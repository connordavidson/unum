/**
 * Block Service
 *
 * Manages user blocking functionality.
 * Blocked users' posts are filtered from the feed.
 */

import {
  blockUser as dbBlockUser,
  unblockUser as dbUnblockUser,
  getBlockedUserIds as dbGetBlockedUserIds,
} from '../api/clients/dynamodb.client';
import { getLoggingService } from './logging.service';

const log = getLoggingService().createLogger('Feed');

// ============ Service Implementation ============

class BlockService {
  private cachedBlockedIds: Set<string> | null = null;
  private cachedForUserId: string | null = null;

  /**
   * Block a user
   */
  async blockUser(userId: string, blockedUserId: string): Promise<void> {
    log.debug('Blocking user', { blockedUserId });
    await dbBlockUser(userId, blockedUserId);
    // Invalidate cache
    this.cachedBlockedIds = null;
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string, blockedUserId: string): Promise<void> {
    log.debug('Unblocking user', { blockedUserId });
    await dbUnblockUser(userId, blockedUserId);
    // Invalidate cache
    this.cachedBlockedIds = null;
  }

  /**
   * Get set of blocked user IDs (cached)
   */
  async getBlockedUserIds(userId: string): Promise<Set<string>> {
    if (this.cachedBlockedIds && this.cachedForUserId === userId) {
      return this.cachedBlockedIds;
    }

    try {
      const ids = await dbGetBlockedUserIds(userId);
      this.cachedBlockedIds = ids;
      this.cachedForUserId = userId;
      return ids;
    } catch (error) {
      log.error('Failed to get blocked user IDs', error);
      return new Set();
    }
  }

  /**
   * Check if a user is blocked
   */
  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const blocked = await this.getBlockedUserIds(userId);
    return blocked.has(targetUserId);
  }

  /**
   * Invalidate cache (call after block/unblock)
   */
  invalidateCache(): void {
    this.cachedBlockedIds = null;
    this.cachedForUserId = null;
  }
}

// ============ Singleton ============

let instance: BlockService | null = null;

export function getBlockService(): BlockService {
  if (!instance) {
    instance = new BlockService();
  }
  return instance;
}

export function resetBlockService(): void {
  instance = null;
}
