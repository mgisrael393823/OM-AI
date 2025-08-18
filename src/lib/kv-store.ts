/**
 * Vercel KV Store Adapter for Cross-Runtime Context Persistence
 * 
 * Handles document context storage across Lambda instances with:
 * - Multi-part storage for large documents (>900KB)
 * - Status tracking (processing/ready/error)
 * - User isolation and security
 * - Retry logic with exponential backoff
 * - Structured logging
 */

import { structuredLog } from './log'

// Determine adapter based on environment
const vercelEnv = process.env.VERCEL_ENV
const fallbackPreview = process.env.KV_FALLBACK_PREVIEW === 'true'

// Check if KV is available
let kvClient: any = null
let kvAvailable = false
let adapter: 'vercel-kv' | 'memory' = 'memory'

// Memory storage implementation for development/fallback
const memoryStore = new Map<string, any>()
const memoryTTL = new Map<string, NodeJS.Timeout>()

// Memory adapter functions
function memorySet(key: string, value: any, options?: { ex?: number }): boolean {
  try {
    // Clear existing TTL if present
    if (memoryTTL.has(key)) {
      clearTimeout(memoryTTL.get(key)!)
      memoryTTL.delete(key)
    }
    
    // Store value
    memoryStore.set(key, value)
    
    // Set TTL if provided
    if (options?.ex && options.ex > 0) {
      const timeoutId = setTimeout(() => {
        memoryStore.delete(key)
        memoryTTL.delete(key)
      }, options.ex * 1000) // Convert seconds to milliseconds
      
      memoryTTL.set(key, timeoutId)
    }
    
    return true
  } catch (error) {
    console.error('[Memory Store] Set failed:', error)
    return false
  }
}

function memoryGet(key: string): any | null {
  try {
    return memoryStore.get(key) || null
  } catch (error) {
    console.error('[Memory Store] Get failed:', error)
    return null
  }
}

function memoryDel(key: string): boolean {
  try {
    // Clear TTL if present
    if (memoryTTL.has(key)) {
      clearTimeout(memoryTTL.get(key)!)
      memoryTTL.delete(key)
    }
    
    return memoryStore.delete(key)
  } catch (error) {
    console.error('[Memory Store] Delete failed:', error)
    return false
  }
}

// Use memory fallback for local dev or when explicitly set for preview
if (!vercelEnv || (vercelEnv === 'preview' && fallbackPreview)) {
  adapter = 'memory'
  kvAvailable = true // Memory is always available
  console.log(`[KV Store] Using memory adapter (${!vercelEnv ? 'local dev' : 'preview fallback'})`)
} else {
  // Try to initialize KV for preview/production
  try {
    const { kv } = require('@vercel/kv')
    kvClient = kv
    
    // Validate KV environment variables
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.warn('[KV Store] Missing KV environment variables')
      kvAvailable = false
      adapter = 'memory'
    } else {
      kvAvailable = true
      adapter = 'vercel-kv'
      console.log('[KV Store] Vercel KV initialized successfully')
    }
  } catch (error) {
    console.warn('[KV Store] Vercel KV not available:', error)
    kvAvailable = false
    adapter = 'memory'
  }
}

const TTL_SECONDS = 1800 // 30 minutes
const MAX_PART_SIZE = 900 * 1024 // 900KB per part
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 500

export interface DocumentContext {
  chunks: Array<{
    id: string
    text: string
    page: number
    chunk_index: number
    metadata?: Record<string, any>
  }>
  userId: string
  meta?: {
    pagesIndexed?: number
    processingTime?: number
    contentHash?: string
    originalFilename?: string
  }
}

export interface DocumentStatus {
  status: 'processing' | 'ready' | 'error' | 'missing'
  error?: string
  parts?: number
  pagesIndexed?: number
}

/**
 * Check if storage is available (KV or memory)
 */
export function isKvAvailable(): boolean {
  return adapter === 'memory' ? true : kvAvailable
}

/**
 * Get current adapter type
 */
export function getAdapter(): 'vercel-kv' | 'memory' {
  return adapter
}

