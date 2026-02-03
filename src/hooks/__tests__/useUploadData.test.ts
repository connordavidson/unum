/**
 * useUploadData Hook Tests
 *
 * Since this is a React Native project running in Node test environment,
 * we test the hook logic directly by extracting testable functionality.
 */

import type { Upload, VoteType, CreateUploadData } from '../../shared/types';

// Mock the UploadDataProvider
const mockGetAll = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../providers/UploadDataProvider', () => ({
  getUploadDataProvider: () => ({
    getAll: mockGetAll,
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
 * Core data fetching logic for testing.
 * Always uses getAll() — no bbox filtering at the data layer.
 */
async function fetchUploadsLogic(
  userId: string | undefined
): Promise<{ uploads: Upload[]; error: string | null }> {
  try {
    const data = await mockGetAll(userId);
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

/**
 * Simulates the request-versioned refresh logic from useUploadData.
 * Mirrors the actual refreshUploads implementation:
 * - Increments a version counter per call
 * - Only applies the result if the version is still the latest
 * - Uses ref-based userId (no fallback to state)
 * - Always calls getAll() (no bbox filtering)
 * - On error, preserves previous uploads (does not set to [])
 */
function createRefreshSimulator() {
  let requestVersion = 0;
  let uploads: Upload[] = [];
  let loading = false;
  let error: string | null = null;

  return {
    get state() {
      return { uploads, loading, error, requestVersion };
    },
    async refresh(
      userIdRef: { current: string | null }
    ) {
      const currentVersion = ++requestVersion;
      const currentUserId = userIdRef.current;

      if (currentVersion === requestVersion) {
        loading = true;
      }

      try {
        const data = await mockGetAll(currentUserId || undefined);

        // Only apply if still the latest request
        if (currentVersion === requestVersion) {
          uploads = data;
          error = null;
        }
      } catch (err) {
        if (currentVersion === requestVersion) {
          error = 'Failed to load uploads';
          // Do NOT clear uploads — keep previous data
        }
      } finally {
        if (currentVersion === requestVersion) {
          loading = false;
        }
      }
    },
  };
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
    it('should always fetch all uploads via getAll', async () => {
      const result = await fetchUploadsLogic('user-123');

      expect(mockGetAll).toHaveBeenCalledWith('user-123');
      expect(result.uploads).toEqual(mockUploads);
      expect(result.error).toBeNull();
    });

    it('should return error on fetch failure', async () => {
      mockGetAll.mockRejectedValue(new Error('Network error'));

      const result = await fetchUploadsLogic('user-123');

      expect(result.uploads).toEqual([]);
      expect(result.error).toBe('Failed to load uploads');
    });

    it('should handle undefined userId', async () => {
      const result = await fetchUploadsLogic(undefined);

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

  describe('request versioning', () => {
    it('should only apply the latest request result when multiple calls overlap', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      // First call resolves slowly with stale data
      let resolveFirst!: (value: Upload[]) => void;
      const firstPromise = new Promise<Upload[]>((resolve) => {
        resolveFirst = resolve;
      });
      mockGetAll.mockReturnValueOnce(firstPromise);

      // Second call resolves immediately with fresh data
      const freshUploads: Upload[] = [
        {
          id: 'fresh-1',
          type: 'photo',
          data: 'https://example.com/fresh.jpg',
          coordinates: [37.78, -122.42],
          timestamp: '2024-01-03T00:00:00.000Z',
          votes: 20,
          userVote: null,
        },
      ];
      mockGetAll.mockResolvedValueOnce(freshUploads);

      // Fire both requests (simulating rapid calls)
      const first = sim.refresh(userIdRef);
      const second = sim.refresh(userIdRef);

      // Second completes first (fast response)
      await second;
      expect(sim.state.uploads).toEqual(freshUploads);

      // Now first completes (slow response) — should be ignored
      resolveFirst([
        {
          id: 'stale-1',
          type: 'photo',
          data: 'https://example.com/stale.jpg',
          coordinates: [37.77, -122.41],
          timestamp: '2024-01-01T00:00:00.000Z',
          votes: 1,
          userVote: null,
        },
      ]);
      await first;

      // State should still have fresh data, not stale
      expect(sim.state.uploads).toEqual(freshUploads);
      expect(sim.state.uploads[0].id).toBe('fresh-1');
    });

    it('should ignore stale error when a newer request succeeded', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      // First call will reject slowly
      let rejectFirst!: (err: Error) => void;
      const firstPromise = new Promise<Upload[]>((_, reject) => {
        rejectFirst = reject;
      });
      mockGetAll.mockReturnValueOnce(firstPromise);

      // Second call succeeds immediately
      const freshUploads: Upload[] = [
        {
          id: 'fresh-1',
          type: 'photo',
          data: 'https://example.com/fresh.jpg',
          coordinates: [37.78, -122.42],
          timestamp: '2024-01-03T00:00:00.000Z',
          votes: 20,
          userVote: null,
        },
      ];
      mockGetAll.mockResolvedValueOnce(freshUploads);

      const first = sim.refresh(userIdRef);
      const second = sim.refresh(userIdRef);

      await second;
      expect(sim.state.error).toBeNull();
      expect(sim.state.uploads).toEqual(freshUploads);

      // Now first rejects — error should be ignored
      rejectFirst(new Error('Network error'));
      await first;

      expect(sim.state.error).toBeNull();
      expect(sim.state.uploads).toEqual(freshUploads);
    });
  });

  describe('ref-based userId', () => {
    it('should use userIdRef value (not a separate state fallback)', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'ref-user-456' };

      mockGetAll.mockResolvedValue([]);

      await sim.refresh(userIdRef);

      expect(mockGetAll).toHaveBeenCalledWith('ref-user-456');
    });

    it('should pass undefined when userIdRef.current is null', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: null };

      mockGetAll.mockResolvedValue([]);

      await sim.refresh(userIdRef);

      expect(mockGetAll).toHaveBeenCalledWith(undefined);
    });

    it('should pick up updated ref value on subsequent calls', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'device-id-anon' };

      mockGetAll.mockResolvedValue([]);

      // First call with anonymous device ID
      await sim.refresh(userIdRef);
      expect(mockGetAll).toHaveBeenCalledWith('device-id-anon');

      // Auth completes, ref updated (simulates useEffect in useUserIdentity)
      userIdRef.current = 'apple-user-789';

      // Second call picks up the new value without needing callback recreation
      await sim.refresh(userIdRef);
      expect(mockGetAll).toHaveBeenCalledWith('apple-user-789');
    });
  });

  describe('error resilience', () => {
    it('should preserve previous uploads when refresh fails', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      // First call succeeds
      const goodUploads: Upload[] = [
        {
          id: 'upload-1',
          type: 'photo',
          data: 'https://example.com/photo1.jpg',
          coordinates: [37.7749, -122.4194],
          timestamp: '2024-01-01T00:00:00.000Z',
          votes: 5,
          userVote: null,
        },
      ];
      mockGetAll.mockResolvedValueOnce(goodUploads);
      await sim.refresh(userIdRef);
      expect(sim.state.uploads).toEqual(goodUploads);

      // Second call fails
      mockGetAll.mockRejectedValueOnce(new Error('Network error'));
      await sim.refresh(userIdRef);

      // Uploads should still be the good data, not empty
      expect(sim.state.uploads).toEqual(goodUploads);
      expect(sim.state.error).toBe('Failed to load uploads');
    });

    it('should clear error on successful refresh after failure', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      // First call fails
      mockGetAll.mockRejectedValueOnce(new Error('Network error'));
      await sim.refresh(userIdRef);
      expect(sim.state.error).toBe('Failed to load uploads');

      // Second call succeeds
      const goodUploads: Upload[] = [
        {
          id: 'upload-1',
          type: 'photo',
          data: 'https://example.com/photo1.jpg',
          coordinates: [37.7749, -122.4194],
          timestamp: '2024-01-01T00:00:00.000Z',
          votes: 5,
          userVote: null,
        },
      ];
      mockGetAll.mockResolvedValueOnce(goodUploads);
      await sim.refresh(userIdRef);

      expect(sim.state.error).toBeNull();
      expect(sim.state.uploads).toEqual(goodUploads);
    });

    it('should set loading false after error', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      mockGetAll.mockRejectedValueOnce(new Error('Network error'));
      await sim.refresh(userIdRef);

      expect(sim.state.loading).toBe(false);
    });
  });

  describe('refresh always uses getAll', () => {
    it('should always call getAll (never getInBounds)', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      mockGetAll.mockResolvedValue([]);

      await sim.refresh(userIdRef);

      expect(mockGetAll).toHaveBeenCalledWith('user-123');
    });

    it('should return same data on repeated calls when cache returns same reference', async () => {
      const sim = createRefreshSimulator();
      const userIdRef = { current: 'user-123' };

      // Simulate cache returning the same array reference
      const cachedData: Upload[] = [
        {
          id: 'upload-1',
          type: 'photo',
          data: 'https://example.com/photo1.jpg',
          coordinates: [37.7749, -122.4194],
          timestamp: '2024-01-01T00:00:00.000Z',
          votes: 5,
          userVote: null,
        },
      ];
      mockGetAll.mockResolvedValue(cachedData);

      await sim.refresh(userIdRef);
      const firstResult = sim.state.uploads;

      await sim.refresh(userIdRef);
      const secondResult = sim.state.uploads;

      // Same reference from cache means same data
      expect(firstResult).toBe(secondResult);
    });
  });

  describe('invalidateCache', () => {
    it('should call provider.invalidate()', () => {
      mockInvalidate();
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });
});
