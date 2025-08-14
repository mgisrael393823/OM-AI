/**
 * Transient In-Memory Store for In-Memory PDF Processing
 * 
 * Global singleton that persists across API routes and HMR reloads
 * Stores document chunks by requestId with configurable TTL
 * Used when INGEST_MODE=memory to provide context for follow-up queries
 */

export interface TransientChunk {
  id: string
  text: string
  page: number | null
  chunk_index: number
  metadata?: Record<string, unknown>
}

interface StoredChunks {
  chunks: TransientChunk[]
  createdAt: Date
  ttl: number
}

// Global singleton key
declare global {
  var __TRANSIENT_STORE__: TransientStore | undefined
}

class TransientStore {
  private store = new Map<string, StoredChunks>()
  private timers = new Map<string, NodeJS.Timeout>()
  private insertionOrder: string[] = [] // Track insertion order for eviction
  
  // Environment-configurable settings
  private readonly DEFAULT_TTL_MS = Number(process.env.TRANSIENT_STORE_TTL_MS) || 900_000 // 15 minutes
  private readonly MAX_CONTEXTS = Number(process.env.TRANSIENT_STORE_MAX_CONTEXTS) || 100 // Soft cap

  constructor() {
    // Log initialization for debugging singleton behavior
    console.log(`[TransientStore] Initialized new instance (PID: ${process.pid})`, {
      ttl: this.DEFAULT_TTL_MS,
      maxContexts: this.MAX_CONTEXTS,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Store document chunks by requestId
   */
  setChunks(id: string, chunks: TransientChunk[], opts?: { ttlMs?: number }): void {
    const ttl = opts?.ttlMs ?? this.DEFAULT_TTL_MS
    
    // Clear any existing timer for this id
    const existingTimer = this.timers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Remove from insertion order if already exists
    const existingIndex = this.insertionOrder.indexOf(id)
    if (existingIndex >= 0) {
      this.insertionOrder.splice(existingIndex, 1)
    }

    // Check soft cap and evict oldest if needed
    if (this.insertionOrder.length >= this.MAX_CONTEXTS) {
      const oldestId = this.insertionOrder.shift()
      if (oldestId) {
        this.delete(oldestId)
      }
    }

    // Store the chunks
    this.store.set(id, {
      chunks,
      createdAt: new Date(),
      ttl
    })

    // Add to insertion order
    this.insertionOrder.push(id)

    // Set cleanup timer
    const timer = setTimeout(() => {
      this.delete(id)
    }, ttl)
    
    this.timers.set(id, timer)

    console.log(`[TransientStore] Stored ${chunks.length} chunks for ${id}`, {
      chunkCount: chunks.length,
      firstChunkId: chunks[0]?.id || 'none',
      ttl: ttl,
      expiresAt: new Date(Date.now() + ttl).toISOString(),
      totalContexts: this.store.size,
      pid: process.pid
    })
  }

  /**
   * Get current context count for diagnostics
   */
  get contextCount(): number {
    return this.store.size
  }

  /**
   * Retrieve chunks by requestId
   */
  getChunks(requestId: string): TransientChunk[] | null {
    console.log(`[TransientStore] Checking for chunks: ${requestId}`, {
      contextCount: this.contextCount,
      hasContext: this.store.has(requestId),
      pid: process.pid
    })

    const stored = this.store.get(requestId)
    if (!stored) {
      if (this.contextCount === 0) {
        console.warn(`[TransientStore] No contexts available - possible duplicate module instance or runtime mismatch`, {
          requestId,
          pid: process.pid,
          suggestion: 'Check that both upload and chat routes use the same singleton instance'
        })
      }
      return null
    }

    // Check if expired (shouldn't happen with timers, but safety check)
    const ageMs = Date.now() - stored.createdAt.getTime()
    if (ageMs > stored.ttl) {
      console.log(`[TransientStore] Context expired for ${requestId}`, {
        ageMs,
        ttl: stored.ttl,
        pid: process.pid
      })
      this.delete(requestId)
      return null
    }

    console.log(`[TransientStore] Found ${stored.chunks.length} chunks for ${requestId}`, {
      chunkCount: stored.chunks.length,
      ageMs,
      contextSource: 'transient',
      pid: process.pid
    })

    return stored.chunks
  }

  /**
   * Get chunks for document context (compatible with existing chat interface)
   */
  getChunksForChat(requestId: string): Array<{
    content: string
    page_number: number
    document_id: string
    chunk_type?: string
    documents?: { original_filename?: string }
  }> | null {
    const chunks = this.getChunks(requestId)
    if (!chunks) {
      return null
    }

    // Get metadata for filename (stored separately in insertionOrder tracking)
    const stored = this.store.get(requestId)
    const originalFilename = stored?.chunks[0]?.metadata?.originalFilename

    // Transform to match expected chat interface format
    return chunks.map(chunk => ({
      content: chunk.text,
      page_number: chunk.page || 1,
      document_id: requestId, // Use requestId as document_id for compatibility
      chunk_type: 'text',
      documents: {
        original_filename: originalFilename || 'document.pdf'
      }
    }))
  }

  /**
   * Delete chunks from store
   */
  delete(requestId: string): boolean {
    const timer = this.timers.get(requestId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(requestId)
    }

    // Remove from insertion order
    const orderIndex = this.insertionOrder.indexOf(requestId)
    if (orderIndex >= 0) {
      this.insertionOrder.splice(orderIndex, 1)
    }

    const existed = this.store.has(requestId)
    this.store.delete(requestId)
    
    if (existed) {
      console.log(`[TransientStore] Removed chunks for ${requestId}`)
    }
    
    return existed
  }

  /**
   * Check if requestId exists and is valid
   */
  has(requestId: string): boolean {
    return this.getChunks(requestId) !== null
  }

  /**
   * Clear expired chunks (called periodically)
   */
  clearExpired(): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [requestId, stored] of this.store.entries()) {
      const ageMs = now - stored.createdAt.getTime()
      if (ageMs > stored.ttl) {
        this.delete(requestId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TransientStore] Cleaned up ${cleanedCount} expired contexts`)
    }
  }

  /**
   * Legacy alias for clearExpired
   */
  cleanup(): void {
    this.clearExpired()
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalContexts: number
    totalChunks: number
    oldestContext?: Date
    newestContext?: Date
    memoryUsageEstimate: string
  } {
    const stored = Array.from(this.store.values())
    const totalChunks = stored.reduce((sum, s) => sum + s.chunks.length, 0)
    
    const dates = stored.map(s => s.createdAt).sort()
    const oldestContext = dates[0]
    const newestContext = dates[dates.length - 1]
    
    // Rough memory usage estimate (very approximate)
    const avgChunkSize = 800 * 4 // 800 tokens * 4 chars per token
    const estimatedBytes = totalChunks * avgChunkSize
    const memoryUsageEstimate = estimatedBytes > 1024 * 1024 
      ? `${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB`
      : `${(estimatedBytes / 1024).toFixed(1)}KB`

    return {
      totalContexts: stored.length,
      totalChunks,
      oldestContext,
      newestContext,
      memoryUsageEstimate
    }
  }

  /**
   * Clear all contexts (for testing/maintenance)
   */
  clear(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    
    this.timers.clear()
    this.store.clear()
    this.insertionOrder.length = 0
    
    console.log('[TransientStore] Cleared all contexts')
  }
}

// HMR-safe singleton initialization
function getTransientStore(): TransientStore {
  if (!globalThis.__TRANSIENT_STORE__) {
    console.log('[TransientStore] Creating global singleton instance')
    globalThis.__TRANSIENT_STORE__ = new TransientStore()
    
    // Set up periodic cleanup (every hour) - only once
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        globalThis.__TRANSIENT_STORE__?.clearExpired()
      }, 60 * 60 * 1000) // 1 hour
    }

    // Log store stats periodically in development - only once
    if (process.env.NODE_ENV === 'development' && typeof setInterval !== 'undefined') {
      setInterval(() => {
        const stats = globalThis.__TRANSIENT_STORE__?.getStats()
        if (stats && stats.totalContexts > 0) {
          console.log('[TransientStore] Stats:', stats)
        }
      }, 10 * 60 * 1000) // 10 minutes
    }
  } else {
    console.log('[TransientStore] Reusing existing global singleton instance', {
      contextCount: globalThis.__TRANSIENT_STORE__.contextCount,
      pid: process.pid
    })
  }
  
  return globalThis.__TRANSIENT_STORE__
}

// Get the singleton instance
const transientStore = getTransientStore()

// Export functional interface that always uses the singleton
export const setChunks = (id: string, chunks: TransientChunk[], opts?: { ttlMs?: number }) => 
  transientStore.setChunks(id, chunks, opts)

export const getChunks = (requestId: string) => 
  transientStore.getChunks(requestId)

export const getChunksForChat = (requestId: string) => 
  transientStore.getChunksForChat(requestId)

export const deleteChunks = (requestId: string) => 
  transientStore.delete(requestId)

export const hasChunks = (requestId: string) => 
  transientStore.has(requestId)

export const getContextCount = () => 
  transientStore.contextCount

export const getStats = () => 
  transientStore.getStats()

export const clearExpired = () => 
  transientStore.clearExpired()

export const clear = () => 
  transientStore.clear()

// Legacy export for backward compatibility
export { transientStore }
export default transientStore

// ESLint: Do not import this module with relative paths - always use @/lib/transient-store
// Test comment - HMR persistence test