/**
 * Self-test the storage adapter
 */
export async function selfTest(): Promise<boolean> {
  const testKey = `test:${Date.now()}`
  const testValue = { test: true, timestamp: Date.now() }
  
  try {
    if (adapter === 'memory') {
      // Test memory adapter
      const setResult = memorySet(testKey, JSON.stringify(testValue), { ex: 5 })
      if (!setResult) return false
      
      const getResult = memoryGet(testKey)
      if (!getResult) return false
      
      const delResult = memoryDel(testKey)
      return delResult
    } else {
      // Test KV adapter
      if (!kvClient) return false
      
      await kvClient.set(testKey, JSON.stringify(testValue), { ex: 5 })
      const getResult = await kvClient.get(testKey)
      if (!getResult) return false
      
      await kvClient.del(testKey)
      return true
    }
  } catch (error) {
    console.error('[Storage] Self-test failed:', error)
    return false
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry wrapper for KV operations
 */
async function retryKvOperation<T>(
  operation: () => Promise<T>,
  documentId: string,
  operationType: 'read' | 'write'
): Promise<T | null> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await operation()
      return result
    } catch (error) {
      const isLastAttempt = attempt === RETRY_ATTEMPTS
      
      structuredLog('error', `KV ${operationType} failed (attempt ${attempt}/${RETRY_ATTEMPTS})`, {
        documentId,
        userId: 'system',
        kvRead: operationType === 'read',
        kvWrite: operationType === 'write',
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: `kv-${Date.now()}`
      })
      
      if (isLastAttempt) {
        throw error
      }
      
      await sleep(RETRY_DELAY_MS * attempt) // Exponential backoff
    }
  }
  
  return null
}

/**
 * Set document status
 */
export async function setStatus(
  documentId: string,
  status: 'processing' | 'ready' | 'error',
  error?: string
): Promise<boolean> {
  if (!isKvAvailable()) {
    structuredLog('warn', 'Storage unavailable for status write', {
      documentId,
      userId: 'system',
      kvWrite: false,
      adapter,
      request_id: `status-${Date.now()}`
    })
    return false
  }

  const key = `mem:ctx:${documentId}:status`
  const value: DocumentStatus = {
    status,
    ...(error && { error })
  }

  try {
    if (adapter === 'memory') {
      const success = memorySet(key, JSON.stringify(value), { ex: TTL_SECONDS })
      
      structuredLog('info', `Status set: ${status}`, {
        documentId,
        userId: 'system',
        kvWrite: success,
        adapter,
        request_id: `status-${Date.now()}`
      })
      
      return success
    } else {
      const result = await retryKvOperation(
        async () => {
          await kvClient.set(key, JSON.stringify(value), { ex: TTL_SECONDS })
          return true
        },
        documentId,
        'write'
      )
      
      structuredLog('info', `Status set: ${status}`, {
        documentId,
        userId: 'system',
        kvWrite: true,
        adapter,
        request_id: `status-${Date.now()}`
      })
      
      return result ?? false
    }
  } catch (error) {
    structuredLog('error', 'Failed to set status', {
      documentId,
      userId: 'system',
      kvWrite: false,
      adapter,
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: `status-${Date.now()}`
    })
    return false
  }
}

/**
 * Get document status
 */
