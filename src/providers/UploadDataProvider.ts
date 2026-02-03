/**
 * Upload Data Provider
 *
 * Single source of truth for all upload data.
 * Handles fetching, caching, filtering, and deduplication.
 */

import { FEATURE_FLAGS, API_CONFIG } from '../shared/constants';
import { TEST_UPLOADS } from '../data/testUploads';
import { getAllUploads, getUserVotesMap, getBlockedUserIds } from '../api/clients/dynamodb.client';
import { getMediaService } from '../services/media.service';
import { rankUploads } from '../shared/utils/ranking';
import type { Upload, BoundingBox, VoteType } from '../shared/types';
import { getLoggingService } from '../services/logging.service';

const log = getLoggingService().createLogger('Feed');

class UploadDataProvider {
  private cache: Upload[] | null = null;
  private cacheTime: number = 0;
  private cacheUserId: string | null = null;
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Get all uploads (cached)
   * @param userId - Current user's ID to determine their vote state
   */
  async getAll(userId?: string): Promise<Upload[]> {
    // Return cache if valid and for same user
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL && this.cacheUserId === userId) {
      log.debug('Using cached data', { count: String(this.cache.length) });
      return this.cache;
    }

    let uploads: Upload[] = [];
    let fetchSucceeded = false;

    // Fetch from AWS if enabled
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      try {
        const awsData = await this.fetchFromAWS(userId);
        uploads = awsData;
        fetchSucceeded = true;
        log.debug('AWS returned uploads', { count: String(awsData.length) });
      } catch (err) {
        log.error('AWS fetch failed', err);
        // Return stale cache if available rather than empty array
        if (this.cache) {
          log.debug('Returning stale cache after fetch failure', { count: String(this.cache.length) });
          return this.cache;
        }
      }
    }

    // Add test data if enabled
    if (API_CONFIG.USE_TEST_DATA) {
      const testData = TEST_UPLOADS.map(t => ({ ...t }));
      log.debug('Adding test uploads', { count: String(testData.length) });
      uploads = this.merge(uploads, testData);
      fetchSucceeded = true;
    }

    // Rank by time-decay algorithm (recent + upvoted first, downvoted sinks)
    uploads = rankUploads(uploads);

    // Only cache successful fetches — never cache error results
    if (fetchSucceeded) {
      this.cache = uploads;
      this.cacheTime = Date.now();
      this.cacheUserId = userId || null;
    }

    log.debug('Loaded uploads', { count: String(uploads.length) });
    return uploads;
  }

  /**
   * Get uploads within bounding box
   * @param userId - Current user's ID to determine their vote state
   */
  async getInBounds(bbox: BoundingBox, userId?: string): Promise<Upload[]> {
    const all = await this.getAll(userId);
    const filtered = all.filter(upload => {
      const [lat, lon] = upload.coordinates;
      return lat >= bbox.minLat && lat <= bbox.maxLat &&
             lon >= bbox.minLon && lon <= bbox.maxLon;
    });
    log.debug('Filtered uploads in bounds', { count: String(filtered.length) });
    return filtered;
  }

  /**
   * Invalidate cache (call after creating new upload).
   * Expires the cache so the next getAll() re-fetches, but keeps stale
   * data available as a fallback if the re-fetch fails.
   */
  invalidate(): void {
    log.debug('Cache invalidated');
    this.cacheTime = 0;
  }

  /**
   * Merge two arrays, deduplicating by ID (first array wins)
   */
  private merge(primary: Upload[], secondary: Upload[]): Upload[] {
    const seen = new Set(primary.map(u => String(u.id)));
    const unique = secondary.filter(u => !seen.has(String(u.id)));
    return [...primary, ...unique];
  }

  /**
   * Fetch from AWS and resolve media URLs
   * @param userId - Current user's ID to determine their vote state
   */
  private async fetchFromAWS(userId?: string): Promise<Upload[]> {
    // Read operations use unauthenticated credentials - no waiting needed
    // Fetch uploads, user's votes, and blocked users in parallel
    const [items, userVotesMap, blockedUserIds] = await Promise.all([
      getAllUploads(),
      userId ? getUserVotesMap(userId) : Promise.resolve({} as Record<string, 'up' | 'down'>),
      userId ? getBlockedUserIds(userId) : Promise.resolve(new Set<string>()),
    ]);

    log.debug('Fetched from DynamoDB', { items: String(items.length), userVotes: String(Object.keys(userVotesMap).length) });

    if (items.length === 0) {
      return [];
    }

    const mediaSvc = getMediaService({ useRemote: true });

    const uploads = await Promise.all(
      items.map(async (item) => {
        let mediaUrl = '';
        if (item.mediaKey) {
          try {
            mediaUrl = await mediaSvc.getDisplayUrl(item.mediaKey);
          } catch (err) {
            log.error('Failed to get media URL, using mediaKey as fallback', err);
            mediaUrl = item.mediaKey;
          }
        }
        // If getDisplayUrl returned empty string, fall back to mediaKey
        if (!mediaUrl && item.mediaKey) {
          mediaUrl = item.mediaKey;
        }

        // Use cached voteCount from upload item (updated when votes change)
        // For true scale, use DynamoDB Streams to keep this in sync
        const voteCount = item.voteCount ?? 0;

        // Get user's vote from the map (fetched via GSI)
        const userVote: VoteType | null = userVotesMap[item.id] ?? null;

        return {
          id: item.id,
          type: item.type,
          data: mediaUrl,
          coordinates: [item.latitude, item.longitude] as [number, number],
          timestamp: item.timestamp,
          caption: item.caption,
          votes: voteCount,
          userVote,
          userId: item.userId,
          hidden: item.hidden,
        };
      })
    );

    // Filter out: empty media, hidden (reported) uploads, blocked users' uploads
    return uploads.filter(u => {
      if (!u.data || u.data.length === 0) return false;
      if (u.hidden) return false;
      if (u.userId && blockedUserIds.has(u.userId)) return false;
      return true;
    });
  }
}

// Singleton
let instance: UploadDataProvider | null = null;

export function getUploadDataProvider(): UploadDataProvider {
  if (!instance) {
    instance = new UploadDataProvider();
  }
  return instance;
}

export function resetUploadDataProvider(): void {
  instance = null;
}
