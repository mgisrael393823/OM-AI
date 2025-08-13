/**
 * Canvas Loader Utility
 * 
 * Centralized dynamic loading that only imports packages when USE_CANVAS=true.
 * Uses runtime evaluation to prevent static analysis by bundlers.
 * 
 * Key principles:
 * - Hard environment gate before any imports
 * - Runtime evaluation to hide package references from bundlers
 * - Graceful degradation when packages missing or disabled
 * - No-op API when canvas disabled
 */

// Hard environment gate at top of file
const USE_CANVAS = process.env.USE_CANVAS === 'true';

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

// No-op API when canvas is disabled
const NO_OP_CANVAS_API: CanvasAPI = {
  createCanvas: () => ({ 
    getContext: () => null, 
    width: 0, 
    height: 0, 
    toBuffer: () => Buffer.alloc(0),
    toDataURL: () => ''
  }),
  loadImage: async () => null,
  registerFont: () => {},
  available: false
};

let cachedCanvas: CanvasLoaderResult | null = null;

/**
 * Dynamically load canvas package with graceful fallback
 * Only called when USE_CANVAS=true
 */
export async function loadCanvas(): Promise<CanvasLoaderResult> {
  // Return cached result if available
  if (cachedCanvas) {
    return cachedCanvas;
  }

  // Hard environment gate
  if (!USE_CANVAS) {
    const result: CanvasLoaderResult = {
      success: false,
      error: 'Canvas disabled via USE_CANVAS environment variable'
    };
    cachedCanvas = result;
    return result;
  }

  // Runtime evaluation to prevent static analysis
  /* eslint-disable-next-line no-new-func */
  const dynamicImport = new Function('pkg', 'return import(pkg)');

  // Try modern package first (build package name from parts)
  try {
    const napiPkgName = ['@napi-rs', 'canvas'].join('/');
    const napiCanvas = await dynamicImport(napiPkgName);
    
    // Verify the package actually works
    if (napiCanvas && napiCanvas.createCanvas) {
      const api: CanvasAPI = {
        createCanvas: napiCanvas.createCanvas,
        loadImage: napiCanvas.loadImage,
        DOMMatrix: napiCanvas.DOMMatrix,
        Path2D: napiCanvas.Path2D,
        available: true
      };
      
      const result: CanvasLoaderResult = {
        success: true,
        api,
        package: napiPkgName
      };
      
      cachedCanvas = result;
      console.log(`[canvas-loader] Successfully loaded ${napiPkgName}`);
      return result;
    }
  } catch (error: any) {
    console.debug('[canvas-loader] Modern package not available:', error?.message || 'Unknown error');
  }

  // Try fallback package
  try {
    const canvasPkgName = ['can', 'vas'].join(''); // Split to avoid static analysis
    const nodeCanvas = await dynamicImport(canvasPkgName);
    
    // Verify the package actually works
    if (nodeCanvas && nodeCanvas.createCanvas) {
      const api: CanvasAPI = {
        createCanvas: nodeCanvas.createCanvas,
        loadImage: nodeCanvas.loadImage,
        registerFont: nodeCanvas.registerFont,
        available: true
      };
      
      // Try to load polyfills if available
      try {
        const { DOMMatrix } = await dynamicImport(canvasPkgName);
        api.DOMMatrix = DOMMatrix;
      } catch {
        // DOMMatrix not available in this version
      }
      
      try {
        // Some versions have Path2D - check if it exists
        const canvasModule = await dynamicImport(canvasPkgName);
        if ('Path2D' in canvasModule) {
          api.Path2D = (canvasModule as any).Path2D;
        }
      } catch {
        // Path2D not available, try polyfill
        try {
          const path2dPkg = ['path2d', 'polyfill'].join('-');
          /* eslint-disable-next-line no-new-func */
          const path2dPolyfill = await dynamicImport(path2dPkg);
          api.Path2D = path2dPolyfill.default || path2dPolyfill;
        } catch {
          // No Path2D available - this is fine
        }
      }
      
      const result: CanvasLoaderResult = {
        success: true,
        api,
        package: canvasPkgName
      };
      
      cachedCanvas = result;
      console.log(`[canvas-loader] Successfully loaded ${canvasPkgName}`);
      return result;
    }
  } catch (error: any) {
    console.debug('[canvas-loader] Fallback package not available:', error?.message || 'Unknown error');
  }

  // No packages available
  const result: CanvasLoaderResult = {
    success: false,
    error: 'No packages available',
    package: undefined
  };

  cachedCanvas = result;
  return result;
}

/**
 * Get current canvas status without attempting to load
 */
export function getCanvasStatus() {
  if (!USE_CANVAS) {
    return { 
      available: false, 
      reason: 'Canvas disabled via USE_CANVAS environment variable',
      suggestion: 'Set USE_CANVAS=true to enable'
    };
  }
  
  return { 
    available: true, 
    reason: 'Canvas enabled and ready',
    suggestion: 'Install optional dependencies if not available: pnpm install --include-optional'
  };
}

/**
 * Quick check if canvas is available
 */
export function isCanvasAvailable(): boolean {
  return USE_CANVAS;
}

/**
 * Safe canvas loading that returns API or null
 */
export async function safeLoadCanvas(): Promise<CanvasAPI | null> {
  if (!USE_CANVAS) return NO_OP_CANVAS_API;
  
  const result = await loadCanvas();
  return result.success ? result.api : NO_OP_CANVAS_API;
}