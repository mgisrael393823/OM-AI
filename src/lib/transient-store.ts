/**
 * Transient In-Memory Store for In-Memory PDF Processing
 * 
 * Stores document chunks and analysis by requestId with 24-hour TTL
 * Used when INGEST_MODE=memory to provide context for follow-up queries
 */

interface StoredDocument {
  requestId: string
  chunks: Array<{
    content: string
    page_number: number
    chunk_index: number
    chunk_type?: string
  }>
  analysis: any
  metadata: {
    originalFilename: string
    pageCount: number
    chunkCount: number
    userId: string
    processingTime: number
    createdAt: Date
  }
}

class TransientStore {
  private store = new Map<string, StoredDocument>()
  private timers = new Map<string, NodeJS.Timeout>()
  private readonly TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

  /**
   * Store document chunks and analysis by requestId
   */
  set(requestId: string, document: Omit<StoredDocument, 'requestId'>): void {
    // Clear any existing timer for this requestId
    const existingTimer = this.timers.get(requestId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Store the document
    this.store.set(requestId, { requestId, ...document })

    // Set cleanup timer
    const timer = setTimeout(() => {
      this.delete(requestId)
    }, this.TTL_MS)
    
    this.timers.set(requestId, timer)

    console.log(`[TransientStore] Stored document ${requestId} for user ${document.metadata.userId}`, {
      filename: document.metadata.originalFilename,
      chunkCount: document.chunks.length,
      expiresAt: new Date(Date.now() + this.TTL_MS).toISOString()
    })
  }

  /**
   * Retrieve document by requestId
   */
  get(requestId: string): StoredDocument | null {
    const document = this.store.get(requestId)
    if (!document) {
      return null
    }

    // Check if expired (shouldn't happen with timers, but safety check)
    const ageMs = Date.now() - document.metadata.createdAt.getTime()
    if (ageMs > this.TTL_MS) {
      this.delete(requestId)
      return null
    }

    return document
  }

  /**
   * Get chunks for document context (compatible with existing chat interface)
   */
  getChunks(requestId: string): Array<{
    content: string
    page_number: number
    document_id: string
    chunk_type?: string
    documents?: { original_filename?: string }
  }> | null {
    const document = this.get(requestId)
    if (!document) {
      return null
    }

    // Transform to match expected chat interface format
    return document.chunks.map(chunk => ({
      content: chunk.content,
      page_number: chunk.page_number,
      document_id: requestId, // Use requestId as document_id for compatibility
      chunk_type: chunk.chunk_type || 'text',
      documents: {
        original_filename: document.metadata.originalFilename
      }
    }))
  }

  /**
   * Delete document from store
   */
  delete(requestId: string): boolean {
    const timer = this.timers.get(requestId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(requestId)
    }

    const existed = this.store.has(requestId)
    this.store.delete(requestId)
    
    if (existed) {
      console.log(`[TransientStore] Removed document ${requestId}`)
    }
    
    return existed
  }

  /**
   * Check if requestId exists and is valid
   */
  has(requestId: string): boolean {
    return this.get(requestId) !== null
  }

  /**
   * Get all documents for a specific user
   */
  getByUser(userId: string): StoredDocument[] {
    const userDocs: StoredDocument[] = []
    for (const document of this.store.values()) {
      if (document.metadata.userId === userId) {
        userDocs.push(document)
      }
    }
    return userDocs
  }

  /**
   * Clean up expired documents (called periodically)
   */
  cleanup(): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [requestId, document] of this.store.entries()) {
      const ageMs = now - document.metadata.createdAt.getTime()
      if (ageMs > this.TTL_MS) {
        this.delete(requestId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TransientStore] Cleaned up ${cleanedCount} expired documents`)
    }
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalDocuments: number
    totalChunks: number
    oldestDocument?: Date
    newestDocument?: Date
    memoryUsageEstimate: string
  } {
    const documents = Array.from(this.store.values())
    const totalChunks = documents.reduce((sum, doc) => sum + doc.chunks.length, 0)
    
    const dates = documents.map(doc => doc.metadata.createdAt).sort()
    const oldestDocument = dates[0]
    const newestDocument = dates[dates.length - 1]
    
    // Rough memory usage estimate (very approximate)
    const avgChunkSize = 800 * 4 // 800 tokens * 4 chars per token
    const estimatedBytes = totalChunks * avgChunkSize
    const memoryUsageEstimate = estimatedBytes > 1024 * 1024 
      ? `${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB`
      : `${(estimatedBytes / 1024).toFixed(1)}KB`

    return {
      totalDocuments: documents.length,
      totalChunks,
      oldestDocument,
      newestDocument,
      memoryUsageEstimate
    }
  }

  /**
   * Clear all documents (for testing/maintenance)
   */
  clear(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    
    this.timers.clear()
    this.store.clear()
    
    console.log('[TransientStore] Cleared all documents')
  }
}

// Create singleton instance
const transientStore = new TransientStore()

// Set up periodic cleanup (every hour)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    transientStore.cleanup()
  }, 60 * 60 * 1000) // 1 hour
}

// Log store stats periodically in development
if (process.env.NODE_ENV === 'development' && typeof setInterval !== 'undefined') {
  setInterval(() => {
    const stats = transientStore.getStats()
    if (stats.totalDocuments > 0) {
      console.log('[TransientStore] Stats:', stats)
    }
  }, 10 * 60 * 1000) // 10 minutes
}

export { transientStore, type StoredDocument }
export default transientStore