/**
 * useDeviceIdentity Hook
 *
 * Manages device identity for AWS operations.
 * Generates and persists a unique device ID for anonymous user identification.
 */

import { useState, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { FEATURE_FLAGS, BFF_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';

interface UseDeviceIdentityResult {
  /** The device ID (null if not yet initialized) */
  deviceId: string | null;
  /** Ref to deviceId for use in async callbacks (avoids stale closures) */
  deviceIdRef: React.MutableRefObject<string | null>;
  /** Whether AWS services are ready (deviceId loaded) */
  isReady: boolean;
  /** Whether initialization is in progress */
  isLoading: boolean;
}

export function useDeviceIdentity(): UseDeviceIdentityResult {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(!FEATURE_FLAGS.USE_AWS_BACKEND);
  const [isLoading, setIsLoading] = useState(FEATURE_FLAGS.USE_AWS_BACKEND);

  // Ref to track deviceId for async checks (refs update immediately, state doesn't)
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initDeviceId = async () => {
      if (!FEATURE_FLAGS.USE_AWS_BACKEND) {
        setIsLoading(false);
        return;
      }

      try {
        let id = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);

        if (!id) {
          id = Crypto.randomUUID();
          await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, id);
        }

        deviceIdRef.current = id;
        setDeviceId(id);
        setIsReady(true);
      } catch (err) {
        console.error('[useDeviceIdentity] Failed to initialize:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initDeviceId();
  }, []);

  return {
    deviceId,
    deviceIdRef,
    isReady,
    isLoading,
  };
}
