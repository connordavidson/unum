/**
 * Vote Service Tests
 */

import { VoteService, getVoteService, resetVoteService } from '../vote.service';

// Mock the repositories
jest.mock('../../repositories/local', () => ({
  getLocalVoteRepository: jest.fn(() => mockLocalRepo),
}));

jest.mock('../../repositories/remote', () => ({
  getRemoteVoteRepository: jest.fn(() => mockRemoteRepo),
}));

// Mock FEATURE_FLAGS
jest.mock('../../shared/constants', () => ({
  FEATURE_FLAGS: {
    USE_AWS_BACKEND: true,
  },
}));

// Create mock repositories
const mockLocalRepo = {
  upsert: jest.fn(),
  remove: jest.fn(),
  getVote: jest.fn(),
  getVotesByDevice: jest.fn(),
  getUserVotesMap: jest.fn(),
  getVotesForUpload: jest.fn(),
  calculateVoteDelta: jest.fn(),
  getPendingSync: jest.fn(),
  markSynced: jest.fn(),
  markFailed: jest.fn(),
  getUserVotesLegacy: jest.fn(),
  saveUserVotesLegacy: jest.fn(),
};

const mockRemoteRepo = {
  upsert: jest.fn(),
  remove: jest.fn(),
  getVotesForUpload: jest.fn(),
};

