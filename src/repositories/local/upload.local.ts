/**
 * Local Upload Repository
 *
 * AsyncStorage-based implementation of IUploadRepository.
 * Maintains backward compatibility with existing Upload format.
 */

import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS, API_CONFIG } from '../../shared/constants';
import { TEST_UPLOADS } from '../../data/testUploads';
import { BaseLocalRepository } from './base.local';
import type { Upload, BoundingBox, PaginationCursor, Coordinates } from '../../shared/types';
import type {
  IUploadRepository,
  BFFUpload,
  CreateUploadInput,
  UploadQueryResult,
} from '../interfaces/upload.repository';

/**
 * Convert BFFUpload to legacy Upload format
 */
function toLegacyUpload(bffUpload: BFFUpload): Upload {
  return {
    id: bffUpload.id,
    type: bffUpload.type,
    data: bffUpload.mediaUrl,
    coordinates: bffUpload.coordinates,
    timestamp: bffUpload.timestamp,
    caption: bffUpload.caption,
    votes: bffUpload.voteCount,
  };
}

/**
 * Convert Upload to BFFUpload format
 */
function toBFFUpload(upload: Upload, userId: string, deviceId: string): BFFUpload {
  return {
    id: upload.id,
    type: upload.type,
    mediaUrl: upload.data,
    coordinates: upload.coordinates,
    timestamp: upload.timestamp,
    caption: upload.caption,
    voteCount: upload.votes,
    userId,
    deviceId,
    createdAt: upload.timestamp,
    updatedAt: upload.timestamp,
    syncStatus: 'synced', // Local data is always "synced" locally
  };
}

/**
 * Check if a point is within a bounding box
 */
