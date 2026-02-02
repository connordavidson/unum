/**
 * UploadDataProvider Tests
 */

import { getUploadDataProvider } from '../UploadDataProvider';
import type { BoundingBox } from '../../shared/types';

// Mock the feature flags and API config
jest.mock('../../shared/constants', () => ({
  FEATURE_FLAGS: {
    USE_AWS_BACKEND: true,
  },
  API_CONFIG: {
    USE_TEST_DATA: false,
  },
}));

// Mock the test uploads
jest.mock('../../data/testUploads', () => ({
  TEST_UPLOADS: [
    {
      id: 'test-upload-1',
      type: 'photo',
      data: 'https://test.com/photo1.jpg',
      coordinates: [37.7749, -122.4194],
      timestamp: '2024-01-01T00:00:00.000Z',
      votes: 5,
    },
    {
      id: 'test-upload-2',
      type: 'photo',
      data: 'https://test.com/photo2.jpg',
      coordinates: [37.7850, -122.4094],
      timestamp: '2024-01-02T00:00:00.000Z',
      votes: 10,
    },
  ],
}));

// Mock the DynamoDB client
const mockGetAllUploads = jest.fn();
const mockGetUserVotesMap = jest.fn();
const mockGetBlockedUserIds = jest.fn().mockResolvedValue(new Set<string>());

jest.mock('../../api/clients/dynamodb.client', () => ({
  getAllUploads: (...args: unknown[]) => mockGetAllUploads(...args),
  getUserVotesMap: (...args: unknown[]) => mockGetUserVotesMap(...args),
  getBlockedUserIds: (...args: unknown[]) => mockGetBlockedUserIds(...args),
}));

// Mock the media service
const mockGetDisplayUrl = jest.fn();

jest.mock('../../services/media.service', () => ({
  getMediaService: () => ({
    getDisplayUrl: mockGetDisplayUrl,
  }),
}));

