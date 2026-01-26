/**
 * Debug Utilities
 *
 * Centralized logging with module prefixes.
 * Logs are only output in development mode.
 */

const isDev = __DEV__;

type LogLevel = 'log' | 'warn' | 'error';

function createLogger(prefix: string) {
  return {
    log: (message: string, ...args: unknown[]) => {
      if (isDev) {
        console.log(`[${prefix}] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (isDev) {
        console.warn(`[${prefix}] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      // Always log errors, even in production
      console.error(`[${prefix}] ${message}`, ...args);
    },
  };
}

/**
 * Debug loggers for different modules
 */
export const debug = {
  upload: createLogger('Upload'),
  media: createLogger('Media'),
  vote: createLogger('Vote'),
  sync: createLogger('Sync'),
  camera: createLogger('Camera'),
  location: createLogger('Location'),
  map: createLogger('Map'),
  feed: createLogger('Feed'),
  storage: createLogger('Storage'),
  api: createLogger('API'),
};

/**
 * Create a custom debug logger for a specific module
 */
export function createDebugLogger(moduleName: string) {
  return createLogger(moduleName);
}
