/**
 * Error logging utility
 * Integrated with Sentry for production error tracking
 */

import { isProduction } from './config';
import * as Sentry from '@sentry/nextjs';

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
    // Send to Sentry in production
    Sentry.captureException(error, {
      extra: context,
      tags: {
        environment: process.env.NODE_ENV,
        endpoint: context?.endpoint
      }
    });
    console.error('[ERROR]', JSON.stringify(errorInfo));
  } else {
    // In development, log to console with formatting and also send to Sentry for testing
    console.error('🚨 Error occurred:', {
      message: errorInfo.message,
      context,
      stack: errorInfo.stack
    });
    
    // Send to Sentry in development too for testing
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error, {
        extra: context,
        tags: {
          environment: 'development',
          endpoint: context?.endpoint
        }
      });
    }
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
    // Send warnings to Sentry in production
    Sentry.captureMessage(message, 'warning', {
      extra: context,
      tags: {
        environment: process.env.NODE_ENV,
        endpoint: context?.endpoint
      }
    });
    console.warn('[WARNING]', JSON.stringify(warningInfo));
  } else {
    console.warn('⚠️  Warning:', message, context || '');
    
    // Send to Sentry in development too for testing
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureMessage(message, 'warning', {
        extra: context,
        tags: {
          environment: 'development',
          endpoint: context?.endpoint
        }
      });
    }
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