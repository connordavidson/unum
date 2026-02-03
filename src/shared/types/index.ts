export type Coordinates = [number, number]; // [latitude, longitude]

export interface Upload {
  id: string;
  type: 'photo' | 'video';
  data: string;
  coordinates: Coordinates;
  timestamp: string;
  caption?: string;
  votes: number;
  userVote?: VoteType | null;  // Current user's vote on this upload
  userId?: string;             // Upload author's user ID (for blocking)
  hidden?: boolean;            // Hidden due to reports
}

export interface CreateUploadData {
  type: 'photo' | 'video';
  data: string;
  coordinates: Coordinates;
  caption?: string;
}

export type VoteType = 'up' | 'down';

export interface UserVotes {
  [uploadId: string]: VoteType;
}

export interface Cluster {
  id: string;
  center: Coordinates;
  count: number;
  radius: number;
  uploads: Upload[];
}

export interface ClusterResult {
  largeClusters: Cluster[];
  smallClusters: Cluster[];
  unclustered: Upload[];
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface SavedCity {
  name: string;
  latitude: number;
  longitude: number;
}

// ============ BFF Layer Types ============

/**
 * Sync status for offline-first operations
 */
export type SyncStatus = 'synced' | 'pending' | 'failed' | 'conflict';

/**
 * Media type enum
 */
export type MediaType = 'photo' | 'video';

/**
 * Geolocation bounding box for queries
 */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Device identity (anonymous user)
 */
export interface DeviceIdentity {
  deviceId: string;
  createdAt: string;
}

/**
 * Vote entity for BFF layer
 */
export interface Vote {
  id: string;
  uploadId: string;
  deviceId: string;
  voteType: VoteType;
  timestamp: string;
  syncStatus: SyncStatus;
}

/**
 * Sync queue item for offline operations
 */
export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'upload' | 'vote';
  payload: unknown;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

/**
 * Pagination cursor for queries
 */
export interface PaginationCursor {
  lastEvaluatedKey?: string;
  limit: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: string[];
  errors: Array<{ id: string; error: string }>;
}

/**
 * Queue status
 */
export interface QueueStatus {
  pending: number;
  failed: number;
  oldest?: string;
}
