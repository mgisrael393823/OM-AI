/**
 * Next.js 15 Instrumentation File
 * This file replaces the deprecated sentry.server.config.js
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-initialization-config-files
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Sentry initialization
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    await import('./sentry.edge.config')
  }
}

/**
 * Global error handler for React Server Components
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
 */
export async function onRequestError(err: unknown, request: Request, context: { routerKind: string; routePath: string }) {
  // Import Sentry dynamically to avoid issues during build
  const Sentry = await import('@sentry/nextjs')
  
  // Convert Request to the expected RequestInfo format
  const requestInfo = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    path: new URL(request.url).pathname
  }
  
  // Add missing routeType property for ErrorContext
  const errorContext = {
    ...context,
    routeType: context.routerKind
  }
  
  Sentry.captureRequestError(err, requestInfo as any, errorContext)
}