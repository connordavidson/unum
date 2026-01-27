/**
 * Mock Factories
 *
 * Factory functions for creating mock services, repositories, and API clients.
 */

import type { VoteType } from '../../shared/types';

// ============ Repository Mocks ============

/**
 * Create a mock Upload Repository
 */
export const createMockUploadRepository = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  create: jest.fn().mockResolvedValue(null),
  getById: jest.fn().mockResolvedValue(null),
  getByDeviceId: jest.fn().mockResolvedValue({ uploads: [], nextCursor: undefined }),
  getByLocation: jest.fn().mockResolvedValue({ uploads: [], nextCursor: undefined }),
  getAll: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue(null),
  updateVoteCount: jest.fn().mockResolvedValue(0),
  markSynced: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  getPendingSync: jest.fn().mockResolvedValue([]),
  getFailedSync: jest.fn().mockResolvedValue([]),
});

/**
 * Create a mock Vote Repository
 */
export const createMockVoteRepository = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  upsert: jest.fn().mockResolvedValue({ vote: null, previousVoteType: null }),
  getVote: jest.fn().mockResolvedValue(null),
  getVotesByDevice: jest.fn().mockResolvedValue([]),
  getVotesForUpload: jest.fn().mockResolvedValue([]),
  getUserVotesMap: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  getPendingSync: jest.fn().mockResolvedValue([]),
  markSynced: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
});

// ============ Service Mocks ============

/**
 * Create a mock Upload Service
 */
export const createMockUploadService = () => ({
  createUpload: jest.fn().mockResolvedValue(null),
  getUploadById: jest.fn().mockResolvedValue(null),
  getUploadsByLocation: jest.fn().mockResolvedValue({ uploads: [] }),
  deleteUpload: jest.fn().mockResolvedValue(undefined),
});

/**
 * Create a mock Vote Service
 */
export const createMockVoteService = () => ({
  castVote: jest.fn().mockResolvedValue({ voteCount: 0, userVote: null }),
  removeVote: jest.fn().mockResolvedValue({ voteCount: 0, userVote: null }),
  getVote: jest.fn().mockResolvedValue(null),
  getUserVotes: jest.fn().mockResolvedValue({}),
});

/**
 * Create a mock Media Service
 */
export const createMockMediaService = () => ({
  uploadMedia: jest.fn().mockResolvedValue({ key: 'test-key', url: 'https://example.com' }),
  getMediaUrl: jest.fn().mockResolvedValue('https://example.com'),
  getDisplayUrl: jest.fn().mockResolvedValue('https://example.com'),
  deleteMedia: jest.fn().mockResolvedValue(undefined),
});

/**
 * Create a mock Auth Service
 */
export const createMockAuthService = () => ({
  signInWithApple: jest.fn().mockResolvedValue({ user: null, isNewUser: false }),
  signOut: jest.fn().mockResolvedValue(undefined),
  loadStoredAuth: jest.fn().mockResolvedValue(null),
  checkCredentialState: jest.fn().mockResolvedValue(true),
  getCurrentUser: jest.fn().mockReturnValue(null),
});

/**
 * Create a mock Sync Service
 */
export const createMockSyncService = () => ({
  syncPending: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
  getQueueStatus: jest.fn().mockResolvedValue({ pending: 0, failed: 0 }),
  clearFailedItems: jest.fn().mockResolvedValue(undefined),
});

// ============ DynamoDB Client Mocks ============

/**
 * Create a mock DynamoDB client
 */
export const createMockDynamoDBClient = () => ({
  // Upload operations
  createUpload: jest.fn().mockResolvedValue(undefined),
  getUploadById: jest.fn().mockResolvedValue(null),
  updateUpload: jest.fn().mockResolvedValue(null),
  deleteUpload: jest.fn().mockResolvedValue(undefined),
  queryUploadsByGeohash: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
  queryUploadsByDevice: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
  getAllUploads: jest.fn().mockResolvedValue([]),

  // Vote operations
  castVote: jest.fn().mockImplementation(
    (uploadId: string, userId: string, voteType: VoteType) =>
      Promise.resolve({ voteCount: voteType === 'up' ? 1 : -1, userVote: voteType })
  ),
  removeVote: jest.fn().mockResolvedValue({ voteCount: 0, userVote: null }),
  getVote: jest.fn().mockResolvedValue(null),
  getUserVotesMap: jest.fn().mockResolvedValue({}),
  getVoteCountForUpload: jest.fn().mockResolvedValue(0),
  getVoteCountsForUploads: jest.fn().mockResolvedValue({}),
  getVotesForUpload: jest.fn().mockResolvedValue([]),
  getVotesByDevice: jest.fn().mockResolvedValue([]),

  // User operations
  upsertUser: jest.fn().mockResolvedValue(undefined),
  getUserById: jest.fn().mockResolvedValue(null),

  // Legacy (for backwards compatibility)
  upsertVote: jest.fn().mockResolvedValue(undefined),
  deleteVote: jest.fn().mockResolvedValue(undefined),
  updateVoteCount: jest.fn().mockResolvedValue(0),
});

// ============ S3 Client Mocks ============

/**
 * Create a mock S3 client
 */
export const createMockS3Client = () => ({
  uploadFile: jest.fn().mockResolvedValue({ key: 'test-key' }),
  downloadFile: jest.fn().mockResolvedValue({ path: '/test/path' }),
  getPresignedUrl: jest.fn().mockResolvedValue('https://presigned-url.com'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
});

// ============ Hook Result Mocks ============

/**
 * Create a mock useAuth result
 */
export const createMockUseAuthResult = (overrides: Partial<{
  isAuthenticated: boolean;
  user: { id: string; email: string | null; displayName: string | null } | null;
  isLoading: boolean;
  error: string | null;
  isAppleSignInAvailable: boolean;
  canPost: boolean;
}> = {}) => ({
  isAuthenticated: overrides.isAuthenticated ?? false,
  user: overrides.user ?? null,
  isLoading: overrides.isLoading ?? false,
  error: overrides.error ?? null,
  isAppleSignInAvailable: overrides.isAppleSignInAvailable ?? true,
  canPost: overrides.canPost ?? false,
  signInWithApple: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockResolvedValue(undefined),
});

/**
 * Create a mock useDeviceIdentity result
 */
export const createMockUseDeviceIdentityResult = (deviceId: string = 'test-device-id') => ({
  deviceId,
  deviceIdRef: { current: deviceId },
  isLoading: false,
  error: null,
});

// ============ Provider Mocks ============

/**
 * Create a mock UploadDataProvider
 */
export const createMockUploadDataProvider = () => ({
  getAll: jest.fn().mockResolvedValue([]),
  getInBounds: jest.fn().mockResolvedValue([]),
  invalidate: jest.fn(),
});

// ============ Helper Functions ============

/**
 * Reset all mocks in an object
 */
export const resetAllMocks = (mockObject: Record<string, jest.Mock>) => {
  Object.values(mockObject).forEach((mock) => {
    if (typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
};

/**
 * Verify all mocks in an object were not called
 */
export const verifyNoMocksCalled = (mockObject: Record<string, jest.Mock>) => {
  Object.entries(mockObject).forEach(([name, mock]) => {
    if (typeof mock.mock !== 'undefined') {
      expect(mock).not.toHaveBeenCalled();
    }
  });
};
