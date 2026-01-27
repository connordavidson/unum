/**
 * useLogger Hook
 *
 * React hook for logging in components.
 * Automatically sets user ID for crash attribution.
 */

import { useMemo, useEffect } from 'react';
import {
  getLoggingService,
  LogModule,
  ModuleLogger,
} from '../services/logging.service';
import { useAuthContext } from '../contexts/AuthContext';

/**
 * Get a module-scoped logger for use in React components
 *
 * @param module - The module/feature name for log prefixing
 * @returns Logger with debug, info, warn, error methods
 *
 * @example
 * function CameraScreen() {
 *   const log = useLogger('Camera');
 *
 *   const handleCapture = async () => {
 *     log.info('Photo capture started');
 *     try {
 *       await takePhoto();
 *       log.info('Photo captured successfully');
 *     } catch (error) {
 *       log.error('Photo capture failed', error);
 *     }
 *   };
 * }
 */
export function useLogger(module: LogModule): ModuleLogger {
  const logger = getLoggingService();
  const { userId } = useAuthContext();

  // Set user ID when auth changes
  useEffect(() => {
    logger.setUserId(userId);
  }, [userId, logger]);

  // Return memoized module logger
  return useMemo(() => logger.createLogger(module), [module, logger]);
}
