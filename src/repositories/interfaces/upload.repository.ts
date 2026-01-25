/**
 * Upload Repository Interface
 *
 * Defines the contract for upload data access.
 * Implementations can use AsyncStorage (local) or DynamoDB (remote).
 */

import type {
  Upload,
  BoundingBox,
  SyncStatus,
  PaginationCursor,
  MediaType,
  Coordinates,
} from '../../shared/types';

/**
 * Extended Upload type for BFF layer with additional fields
 */
export interface BFFUpload {
  id: string;
  type: MediaType;
  mediaUrl: string;
  mediaKey?: string;          // S3 object key (remote only)
  thumbnailUrl?: string;
  coordinates: Coordinates;
  timestamp: string;
  caption?: string;
  voteCount: number;
  deviceId: string;
  geohash?: string;           // For geo queries
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

/**
 * Input for creating a new upload
 */
export interface CreateUploadInput {
  type: MediaType;
  mediaUrl: string;
  mediaKey?: string;           // S3 object key (for remote storage)
  coordinates: Coordinates;
  caption?: string;
  deviceId: string;
}

/**
 * Query result with pagination
 */
export interface UploadQueryResult {
  uploads: BFFUpload[];
  nextCursor?: string;
  totalCount?: number;
}

/**
 * Upload Repository Interface
 */
export interface IUploadRepository {
  // ============ Create ============

  /**
   * Create a new upload
   */
  create(input: CreateUploadInput): Promise<BFFUpload>;

  // ============ Read ============

  /**
   * Get upload by ID
   */
  getById(id: string): Promise<BFFUpload | null>;

  /**
   * Get uploads by device ID
   */
  getByDeviceId(
    deviceId: string,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult>;

  /**
   * Get uploads within a geographic bounding box
   */
  getByLocation(
    boundingBox: BoundingBox,
    cursor?: PaginationCursor
  ): Promise<UploadQueryResult>;

  /**
   * Get all uploads (for local repository)
   */
  getAll(): Promise<BFFUpload[]>;

  // ============ Update ============

  /**
   * Update upload fields
   */
  update(id: string, updates: Partial<BFFUpload>): Promise<BFFUpload>;

  /**
   * Update vote count (atomic increment/decrement)
   */
  updateVoteCount(id: string, delta: number): Promise<number>;

  /**
   * Mark upload as synced
   */
  markSynced(id: string): Promise<void>;

  /**
   * Mark upload as failed
   */
  markFailed(id: string, error: string): Promise<void>;

  // ============ Delete ============

  /**
   * Delete upload by ID
   */
  delete(id: string): Promise<void>;

  // ============ Sync ============

  /**
   * Get uploads pending sync
   */
  getPendingSync(): Promise<BFFUpload[]>;

  /**
   * Get uploads that failed to sync
   */
  getFailedSync(): Promise<BFFUpload[]>;
}
