/**
 * Logging Service Tests
 */

import {
  getLoggingService,
  resetLoggingService,
  LogModule,
} from '../logging.service';
import crashlytics from '@react-native-firebase/crashlytics';

// Get mock instance
const mockCrashlytics = crashlytics();

describe('LoggingService', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    // Reset singleton
    resetLoggingService();

    // Reset mocks
    jest.clearAllMocks();

    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('initialize', () => {
    it('should enable crashlytics collection', async () => {
      const service = getLoggingService();
      await service.initialize();

      expect(mockCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(true);
    });

    it('should only initialize once', async () => {
      const service = getLoggingService();
      await service.initialize();
      await service.initialize();

      expect(mockCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledTimes(1);
    });
  });

  describe('setUserId', () => {
    it('should set user ID in crashlytics', async () => {
      const service = getLoggingService();
      await service.setUserId('user-123');

      expect(mockCrashlytics.setUserId).toHaveBeenCalledWith('user-123');
    });

    it('should set empty string when user ID is null', async () => {
      const service = getLoggingService();
      await service.setUserId(null);

      expect(mockCrashlytics.setUserId).toHaveBeenCalledWith('');
    });
  });

  describe('setAttribute', () => {
    it('should set attribute in crashlytics', async () => {
      const service = getLoggingService();
      await service.setAttribute('key', 'value');

      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('debug', () => {
    it('should log to console in dev mode', () => {
      const service = getLoggingService();
      service.debug('Upload', 'Test message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Upload] Test message');
    });

    it('should log with data in dev mode', () => {
      const service = getLoggingService();
      service.debug('Upload', 'Test message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledWith('[Upload] Test message', { key: 'value' });
    });

    it('should not log to crashlytics', () => {
      const service = getLoggingService();
      service.debug('Upload', 'Test message');

      expect(mockCrashlytics.log).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log to console in dev mode', () => {
      const service = getLoggingService();
      service.info('Media', 'Info message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Media] Info message');
    });

    it('should log with data in dev mode', () => {
      const service = getLoggingService();
      service.info('Media', 'Info message', { count: 5 });

      expect(consoleSpy.log).toHaveBeenCalledWith('[Media] Info message', { count: 5 });
    });

    // Note: In dev mode (__DEV__ = true), info logs don't go to crashlytics
    it('should not log to crashlytics in dev mode', () => {
      const service = getLoggingService();
      service.info('Media', 'Info message');

      expect(mockCrashlytics.log).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log to console.warn', () => {
      const service = getLoggingService();
      service.warn('Vote', 'Warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Vote] Warning message');
    });

    it('should log with data', () => {
      const service = getLoggingService();
      service.warn('Vote', 'Warning message', { retries: 3 });

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Vote] Warning message', { retries: 3 });
    });

    it('should log to crashlytics as breadcrumb', () => {
      const service = getLoggingService();
      service.warn('Vote', 'Warning message');

      expect(mockCrashlytics.log).toHaveBeenCalledWith('WARN: [Vote] Warning message');
    });

    it('should include data in crashlytics breadcrumb', () => {
      const service = getLoggingService();
      service.warn('Vote', 'Warning message', { retries: 3 });

      expect(mockCrashlytics.log).toHaveBeenCalledWith(
        'WARN: [Vote] Warning message {"retries":3}'
      );
    });
  });

  describe('error', () => {
    it('should log to console.error', () => {
      const service = getLoggingService();
      const testError = new Error('Test error');
      service.error('API', 'Operation failed', testError);

      expect(consoleSpy.error).toHaveBeenCalledWith('[API] Operation failed', testError);
    });

    it('should log without error object', () => {
      const service = getLoggingService();
      service.error('API', 'Operation failed');

      expect(consoleSpy.error).toHaveBeenCalledWith('[API] Operation failed', undefined);
    });

    // Note: In dev mode (__DEV__ = true), errors don't go to crashlytics
    it('should not report to crashlytics in dev mode', () => {
      const service = getLoggingService();
      service.error('API', 'Operation failed', new Error('Test'));

      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });
  });

  describe('createLogger', () => {
    it('should create a module-scoped logger', () => {
      const service = getLoggingService();
      const logger = service.createLogger('Camera');

      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
    });

    it('should prefix messages with module name', () => {
      const service = getLoggingService();
      const logger = service.createLogger('Camera');

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Camera] Debug message');
      expect(consoleSpy.log).toHaveBeenCalledWith('[Camera] Info message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[Camera] Warn message');
      expect(consoleSpy.error).toHaveBeenCalledWith('[Camera] Error message', undefined);
    });
  });

  describe('test methods', () => {
    it('testCrash should call crashlytics.crash', () => {
      const service = getLoggingService();
      service.testCrash();

      expect(mockCrashlytics.crash).toHaveBeenCalled();
    });

    it('testNonFatalError should record error', () => {
      const service = getLoggingService();
      service.testNonFatalError();

      expect(mockCrashlytics.recordError).toHaveBeenCalledWith(
        expect.any(Error),
        'Test error triggered manually'
      );
    });

    it('testBreadcrumbs should log breadcrumbs', () => {
      const service = getLoggingService();
      service.testBreadcrumbs();

      expect(mockCrashlytics.log).toHaveBeenCalledTimes(4);
    });

    it('runAllTests should set attributes and run tests', () => {
      const service = getLoggingService();
      service.runAllTests();

      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('test_run', 'true');
      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('test_timestamp', expect.any(String));
      expect(mockCrashlytics.recordError).toHaveBeenCalled();
    });
  });
});

describe('getLoggingService', () => {
  beforeEach(() => {
    resetLoggingService();
  });

  it('should return singleton instance', () => {
    const instance1 = getLoggingService();
    const instance2 = getLoggingService();

    expect(instance1).toBe(instance2);
  });
});

describe('resetLoggingService', () => {
  it('should reset the singleton', () => {
    const instance1 = getLoggingService();
    resetLoggingService();
    const instance2 = getLoggingService();

    expect(instance1).not.toBe(instance2);
  });
});
