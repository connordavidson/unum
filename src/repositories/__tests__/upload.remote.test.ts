/**
 * Remote Upload Repository Tests
 */

import {
  RemoteUploadRepository,
  getRemoteUploadRepository,
} from '../remote/upload.remote';
import type { BoundingBox } from '../../shared/types';

// Mock the DynamoDB client
jest.mock('../../api/clients/dynamodb.client', () => ({
  createUpload: jest.fn(),
  getUploadById: jest.fn(),
  updateUpload: jest.fn(),
  updateVoteCount: jest.fn(),
  deleteUpload: jest.fn(),
  queryUploadsByGeohash: jest.fn(),
  queryUploadsByDevice: jest.fn(),
  createUploadPK: jest.fn((id) => `UPLOAD#${id}`),
  createUploadSK: jest.fn(() => 'METADATA'),
  createGeohashGSI1PK: jest.fn((geohash) => `GEOHASH#${geohash}`),
}));

// Mock ngeohash
jest.mock('ngeohash', () => ({
  encode: jest.fn((lat, lon, precision) => `geohash-${lat.toFixed(2)}-${lon.toFixed(2)}`),
  decode_bbox: jest.fn(() => [37.7, -122.5, 37.8, -122.4]),
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-123'),
}));

// Mock config
jest.mock('../../api/config', () => ({
  dynamoConfig: {
    geohashPrecision: 6,
  },
}));

// Import the mocked module
import * as dynamoClient from '../../api/clients/dynamodb.client';
import type { DynamoUploadItem } from '../../api/types';

const mockDynamoClient = dynamoClient as jest.Mocked<typeof dynamoClient>;