function isInBoundingBox(coords: Coordinates, box: BoundingBox): boolean {
  const [lat, lon] = coords;
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

/**
 * Local Upload Repository Implementation
 */
export class LocalUploadRepository extends BaseLocalRepository implements IUploadRepository {
  /**
   * Load all uploads from storage
   */
  private async loadUploads(): Promise<Upload[]> {
    // If using test data, seed first
    if (API_CONFIG.USE_TEST_DATA) {
      return TEST_UPLOADS;
    }

    return this.loadFromStorage<Upload[]>(STORAGE_KEYS.UPLOADS, []);
  }

  /**
   * Save all uploads to storage
   */
  private async saveUploads(uploads: Upload[]): Promise<void> {
    await this.saveToStorage(STORAGE_KEYS.UPLOADS, uploads);
  }

  // ============ Create ============

  async create(input: CreateUploadInput): Promise<BFFUpload> {
    const uploads = await this.loadUploads();
    const now = new Date().toISOString();

    // Create new upload in legacy format
    const newUpload: Upload = {
      id: Crypto.randomUUID(),
      type: input.type,
      data: input.mediaUrl,
      coordinates: input.coordinates,
      timestamp: now,
      caption: input.caption,
      votes: 0,
    };

    // Prepend to list (newest first)
    const updatedUploads = [newUpload, ...uploads];
    await this.saveUploads(updatedUploads);

    return toBFFUpload(newUpload, input.userId, input.deviceId);
  }

  // ============ Read ============

  async getById(id: string): Promise<BFFUpload | null> {
    const uploads = await this.loadUploads();
    const deviceId = await this.ensureDeviceId();

    const upload = uploads.find((u) => u.id === id);
    // Legacy format doesn't store userId, use deviceId as fallback
    return upload ? toBFFUpload(upload, deviceId, deviceId) : null;
  }

  async getByDeviceId(
    deviceId: string,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    // In local storage, we don't track device IDs per upload
    // Return all uploads for now
    const uploads = await this.loadUploads();
    const currentDeviceId = await this.ensureDeviceId();

    const limit = cursor?.limit || 50;
    const offset = cursor?.lastEvaluatedKey ? parseInt(cursor.lastEvaluatedKey, 10) : 0;

    const paginatedUploads = uploads.slice(offset, offset + limit);
    const hasMore = offset + limit < uploads.length;

    return {
      // Legacy format doesn't store userId, use deviceId as fallback
      uploads: paginatedUploads.map((u) => toBFFUpload(u, currentDeviceId, currentDeviceId)),
      nextCursor: hasMore ? String(offset + limit) : undefined,
      totalCount: uploads.length,
    };
  }

  async getByLocation(
    boundingBox: BoundingBox,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    const uploads = await this.loadUploads();
    const deviceId = await this.ensureDeviceId();

    // Filter by bounding box
    const filtered = uploads.filter((u) => isInBoundingBox(u.coordinates, boundingBox));

    const limit = cursor?.limit || 50;
    const offset = cursor?.lastEvaluatedKey ? parseInt(cursor.lastEvaluatedKey, 10) : 0;

    const paginatedUploads = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    return {
      // Legacy format doesn't store userId, use deviceId as fallback
      uploads: paginatedUploads.map((u) => toBFFUpload(u, deviceId, deviceId)),
      nextCursor: hasMore ? String(offset + limit) : undefined,
      totalCount: filtered.length,
    };
  }

  async getAll(): Promise<BFFUpload[]> {
    const uploads = await this.loadUploads();
    const deviceId = await this.ensureDeviceId();
    // Legacy format doesn't store userId, use deviceId as fallback
    return uploads.map((u) => toBFFUpload(u, deviceId, deviceId));
  }

  // ============ Update ============

  async update(id: string, updates: Partial<BFFUpload>): Promise<BFFUpload> {
    const uploads = await this.loadUploads();
    const deviceId = await this.ensureDeviceId();

    const index = uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      throw new Error(`Upload not found: ${id}`);
    }

    // Apply updates to legacy format
    const existingUpload = uploads[index];
    const updatedUpload: Upload = {
      ...existingUpload,
      ...(updates.mediaUrl && { data: updates.mediaUrl }),
      ...(updates.caption !== undefined && { caption: updates.caption }),
      ...(updates.voteCount !== undefined && { votes: updates.voteCount }),
    };

    uploads[index] = updatedUpload;
    await this.saveUploads(uploads);

    // Legacy format doesn't store userId, use deviceId as fallback
    return toBFFUpload(updatedUpload, deviceId, deviceId);
  }

  async updateVoteCount(id: string, delta: number): Promise<number> {
    const uploads = await this.loadUploads();

    const index = uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      throw new Error(`Upload not found: ${id}`);
    }

    const newVoteCount = uploads[index].votes + delta;
    uploads[index] = { ...uploads[index], votes: newVoteCount };
    await this.saveUploads(uploads);

    return newVoteCount;
  }

  async markSynced(id: string): Promise<void> {
    // No-op for local repository - local data is always "synced"
  }

  async markFailed(id: string, error: string): Promise<void> {
    // No-op for local repository
    console.warn(`Upload ${id} sync failed: ${error}`);
  }

  // ============ Delete ============

  async delete(id: string): Promise<void> {
    const uploads = await this.loadUploads();

    const filtered = uploads.filter((u) => u.id !== id);
    await this.saveUploads(filtered);
  }

  // ============ Sync ============

  async getPendingSync(): Promise<BFFUpload[]> {
    // Local repository has no pending sync items
    return [];
  }

  async getFailedSync(): Promise<BFFUpload[]> {
    // Local repository has no failed sync items
    return [];
  }

  // ============ Legacy Compatibility ============

  /**
   * Get all uploads in legacy format (for existing hook compatibility)
   */
  async getAllLegacy(): Promise<Upload[]> {
    return this.loadUploads();
  }

  /**
   * Save uploads in legacy format (for existing hook compatibility)
   */
  async saveAllLegacy(uploads: Upload[]): Promise<void> {
    await this.saveUploads(uploads);
  }
}

// Singleton instance
let instance: LocalUploadRepository | null = null;

export function getLocalUploadRepository(): LocalUploadRepository {
  if (!instance) {
    instance = new LocalUploadRepository();
  }
  return instance;
}
