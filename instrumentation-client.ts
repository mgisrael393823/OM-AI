/**
 * Sentry Client Configuration for Next.js 15
 * This file replaces the deprecated sentry.client.config.js
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

// Import the enhanced client configuration
import './sentry.client.config.js'

// Re-export the router transition hook from the enhanced config
export { onRouterTransitionStart } from './sentry.client.config.js'