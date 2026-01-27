/**
 * Remote Vote Repository
 *
 * DynamoDB-based implementation of IVoteRepository.
 * Stores votes in the same table as uploads using a different sort key pattern.
 */

import {
  upsertVote as dynamoUpsertVote,
  getVote as dynamoGetVote,
  deleteVote as dynamoDeleteVote,
  getVotesForUpload as dynamoGetVotesForUpload,
  getVotesByDevice as dynamoGetVotesByDevice,
  createUploadPK,
  createVoteSK,
  createUserGSI1PK,
  getVoteCountForUpload,
} from '../../api/clients/dynamodb.client';
import { createVoteId } from '../../shared/utils/votes';
import type { VoteType } from '../../shared/types';
import type {
  IVoteRepository,
  BFFVote,
  UpsertVoteInput,
} from '../interfaces/vote.repository';
import type { DynamoVoteItem } from '../../api/types';
import { getLoggingService } from '../../services/logging.service';

const log = getLoggingService().createLogger('Vote');

// ============ Conversion Helpers ============

/**
 * Convert DynamoDB item to BFFVote
 * Note: DynamoDB uses userId, BFFVote uses deviceId (legacy naming)
 */
function fromDynamoItem(item: DynamoVoteItem): BFFVote {
  return {
    id: createVoteId(item.uploadId, item.userId),
    uploadId: item.uploadId,
    deviceId: item.userId, // Map userId -> deviceId for backwards compatibility
    voteType: item.voteType,
    timestamp: item.createdAt,
    syncStatus: 'synced',
  };
}

/**
 * Convert BFFVote to DynamoDB item
 * Note: BFFVote uses deviceId, DynamoDB uses userId (legacy naming in BFFVote)
 */
function toDynamoItem(vote: BFFVote): DynamoVoteItem {
  const now = new Date().toISOString();
  return {
    PK: createUploadPK(vote.uploadId),
    SK: createVoteSK(vote.deviceId),
    GSI1PK: createUserGSI1PK(vote.deviceId), // deviceId is actually userId
    GSI1SK: `VOTE#${vote.uploadId}#${now}`,
    uploadId: vote.uploadId,
    userId: vote.deviceId, // Map deviceId -> userId
    voteType: vote.voteType,
    createdAt: vote.timestamp,
    updatedAt: now,
  };
}

// ============ Repository Implementation ============

/**
 * Remote Vote Repository
 */
export class RemoteVoteRepository implements IVoteRepository {
  private deviceId: string = '';

  /**
   * Initialize with device ID
   */
  async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
  }

  // ============ Create/Update ============

  async upsert(
    input: UpsertVoteInput
  ): Promise<{ vote: BFFVote; previousVoteType: VoteType | null }> {
    // Get existing vote if any
    const existingItem = await dynamoGetVote(input.uploadId, input.deviceId);
    const previousVoteType = existingItem ? existingItem.voteType : null;

    const now = new Date().toISOString();
    const vote: BFFVote = {
      id: createVoteId(input.uploadId, input.deviceId),
      uploadId: input.uploadId,
      deviceId: input.deviceId,
      voteType: input.voteType,
      timestamp: now,
      syncStatus: 'synced',
    };

    // Save vote (vote items are source of truth - count is derived)
    const dynamoItem = toDynamoItem(vote);
    await dynamoUpsertVote(dynamoItem);

    return { vote, previousVoteType };
  }

  // ============ Read ============

  async getVote(uploadId: string, deviceId: string): Promise<BFFVote | null> {
    const item = await dynamoGetVote(uploadId, deviceId);
    return item ? fromDynamoItem(item) : null;
  }

  async getVotesByDevice(deviceId: string): Promise<BFFVote[]> {
    const items = await dynamoGetVotesByDevice(deviceId);
    return items.map(fromDynamoItem);
  }

  async getVotesForUpload(uploadId: string): Promise<BFFVote[]> {
    const items = await dynamoGetVotesForUpload(uploadId);
    return items.map(fromDynamoItem);
  }

  async getUserVotesMap(deviceId: string): Promise<Record<string, VoteType>> {
    const votes = await this.getVotesByDevice(deviceId);
    const map: Record<string, VoteType> = {};

    for (const vote of votes) {
      map[vote.uploadId] = vote.voteType;
    }

    return map;
  }

  // ============ Delete ============

  async remove(uploadId: string, deviceId: string): Promise<VoteType | null> {
    // Get existing vote
    const existingItem = await dynamoGetVote(uploadId, deviceId);
    if (!existingItem) {
      return null;
    }

    const previousVoteType = existingItem.voteType;

    // Delete vote (vote items are source of truth - count is derived)
    await dynamoDeleteVote(uploadId, deviceId);

    return previousVoteType;
  }

  // ============ Sync ============

  async getPendingSync(): Promise<BFFVote[]> {
    // Remote repository has no pending sync
    return [];
  }

  async markSynced(id: string): Promise<void> {
    // Remote repository items are always synced
  }

  async markFailed(id: string, error: string): Promise<void> {
    // Remote repository doesn't track sync status
    log.error(`Vote ${id} operation failed`, new Error(error));
  }
}

// Singleton instance
let instance: RemoteVoteRepository | null = null;

export function getRemoteVoteRepository(): RemoteVoteRepository {
  if (!instance) {
    instance = new RemoteVoteRepository();
  }
  return instance;
}