// Mock the logging service
jest.mock('../../services/logging.service', () => ({
  getLoggingService: () => ({
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

describe('UploadDataProvider', () => {
  let provider: ReturnType<typeof getUploadDataProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get fresh instance by invalidating cache
    provider = getUploadDataProvider();
    provider.invalidate();
  });

  describe('getAll', () => {
    it('should fetch uploads from AWS when enabled', async () => {
      const mockUploads = [
        {
          id: 'aws-upload-1',
          type: 'photo',
          mediaKey: 'uploads/aws-upload-1.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          caption: 'Test caption',
          voteCount: 5,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const result = await provider.getAll('user-123');

      expect(mockGetAllUploads).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].data).toBe('https://presigned-url.com/photo.jpg');
    });

    it('should include user vote state in uploads', async () => {
      const mockUploads = [
        {
          id: 'upload-1',
          type: 'photo',
          mediaKey: 'uploads/upload-1.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 5,
        },
        {
          id: 'upload-2',
          type: 'photo',
          mediaKey: 'uploads/upload-2.jpg',
          latitude: 37.7850,
          longitude: -122.4094,
          timestamp: '2024-01-02T00:00:00.000Z',
          voteCount: 10,
        },
      ];

      const mockUserVotes = {
        'upload-1': 'up' as const,
        'upload-2': 'down' as const,
      };

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue(mockUserVotes);
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const result = await provider.getAll('user-123');

      const upload1 = result.find((u) => u.id === 'upload-1');
      const upload2 = result.find((u) => u.id === 'upload-2');

      expect(upload1?.userVote).toBe('up');
      expect(upload2?.userVote).toBe('down');
    });

    it('should return cached data on subsequent calls', async () => {
      const mockUploads = [
        {
          id: 'upload-1',
          type: 'photo',
          mediaKey: 'uploads/upload-1.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 5,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      // First call
      await provider.getAll('user-123');

      // Second call should use cache
      await provider.getAll('user-123');

      // getAllUploads should only be called once due to caching
      expect(mockGetAllUploads).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache for different user', async () => {
      const mockUploads = [
        {
          id: 'upload-1',
          type: 'photo',
          mediaKey: 'uploads/upload-1.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 5,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      // First call with user-1
      await provider.getAll('user-1');

      // Second call with user-2 should fetch fresh data
      await provider.getAll('user-2');

      expect(mockGetAllUploads).toHaveBeenCalledTimes(2);
    });

    it('should handle AWS fetch failure gracefully', async () => {
      mockGetAllUploads.mockRejectedValue(new Error('Network error'));

      const result = await provider.getAll('user-123');

      expect(result).toEqual([]);
    });

    it('should rank uploads by time-decay algorithm (recent and upvoted first)', async () => {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const mockUploads = [
        {
          id: 'older-low-votes',
          type: 'photo',
          mediaKey: 'uploads/older.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: dayAgo,
          voteCount: 2,
        },
        {
          id: 'newer-high-votes',
          type: 'photo',
          mediaKey: 'uploads/newer.jpg',
          latitude: 37.7850,
          longitude: -122.4094,
          timestamp: sixHoursAgo,
          voteCount: 10,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const result = await provider.getAll('user-123');

      // Newer post with more votes should rank first
      expect(result[0].id).toBe('newer-high-votes');
      expect(result[1].id).toBe('older-low-votes');
    });

    it('should filter out uploads with empty media URLs', async () => {
      const mockUploads = [
        {
          id: 'has-media',
          type: 'photo',
          mediaKey: 'uploads/has-media.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 0,
        },
        {
          id: 'no-media',
          type: 'photo',
          mediaKey: 'uploads/no-media.jpg',
          latitude: 37.7850,
          longitude: -122.4094,
          timestamp: '2024-01-02T00:00:00.000Z',
          voteCount: 0,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl
        .mockResolvedValueOnce('https://presigned-url.com/photo.jpg')
        .mockResolvedValueOnce(''); // Empty URL for second upload

      const result = await provider.getAll('user-123');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('has-media');
    });
  });

  describe('getInBounds', () => {
    it('should filter uploads by bounding box', async () => {
      const mockUploads = [
        {
          id: 'inside',
          type: 'photo',
          mediaKey: 'uploads/inside.jpg',
          latitude: 37.75,
          longitude: -122.45,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 0,
        },
        {
          id: 'outside',
          type: 'photo',
          mediaKey: 'uploads/outside.jpg',
          latitude: 40.0,
          longitude: -74.0,
          timestamp: '2024-01-02T00:00:00.000Z',
          voteCount: 0,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await provider.getInBounds(bbox, 'user-123');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('inside');
    });

    it('should include uploads on boundary', async () => {
      const mockUploads = [
        {
          id: 'on-boundary',
          type: 'photo',
          mediaKey: 'uploads/on-boundary.jpg',
          latitude: 37.7, // Exactly on minLat
          longitude: -122.5, // Exactly on minLon
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 0,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await provider.getInBounds(bbox, 'user-123');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('on-boundary');
    });

    it('should return empty array when no uploads in bounds', async () => {
      const mockUploads = [
        {
          id: 'far-away',
          type: 'photo',
          mediaKey: 'uploads/far-away.jpg',
          latitude: 0.0,
          longitude: 0.0,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 0,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await provider.getInBounds(bbox, 'user-123');

      expect(result).toEqual([]);
    });
  });

  describe('invalidate', () => {
    it('should clear the cache', async () => {
      const mockUploads = [
        {
          id: 'upload-1',
          type: 'photo',
          mediaKey: 'uploads/upload-1.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: '2024-01-01T00:00:00.000Z',
          voteCount: 0,
        },
      ];

      mockGetAllUploads.mockResolvedValue(mockUploads);
      mockGetUserVotesMap.mockResolvedValue({});
      mockGetDisplayUrl.mockResolvedValue('https://presigned-url.com/photo.jpg');

      // First call
      await provider.getAll('user-123');

      // Invalidate cache
      provider.invalidate();

      // Second call should fetch fresh data
      await provider.getAll('user-123');

      expect(mockGetAllUploads).toHaveBeenCalledTimes(2);
    });
  });
});

describe('getUploadDataProvider', () => {
  it('should return singleton instance', () => {
    const instance1 = getUploadDataProvider();
    const instance2 = getUploadDataProvider();

    expect(instance1).toBe(instance2);
  });
});
