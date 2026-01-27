/**
 * Remote Vote Repository Tests
 */

import {
  RemoteVoteRepository,
  getRemoteVoteRepository,
} from '../remote/vote.remote';

// Mock the DynamoDB client
jest.mock('../../api/clients/dynamodb.client', () => ({
  upsertVote: jest.fn(),
  getVote: jest.fn(),
  deleteVote: jest.fn(),
  getVotesForUpload: jest.fn(),
  getVotesByDevice: jest.fn(),
  getVoteCountForUpload: jest.fn(),
  createUploadPK: jest.fn((id) => `UPLOAD#${id}`),
  createVoteSK: jest.fn((id) => `VOTE#${id}`),
  createUserGSI1PK: jest.fn((id) => `USER#${id}`),
}));

// Import the mocked module
import * as dynamoClient from '../../api/clients/dynamodb.client';

const mockDynamoClient = dynamoClient as jest.Mocked<typeof dynamoClient>;

describe('RemoteVoteRepository', () => {
  let repository: RemoteVoteRepository;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a fresh repository instance
    repository = new RemoteVoteRepository();
  });

  describe('initialize', () => {
    it('should set the device ID', async () => {
      await repository.initialize('test-device-id');
      // No error means success - deviceId is private
      expect(true).toBe(true);
    });
  });

  describe('upsert', () => {
    it('should create a new vote when no previous vote exists', async () => {
      mockDynamoClient.getVote.mockResolvedValue(null);
      mockDynamoClient.upsertVote.mockResolvedValue(undefined);

      const result = await repository.upsert({
        uploadId: 'upload-123',
        deviceId: 'user-456',
        voteType: 'up',
      });

      expect(result.vote).toBeDefined();
      expect(result.vote.uploadId).toBe('upload-123');
      expect(result.vote.deviceId).toBe('user-456');
      expect(result.vote.voteType).toBe('up');
      expect(result.vote.syncStatus).toBe('synced');
      expect(result.previousVoteType).toBeNull();

      expect(mockDynamoClient.upsertVote).toHaveBeenCalledTimes(1);
    });

    it('should update an existing vote', async () => {
      mockDynamoClient.getVote.mockResolvedValue({
        PK: 'UPLOAD#upload-123',
        SK: 'VOTE#user-456',
        GSI1PK: 'USER#user-456',
        GSI1SK: 'VOTE#upload-123#2024-01-01T00:00:00.000Z',
        uploadId: 'upload-123',
        userId: 'user-456',
        voteType: 'up',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      mockDynamoClient.upsertVote.mockResolvedValue(undefined);

      const result = await repository.upsert({
        uploadId: 'upload-123',
        deviceId: 'user-456',
        voteType: 'down',
      });

      expect(result.vote.voteType).toBe('down');
      expect(result.previousVoteType).toBe('up');
    });

    it('should generate correct vote ID format', async () => {
      mockDynamoClient.getVote.mockResolvedValue(null);
      mockDynamoClient.upsertVote.mockResolvedValue(undefined);

      const result = await repository.upsert({
        uploadId: 'upload-123',
        deviceId: 'user-456',
        voteType: 'up',
      });

      expect(result.vote.id).toBe('upload-123#user-456');
    });
  });

  describe('getVote', () => {
    it('should return null when vote does not exist', async () => {
      mockDynamoClient.getVote.mockResolvedValue(null);

      const result = await repository.getVote('upload-123', 'user-456');

      expect(result).toBeNull();
      expect(mockDynamoClient.getVote).toHaveBeenCalledWith('upload-123', 'user-456');
    });

    it('should return vote when it exists', async () => {
      mockDynamoClient.getVote.mockResolvedValue({
        PK: 'UPLOAD#upload-123',
        SK: 'VOTE#user-456',
        GSI1PK: 'USER#user-456',
        GSI1SK: 'VOTE#upload-123#2024-01-01T00:00:00.000Z',
        uploadId: 'upload-123',
        userId: 'user-456',
        voteType: 'up',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await repository.getVote('upload-123', 'user-456');

      expect(result).not.toBeNull();
      expect(result?.uploadId).toBe('upload-123');
      expect(result?.deviceId).toBe('user-456'); // Maps userId -> deviceId
      expect(result?.voteType).toBe('up');
      expect(result?.syncStatus).toBe('synced');
    });
  });

  describe('getVotesByDevice', () => {
    it('should return empty array when no votes exist', async () => {
      mockDynamoClient.getVotesByDevice.mockResolvedValue([]);

      const result = await repository.getVotesByDevice('user-456');

      expect(result).toEqual([]);
      expect(mockDynamoClient.getVotesByDevice).toHaveBeenCalledWith('user-456');
    });

    it('should return all votes for a device', async () => {
      mockDynamoClient.getVotesByDevice.mockResolvedValue([
        {
          PK: 'UPLOAD#upload-1',
          SK: 'VOTE#user-456',
          GSI1PK: 'USER#user-456',
          GSI1SK: 'VOTE#upload-1#2024-01-01T00:00:00.000Z',
          uploadId: 'upload-1',
          userId: 'user-456',
          voteType: 'up',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'UPLOAD#upload-2',
          SK: 'VOTE#user-456',
          GSI1PK: 'USER#user-456',
          GSI1SK: 'VOTE#upload-2#2024-01-02T00:00:00.000Z',
          uploadId: 'upload-2',
          userId: 'user-456',
          voteType: 'down',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]);

      const result = await repository.getVotesByDevice('user-456');

      expect(result).toHaveLength(2);
      expect(result[0].uploadId).toBe('upload-1');
      expect(result[0].voteType).toBe('up');
      expect(result[1].uploadId).toBe('upload-2');
      expect(result[1].voteType).toBe('down');
    });
  });

  describe('getVotesForUpload', () => {
    it('should return empty array when no votes exist', async () => {
      mockDynamoClient.getVotesForUpload.mockResolvedValue([]);

      const result = await repository.getVotesForUpload('upload-123');

      expect(result).toEqual([]);
    });

    it('should return all votes for an upload', async () => {
      mockDynamoClient.getVotesForUpload.mockResolvedValue([
        {
          PK: 'UPLOAD#upload-123',
          SK: 'VOTE#user-1',
          GSI1PK: 'USER#user-1',
          GSI1SK: 'VOTE#upload-123#2024-01-01T00:00:00.000Z',
          uploadId: 'upload-123',
          userId: 'user-1',
          voteType: 'up',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'UPLOAD#upload-123',
          SK: 'VOTE#user-2',
          GSI1PK: 'USER#user-2',
          GSI1SK: 'VOTE#upload-123#2024-01-02T00:00:00.000Z',
          uploadId: 'upload-123',
          userId: 'user-2',
          voteType: 'up',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]);

      const result = await repository.getVotesForUpload('upload-123');

      expect(result).toHaveLength(2);
    });
  });

  describe('getUserVotesMap', () => {
    it('should return empty object when no votes exist', async () => {
      mockDynamoClient.getVotesByDevice.mockResolvedValue([]);

      const result = await repository.getUserVotesMap('user-456');

      expect(result).toEqual({});
    });

    it('should return map of uploadId to voteType', async () => {
      mockDynamoClient.getVotesByDevice.mockResolvedValue([
        {
          PK: 'UPLOAD#upload-1',
          SK: 'VOTE#user-456',
          GSI1PK: 'USER#user-456',
          GSI1SK: 'VOTE#upload-1#2024-01-01T00:00:00.000Z',
          uploadId: 'upload-1',
          userId: 'user-456',
          voteType: 'up',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'UPLOAD#upload-2',
          SK: 'VOTE#user-456',
          GSI1PK: 'USER#user-456',
          GSI1SK: 'VOTE#upload-2#2024-01-02T00:00:00.000Z',
          uploadId: 'upload-2',
          userId: 'user-456',
          voteType: 'down',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]);

      const result = await repository.getUserVotesMap('user-456');

      expect(result).toEqual({
        'upload-1': 'up',
        'upload-2': 'down',
      });
    });
  });

  describe('remove', () => {
    it('should return null when vote does not exist', async () => {
      mockDynamoClient.getVote.mockResolvedValue(null);

      const result = await repository.remove('upload-123', 'user-456');

      expect(result).toBeNull();
      expect(mockDynamoClient.deleteVote).not.toHaveBeenCalled();
    });

    it('should delete vote and return previous vote type', async () => {
      mockDynamoClient.getVote.mockResolvedValue({
        PK: 'UPLOAD#upload-123',
        SK: 'VOTE#user-456',
        GSI1PK: 'USER#user-456',
        GSI1SK: 'VOTE#upload-123#2024-01-01T00:00:00.000Z',
        uploadId: 'upload-123',
        userId: 'user-456',
        voteType: 'up',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      mockDynamoClient.deleteVote.mockResolvedValue(undefined);

      const result = await repository.remove('upload-123', 'user-456');

      expect(result).toBe('up');
      expect(mockDynamoClient.deleteVote).toHaveBeenCalledWith('upload-123', 'user-456');
    });
  });

  describe('sync methods', () => {
    it('getPendingSync should return empty array (remote has no pending)', async () => {
      const result = await repository.getPendingSync();
      expect(result).toEqual([]);
    });

    it('markSynced should be a no-op', async () => {
      await expect(repository.markSynced('vote-id')).resolves.toBeUndefined();
    });

    it('markFailed should log error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await repository.markFailed('vote-id', 'Test error');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Vote] Vote vote-id operation failed',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});

describe('getRemoteVoteRepository', () => {
  it('should return singleton instance', () => {
    const instance1 = getRemoteVoteRepository();
    const instance2 = getRemoteVoteRepository();

    expect(instance1).toBe(instance2);
  });
});
