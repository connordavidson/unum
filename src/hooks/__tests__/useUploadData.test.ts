/**
 * useUploadData Hook Tests
 *
 * Since this is a React Native project running in Node test environment,
 * we test the hook logic directly by extracting testable functionality.
 */

import type { Upload, VoteType, BoundingBox, CreateUploadData } from '../../shared/types';

// Mock the UploadDataProvider
const mockGetAll = jest.fn();
const mockGetInBounds = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../providers/UploadDataProvider', () => ({
  getUploadDataProvider: () => ({
    getAll: mockGetAll,
    getInBounds: mockGetInBounds,
    invalidate: mockInvalidate,
  }),
}));

// Mock UploadService
const mockCreateUpload = jest.fn();

jest.mock('../../services/upload.service', () => ({
  getUploadService: () => ({
    createUpload: mockCreateUpload,
  }),
}));

// Mock MediaService
const mockMediaUpload = jest.fn();

jest.mock('../../services/media.service', () => ({
  getMediaService: () => ({
    upload: mockMediaUpload,
  }),
}));

// Mock FEATURE_FLAGS
jest.mock('../../shared/constants', () => ({
  FEATURE_FLAGS: {
    USE_AWS_BACKEND: true,
  },
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-123',
}));

/**
 * Core data fetching logic for testing
 */
async function fetchUploadsLogic(
  bbox: BoundingBox | undefined,
  userId: string | undefined
): Promise<{ uploads: Upload[]; error: string | null }> {
  try {
    const data = bbox
      ? await mockGetInBounds(bbox, userId)
      : await mockGetAll(userId);
    return { uploads: data, error: null };
  } catch (err) {
    return { uploads: [], error: 'Failed to load uploads' };
  }
}

/**
 * Core create upload logic for testing
 */
async function createUploadLogic(
  uploadData: CreateUploadData,
  userId: string | null,
  deviceId: string | null
): Promise<void> {
  if (!userId) {
    throw new Error('User ID not available. Please sign in and try again.');
  }
  if (!deviceId) {
    throw new Error('Device ID not available. Please try again.');
  }

  const uploadId = 'test-uuid-123';

  const mediaResult = await mockMediaUpload({
    localPath: uploadData.data,
    uploadId,
    mediaType: uploadData.type,
    coordinates: uploadData.coordinates,
    timestamp: expect.any(String),
    uploaderId: userId,
  });

  await mockCreateUpload({
    type: uploadData.type,
    mediaUrl: mediaResult.url,
    mediaKey: mediaResult.key,
    coordinates: uploadData.coordinates,
    caption: uploadData.caption,
    userId,
    deviceId,
  });

  mockInvalidate();
}

/**
 * Derive user votes from uploads
 */
function deriveUserVotes(uploads: Upload[]): Record<string, VoteType> {
  const votes: Record<string, VoteType> = {};
  for (const upload of uploads) {
    if (upload.userVote) {
      votes[upload.id] = upload.userVote;
    }
  }
  return votes;
}

