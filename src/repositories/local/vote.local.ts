/**
 * Local Vote Repository
 *
 * AsyncStorage-based implementation of IVoteRepository.
 * Maintains backward compatibility with existing UserVotes format.
 */

import { v4 as uuidv4 } from 'uuid';
import { getStoredJSON, setStoredJSON } from '../../shared/utils/storage';
import { STORAGE_KEYS, BFF_STORAGE_KEYS } from '../../shared/constants';
import type { VoteType, UserVotes } from '../../shared/types';
import type {
  IVoteRepository,
  BFFVote,
  UpsertVoteInput,
} from '../interfaces/vote.repository';

/**
 * Create a vote ID from upload and device IDs
 */
function createVoteId(uploadId: string, deviceId: string): string {
  return `${uploadId}#${deviceId}`;
}

/**
 * Local Vote Repository Implementation
 */
export class LocalVoteRepository implements IVoteRepository {
  private deviceId: string = '';

  /**
   * Initialize with device ID
   */
  async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
  }

  /**
   * Get current device ID
   */
  private async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    // Try to load from storage
    const stored = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
    if (stored) {
      this.deviceId = stored;
      return stored;
    }

    // Generate new device ID
    this.deviceId = uuidv4();
    await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, this.deviceId);
    return this.deviceId;
  }

  /**
   * Load user votes from storage (legacy format)
   */
  private async loadUserVotes(): Promise<UserVotes> {
    const stored = await getStoredJSON<UserVotes>(STORAGE_KEYS.USER_VOTES);
    return stored || {};
  }

  /**
   * Save user votes to storage (legacy format)
   */
  private async saveUserVotes(votes: UserVotes): Promise<void> {
    await setStoredJSON(STORAGE_KEYS.USER_VOTES, votes);
  }

  /**
   * Convert legacy vote to BFFVote
   */
  private toBFFVote(
    uploadId: string,
    deviceId: string,
    voteType: VoteType
  ): BFFVote {
    return {
      id: createVoteId(uploadId, deviceId),
      uploadId,
      deviceId,
      voteType,
      timestamp: new Date().toISOString(),
      syncStatus: 'synced',
    };
  }

  // ============ Create/Update ============

  async upsert(
    input: UpsertVoteInput
  ): Promise<{ vote: BFFVote; previousVoteType: VoteType | null }> {
    const userVotes = await this.loadUserVotes();
    const deviceId = await this.getDeviceId();

    // Legacy format uses numeric upload IDs
    const numericUploadId = parseInt(input.uploadId, 10);
    const previousVoteType = userVotes[numericUploadId] || null;

    // Update vote
    userVotes[numericUploadId] = input.voteType;
    await this.saveUserVotes(userVotes);

    const vote = this.toBFFVote(input.uploadId, deviceId, input.voteType);

    return { vote, previousVoteType };
  }

  // ============ Read ============

  async getVote(uploadId: string, deviceId: string): Promise<BFFVote | null> {
    const userVotes = await this.loadUserVotes();
    const currentDeviceId = await this.getDeviceId();

    // Only return votes for the current device
    if (deviceId !== currentDeviceId) {
      return null;
    }

    const numericUploadId = parseInt(uploadId, 10);
    const voteType = userVotes[numericUploadId];

    if (!voteType) {
      return null;
    }

    return this.toBFFVote(uploadId, currentDeviceId, voteType);
  }

  async getVotesByDevice(deviceId: string): Promise<BFFVote[]> {
    const userVotes = await this.loadUserVotes();
    const currentDeviceId = await this.getDeviceId();

    // Only return votes for the current device
    if (deviceId !== currentDeviceId) {
      return [];
    }

    return Object.entries(userVotes).map(([uploadId, voteType]) =>
      this.toBFFVote(uploadId, currentDeviceId, voteType)
    );
  }

  async getVotesForUpload(uploadId: string): Promise<BFFVote[]> {
    // In local storage, we only have the current user's vote
    const vote = await this.getVote(uploadId, await this.getDeviceId());
    return vote ? [vote] : [];
  }

  async getUserVotesMap(deviceId: string): Promise<Record<string, VoteType>> {
    const currentDeviceId = await this.getDeviceId();

    // Only return votes for the current device
    if (deviceId !== currentDeviceId) {
      return {};
    }

    const userVotes = await this.loadUserVotes();

    // Convert numeric keys to string keys
    const result: Record<string, VoteType> = {};
    for (const [uploadId, voteType] of Object.entries(userVotes)) {
      result[uploadId] = voteType;
    }
    return result;
  }

  // ============ Delete ============

  async remove(uploadId: string, deviceId: string): Promise<VoteType | null> {
    const userVotes = await this.loadUserVotes();
    const currentDeviceId = await this.getDeviceId();

    // Only allow removing votes for the current device
    if (deviceId !== currentDeviceId) {
      return null;
    }

    const numericUploadId = parseInt(uploadId, 10);
    const previousVoteType = userVotes[numericUploadId] || null;

    if (previousVoteType) {
      delete userVotes[numericUploadId];
      await this.saveUserVotes(userVotes);
    }

    return previousVoteType;
  }

  // ============ Sync ============

  async getPendingSync(): Promise<BFFVote[]> {
    // Local repository has no pending sync items
    return [];
  }

  async markSynced(id: string): Promise<void> {
    // No-op for local repository
  }

  async markFailed(id: string, error: string): Promise<void> {
    // No-op for local repository
    console.warn(`Vote ${id} sync failed: ${error}`);
  }

  // ============ Legacy Compatibility ============

  /**
   * Get user votes in legacy format (for existing hook compatibility)
   */
  async getUserVotesLegacy(): Promise<UserVotes> {
    return this.loadUserVotes();
  }

  /**
   * Save user votes in legacy format (for existing hook compatibility)
   */
  async saveUserVotesLegacy(votes: UserVotes): Promise<void> {
    await this.saveUserVotes(votes);
  }

  /**
   * Calculate vote delta for an upload based on vote change
   */
  calculateVoteDelta(
    previousVoteType: VoteType | null,
    newVoteType: VoteType | null
  ): number {
    if (previousVoteType === newVoteType) {
      return 0; // No change
    }

    if (previousVoteType === null) {
      // New vote
      return newVoteType === 'up' ? 1 : -1;
    }

    if (newVoteType === null) {
      // Removed vote
      return previousVoteType === 'up' ? -1 : 1;
    }

    // Changed vote (up to down or down to up)
    return newVoteType === 'up' ? 2 : -2;
  }
}

// Singleton instance
let instance: LocalVoteRepository | null = null;

export function getLocalVoteRepository(): LocalVoteRepository {
  if (!instance) {
    instance = new LocalVoteRepository();
  }
  return instance;
}