export async function getStatus(
  documentId: string,
  userId?: string
): Promise<DocumentStatus> {
  if (!isKvAvailable()) {
    return { status: 'missing' }
  }

  const statusKey = `mem:ctx:${documentId}:status`
  const indexKey = `mem:ctx:${documentId}:index`

  try {
    // Get status
    let statusResult: any = null
    
    if (adapter === 'memory') {
      statusResult = memoryGet(statusKey)
    } else {
      statusResult = await retryKvOperation(
        async () => kvClient.get(statusKey),
        documentId,
        'read'
      )
    }
    
    if (!statusResult) {
      return { status: 'missing' }
    }
    
    const status = typeof statusResult === 'string' 
      ? JSON.parse(statusResult) 
      : statusResult

    // Get index for parts info
    const indexResult = adapter === 'memory' 
      ? memoryGet(indexKey)
      : await kvClient.get(indexKey)
    if (indexResult) {
      const index = typeof indexResult === 'string'
        ? JSON.parse(indexResult)
        : indexResult
      
      if (userId && index.userId !== userId) {
        return { status: 'missing' } // Security: hide from other users
      }
      
      status.parts = index.parts
      status.pagesIndexed = index.meta?.pagesIndexed
    }
    
    return status
  } catch (error) {
    structuredLog('error', 'Failed to get status', {
      documentId,
      userId: userId || 'unknown',
      kvRead: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: `status-${Date.now()}`
    })
    return { status: 'error', error: 'Failed to retrieve status' }
  }
}

/**
 * Store document context with automatic partitioning for large documents
 */
export async function setContext(
  documentId: string,
  userId: string,
  context: DocumentContext
): Promise<boolean> {
  if (!isKvAvailable()) {
    structuredLog('warn', 'Storage unavailable for context write', {
      documentId,
      userId,
      kvWrite: false,
      adapter,
      request_id: `ctx-${Date.now()}`
    })
    return false
  }

  try {
    const contextJson = JSON.stringify(context)
    const contextSize = new TextEncoder().encode(contextJson).length
    
    if (contextSize <= MAX_PART_SIZE) {
      // Single part storage
      const key = `mem:ctx:${documentId}`
      
      if (adapter === 'memory') {
        const success = memorySet(key, contextJson, { ex: TTL_SECONDS })
        
        structuredLog('info', 'Context stored (single part)', {
          documentId,
          userId,
          kvWrite: success,
          adapter,
          parts: 1,
          request_id: `ctx-${Date.now()}`
        })
        
        return success
      } else {
        await retryKvOperation(
          async () => {
            await kvClient.set(key, contextJson, { ex: TTL_SECONDS })
            return true
          },
          documentId,
          'write'
        )
        
        structuredLog('info', 'Context stored (single part)', {
          documentId,
          userId,
          kvWrite: true,
          adapter,
          parts: 1,
          request_id: `ctx-${Date.now()}`
        })
        
        return true
      }
    } else {
      // Multi-part storage
      const chunkSize = Math.ceil(context.chunks.length / Math.ceil(contextSize / MAX_PART_SIZE))
      const parts: any[] = []
      
      for (let i = 0; i < context.chunks.length; i += chunkSize) {
        const partChunks = context.chunks.slice(i, i + chunkSize)
        const partData = {
          ...context,
          chunks: partChunks,
          partIndex: parts.length
        }
        parts.push(partData)
      }
      
      // Store index
      const indexKey = `mem:ctx:${documentId}:index`
      const indexData = {
        parts: parts.length,
        userId,
        meta: context.meta
      }
      
      if (adapter === 'memory') {
        const indexSuccess = memorySet(indexKey, JSON.stringify(indexData), { ex: TTL_SECONDS })
        if (!indexSuccess) return false
        
        // Store parts
        for (let i = 0; i < parts.length; i++) {
          const partKey = `mem:ctx:${documentId}:part:${i}`
          const partSuccess = memorySet(partKey, JSON.stringify(parts[i]), { ex: TTL_SECONDS })
          if (!partSuccess) return false
        }
        
        structuredLog('info', 'Context stored (multi-part)', {
          documentId,
          userId,
          kvWrite: true,
          adapter,
          parts: parts.length,
          request_id: `ctx-${Date.now()}`
        })
        
        return true
      } else {
        await retryKvOperation(
          async () => {
            await kvClient.set(indexKey, JSON.stringify(indexData), { ex: TTL_SECONDS })
            return true
          },
          documentId,
          'write'
        )
        
        // Store parts
        for (let i = 0; i < parts.length; i++) {
          const partKey = `mem:ctx:${documentId}:part:${i}`
          await retryKvOperation(
            async () => {
              await kvClient.set(partKey, JSON.stringify(parts[i]), { ex: TTL_SECONDS })
              return true
            },
            documentId,
            'write'
          )
        }
        
        structuredLog('info', 'Context stored (multi-part)', {
          documentId,
          userId,
          kvWrite: true,
          adapter,
          parts: parts.length,
          request_id: `ctx-${Date.now()}`
        })
        
        return true
      }
    }
  } catch (error) {
    structuredLog('error', 'Failed to store context', {
      documentId,
      userId,
      kvWrite: false,
      adapter,
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: `ctx-${Date.now()}`
    })
    return false
  }
}

