/**
 * useBFFInit Hook
 *
 * Initializes the BFF layer on app startup.
 * Handles migration, device identity, and service initialization.
 */

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { FEATURE_FLAGS, BFF_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import {
  runMigration,
  isMigrationNeeded,
  getMigrationInfo,
  MigrationResult,
} from '../migrations';
import { getUploadService, resetUploadService } from '../services/upload.service';
import { getVoteService, resetVoteService } from '../services/vote.service';
import { getMediaService, resetMediaService } from '../services/media.service';
import { getSyncService, resetSyncService } from '../services/sync.service';

// ============ Types ============

export interface BFFInitState {
  isInitialized: boolean;
  isInitializing: boolean;
  deviceId: string | null;
  migrationResult: MigrationResult | null;
  error: Error | null;
}

export interface UseBFFInitResult extends BFFInitState {
  // Actions
  initialize: () => Promise<void>;
  reset: () => Promise<void>;
}

export interface UseBFFInitOptions {
  autoInit?: boolean;
  enableBackgroundSync?: boolean;
}

// ============ Hook Implementation ============

/**
 * Hook for initializing the BFF layer
 */
export function useBFFInit(options: UseBFFInitOptions = {}): UseBFFInitResult {
  const { autoInit = true, enableBackgroundSync = false } = options;

  const [state, setState] = useState<BFFInitState>({
    isInitialized: false,
    isInitializing: false,
    deviceId: null,
    migrationResult: null,
    error: null,
  });

  /**
   * Get or create device ID
   */
  const getDeviceId = useCallback(async (): Promise<string> => {
    const existing = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
    if (existing) {
      return existing;
    }

    const newId = uuidv4();
    await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, newId);
    return newId;
  }, []);

  /**
   * Initialize the BFF layer
   */
  const initialize = useCallback(async () => {
    if (state.isInitializing || state.isInitialized) {
      return;
    }

    setState((prev) => ({ ...prev, isInitializing: true, error: null }));

    try {
      // Step 1: Run migration if needed
      let migrationResult: MigrationResult | null = null;
      if (await isMigrationNeeded()) {
        migrationResult = await runMigration();
        if (!migrationResult.success && migrationResult.errors.length > 0) {
          console.warn('Migration completed with errors:', migrationResult.errors);
        }
      }

      // Step 2: Get device ID
      const deviceId = await getDeviceId();

      // Step 3: Initialize services
      const serviceConfig = {
        deviceId,
        useRemote: FEATURE_FLAGS.USE_AWS_BACKEND,
      };

      getUploadService(serviceConfig);
      getVoteService(serviceConfig);
      getMediaService({ useRemote: FEATURE_FLAGS.USE_AWS_BACKEND });

      // Step 4: Initialize sync service
      const syncService = getSyncService({ deviceId });
      if (enableBackgroundSync && FEATURE_FLAGS.ENABLE_BACKGROUND_SYNC) {
        syncService.startBackgroundSync();
      }

      setState({
        isInitialized: true,
        isInitializing: false,
        deviceId,
        migrationResult,
        error: null,
      });

      console.log('BFF layer initialized successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Initialization failed');
      setState((prev) => ({
        ...prev,
        isInitializing: false,
        error: err,
      }));
      console.error('BFF initialization failed:', error);
    }
  }, [state.isInitializing, state.isInitialized, getDeviceId, enableBackgroundSync]);

  /**
   * Reset the BFF layer (for testing/debugging)
   */
  const reset = useCallback(async () => {
    // Stop background sync
    resetSyncService();

    // Reset services
    resetUploadService();
    resetVoteService();
    resetMediaService();

    // Reset state
    setState({
      isInitialized: false,
      isInitializing: false,
      deviceId: null,
      migrationResult: null,
      error: null,
    });

    console.log('BFF layer reset');
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit && !state.isInitialized && !state.isInitializing) {
      initialize();
    }
  }, [autoInit, state.isInitialized, state.isInitializing, initialize]);

  return {
    ...state,
    initialize,
    reset,
  };
}

/**
 * Hook for accessing device ID
 */
export function useDeviceId(): {
  deviceId: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDeviceId = useCallback(async () => {
    setIsLoading(true);
    try {
      const id = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
      setDeviceId(id);
    } catch (error) {
      console.error('Failed to load device ID:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeviceId();
  }, [loadDeviceId]);

  return {
    deviceId,
    isLoading,
    refresh: loadDeviceId,
  };
}
