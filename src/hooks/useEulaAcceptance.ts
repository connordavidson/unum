/**
 * EULA Acceptance Hook
 *
 * Tracks whether the user has accepted the Terms of Service / EULA.
 * Stores acceptance flag in AsyncStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EULA_KEY = 'unum_eula_accepted_v1';

export function useEulaAcceptance() {
  const [isAccepted, setIsAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    checkAcceptance();
  }, []);

  const checkAcceptance = useCallback(async () => {
    try {
      const value = await AsyncStorage.getItem(EULA_KEY);
      setIsAccepted(value === 'true');
    } catch {
      setIsAccepted(false);
    }
  }, []);

  const acceptEula = useCallback(async () => {
    try {
      await AsyncStorage.setItem(EULA_KEY, 'true');
      setIsAccepted(true);
    } catch {
      // Silently fail — user can retry
    }
  }, []);

  return { isAccepted, acceptEula, checkAcceptance };
}
