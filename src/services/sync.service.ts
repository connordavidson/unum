/**
 * Sync Service
 *
 * Manages offline queue and synchronization between local and remote storage.
 * Handles background sync, conflict resolution, and queue management.
 */

import { FEATURE_FLAGS, BFF_CONFIG, BFF_STORAGE_KEYS } from '../shared/constants';
import { getStoredJSON, setStoredJSON } from '../shared/utils';
import type { SyncQueueItem, SyncResult, QueueStatus } from '../shared/types';
import { getUploadService, UploadService } from './upload.service';
import { getVoteService, VoteService } from './vote.service';

// ============ Types ============

export interface SyncServiceConfig {
  deviceId: string;
  onSyncStart?: () => void;
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error) => void;
}

export type SyncEventType = 'start' | 'complete' | 'error' | 'progress';

export interface SyncEventData {
  type: SyncEventType;
  result?: SyncResult;
  error?: Error;
  progress?: number;
}

export type SyncEventListener = (event: SyncEventData) => void;

// ============ Service Implementation ============

/**
 * Sync Service
 *
 * Coordinates synchronization between local and remote storage:
 * - Maintains an offline queue for pending operations
 * - Processes queue when online
 * - Handles retry logic and failure tracking
 * - Emits events for UI updates
 */
export class SyncService {
  private config: SyncServiceConfig;
  private uploadService: UploadService;
  private voteService: VoteService;
  private isSyncing: boolean = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<SyncEventListener> = new Set();

  constructor(config: SyncServiceConfig) {
    this.config = config;
    this.uploadService = getUploadService();
    this.voteService = getVoteService({ deviceId: config.deviceId });
  }

  // ============ Event Management ============

  /**
   * Subscribe to sync events
   */
  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit sync event
   */
  private emit(event: SyncEventData): void {
    this.listeners.forEach((listener) => listener(event));
  }

  // ============ Queue Management ============

  /**
   * Add item to sync queue
   */
  async addToQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const queue = await this.getQueue();

