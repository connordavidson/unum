/**
 * Remote Upload Repository
 *
 * DynamoDB-based implementation of IUploadRepository.
 * Uses single-table design with geohash for location queries.
 */

import * as Crypto from 'expo-crypto';
import ngeohash from 'ngeohash';
import {
  createUpload as dynamoCreateUpload,
  getUploadById as dynamoGetUploadById,
  updateUpload as dynamoUpdateUpload,
  updateVoteCount as dynamoUpdateVoteCount,
  deleteUpload as dynamoDeleteUpload,
  queryUploadsByGeohash,
  queryUploadsByDevice,
  createUploadPK,
  createUploadSK,
  createGeohashGSI1PK,
} from '../../api/clients/dynamodb.client';
import { dynamoConfig } from '../../api/config';
import type { BoundingBox, PaginationCursor, Coordinates } from '../../shared/types';
import type {
  IUploadRepository,
  BFFUpload,
  CreateUploadInput,
  UploadQueryResult,
} from '../interfaces/upload.repository';
import type { DynamoUploadItem } from '../../api/types';

// ============ Conversion Helpers ============

/**
 * Convert DynamoDB item to BFFUpload
 */
function fromDynamoItem(item: DynamoUploadItem): BFFUpload {
  return {
    id: item.id,
    type: item.type,
    mediaUrl: '', // Will be populated with presigned URL by service layer
    mediaKey: item.mediaKey,
    thumbnailUrl: item.thumbnailKey ? '' : undefined,
    coordinates: [item.latitude, item.longitude] as Coordinates,
    timestamp: item.timestamp,
    caption: item.caption,
    voteCount: item.voteCount,
    deviceId: item.deviceId,
    geohash: item.geohash,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    syncStatus: 'synced',
  };
}

/**
 * Convert BFFUpload to DynamoDB item
 */
function toDynamoItem(upload: BFFUpload, mediaKey: string): DynamoUploadItem {
  const [latitude, longitude] = upload.coordinates;
  const geohash = ngeohash.encode(latitude, longitude, dynamoConfig.geohashPrecision);

  return {
    PK: createUploadPK(upload.id),
    SK: createUploadSK(),
    GSI1PK: createGeohashGSI1PK(geohash),
    GSI1SK: upload.timestamp,
    id: upload.id,
    type: upload.type,
    mediaKey,
    latitude,
    longitude,
    geohash,
    timestamp: upload.timestamp,
    caption: upload.caption,
    voteCount: upload.voteCount,
    deviceId: upload.deviceId,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  };
}

/**
 * Get approximate geohash cell dimensions based on precision
 * Precision 6 ≈ 1.2km x 0.6km
 */
function getGeohashCellSize(precision: number): { latDeg: number; lonDeg: number } {
  // Approximate degrees per geohash cell at different precisions
  // These are rough estimates that work for mid-latitudes
  const sizes: Record<number, { latDeg: number; lonDeg: number }> = {
    4: { latDeg: 0.18, lonDeg: 0.18 },    // ~20km
    5: { latDeg: 0.045, lonDeg: 0.045 },  // ~5km
    6: { latDeg: 0.011, lonDeg: 0.011 },  // ~1.2km
    7: { latDeg: 0.003, lonDeg: 0.003 },  // ~150m
  };
  return sizes[precision] || sizes[6];
}

/**
 * Get all geohash prefixes that cover a bounding box
 * Uses cell-based sampling to ensure we don't miss any geohash cells
 */
function getGeohashesForBoundingBox(box: BoundingBox): string[] {
  const { minLat, maxLat, minLon, maxLon } = box;
  const precision = dynamoConfig.geohashPrecision;
  const geohashes = new Set<string>();

  // Get geohash cell size - step must be <= cell size to ensure coverage
  const cellSize = getGeohashCellSize(precision);

  // Always use cell size as step to guarantee every cell is sampled
  const latStep = cellSize.latDeg;
  const lonStep = cellSize.lonDeg;

  // Safety cap to prevent runaway iteration for huge bounding boxes
  const maxIterations = 10000;
  let iterations = 0;

  for (let lat = minLat; lat <= maxLat && iterations < maxIterations; lat += latStep) {
    for (let lon = minLon; lon <= maxLon && iterations < maxIterations; lon += lonStep) {
      const hash = ngeohash.encode(lat, lon, precision);
      geohashes.add(hash);
      iterations++;
    }
  }

  const latRange = maxLat - minLat;
  const lonRange = maxLon - minLon;
  console.log(`[RemoteUploadRepo] Geohash query: ${geohashes.size} unique hashes for bbox ${latRange.toFixed(2)}° x ${lonRange.toFixed(2)}° (${iterations} samples)`);

  return Array.from(geohashes);
}

// ============ Repository Implementation ============

/**
 * Remote Upload Repository
 */
export class RemoteUploadRepository implements IUploadRepository {
  private deviceId: string = '';

