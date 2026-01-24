/**
 * Vote Repository Interface
 *
 * Defines the contract for vote data access.
 * Implementations can use AsyncStorage (local) or DynamoDB (remote).
 */

import type { VoteType, SyncStatus } from '../../shared/types';

/**
 * Vote entity for BFF layer
 */
export interface BFFVote {
  id: string;                  // Composite: `${uploadId}#${deviceId}`
  uploadId: string;
  deviceId: string;
  voteType: VoteType;
  timestamp: string;
  syncStatus: SyncStatus;
}

/**
 * Input for upserting a vote
 */
export interface UpsertVoteInput {
  uploadId: string;
  deviceId: string;
  voteType: VoteType;
}

/**
 * Vote Repository Interface
 */
export interface IVoteRepository {
  // ============ Create/Update ============

  /**
   * Create or update a vote (upsert)
   * Returns the previous vote type if it existed, null otherwise
   */
  upsert(input: UpsertVoteInput): Promise<{ vote: BFFVote; previousVoteType: VoteType | null }>;

  // ============ Read ============

  /**
   * Get a specific vote
   */
  getVote(uploadId: string, deviceId: string): Promise<BFFVote | null>;

  /**
   * Get all votes by a device
   */
  getVotesByDevice(deviceId: string): Promise<BFFVote[]>;

  /**
   * Get all votes for an upload
   */
  getVotesForUpload(uploadId: string): Promise<BFFVote[]>;

  /**
   * Get user votes as a map (for UI state)
   */
  getUserVotesMap(deviceId: string): Promise<Record<string, VoteType>>;

  // ============ Delete ============

  /**
   * Remove a vote
   * Returns the removed vote type if it existed, null otherwise
   */
  remove(uploadId: string, deviceId: string): Promise<VoteType | null>;

  // ============ Sync ============

  /**
   * Get votes pending sync
   */
  getPendingSync(): Promise<BFFVote[]>;

  /**
   * Mark vote as synced
   */
  markSynced(id: string): Promise<void>;

  /**
   * Mark vote as failed
   */
  markFailed(id: string, error: string): Promise<void>;
}