    const newItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    queue.push(newItem);
    await this.saveQueue(queue);
  }

  /**
   * Get current sync queue
   */
  async getQueue(): Promise<SyncQueueItem[]> {
    return (await getStoredJSON<SyncQueueItem[]>(BFF_STORAGE_KEYS.SYNC_QUEUE)) || [];
  }

  /**
   * Save sync queue
   */
  private async saveQueue(queue: SyncQueueItem[]): Promise<void> {
    await setStoredJSON(BFF_STORAGE_KEYS.SYNC_QUEUE, queue);
  }

  /**
   * Remove item from queue
   */
  private async removeFromQueue(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await this.saveQueue(filtered);
  }

  /**
   * Update item retry count
   */
  private async updateRetryCount(id: string, error?: string): Promise<void> {
    const queue = await this.getQueue();
    const item = queue.find((i) => i.id === id);

    if (item) {
      item.retryCount++;
      item.lastError = error;
      await this.saveQueue(queue);
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const queue = await this.getQueue();
    const pending = queue.filter((i) => i.retryCount < BFF_CONFIG.MAX_SYNC_RETRIES);
    const failed = queue.filter((i) => i.retryCount >= BFF_CONFIG.MAX_SYNC_RETRIES);

    return {
      pending: pending.length,
      failed: failed.length,
      oldest: pending.length > 0 ? pending[0].createdAt : undefined,
    };
  }

  /**
   * Clear failed items from queue
   */
  async clearFailed(): Promise<number> {
    const queue = await this.getQueue();
    const failed = queue.filter((i) => i.retryCount >= BFF_CONFIG.MAX_SYNC_RETRIES);
    const remaining = queue.filter((i) => i.retryCount < BFF_CONFIG.MAX_SYNC_RETRIES);

    await this.saveQueue(remaining);
    return failed.length;
  }

  // ============ Sync Operations ============

  /**
   * Process sync queue
   */
  async processQueue(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: [],
      errors: [],
    };

    if (!FEATURE_FLAGS.USE_AWS_BACKEND) {
      return result;
    }

    const queue = await this.getQueue();
    const toProcess = queue
      .filter((i) => i.retryCount < BFF_CONFIG.MAX_SYNC_RETRIES)
      .slice(0, BFF_CONFIG.SYNC_BATCH_SIZE);

    for (const item of toProcess) {
      try {
        await this.processQueueItem(item);
        await this.removeFromQueue(item.id);
        result.synced++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.updateRetryCount(item.id, errorMessage);
        result.failed++;
        result.errors.push({ id: item.id, error: errorMessage });
      }
    }

    result.success = result.failed === 0;
    return result;
  }

  /**
   * Process a single queue item
   */
  private async processQueueItem(item: SyncQueueItem): Promise<void> {
    // Queue items are processed by the respective services
    // The services handle the actual sync logic
    // This is a placeholder for custom queue processing if needed

    switch (item.entityType) {
      case 'upload':
        // Uploads are synced through uploadService.syncPending()
        break;
      case 'vote':
        // Votes are synced through voteService.syncPending()
        break;
      default:
        console.warn(`Unknown entity type: ${item.entityType}`);
    }
  }

  /**
   * Run full sync
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        conflicts: [],
        errors: [{ id: 'sync', error: 'Sync already in progress' }],
      };
    }

    if (!FEATURE_FLAGS.USE_AWS_BACKEND) {
      return {
        success: true,
        synced: 0,
        failed: 0,
        conflicts: [],
        errors: [],
      };
    }

    this.isSyncing = true;
    this.emit({ type: 'start' });
    this.config.onSyncStart?.();

    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Sync uploads
      const uploadResult = await this.uploadService.syncPending();
      result.synced += uploadResult.synced;
      result.failed += uploadResult.failed;

      // Sync votes
      const voteResult = await this.voteService.syncPending();
      result.synced += voteResult.synced;
      result.failed += voteResult.failed;

      // Process custom queue items
      const queueResult = await this.processQueue();
      result.synced += queueResult.synced;
      result.failed += queueResult.failed;
      result.errors.push(...queueResult.errors);

      result.success = result.failed === 0;

      // Update last sync time
      await setStoredJSON(BFF_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

      this.emit({ type: 'complete', result });
      this.config.onSyncComplete?.(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown sync error');
      result.success = false;
      result.errors.push({ id: 'sync', error: err.message });

      this.emit({ type: 'error', error: err });
      this.config.onSyncError?.(err);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  // ============ Background Sync ============

  /**
   * Start background sync
   */
  startBackgroundSync(): void {
    if (this.syncInterval || !FEATURE_FLAGS.ENABLE_BACKGROUND_SYNC) {
      return;
    }

    this.syncInterval = setInterval(() => {
      this.sync().catch((error) => {
        console.error('Background sync failed:', error);
      });
    }, BFF_CONFIG.SYNC_INTERVAL_MS);

    // Run initial sync
    this.sync().catch((error) => {
      console.error('Initial sync failed:', error);
    });
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Check if sync is in progress
   */
  get syncing(): boolean {
    return this.isSyncing;
  }

  // ============ Status ============

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<string | null> {
    return getStoredJSON<string>(BFF_STORAGE_KEYS.LAST_SYNC);
  }

  /**
   * Get sync status summary
   */
  async getStatus(): Promise<{
    isSyncing: boolean;
    lastSync: string | null;
    queue: QueueStatus;
  }> {
    return {
      isSyncing: this.isSyncing,
      lastSync: await this.getLastSyncTime(),
      queue: await this.getQueueStatus(),
    };
  }
}

// ============ Factory ============

let serviceInstance: SyncService | null = null;

export function getSyncService(config?: Partial<SyncServiceConfig>): SyncService {
  if (!serviceInstance) {
    serviceInstance = new SyncService({
      deviceId: config?.deviceId ?? '',
      onSyncStart: config?.onSyncStart,
      onSyncComplete: config?.onSyncComplete,
      onSyncError: config?.onSyncError,
    });
  }
  return serviceInstance;
}

export function resetSyncService(): void {
  serviceInstance?.stopBackgroundSync();
  serviceInstance = null;
}
