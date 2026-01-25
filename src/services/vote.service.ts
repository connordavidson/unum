/**
 * Vote Service
 *
 * Business logic for vote operations with dual-write support.
 * Manages vote state and keeps vote counts in sync.
 */

import { FEATURE_FLAGS } from '../shared/constants';
import type { VoteType, UserVotes } from '../shared/types';
import {
  getLocalVoteRepository,
  LocalVoteRepository,
} from '../repositories/local';
import {
  getRemoteVoteRepository,
  RemoteVoteRepository,
} from '../repositories/remote';
import type { BFFVote, UpsertVoteInput } from '../repositories/interfaces/vote.repository';
import { getUploadService } from './upload.service';

// ============ Types ============

export interface VoteServiceConfig {
  useRemote: boolean;
  deviceId: string;
}

export interface VoteResult {
  vote: BFFVote | null;
  previousVoteType: VoteType | null;
  voteDelta: number;
}

// ============ Service Implementation ============

/**
 * Vote Service
 *
 * Provides vote operations with offline-first strategy:
 * - Votes always go to local first
 * - When online and USE_AWS_BACKEND is enabled, also writes to remote
 * - Vote counts are updated atomically
 */
export class VoteService {
  private localRepo: LocalVoteRepository;
  private remoteRepo: RemoteVoteRepository;
  private config: VoteServiceConfig;

  constructor(config: VoteServiceConfig) {
    this.config = config;
    this.localRepo = getLocalVoteRepository();
    this.remoteRepo = getRemoteVoteRepository();
  }

  /**
   * Check if remote operations are enabled
   */
  private get useRemote(): boolean {
    return this.config.useRemote && FEATURE_FLAGS.USE_AWS_BACKEND;
  }

  // ============ Vote Operations ============

  /**
   * Cast or change a vote
   * Returns the vote result including the delta to apply to vote count
   */
  async castVote(uploadId: string, voteType: VoteType): Promise<VoteResult> {
    const input: UpsertVoteInput = {
      uploadId,
      deviceId: this.config.deviceId,
      voteType,
    };

    // Cast vote locally first
    const { vote, previousVoteType } = await this.localRepo.upsert(input);

    // Calculate vote delta
    const voteDelta = this.localRepo.calculateVoteDelta(previousVoteType, voteType);

    // If remote is enabled, also cast remotely
    if (this.useRemote) {
      try {
        await this.remoteRepo.upsert(input);
        // Remote repository handles vote count update internally
      } catch (error) {
        console.error('Failed to sync vote to remote:', error);
        // Local vote is still valid, will be synced later
      }
    }

    return { vote, previousVoteType, voteDelta };
  }

  /**
   * Remove a vote
   * Returns the removed vote type and the delta to apply
   */
  async removeVote(uploadId: string): Promise<VoteResult> {
    const deviceId = this.config.deviceId;

    // Remove locally first
    const previousVoteType = await this.localRepo.remove(uploadId, deviceId);

    // Calculate vote delta
    const voteDelta = previousVoteType
      ? this.localRepo.calculateVoteDelta(previousVoteType, null)
      : 0;

    // If remote is enabled, also remove remotely
    if (this.useRemote && previousVoteType) {
      try {
        await this.remoteRepo.remove(uploadId, deviceId);
        // Remote repository handles vote count update internally
      } catch (error) {
        console.error('Failed to sync vote removal to remote:', error);
      }
    }

    return { vote: null, previousVoteType, voteDelta };
  }

  /**
   * Toggle a vote - if same type, remove; otherwise cast new type
   */
  async toggleVote(uploadId: string, voteType: VoteType): Promise<VoteResult> {
    const currentVote = await this.getVote(uploadId);

    if (currentVote && currentVote.voteType === voteType) {
      // Same vote type - remove it
      return this.removeVote(uploadId);
    } else {
      // Different or no vote - cast new vote
      return this.castVote(uploadId, voteType);
    }
  }

  // ============ Read Operations ============

  /**
   * Get the current user's vote for an upload
   */
  async getVote(uploadId: string): Promise<BFFVote | null> {
    return this.localRepo.getVote(uploadId, this.config.deviceId);
  }

  /**
   * Get all votes by the current user
   */
  async getUserVotes(): Promise<BFFVote[]> {
    return this.localRepo.getVotesByDevice(this.config.deviceId);
  }

  /**
   * Get user votes as a map (uploadId -> voteType)
   * Useful for UI state
   */
  async getUserVotesMap(): Promise<Record<string, VoteType>> {
    return this.localRepo.getUserVotesMap(this.config.deviceId);
  }

  /**
   * Get all votes for an upload
   * Only returns current user's vote for local, all votes for remote
   */
  async getVotesForUpload(uploadId: string): Promise<BFFVote[]> {
    if (this.useRemote) {
      try {
        return await this.remoteRepo.getVotesForUpload(uploadId);
      } catch (error) {
        console.error('Failed to fetch votes from remote:', error);
      }
    }
    return this.localRepo.getVotesForUpload(uploadId);
  }

  // ============ Legacy Compatibility ============

  /**
   * Get user votes in legacy format
   */
  async getUserVotesLegacy(): Promise<UserVotes> {
    return this.localRepo.getUserVotesLegacy();
  }

  /**
   * Save user votes in legacy format
   */
  async saveUserVotesLegacy(votes: UserVotes): Promise<void> {
    await this.localRepo.saveUserVotesLegacy(votes);
  }

  /**
   * Calculate vote delta (exposed for hooks)
   */
  calculateVoteDelta(
    previousVoteType: VoteType | null,
    newVoteType: VoteType | null
  ): number {
    return this.localRepo.calculateVoteDelta(previousVoteType, newVoteType);
  }

  // ============ Sync ============

  /**
   * Get votes pending sync
   */
  async getPendingSync(): Promise<BFFVote[]> {
    return this.localRepo.getPendingSync();
  }

  /**
   * Sync pending votes to remote
   */
  async syncPending(): Promise<{ synced: number; failed: number }> {
    if (!this.useRemote) {
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingSync();
    let synced = 0;
    let failed = 0;

    for (const vote of pending) {
      try {
        await this.remoteRepo.upsert({
          uploadId: vote.uploadId,
          deviceId: vote.deviceId,
          voteType: vote.voteType,
        });
        await this.localRepo.markSynced(vote.id);
        synced++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.localRepo.markFailed(vote.id, errorMessage);
        failed++;
      }
    }

    return { synced, failed };
  }
}

// ============ Factory ============

let serviceInstance: VoteService | null = null;

export function getVoteService(config?: Partial<VoteServiceConfig>): VoteService {
  if (!serviceInstance) {
    serviceInstance = new VoteService({
      useRemote: config?.useRemote ?? FEATURE_FLAGS.USE_AWS_BACKEND,
      deviceId: config?.deviceId ?? '',
    });
  }
  return serviceInstance;
}

export function resetVoteService(): void {
  serviceInstance = null;
}
