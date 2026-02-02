/**
 * Logging Service
 *
 * Production-grade logging with Firebase Crashlytics integration.
 * - Development: Console output with module prefixes
 * - Production: Crashlytics breadcrumbs + error reporting
 */

import crashlytics from '@react-native-firebase/crashlytics';

// ============ Types ============

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogModule =
  | 'Upload'
  | 'Media'
  | 'Vote'
  | 'Sync'
  | 'Auth'
  | 'Camera'
  | 'Map'
  | 'Feed'
  | 'API'
  | 'App'
  | 'Analytics'
  | 'Storage'
  | 'Location'
  | 'Biometric'
  | 'Exif'
  | 'Moderation'
  | 'Account';

export interface ModuleLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown) => void;
}

// ============ Service Implementation ============

class LoggingService {
  private userId: string | null = null;
  private isInitialized = false;

  /**
   * Initialize the logging service
   * Call this on app startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await crashlytics().setCrashlyticsCollectionEnabled(true);
      this.isInitialized = true;
      this.info('App', 'Logging service initialized');
    } catch (error) {
      console.error('[Logging] Failed to initialize Crashlytics:', error);
    }
  }

  /**
   * Set the current user ID for crash attribution
   */
  async setUserId(userId: string | null): Promise<void> {
    this.userId = userId;
    try {
      await crashlytics().setUserId(userId || '');
      if (__DEV__) {
        console.log('[Logging] User ID set:', userId ? userId.substring(0, 8) + '...' : 'null');
      }
    } catch (error) {
      console.error('[Logging] Failed to set user ID:', error);
    }
  }

  /**
   * Set a custom attribute for crash reports
   */
  async setAttribute(key: string, value: string): Promise<void> {
    try {
      await crashlytics().setAttribute(key, value);
    } catch (error) {
      console.error('[Logging] Failed to set attribute:', error);
    }
  }

  /**
   * Log debug information (dev only, stripped in production)
   */
  debug(module: LogModule, message: string, data?: Record<string, unknown>): void {
    if (__DEV__) {
      const formatted = `[${module}] ${message}`;
      if (data) {
        console.log(formatted, data);
      } else {
        console.log(formatted);
      }
    }
    // Debug logs are NOT sent to Crashlytics
  }

  /**
   * Log informational messages
   */
  info(module: LogModule, message: string, data?: Record<string, unknown>): void {
    const formatted = `[${module}] ${message}`;

    if (__DEV__) {
      if (data) {
        console.log(formatted, data);
      } else {
        console.log(formatted);
      }
    }

    // In production, log as breadcrumb
    if (!__DEV__) {
      try {
        const breadcrumb = data
          ? `${formatted} ${JSON.stringify(data)}`
          : formatted;
        crashlytics().log(breadcrumb);
      } catch {
        // Silently fail - don't break the app for logging
      }
    }
  }

  /**
   * Log warnings (potential issues)
   */
  warn(module: LogModule, message: string, data?: Record<string, unknown>): void {
    const formatted = `[${module}] ${message}`;

    if (data) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }

    // Log as breadcrumb with WARN prefix
    try {
      const breadcrumb = data
        ? `WARN: ${formatted} ${JSON.stringify(data)}`
        : `WARN: ${formatted}`;
      crashlytics().log(breadcrumb);
    } catch {
      // Silently fail
    }
  }

  /**
   * Log and report errors to Crashlytics
   */
  error(module: LogModule, message: string, error?: Error | unknown): void {
    const formatted = `[${module}] ${message}`;

    // Always log errors to console
    console.error(formatted, error);

    // Only report to Crashlytics in production
    if (!__DEV__) {
      try {
        // Convert to Error if needed
        const jsError =
          error instanceof Error
            ? error
            : new Error(error ? String(error) : message);

        // Add module context
        crashlytics().setAttribute('module', module);

        // Record the non-fatal error
        crashlytics().recordError(jsError, formatted);
      } catch {
        // Silently fail - don't break the app for logging
      }
    }
  }

  /**
   * Create a module-scoped logger
   * Usage: const log = getLoggingService().createLogger('Upload');
   */
  createLogger(module: LogModule): ModuleLogger {
    return {
      debug: (message: string, data?: Record<string, unknown>) =>
        this.debug(module, message, data),
      info: (message: string, data?: Record<string, unknown>) =>
        this.info(module, message, data),
      warn: (message: string, data?: Record<string, unknown>) =>
        this.warn(module, message, data),
      error: (message: string, error?: Error | unknown) =>
        this.error(module, message, error),
    };
  }

  /**
   * Test crash (development only)
   * Use to verify Crashlytics is working
   */
  testCrash(): void {
    if (!__DEV__) return;
    console.warn('[Logging] Triggering test crash...');
    crashlytics().crash();
  }

  /**
   * Test non-fatal error reporting
   * Use to verify error reporting without crashing
   */
  testNonFatalError(): void {
    if (!__DEV__) return;
    console.warn('[Logging] Triggering test non-fatal error...');
    const testError = new Error('Test non-fatal error from Unum app');
    testError.name = 'TestError';
    crashlytics().recordError(testError, 'Test error triggered manually');
  }

  /**
   * Test logging breadcrumbs
   * Logs several breadcrumbs that will appear in crash reports
   */
  testBreadcrumbs(): void {
    if (!__DEV__) return;
    console.warn('[Logging] Logging test breadcrumbs...');
    crashlytics().log('Test breadcrumb 1: User opened test');
    crashlytics().log('Test breadcrumb 2: User tapped button');
    crashlytics().log('Test breadcrumb 3: Network request started');
    crashlytics().log('Test breadcrumb 4: Network request completed');
    console.log('[Logging] Breadcrumbs logged - trigger an error to see them');
  }

  /**
   * Run all tests (non-fatal)
   * Tests error reporting without crashing the app
   */
  runAllTests(): void {
    if (!__DEV__) return;
    console.log('[Logging] Running Crashlytics tests...');

    // Set test attributes
    crashlytics().setAttribute('test_run', 'true');
    crashlytics().setAttribute('test_timestamp', new Date().toISOString());

    // Log breadcrumbs
    this.testBreadcrumbs();

    // Report non-fatal error
    this.testNonFatalError();

    // Also test through our service methods
    this.error('App', 'Test error via logging service', new Error('Service test error'));
    this.warn('App', 'Test warning via logging service');
    this.info('App', 'Test info via logging service');

    console.log('[Logging] Tests complete! Check Firebase Console > Crashlytics');
  }
}

// ============ Singleton Factory ============

let instance: LoggingService | null = null;

export function getLoggingService(): LoggingService {
  if (!instance) {
    instance = new LoggingService();
  }
  return instance;
}

export function resetLoggingService(): void {
  instance = null;
}
