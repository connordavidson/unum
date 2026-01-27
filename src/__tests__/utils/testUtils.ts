/**
 * Test Utilities
 *
 * Reusable helpers for creating test data.
 */

import type { Upload, BoundingBox, Coordinates, VoteType, MapRegion } from '../../shared/types';

// ============ Upload Mocks ============

export interface MockUploadOptions {
  id?: string;
  type?: 'photo' | 'video';
  data?: string;
  coordinates?: Coordinates;
  timestamp?: string;
  caption?: string;
  votes?: number;
  userVote?: VoteType | null;
}

/**
 * Create a mock Upload object
 */
export const mockUpload = (overrides: MockUploadOptions = {}): Upload => ({
  id: overrides.id ?? `upload-${Math.random().toString(36).substring(7)}`,
  type: overrides.type ?? 'photo',
  data: overrides.data ?? 'https://example.com/photo.jpg',
  coordinates: overrides.coordinates ?? [37.7749, -122.4194],
  timestamp: overrides.timestamp ?? new Date().toISOString(),
  caption: overrides.caption,
  votes: overrides.votes ?? 0,
  userVote: overrides.userVote ?? null,
});

/**
 * Create multiple mock uploads
 */
export const mockUploads = (count: number, baseOptions: MockUploadOptions = {}): Upload[] =>
  Array.from({ length: count }, (_, i) =>
    mockUpload({
      ...baseOptions,
      id: baseOptions.id ? `${baseOptions.id}-${i}` : undefined,
    })
  );

/**
 * Create mock uploads at specific coordinates (for clustering tests)
 */
export const mockUploadsAtLocations = (
  coordinates: Coordinates[],
  baseOptions: MockUploadOptions = {}
): Upload[] =>
  coordinates.map((coords, i) =>
    mockUpload({
      ...baseOptions,
      id: baseOptions.id ? `${baseOptions.id}-${i}` : undefined,
      coordinates: coords,
    })
  );

// ============ Bounding Box Mocks ============

/**
 * Create a mock BoundingBox (San Francisco area by default)
 */
export const mockBoundingBox = (overrides: Partial<BoundingBox> = {}): BoundingBox => ({
  minLat: overrides.minLat ?? 37.7,
  maxLat: overrides.maxLat ?? 37.8,
  minLon: overrides.minLon ?? -122.5,
  maxLon: overrides.maxLon ?? -122.4,
});

/**
 * Create a small bounding box around a point
 */
export const mockBoundingBoxAroundPoint = (
  lat: number,
  lon: number,
  delta: number = 0.01
): BoundingBox => ({
  minLat: lat - delta,
  maxLat: lat + delta,
  minLon: lon - delta,
  maxLon: lon + delta,
});

// ============ Map Region Mocks ============

/**
 * Create a mock MapRegion (San Francisco by default)
 */
export const mockMapRegion = (overrides: Partial<MapRegion> = {}): MapRegion => ({
  latitude: overrides.latitude ?? 37.7749,
  longitude: overrides.longitude ?? -122.4194,
  latitudeDelta: overrides.latitudeDelta ?? 0.1,
  longitudeDelta: overrides.longitudeDelta ?? 0.1,
});

// ============ Coordinate Mocks ============

/**
 * Create mock coordinates
 */
export const mockCoordinates = (lat: number = 37.7749, lon: number = -122.4194): Coordinates => [
  lat,
  lon,
];

/**
 * San Francisco coordinates
 */
export const SF_COORDINATES: Coordinates = [37.7749, -122.4194];

/**
 * New York coordinates
 */
export const NYC_COORDINATES: Coordinates = [40.7128, -74.006];

/**
 * Los Angeles coordinates
 */
export const LA_COORDINATES: Coordinates = [34.0522, -118.2437];

// ============ User Mocks ============

/**
 * Create a mock user ID
 */
export const mockUserId = (suffix: string = ''): string =>
  `user-${suffix || Math.random().toString(36).substring(7)}`;

/**
 * Create a mock device ID
 */
export const mockDeviceId = (suffix: string = ''): string =>
  `device-${suffix || Math.random().toString(36).substring(7)}`;

// ============ Time Helpers ============

/**
 * Create an ISO timestamp
 */
export const mockTimestamp = (date?: Date): string => (date ?? new Date()).toISOString();

/**
 * Create a timestamp in the past
 */
export const mockPastTimestamp = (hoursAgo: number): string => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
};

/**
 * Create a timestamp in the future
 */
export const mockFutureTimestamp = (hoursFromNow: number): string => {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow);
  return date.toISOString();
};

// ============ Async Helpers ============

/**
 * Wait for a specified duration
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Flush all pending promises
 */
export const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));