/**
 * Retrieve document context with automatic reassembly of parts
 */
export async function getContext(
  documentId: string,
  userId: string
): Promise<DocumentContext | null> {
  if (!isKvAvailable()) {
    structuredLog('warn', 'Storage unavailable for context read', {
      documentId,
      userId,
      kvRead: false,
      adapter,
      request_id: `ctx-${Date.now()}`
    })
    return null
  }

  try {
    // Check for index (multi-part)
    const indexKey = `mem:ctx:${documentId}:index`
    const indexResult = adapter === 'memory' 
      ? memoryGet(indexKey)
      : await kvClient.get(indexKey)
    
    if (indexResult) {
      // Multi-part context
      const index = typeof indexResult === 'string'
        ? JSON.parse(indexResult)
        : indexResult
      
      // Security check
      if (index.userId !== userId) {
        structuredLog('warn', 'User ID mismatch', {
          documentId,
          userId,
          kvRead: true,
          status: 'forbidden',
          request_id: `ctx-${Date.now()}`
        })
        return null
      }
      
      // Reassemble parts
      const allChunks: any[] = []
      
      for (let i = 0; i < index.parts; i++) {
        const partKey = `mem:ctx:${documentId}:part:${i}`
        const partResult = adapter === 'memory'
          ? memoryGet(partKey)
          : await retryKvOperation(
              async () => kvClient.get(partKey),
              documentId,
              'read'
            )
        
        if (!partResult) {
          throw new Error(`Missing part ${i}`)
        }
        
        const partData = typeof partResult === 'string'
          ? JSON.parse(partResult)
          : partResult
        
        allChunks.push(...partData.chunks)
      }
      
      structuredLog('info', 'Context retrieved (multi-part)', {
        documentId,
        userId,
        kvRead: true,
        parts: index.parts,
        status: 'ready',
        request_id: `ctx-${Date.now()}`
      })
      
      return {
        chunks: allChunks,
        userId: index.userId,
        meta: index.meta
      }
    } else {
      // Single part context
      const key = `mem:ctx:${documentId}`
      const result = adapter === 'memory'
        ? memoryGet(key)
        : await retryKvOperation(
            async () => kvClient.get(key),
            documentId,
            'read'
          )
      
      if (!result) {
        structuredLog('info', 'Context not found', {
          documentId,
          userId,
          kvRead: true,
          status: 'missing',
          request_id: `ctx-${Date.now()}`
        })
        return null
      }
      
      const context = typeof result === 'string'
        ? JSON.parse(result)
        : result
      
      // Security check
      if (context.userId !== userId) {
        structuredLog('warn', 'User ID mismatch', {
          documentId,
          userId,
          kvRead: true,
          status: 'forbidden',
          request_id: `ctx-${Date.now()}`
        })
        return null
      }
      
      structuredLog('info', 'Context retrieved (single part)', {
        documentId,
        userId,
        kvRead: true,
        parts: 1,
        status: 'ready',
        request_id: `ctx-${Date.now()}`
      })
      
      return context
    }
  } catch (error) {
    structuredLog('error', 'Failed to retrieve context', {
      documentId,
      userId,
      kvRead: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: `ctx-${Date.now()}`
    })
    return null
  }
}

/**
 * Check for existing context by content hash
 */
export async function findByContentHash(
  contentHash: string,
  userId: string
): Promise<string | null> {
  // This would require a separate index by hash
  // For now, return null (no deduplication)
  // Could be implemented with an additional KV key: hash:{contentHash} -> documentId
  return null
}