describe('VoteService', () => {
  let service: VoteService;
  const deviceId = 'test-device-id';

  beforeEach(() => {
    jest.clearAllMocks();
    resetVoteService();

    service = new VoteService({
      useRemote: true,
      deviceId,
    });
  });

  describe('castVote', () => {
    it('should cast a new upvote', async () => {
      const mockVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: mockVote,
        previousVoteType: null,
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(1);
      mockRemoteRepo.upsert.mockResolvedValue(undefined);

      const result = await service.castVote('upload-123', 'up');

      expect(result.vote).toEqual(mockVote);
      expect(result.previousVoteType).toBeNull();
      expect(result.voteDelta).toBe(1);
      expect(mockLocalRepo.upsert).toHaveBeenCalledWith({
        uploadId: 'upload-123',
        deviceId,
        voteType: 'up',
      });
      expect(mockRemoteRepo.upsert).toHaveBeenCalled();
    });

    it('should change an existing vote', async () => {
      const mockVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'down' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: mockVote,
        previousVoteType: 'up',
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(-2);
      mockRemoteRepo.upsert.mockResolvedValue(undefined);

      const result = await service.castVote('upload-123', 'down');

      expect(result.previousVoteType).toBe('up');
      expect(result.voteDelta).toBe(-2);
    });

    it('should handle remote sync failure gracefully', async () => {
      const mockVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: mockVote,
        previousVoteType: null,
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(1);
      mockRemoteRepo.upsert.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.castVote('upload-123', 'up');

      expect(result.vote).toEqual(mockVote);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to sync vote to remote:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should not sync to remote when useRemote is false', async () => {
      const localOnlyService = new VoteService({
        useRemote: false,
        deviceId,
      });

      const mockVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'pending' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: mockVote,
        previousVoteType: null,
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(1);

      await localOnlyService.castVote('upload-123', 'up');

      expect(mockRemoteRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeVote', () => {
    it('should remove an existing upvote', async () => {
      mockLocalRepo.remove.mockResolvedValue('up');
      mockLocalRepo.calculateVoteDelta.mockReturnValue(-1);
      mockRemoteRepo.remove.mockResolvedValue(undefined);

      const result = await service.removeVote('upload-123');

      expect(result.vote).toBeNull();
      expect(result.previousVoteType).toBe('up');
      expect(result.voteDelta).toBe(-1);
      expect(mockLocalRepo.remove).toHaveBeenCalledWith('upload-123', deviceId);
      expect(mockRemoteRepo.remove).toHaveBeenCalledWith('upload-123', deviceId);
    });

    it('should remove an existing downvote', async () => {
      mockLocalRepo.remove.mockResolvedValue('down');
      mockLocalRepo.calculateVoteDelta.mockReturnValue(1);
      mockRemoteRepo.remove.mockResolvedValue(undefined);

      const result = await service.removeVote('upload-123');

      expect(result.previousVoteType).toBe('down');
      expect(result.voteDelta).toBe(1);
    });

    it('should return zero delta when no vote existed', async () => {
      mockLocalRepo.remove.mockResolvedValue(null);

      const result = await service.removeVote('upload-123');

      expect(result.previousVoteType).toBeNull();
      expect(result.voteDelta).toBe(0);
      expect(mockRemoteRepo.remove).not.toHaveBeenCalled();
    });

    it('should handle remote removal failure gracefully', async () => {
      mockLocalRepo.remove.mockResolvedValue('up');
      mockLocalRepo.calculateVoteDelta.mockReturnValue(-1);
      mockRemoteRepo.remove.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.removeVote('upload-123');

      expect(result.previousVoteType).toBe('up');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('toggleVote', () => {
    it('should remove vote when toggling same type', async () => {
      mockLocalRepo.getVote.mockResolvedValue({
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up',
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced',
      });
      mockLocalRepo.remove.mockResolvedValue('up');
      mockLocalRepo.calculateVoteDelta.mockReturnValue(-1);

      const result = await service.toggleVote('upload-123', 'up');

      expect(result.vote).toBeNull();
      expect(result.previousVoteType).toBe('up');
      expect(mockLocalRepo.remove).toHaveBeenCalled();
    });

    it('should cast vote when toggling different type', async () => {
      mockLocalRepo.getVote.mockResolvedValue({
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up',
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced',
      });

      const newVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'down' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: newVote,
        previousVoteType: 'up',
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(-2);

      const result = await service.toggleVote('upload-123', 'down');

      expect(result.vote?.voteType).toBe('down');
      expect(result.previousVoteType).toBe('up');
    });

    it('should cast vote when no previous vote exists', async () => {
      mockLocalRepo.getVote.mockResolvedValue(null);

      const newVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.upsert.mockResolvedValue({
        vote: newVote,
        previousVoteType: null,
      });
      mockLocalRepo.calculateVoteDelta.mockReturnValue(1);

      const result = await service.toggleVote('upload-123', 'up');

      expect(result.vote?.voteType).toBe('up');
      expect(result.previousVoteType).toBeNull();
    });
  });

  describe('getVote', () => {
    it('should return current user vote', async () => {
      const mockVote = {
        id: 'upload-123#test-device-id',
        uploadId: 'upload-123',
        deviceId: 'test-device-id',
        voteType: 'up' as const,
        timestamp: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      };

      mockLocalRepo.getVote.mockResolvedValue(mockVote);

      const result = await service.getVote('upload-123');

      expect(result).toEqual(mockVote);
      expect(mockLocalRepo.getVote).toHaveBeenCalledWith('upload-123', deviceId);
    });

    it('should return null when no vote exists', async () => {
      mockLocalRepo.getVote.mockResolvedValue(null);

      const result = await service.getVote('upload-123');

      expect(result).toBeNull();
    });
  });

  describe('getUserVotes', () => {
    it('should return all user votes', async () => {
      const mockVotes = [
        { id: 'vote-1', uploadId: 'upload-1', voteType: 'up' as const },
        { id: 'vote-2', uploadId: 'upload-2', voteType: 'down' as const },
      ];

      mockLocalRepo.getVotesByDevice.mockResolvedValue(mockVotes);

      const result = await service.getUserVotes();

      expect(result).toEqual(mockVotes);
      expect(mockLocalRepo.getVotesByDevice).toHaveBeenCalledWith(deviceId);
    });
  });

  describe('getUserVotesMap', () => {
    it('should return votes as map', async () => {
      const mockMap = {
        'upload-1': 'up' as const,
        'upload-2': 'down' as const,
      };

      mockLocalRepo.getUserVotesMap.mockResolvedValue(mockMap);

      const result = await service.getUserVotesMap();

      expect(result).toEqual(mockMap);
    });
  });

  describe('getVotesForUpload', () => {
    it('should return remote votes when remote is enabled', async () => {
      const mockVotes = [
        { id: 'vote-1', uploadId: 'upload-123', deviceId: 'user-1', voteType: 'up' as const },
        { id: 'vote-2', uploadId: 'upload-123', deviceId: 'user-2', voteType: 'up' as const },
      ];

      mockRemoteRepo.getVotesForUpload.mockResolvedValue(mockVotes);

      const result = await service.getVotesForUpload('upload-123');

      expect(result).toEqual(mockVotes);
      expect(mockRemoteRepo.getVotesForUpload).toHaveBeenCalledWith('upload-123');
    });

    it('should fallback to local when remote fails', async () => {
      const mockLocalVotes = [
        { id: 'vote-1', uploadId: 'upload-123', deviceId: 'user-1', voteType: 'up' as const },
      ];

      mockRemoteRepo.getVotesForUpload.mockRejectedValue(new Error('Network error'));
      mockLocalRepo.getVotesForUpload.mockResolvedValue(mockLocalVotes);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.getVotesForUpload('upload-123');

      expect(result).toEqual(mockLocalVotes);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('calculateVoteDelta', () => {
    it('should delegate to local repository', () => {
      mockLocalRepo.calculateVoteDelta.mockReturnValue(2);

      const result = service.calculateVoteDelta('down', 'up');

      expect(result).toBe(2);
      expect(mockLocalRepo.calculateVoteDelta).toHaveBeenCalledWith('down', 'up');
    });
  });

  describe('syncPending', () => {
    it('should return zeros when remote is disabled', async () => {
      const localOnlyService = new VoteService({
        useRemote: false,
        deviceId,
      });

      const result = await localOnlyService.syncPending();

      expect(result).toEqual({ synced: 0, failed: 0 });
    });

    it('should sync pending votes to remote', async () => {
      const pendingVotes = [
        {
          id: 'vote-1',
          uploadId: 'upload-1',
          deviceId: 'test-device-id',
          voteType: 'up' as const,
          timestamp: '2024-01-01T00:00:00.000Z',
          syncStatus: 'pending' as const,
        },
        {
          id: 'vote-2',
          uploadId: 'upload-2',
          deviceId: 'test-device-id',
          voteType: 'down' as const,
          timestamp: '2024-01-01T00:00:00.000Z',
          syncStatus: 'pending' as const,
        },
      ];

      mockLocalRepo.getPendingSync.mockResolvedValue(pendingVotes);
      mockRemoteRepo.upsert.mockResolvedValue(undefined);
      mockLocalRepo.markSynced.mockResolvedValue(undefined);

      const result = await service.syncPending();

      expect(result).toEqual({ synced: 2, failed: 0 });
      expect(mockRemoteRepo.upsert).toHaveBeenCalledTimes(2);
      expect(mockLocalRepo.markSynced).toHaveBeenCalledTimes(2);
    });

    it('should handle sync failures', async () => {
      const pendingVotes = [
        {
          id: 'vote-1',
          uploadId: 'upload-1',
          deviceId: 'test-device-id',
          voteType: 'up' as const,
          timestamp: '2024-01-01T00:00:00.000Z',
          syncStatus: 'pending' as const,
        },
      ];

      mockLocalRepo.getPendingSync.mockResolvedValue(pendingVotes);
      mockRemoteRepo.upsert.mockRejectedValue(new Error('Sync failed'));
      mockLocalRepo.markFailed.mockResolvedValue(undefined);

      const result = await service.syncPending();

      expect(result).toEqual({ synced: 0, failed: 1 });
      expect(mockLocalRepo.markFailed).toHaveBeenCalledWith('vote-1', 'Sync failed');
    });
  });
});

describe('getVoteService', () => {
  beforeEach(() => {
    resetVoteService();
  });

  it('should return singleton instance', () => {
    const instance1 = getVoteService({ deviceId: 'device-1' });
    const instance2 = getVoteService({ deviceId: 'device-2' });

    expect(instance1).toBe(instance2);
  });
});

describe('resetVoteService', () => {
  it('should clear the singleton instance', () => {
    const instance1 = getVoteService({ deviceId: 'device-1' });
    resetVoteService();
    const instance2 = getVoteService({ deviceId: 'device-2' });

    expect(instance1).not.toBe(instance2);
  });
});
