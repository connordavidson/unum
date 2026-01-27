/**
 * useAppLock Hook
 *
 * Manages app lock state with biometric authentication.
 * Shows lock screen only when app first loads (not on resume from background).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isBiometricLockEnabled,
  getBiometricStatus,
} from '../services/biometric.service';

interface UseAppLockResult {
  isLocked: boolean;
  unlock: () => void;
}

export function useAppLock(): UseAppLockResult {
  const [isLocked, setIsLocked] = useState(false);
  const hasCheckedInitial = useRef(false);

  // Check lock status only on initial app load
  useEffect(() => {
    if (hasCheckedInitial.current) return;
    hasCheckedInitial.current = true;

    const checkLockStatus = async () => {
      const enabled = await isBiometricLockEnabled();
      const status = await getBiometricStatus();

      if (enabled && status.isAvailable) {
        setIsLocked(true);
      }
    };

    checkLockStatus();
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  return {
    isLocked,
    unlock,
  };
}