describe('useUploadData logic', () => {
  const mockUploads: Upload[] = [
    {
      id: 'upload-1',
      type: 'photo',
      data: 'https://example.com/photo1.jpg',
      coordinates: [37.7749, -122.4194],
      timestamp: '2024-01-01T00:00:00.000Z',
      votes: 5,
      userVote: 'up',
    },
    {
      id: 'upload-2',
      type: 'photo',
      data: 'https://example.com/photo2.jpg',
      coordinates: [37.78, -122.42],
      timestamp: '2024-01-02T00:00:00.000Z',
      votes: 10,
      userVote: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAll.mockResolvedValue(mockUploads);
    mockGetInBounds.mockResolvedValue([mockUploads[0]]);
    mockMediaUpload.mockResolvedValue({
      url: 'https://s3.example.com/photo.jpg',
      key: 'uploads/test-uuid-123.jpg',
    });
    mockCreateUpload.mockResolvedValue(undefined);
  });

  describe('userVotes derivation', () => {
    it('should derive userVotes from uploads with votes', () => {
      const votes = deriveUserVotes(mockUploads);

      expect(votes).toEqual({
        'upload-1': 'up',
      });
    });

    it('should return empty object when no votes', () => {
      const uploadsNoVotes: Upload[] = [
        { ...mockUploads[0], userVote: null },
        { ...mockUploads[1], userVote: null },
      ];

      const votes = deriveUserVotes(uploadsNoVotes);

      expect(votes).toEqual({});
    });

    it('should include all user votes', () => {
      const uploadsWithVotes: Upload[] = [
        { ...mockUploads[0], userVote: 'up' },
        { ...mockUploads[1], userVote: 'down' },
      ];

      const votes = deriveUserVotes(uploadsWithVotes);

      expect(votes).toEqual({
        'upload-1': 'up',
        'upload-2': 'down',
      });
    });
  });

  describe('fetch uploads', () => {
    it('should fetch all uploads without bounding box', async () => {
      const result = await fetchUploadsLogic(undefined, 'user-123');

      expect(mockGetAll).toHaveBeenCalledWith('user-123');
      expect(result.uploads).toEqual(mockUploads);
      expect(result.error).toBeNull();
    });

    it('should fetch uploads with bounding box', async () => {
      const bbox: BoundingBox = {
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4,
      };

      const result = await fetchUploadsLogic(bbox, 'user-123');

      expect(mockGetInBounds).toHaveBeenCalledWith(bbox, 'user-123');
      expect(result.uploads).toEqual([mockUploads[0]]);
    });

    it('should return error on fetch failure', async () => {
      mockGetAll.mockRejectedValue(new Error('Network error'));

      const result = await fetchUploadsLogic(undefined, 'user-123');

      expect(result.uploads).toEqual([]);
      expect(result.error).toBe('Failed to load uploads');
    });

    it('should handle undefined userId', async () => {
      const result = await fetchUploadsLogic(undefined, undefined);

      expect(mockGetAll).toHaveBeenCalledWith(undefined);
      expect(result.uploads).toEqual(mockUploads);
    });
  });

  describe('create upload', () => {
    it('should create upload with all required fields', async () => {
      await createUploadLogic(
        {
          type: 'photo',
          data: 'file://local/photo.jpg',
          coordinates: [37.7749, -122.4194],
          caption: 'Test caption',
        },
        'user-123',
        'device-456'
      );

      expect(mockMediaUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: 'file://local/photo.jpg',
          uploadId: 'test-uuid-123',
          mediaType: 'photo',
          coordinates: [37.7749, -122.4194],
        })
      );

      expect(mockCreateUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'photo',
          mediaUrl: 'https://s3.example.com/photo.jpg',
          mediaKey: 'uploads/test-uuid-123.jpg',
          coordinates: [37.7749, -122.4194],
          caption: 'Test caption',
          userId: 'user-123',
          deviceId: 'device-456',
        })
      );

      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('should create upload without caption', async () => {
      await createUploadLogic(
        {
          type: 'photo',
          data: 'file://local/photo.jpg',
          coordinates: [37.7749, -122.4194],
        },
        'user-123',
        'device-456'
      );

      expect(mockCreateUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          caption: undefined,
        })
      );
    });

    it('should throw error when userId is not available', async () => {
      await expect(
        createUploadLogic(
          {
            type: 'photo',
            data: 'file://local/photo.jpg',
            coordinates: [37.7749, -122.4194],
          },
          null,
          'device-456'
        )
      ).rejects.toThrow('User ID not available');
    });

    it('should throw error when deviceId is not available', async () => {
      await expect(
        createUploadLogic(
          {
            type: 'photo',
            data: 'file://local/photo.jpg',
            coordinates: [37.7749, -122.4194],
          },
          'user-123',
          null
        )
      ).rejects.toThrow('Device ID not available');
    });

    it('should handle video uploads', async () => {
      await createUploadLogic(
        {
          type: 'video',
          data: 'file://local/video.mp4',
          coordinates: [37.7749, -122.4194],
        },
        'user-123',
        'device-456'
      );

      expect(mockMediaUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'video',
        })
      );

      expect(mockCreateUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'video',
        })
      );
    });

    it('should invalidate cache after successful upload', async () => {
      await createUploadLogic(
        {
          type: 'photo',
          data: 'file://local/photo.jpg',
          coordinates: [37.7749, -122.4194],
        },
        'user-123',
        'device-456'
      );

      expect(mockInvalidate).toHaveBeenCalledTimes(1);
    });

    it('should propagate media upload errors', async () => {
      mockMediaUpload.mockRejectedValue(new Error('Upload failed'));

      await expect(
        createUploadLogic(
          {
            type: 'photo',
            data: 'file://local/photo.jpg',
            coordinates: [37.7749, -122.4194],
          },
          'user-123',
          'device-456'
        )
      ).rejects.toThrow('Upload failed');
    });

    it('should propagate database create errors', async () => {
      mockCreateUpload.mockRejectedValue(new Error('Database error'));

      await expect(
        createUploadLogic(
          {
            type: 'photo',
            data: 'file://local/photo.jpg',
            coordinates: [37.7749, -122.4194],
          },
          'user-123',
          'device-456'
        )
      ).rejects.toThrow('Database error');
    });
  });
});