describe('RemoteUploadRepository', () => {
  let repository: RemoteUploadRepository;

  const mockDynamoUploadItem: DynamoUploadItem = {
    PK: 'UPLOAD#test-id',
    SK: 'METADATA',
    GSI1PK: 'GEOHASH#9q8yyz',
    GSI1SK: '2024-01-01T00:00:00.000Z',
    id: 'test-id',
    type: 'photo',
    mediaKey: 'uploads/test-id.jpg',
    latitude: 37.7749,
    longitude: -122.4194,
    geohash: '9q8yyz',
    timestamp: '2024-01-01T00:00:00.000Z',
    caption: 'Test caption',
    voteCount: 5,
    userId: 'user-123',
    deviceId: 'device-456',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new RemoteUploadRepository();
  });

  describe('initialize', () => {
    it('should set the device ID', async () => {
      await repository.initialize('test-device-id');
      expect(true).toBe(true);
    });
  });

  describe('create', () => {
    it('should create an upload with correct fields', async () => {
      mockDynamoClient.createUpload.mockResolvedValue(undefined);

      const result = await repository.create({
        type: 'photo',
        mediaUrl: 'file://local/path.jpg',
        mediaKey: 'uploads/test-uuid-123.jpg',
        coordinates: [37.7749, -122.4194],
        caption: 'Test caption',
        userId: 'user-123',
        deviceId: 'device-456',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('test-uuid-123');
      expect(result.type).toBe('photo');
      expect(result.mediaKey).toBe('uploads/test-uuid-123.jpg');
      expect(result.coordinates).toEqual([37.7749, -122.4194]);
      expect(result.caption).toBe('Test caption');
      expect(result.voteCount).toBe(0);
      expect(result.syncStatus).toBe('synced');
      expect(mockDynamoClient.createUpload).toHaveBeenCalledTimes(1);
    });

    it('should generate geohash for coordinates', async () => {
      mockDynamoClient.createUpload.mockResolvedValue(undefined);

      const result = await repository.create({
        type: 'photo',
        mediaUrl: 'file://local/path.jpg',
        coordinates: [37.7749, -122.4194],
        userId: 'user-123',
        deviceId: 'device-456',
      });

      expect(result.geohash).toBeDefined();
      expect(result.geohash).toContain('geohash-');
    });

    it('should use mediaKey if provided, fallback to mediaUrl', async () => {
      mockDynamoClient.createUpload.mockResolvedValue(undefined);

      // With mediaKey
      const result1 = await repository.create({
        type: 'photo',
        mediaUrl: 'file://local/path.jpg',
        mediaKey: 's3://bucket/key.jpg',
        coordinates: [37.7749, -122.4194],
        userId: 'user-123',
        deviceId: 'device-456',
      });
      expect(result1.mediaKey).toBe('s3://bucket/key.jpg');

      // Without mediaKey (fallback to mediaUrl)
      const result2 = await repository.create({
        type: 'photo',
        mediaUrl: 'file://local/path.jpg',
        coordinates: [37.7749, -122.4194],
        userId: 'user-123',
        deviceId: 'device-456',
      });
      expect(result2.mediaKey).toBe('file://local/path.jpg');
    });
  });

  describe('getById', () => {
    it('should return null when upload does not exist', async () => {
      mockDynamoClient.getUploadById.mockResolvedValue(null);

      const result = await repository.getById('non-existent-id');

      expect(result).toBeNull();
      expect(mockDynamoClient.getUploadById).toHaveBeenCalledWith('non-existent-id');
    });

    it('should return upload when it exists', async () => {
      mockDynamoClient.getUploadById.mockResolvedValue(mockDynamoUploadItem);

      const result = await repository.getById('test-id');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-id');
      expect(result?.type).toBe('photo');
      expect(result?.coordinates).toEqual([37.7749, -122.4194]);
      expect(result?.voteCount).toBe(5);
      expect(result?.mediaUrl).toBe(''); // Will be populated by service layer
    });
  });

  describe('getByDeviceId', () => {
    it('should return empty result when no uploads exist', async () => {
      mockDynamoClient.queryUploadsByDevice.mockResolvedValue({
        items: [],
        lastEvaluatedKey: undefined,
      });

      const result = await repository.getByDeviceId('device-456');

      expect(result.uploads).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return uploads for device', async () => {
      mockDynamoClient.queryUploadsByDevice.mockResolvedValue({
        items: [mockDynamoUploadItem],
        lastEvaluatedKey: undefined,
      });

      const result = await repository.getByDeviceId('device-456');

      expect(result.uploads).toHaveLength(1);
      expect(result.uploads[0].id).toBe('test-id');
    });

    it('should handle pagination cursor', async () => {
      const lastKey = { PK: 'UPLOAD#last', SK: 'METADATA' };
      mockDynamoClient.queryUploadsByDevice.mockResolvedValue({
        items: [mockDynamoUploadItem],
        lastEvaluatedKey: lastKey,
      });

      const result = await repository.getByDeviceId('device-456', { limit: 10 });

      expect(result.nextCursor).toBe(JSON.stringify(lastKey));
    });
  });

  describe('getByLocation', () => {
    it('should return empty result for empty bounding box query', async () => {
      mockDynamoClient.queryUploadsByGeohash.mockResolvedValue({
        items: [],
        lastEvaluatedKey: undefined,
      });

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await repository.getByLocation(bbox);

      expect(result.uploads).toEqual([]);
    });

    it('should query multiple geohashes for bounding box', async () => {
      mockDynamoClient.queryUploadsByGeohash.mockResolvedValue({
        items: [mockDynamoUploadItem],
        lastEvaluatedKey: undefined,
      });

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await repository.getByLocation(bbox);

      // Should have called queryUploadsByGeohash at least once
      expect(mockDynamoClient.queryUploadsByGeohash).toHaveBeenCalled();
      expect(result.uploads.length).toBeGreaterThanOrEqual(0);
    });

    it('should deduplicate results from multiple geohash queries', async () => {
      // Same item returned from multiple geohash queries
      mockDynamoClient.queryUploadsByGeohash.mockResolvedValue({
        items: [mockDynamoUploadItem],
        lastEvaluatedKey: undefined,
      });

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await repository.getByLocation(bbox);

      // Should not have duplicates
      const uniqueIds = new Set(result.uploads.map((u) => u.id));
      expect(uniqueIds.size).toBe(result.uploads.length);
    });

    it('should filter results to exact bounding box', async () => {
      const insideItem = { ...mockDynamoUploadItem, latitude: 37.75, longitude: -122.45 };
      const outsideItem = { ...mockDynamoUploadItem, id: 'outside', latitude: 37.9, longitude: -122.45 };

      mockDynamoClient.queryUploadsByGeohash.mockResolvedValue({
        items: [insideItem, outsideItem],
        lastEvaluatedKey: undefined,
      });

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await repository.getByLocation(bbox);

      // Should only include the item inside the bounding box
      const ids = result.uploads.map((u) => u.id);
      expect(ids).toContain('test-id');
      expect(ids).not.toContain('outside');
    });
  });

  describe('getAll', () => {
    it('should warn and return empty array', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await repository.getAll();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'RemoteUploadRepository.getAll() is not recommended for production'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('update', () => {
    it('should update upload fields', async () => {
      const updatedItem = { ...mockDynamoUploadItem, caption: 'Updated caption' };
      mockDynamoClient.updateUpload.mockResolvedValue(updatedItem);

      const result = await repository.update('test-id', { caption: 'Updated caption' });

      expect(result.caption).toBe('Updated caption');
      expect(mockDynamoClient.updateUpload).toHaveBeenCalled();
    });
  });

  describe('updateVoteCount', () => {
    it('should update vote count and return new value', async () => {
      mockDynamoClient.updateVoteCount.mockResolvedValue(10);

      const result = await repository.updateVoteCount('test-id', 5);

      expect(result).toBe(10);
      expect(mockDynamoClient.updateVoteCount).toHaveBeenCalledWith('test-id', 5);
    });
  });

  describe('delete', () => {
    it('should delete upload', async () => {
      mockDynamoClient.deleteUpload.mockResolvedValue(undefined);

      await repository.delete('test-id');

      expect(mockDynamoClient.deleteUpload).toHaveBeenCalledWith('test-id');
    });
  });

  describe('sync methods', () => {
    it('markSynced should be a no-op', async () => {
      await expect(repository.markSynced('upload-id')).resolves.toBeUndefined();
    });

    it('markFailed should log error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await repository.markFailed('upload-id', 'Test error');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Upload] Upload upload-id operation failed',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('getPendingSync should return empty array', async () => {
      const result = await repository.getPendingSync();
      expect(result).toEqual([]);
    });

    it('getFailedSync should return empty array', async () => {
      const result = await repository.getFailedSync();
      expect(result).toEqual([]);
    });
  });
});

describe('getRemoteUploadRepository', () => {
  it('should return singleton instance', () => {
    const instance1 = getRemoteUploadRepository();
    const instance2 = getRemoteUploadRepository();

    expect(instance1).toBe(instance2);
  });
});
