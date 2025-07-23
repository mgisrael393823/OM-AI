/**
 * Error logging utility
 * In production, this would integrate with Sentry, Datadog, or similar
 */

import { isProduction } from './config';

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  endpoint?: string;
  [key: string]: any;
}

export function logError(
  error: Error | unknown,
  context?: ErrorContext
): void {
  const errorInfo = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    ...context
  };

  if (isProduction()) {
    // In production, send to error tracking service
    // Example: Sentry.captureException(error, { extra: context });
    console.error('[ERROR]', JSON.stringify(errorInfo));
    
    // TODO: Integrate with your preferred error tracking service:
    // - Sentry: https://sentry.io
    // - Datadog: https://www.datadoghq.com
    // - LogRocket: https://logrocket.com
    // - Rollbar: https://rollbar.com
  } else {
    // In development, log to console with formatting
    console.error('🚨 Error occurred:', {
      message: errorInfo.message,
      context,
      stack: errorInfo.stack
    });
  }
}

export function logWarning(
  message: string,
  context?: ErrorContext
): void {
  const warningInfo = {
    message,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    ...context
  };

  if (isProduction()) {
    // In production, send to monitoring service
    console.warn('[WARNING]', JSON.stringify(warningInfo));
  } else {
    console.warn('⚠️  Warning:', message, context || '');
  }
}

export function logConfigError(
  error: Error,
  endpoint: string
): void {
  logError(error, {
    endpoint,
    errorType: 'CONFIGURATION_ERROR',
    severity: 'critical'
  });
}