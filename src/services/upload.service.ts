/**
 * Upload Service
 *
 * Business logic for upload operations with dual-write support.
 * Writes to local storage first, then syncs to remote when online.
 */

import { FEATURE_FLAGS } from '../shared/constants';
import type {
  Upload,
  BoundingBox,
  PaginationCursor,
  Coordinates,
  MediaType,
} from '../shared/types';
import {
  getLocalUploadRepository,
  LocalUploadRepository,
} from '../repositories/local';
import {
  getRemoteUploadRepository,
  RemoteUploadRepository,
} from '../repositories/remote';
import type {
  BFFUpload,
  CreateUploadInput,
  UploadQueryResult,
} from '../repositories/interfaces/upload.repository';

// ============ Types ============

export interface CreateUploadParams {
  type: MediaType;
  mediaUrl: string;
  mediaKey?: string;           // S3 object key (for remote storage)
  coordinates: Coordinates;
  caption?: string;
  userId: string;              // Apple user ID (authenticated user)
  deviceId: string;            // Device identifier
}

export interface UploadServiceConfig {
  useRemote: boolean;
}

// ============ Service Implementation ============

/**
 * Upload Service
 *
 * Provides upload CRUD operations with offline-first strategy:
 * - Writes always go to local first
 * - When online and USE_AWS_BACKEND is enabled, also writes to remote
 * - Reads prefer local cache, with optional remote refresh
 */
export class UploadService {
  private localRepo: LocalUploadRepository;
  private remoteRepo: RemoteUploadRepository;
  private config: UploadServiceConfig;

  constructor(config: UploadServiceConfig) {
    this.config = config;
    this.localRepo = getLocalUploadRepository();
    this.remoteRepo = getRemoteUploadRepository();
  }

  /**
   * Check if remote operations are enabled
   */
  private get useRemote(): boolean {
    return this.config.useRemote && FEATURE_FLAGS.USE_AWS_BACKEND;
  }

  // ============ Create ============

  /**
   * Create a new upload
   * Always writes to local first, then remote if enabled
   */
  async createUpload(params: CreateUploadParams): Promise<BFFUpload> {
    console.log('[UploadService] createUpload() called');
    console.log('[UploadService] useRemote:', this.useRemote);
    console.log('[UploadService] mediaKey:', params.mediaKey);

    const input: CreateUploadInput = {
      type: params.type,
      mediaUrl: params.mediaUrl,
      mediaKey: params.mediaKey,
      coordinates: params.coordinates,
      caption: params.caption,
      userId: params.userId,
      deviceId: params.deviceId,
    };

    // Always create locally first
    console.log('[UploadService] Creating local upload...');
    const localUpload = await this.localRepo.create(input);
    console.log('[UploadService] Local upload created:', localUpload.id);

    // If remote is enabled, also create remotely
    if (this.useRemote) {
      console.log('[UploadService] Creating remote upload in DynamoDB...');
      // Note: We throw errors during initial setup/debugging.
      // For production offline-first behavior, wrap in try/catch and mark as pending sync.
      await this.remoteRepo.create(input);
      console.log('[UploadService] DynamoDB upload successful');
      // Mark local as synced
      await this.localRepo.markSynced(localUpload.id);
    } else {
      console.log('[UploadService] Remote not enabled, skipping DynamoDB');
    }

    return localUpload;
  }

  // ============ Read ============

  /**
   * Get upload by ID
   * Reads from local first, falls back to remote
   */
  async getById(id: string): Promise<BFFUpload | null> {
    // Try local first
    const local = await this.localRepo.getById(id);
    if (local) {
      return local;
    }

    // If not found locally and remote is enabled, try remote
    if (this.useRemote) {
      const remote = await this.remoteRepo.getById(id);
      if (remote) {
        // Could cache locally here for future reads
        return remote;
      }
    }

    return null;
  }

  /**
   * Get uploads by device ID
   */
  async getByDeviceId(
    deviceId: string,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    // For device-specific queries, prefer local
    return this.localRepo.getByDeviceId(deviceId, cursor);
  }