  /**
   * Initialize with device ID
   */
  async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
  }

  // ============ Create ============

  async create(input: CreateUploadInput): Promise<BFFUpload> {
    const now = new Date().toISOString();
    const id = Crypto.randomUUID();
    const [latitude, longitude] = input.coordinates;
    const geohash = ngeohash.encode(latitude, longitude, dynamoConfig.geohashPrecision);

    // Use mediaKey if provided (from S3 upload), fallback to mediaUrl for local-only
    const mediaKey = input.mediaKey || input.mediaUrl;

    const upload: BFFUpload = {
      id,
      type: input.type,
      mediaUrl: input.mediaUrl,
      mediaKey,
      coordinates: input.coordinates,
      timestamp: now,
      caption: input.caption,
      voteCount: 0,
      deviceId: input.deviceId,
      geohash,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'synced',
    };

    const dynamoItem = toDynamoItem(upload, mediaKey);
    await dynamoCreateUpload(dynamoItem);

    return upload;
  }

  // ============ Read ============

  async getById(id: string): Promise<BFFUpload | null> {
    const item = await dynamoGetUploadById(id);
    return item ? fromDynamoItem(item) : null;
  }

  async getByDeviceId(
    deviceId: string,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    const result = await queryUploadsByDevice(deviceId, {
      limit: cursor?.limit || 50,
      exclusiveStartKey: cursor?.lastEvaluatedKey
        ? JSON.parse(cursor.lastEvaluatedKey)
        : undefined,
    });

    return {
      uploads: result.items.map(fromDynamoItem),
      nextCursor: result.lastEvaluatedKey
        ? JSON.stringify(result.lastEvaluatedKey)
        : undefined,
    };
  }

  async getByLocation(
    boundingBox: BoundingBox,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult> {
    // Get all geohashes that cover the bounding box
    const geohashes = getGeohashesForBoundingBox(boundingBox);

    // Query each geohash (in parallel for efficiency)
    const queryPromises = geohashes.map((geohash) =>
      queryUploadsByGeohash(geohash, {
        limit: cursor?.limit || 50,
      })
    );

    const results = await Promise.all(queryPromises);

    // Combine and deduplicate results
    const seenIds = new Set<string>();
    const allItems: DynamoUploadItem[] = [];

    for (const result of results) {
      for (const item of result.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          // Double-check the item is within bounding box
          if (
            item.latitude >= boundingBox.minLat &&
            item.latitude <= boundingBox.maxLat &&
            item.longitude >= boundingBox.minLon &&
            item.longitude <= boundingBox.maxLon
          ) {
            allItems.push(item);
          }
        }
      }
    }

    // Sort by timestamp descending
    allItems.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const limit = cursor?.limit || 50;
    const paginatedItems = allItems.slice(0, limit);

    return {
      uploads: paginatedItems.map(fromDynamoItem),
      nextCursor: allItems.length > limit ? 'has_more' : undefined,
      totalCount: allItems.length,
    };
  }

  async getAll(): Promise<BFFUpload[]> {
    // Remote repository doesn't support getAll efficiently
    // This would require a full table scan - use with caution
    console.warn('RemoteUploadRepository.getAll() is not recommended for production');
    return [];
  }

  // ============ Update ============

  async update(id: string, updates: Partial<BFFUpload>): Promise<BFFUpload> {
    // Map BFFUpload fields to DynamoDB fields
    const dynamoUpdates: Partial<DynamoUploadItem> = {};

    if (updates.mediaKey) dynamoUpdates.mediaKey = updates.mediaKey;
    if (updates.caption !== undefined) dynamoUpdates.caption = updates.caption;
    if (updates.voteCount !== undefined) dynamoUpdates.voteCount = updates.voteCount;

    const updated = await dynamoUpdateUpload(id, dynamoUpdates);
    return fromDynamoItem(updated);
  }

  async updateVoteCount(id: string, delta: number): Promise<number> {
    return dynamoUpdateVoteCount(id, delta);
  }

  async markSynced(id: string): Promise<void> {
    // Remote repository items are always synced
    // This is a no-op for remote
  }

  async markFailed(id: string, error: string): Promise<void> {
    // Remote repository doesn't track sync status
    // Errors are handled at the service layer
    console.error(`Upload ${id} operation failed: ${error}`);
  }

  // ============ Delete ============

  async delete(id: string): Promise<void> {
    await dynamoDeleteUpload(id);
  }

  // ============ Sync ============

  async getPendingSync(): Promise<BFFUpload[]> {
    // Remote repository has no pending sync
    return [];
  }

  async getFailedSync(): Promise<BFFUpload[]> {
    // Remote repository has no failed sync
    return [];
  }
}

// Singleton instance
let instance: RemoteUploadRepository | null = null;

export function getRemoteUploadRepository(): RemoteUploadRepository {
  if (!instance) {
    instance = new RemoteUploadRepository();
  }
  return instance;
}
