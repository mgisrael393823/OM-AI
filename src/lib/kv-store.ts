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

// Use memory fallback for local dev or when explicitly set for preview
if (!vercelEnv || (vercelEnv === 'preview' && fallbackPreview)) {
  adapter = 'memory'
  kvAvailable = false
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
 * Check if KV store is available
 */
export function isKvAvailable(): boolean {
  return kvAvailable
}

/**
 * Get current adapter type
 */
export function getAdapter(): 'vercel-kv' | 'memory' {
  return adapter
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
  if (!kvAvailable) {
    structuredLog('warn', 'KV unavailable for status write', {
      documentId,
      userId: 'system',
      kvWrite: false,
      status,
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
      status,
      adapter,
      request_id: `status-${Date.now()}`
    })
    
    return result ?? false
  } catch (error) {
    structuredLog('error', 'Failed to set status', {
      documentId,
      userId: 'system',
      kvWrite: false,
      status,
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
  if (!kvAvailable) {
    return { status: 'missing' }
  }

  const statusKey = `mem:ctx:${documentId}:status`
  const indexKey = `mem:ctx:${documentId}:index`

  try {
    // Get status
    const statusResult = await retryKvOperation(
      async () => kvClient.get(statusKey),
      documentId,
      'read'
    )
    
    if (!statusResult) {
      return { status: 'missing' }
    }
    
    const status = typeof statusResult === 'string' 
      ? JSON.parse(statusResult) 
      : statusResult

    // Get index for parts info
    const indexResult = await kvClient.get(indexKey)
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
  if (!kvAvailable) {
    structuredLog('warn', 'KV unavailable for context write', {
      documentId,
      userId,
      kvWrite: false,
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
        parts: 1,
        status: 'ready',
        request_id: `ctx-${Date.now()}`
      })
      
      return true
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
        parts: parts.length,
        status: 'ready',
        request_id: `ctx-${Date.now()}`
      })
      
      return true
    }
  } catch (error) {
    structuredLog('error', 'Failed to store context', {
      documentId,
      userId,
      kvWrite: false,
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
  if (!kvAvailable) {
    structuredLog('warn', 'KV unavailable for context read', {
      documentId,
      userId,
      kvRead: false,
      request_id: `ctx-${Date.now()}`
    })
    return null
  }

  try {
    // Check for index (multi-part)
    const indexKey = `mem:ctx:${documentId}:index`
    const indexResult = await kvClient.get(indexKey)
    
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
        const partResult = await retryKvOperation(
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
      const result = await retryKvOperation(
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