  /**
   * Get uploads within a geographic region
   * For map views, combines local and remote data
   */
  async getByLocation(
    boundingBox: BoundingBox,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    // Get local uploads
    const localResult = await this.localRepo.getByLocation(boundingBox, cursor);

    // If remote is not enabled, return local only
    if (!this.useRemote) {
      return localResult;
    }

    try {
      // Get remote uploads
      const remoteResult = await this.remoteRepo.getByLocation(boundingBox, cursor);

      // Merge results, preferring local versions for duplicates
      const localIds = new Set(localResult.uploads.map((u) => u.id));
      const mergedUploads = [
        ...localResult.uploads,
        ...remoteResult.uploads.filter((u) => !localIds.has(u.id)),
      ];

      // Sort by timestamp descending
      mergedUploads.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        uploads: mergedUploads,
        nextCursor: remoteResult.nextCursor || localResult.nextCursor,
        totalCount: mergedUploads.length,
      };
    } catch (error) {
      console.error('Failed to fetch remote uploads:', error);
      // Fall back to local only
      return localResult;
    }
  }

  /**
   * Get all uploads (local only)
   */
  async getAll(): Promise<BFFUpload[]> {
    return this.localRepo.getAll();
  }

  /**
   * Get all uploads in legacy format (for backward compatibility)
   */
  async getAllLegacy(): Promise<Upload[]> {
    return this.localRepo.getAllLegacy();
  }

  // ============ Update ============

  /**
   * Update upload fields
   */
  async update(id: string, updates: Partial<BFFUpload>): Promise<BFFUpload> {
    // Update locally first
    const updated = await this.localRepo.update(id, updates);

    // If remote is enabled, also update remotely
    if (this.useRemote) {
      try {
        await this.remoteRepo.update(id, updates);
      } catch (error) {
        console.error('Failed to sync upload update to remote:', error);
      }
    }

    return updated;
  }

  /**
   * Update vote count
   */
  async updateVoteCount(id: string, delta: number): Promise<number> {
    // Update locally first
    const newCount = await this.localRepo.updateVoteCount(id, delta);

    // If remote is enabled, also update remotely
    if (this.useRemote) {
      try {
        await this.remoteRepo.updateVoteCount(id, delta);
      } catch (error) {
        console.error('Failed to sync vote count to remote:', error);
      }
    }

    return newCount;
  }

  // ============ Delete ============

  /**
   * Delete an upload
   */
  async delete(id: string): Promise<void> {
    // Delete locally first
    await this.localRepo.delete(id);

    // If remote is enabled, also delete remotely
    if (this.useRemote) {
      try {
        await this.remoteRepo.delete(id);
      } catch (error) {
        console.error('Failed to delete upload from remote:', error);
      }
    }
  }

  // ============ Sync ============

  /**
   * Get uploads pending sync
   */
  async getPendingSync(): Promise<BFFUpload[]> {
    return this.localRepo.getPendingSync();
  }

  /**
   * Sync pending uploads to remote
   */
  async syncPending(): Promise<{ synced: number; failed: number }> {
    if (!this.useRemote) {
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingSync();
    let synced = 0;
    let failed = 0;

    for (const upload of pending) {
      try {
        // Check if exists remotely
        const remote = await this.remoteRepo.getById(upload.id);
        if (remote) {
          // Update remote
          await this.remoteRepo.update(upload.id, upload);
        } else {
          // Create remote
          await this.remoteRepo.create({
            type: upload.type,
            mediaUrl: upload.mediaUrl,
            coordinates: upload.coordinates,
            caption: upload.caption,
            userId: upload.userId,
            deviceId: upload.deviceId,
          });
        }
        await this.localRepo.markSynced(upload.id);
        synced++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.localRepo.markFailed(upload.id, errorMessage);
        failed++;
      }
    }

    return { synced, failed };
  }

  // ============ Legacy Compatibility ============

  /**
   * Save uploads in legacy format
   */
  async saveAllLegacy(uploads: Upload[]): Promise<void> {
    await this.localRepo.saveAllLegacy(uploads);
  }
}

// ============ Factory ============

let serviceInstance: UploadService | null = null;

export function getUploadService(config?: Partial<UploadServiceConfig>): UploadService {
  if (!serviceInstance) {
    serviceInstance = new UploadService({
      useRemote: config?.useRemote ?? FEATURE_FLAGS.USE_AWS_BACKEND,
    });
  }
  return serviceInstance;
}

export function resetUploadService(): void {
  serviceInstance = null;
}
