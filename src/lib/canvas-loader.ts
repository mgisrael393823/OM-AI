/**
 * Canvas Loader Utility
 * 
 * Centralized dynamic canvas loading that only imports canvas packages
 * when USE_CANVAS=true. Prevents canvas.node warnings when disabled.
 * 
 * Key principles:
 * - Zero imports at module load time
 * - Graceful degradation when packages missing
 * - Structured logging for debugging
 * - Support for both @napi-rs/canvas and node-canvas
 */

export interface CanvasAPI {
  createCanvas: (width: number, height: number) => any
  loadImage?: (src: string | Buffer) => Promise<any>
  registerFont?: (path: string, options: any) => void
  DOMMatrix?: any
  Path2D?: any
  available: boolean
}

interface CanvasLoaderResult {
  success: boolean
  api?: CanvasAPI
  error?: string
  package?: string
}

let cachedCanvas: CanvasLoaderResult | null = null

/**
 * Dynamically load canvas package with graceful fallback
 * Only called when USE_CANVAS=true
 */
export async function loadCanvas(): Promise<CanvasLoaderResult> {
  // Return cached result if available
  if (cachedCanvas) {
    return cachedCanvas
  }

  // Check environment flag first
  if (process.env.USE_CANVAS !== 'true') {
    const result: CanvasLoaderResult = {
      success: false,
      error: 'Canvas disabled via USE_CANVAS environment variable'
    }
    cachedCanvas = result
    return result
  }

  // Try @napi-rs/canvas first (preferred for production)
  try {
    // Resolve at runtime to avoid bundling errors when optional dep is missing
    require.resolve('@napi-rs/canvas')
    // @ts-expect-error - Dynamic import may not be available
    const napiCanvas = await import('@napi-rs/canvas')
    
    // Verify the package actually works
    if (napiCanvas.createCanvas) {
      const api: CanvasAPI = {
        createCanvas: napiCanvas.createCanvas,
        loadImage: napiCanvas.loadImage,
        DOMMatrix: napiCanvas.DOMMatrix,
        Path2D: napiCanvas.Path2D,
        available: true
      }
      
      const result: CanvasLoaderResult = {
        success: true,
        api,
        package: '@napi-rs/canvas'
      }
      
      cachedCanvas = result
      console.log('[canvas-loader] Successfully loaded @napi-rs/canvas')
      return result
    }
  } catch (error: any) {
    console.debug('[canvas-loader] @napi-rs/canvas not available:', error?.message || 'Unknown error')
  }

  // Try node-canvas as fallback
  try {
    const nodeCanvas = await import('canvas')
    
    // Verify the package actually works
    if (nodeCanvas.createCanvas) {
      const api: CanvasAPI = {
        createCanvas: nodeCanvas.createCanvas,
        loadImage: nodeCanvas.loadImage,
        registerFont: nodeCanvas.registerFont,
        available: true
      }
      
      // Try to load polyfills if available
      try {
        const { DOMMatrix } = await import('canvas')
        api.DOMMatrix = DOMMatrix
      } catch {
        // DOMMatrix not available in this canvas version
      }
      
      try {
        // Some versions have Path2D - check if it exists
        const canvasModule = await import('canvas')
        if ('Path2D' in canvasModule) {
          api.Path2D = (canvasModule as any).Path2D
        }
      } catch {
        // Path2D not available, try polyfill
        try {
          // @ts-expect-error - Dynamic import may not be available
          const path2dPolyfill = await import('path2d-polyfill')
          api.Path2D = path2dPolyfill.default || path2dPolyfill
        } catch {
          // No Path2D available - this is fine
        }
      }
      
      const result: CanvasLoaderResult = {
        success: true,
        api,
        package: 'canvas'
      }
      
      cachedCanvas = result
      console.log('[canvas-loader] Successfully loaded node-canvas')
      return result
    }
  } catch (error: any) {
    console.debug('[canvas-loader] node-canvas not available:', error?.message || 'Unknown error')
  }

  // No canvas package available
  const result: CanvasLoaderResult = {
    success: false,
    error: 'No canvas package available. Install @napi-rs/canvas or canvas.'
  }
  
  cachedCanvas = result
  
  // Log structured warning when canvas was requested but not available
  console.warn('[canvas-loader] Canvas requested (USE_CANVAS=true) but no canvas package found.', {
    available_packages: [],
    suggestion: 'Install @napi-rs/canvas for best compatibility: npm install @napi-rs/canvas',
    fallback: 'Continuing with text-only processing'
  })
  
  return result
}

/**
 * Check if canvas is available without loading it
 */
export function isCanvasAvailable(): boolean {
  return process.env.USE_CANVAS === 'true' && (cachedCanvas?.success ?? true)
}

/**
 * Get canvas API if available, throw if not available when required
 */
export async function requireCanvas(): Promise<CanvasAPI> {
  const result = await loadCanvas()
  
  if (!result.success || !result.api) {
    throw new Error(`Canvas required but not available: ${result.error}`)
  }
  
  return result.api
}

/**
 * Safe canvas loader that returns null if not available
 */
export async function safeLoadCanvas(): Promise<CanvasAPI | null> {
  try {
    const result = await loadCanvas()
    return result.success ? result.api! : null
  } catch (error: any) {
    console.debug('[canvas-loader] Safe load failed:', error?.message || 'Unknown error')
    return null
  }
}

/**
 * Clear canvas cache (useful for testing)
 */
export function clearCanvasCache(): void {
  cachedCanvas = null
}

/**
 * Get current canvas status for debugging
 */
export function getCanvasStatus(): {
  enabled: boolean
  cached: boolean
  success?: boolean
  package?: string
  error?: string
} {
  return {
    enabled: process.env.USE_CANVAS === 'true',
    cached: cachedCanvas !== null,
    success: cachedCanvas?.success,
    package: cachedCanvas?.package,
    error: cachedCanvas?.error
  }
}