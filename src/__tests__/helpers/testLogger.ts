/**
 * Test logger with environment variable control
 * Uses DefaultLogger from @mcp-abap-adt/logger for proper formatting
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';
// Import DefaultLogger and getLogLevel from logger package
// Note: Importing from main entry may cause side effects (pinoLogger initialization)
// but for stores package this is acceptable as it's only used in tests
import { DefaultLogger, getLogLevel } from '@mcp-abap-adt/logger';

export function createTestLogger(prefix: string = 'TEST'): ILogger {
  // Check if logging is enabled - only if explicitly enabled via environment variables
  const isEnabled = (): boolean => {
    // Explicitly disabled
    if (
      process.env.DEBUG_STORES === 'false' ||
      process.env.DEBUG_AUTH_STORES === 'false'
    ) {
      return false;
    }
    // Explicitly enabled (support both short and long names)
    if (
      process.env.DEBUG_STORES === 'true' ||
      process.env.DEBUG_AUTH_STORES === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('stores') === true ||
      process.env.DEBUG?.includes('auth-stores') === true
    ) {
      return true;
    }
    // Do not enable by default - require explicit enable
    return false;
  };

  // Create DefaultLogger with appropriate log level
  // getLogLevel respects LOG_LEVEL env var and defaults to INFO
  const baseLogger = new DefaultLogger(getLogLevel());

  // Return wrapper that checks if logging is enabled
  return {
    debug: (message: string, meta?: unknown) => {
      if (isEnabled()) {
        baseLogger.debug(`[${prefix}] ${message}`, meta);
      }
    },
    info: (message: string, meta?: unknown) => {
      if (isEnabled()) {
        baseLogger.info(`[${prefix}] ${message}`, meta);
      }
    },
    warn: (message: string, meta?: unknown) => {
      if (isEnabled()) {
        baseLogger.warn(`[${prefix}] ${message}`, meta);
      }
    },
    error: (message: string, meta?: unknown) => {
      if (isEnabled()) {
        baseLogger.error(`[${prefix}] ${message}`, meta);
      }
    },
  };
}
