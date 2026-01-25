/**
 * useSync Hook
 *
 * React hook for managing sync state and operations.
 * Provides UI-friendly interface to the SyncService.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSyncService, SyncService, SyncEventData } from '../services/sync.service';
import type { SyncResult, QueueStatus } from '../shared/types';

// ============ Types ============

export interface UseSyncResult {
  // State
  isSyncing: boolean;
  lastSync: string | null;
  queueStatus: QueueStatus;
  lastResult: SyncResult | null;
  error: Error | null;

  // Actions
  sync: () => Promise<SyncResult>;
  clearFailed: () => Promise<number>;
  startBackgroundSync: () => void;
  stopBackgroundSync: () => void;

  // Refresh status
  refreshStatus: () => Promise<void>;
}

export interface UseSyncOptions {
  deviceId: string;
  autoStart?: boolean;
}

// ============ Hook Implementation ============

/**
 * Hook for managing sync operations
 */
export function useSync(options: UseSyncOptions): UseSyncResult {
  const { deviceId, autoStart = false } = options;

  // State
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    pending: 0,
    failed: 0,
  });
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Service ref
  const serviceRef = useRef<SyncService | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = getSyncService({
      deviceId,
      onSyncStart: () => setIsSyncing(true),
      onSyncComplete: (result) => {
        setIsSyncing(false);
        setLastResult(result);
        setError(null);
      },
      onSyncError: (err) => {
        setIsSyncing(false);
        setError(err);
      },
    });

    // Subscribe to events
    const unsubscribe = serviceRef.current.subscribe((event: SyncEventData) => {
      switch (event.type) {
        case 'start':
          setIsSyncing(true);
          break;
        case 'complete':
          setIsSyncing(false);
          if (event.result) setLastResult(event.result);
          break;
        case 'error':
          setIsSyncing(false);
          if (event.error) setError(event.error);
          break;
      }
    });

    // Load initial status
    refreshStatus();

    // Auto-start background sync if enabled
    if (autoStart) {
      serviceRef.current.startBackgroundSync();
    }

    return () => {
      unsubscribe();
    };
  }, [deviceId, autoStart]);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    if (!serviceRef.current) return;

    try {
      const status = await serviceRef.current.getStatus();
      setIsSyncing(status.isSyncing);
      setLastSync(status.lastSync);
      setQueueStatus(status.queue);
    } catch (err) {
      console.error('Failed to refresh sync status:', err);
    }
  }, []);

  // Manual sync
  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!serviceRef.current) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        conflicts: [],
        errors: [{ id: 'hook', error: 'Service not initialized' }],
      };
    }

    const result = await serviceRef.current.sync();
    await refreshStatus();
    return result;
  }, [refreshStatus]);

  // Clear failed items
  const clearFailed = useCallback(async (): Promise<number> => {
    if (!serviceRef.current) return 0;

    const count = await serviceRef.current.clearFailed();
    await refreshStatus();
    return count;
  }, [refreshStatus]);

  // Start background sync
  const startBackgroundSync = useCallback(() => {
    serviceRef.current?.startBackgroundSync();
  }, []);

  // Stop background sync
  const stopBackgroundSync = useCallback(() => {
    serviceRef.current?.stopBackgroundSync();
  }, []);

  return {
    isSyncing,
    lastSync,
    queueStatus,
    lastResult,
    error,
    sync,
    clearFailed,
    startBackgroundSync,
    stopBackgroundSync,
    refreshStatus,
  };
}
