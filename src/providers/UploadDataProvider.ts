/**
 * Upload Data Provider
 *
 * Single source of truth for all upload data.
 * Handles fetching, caching, filtering, and deduplication.
 */

import { FEATURE_FLAGS, API_CONFIG } from '../shared/constants';
import { TEST_UPLOADS } from '../data/testUploads';
import { getAllUploads, getUserVotesMap } from '../api/clients/dynamodb.client';
import { getMediaService } from '../services/media.service';
import { rankUploads } from '../shared/utils/ranking';
import type { Upload, BoundingBox, VoteType } from '../shared/types';

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
      console.log('[UploadDataProvider] Using cached data:', this.cache.length, 'uploads');
      return this.cache;
    }

    let uploads: Upload[] = [];

    // Fetch from AWS if enabled
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      try {
        console.log('[UploadDataProvider] Fetching from AWS...');
        const awsData = await this.fetchFromAWS(userId);
        uploads = awsData;
        console.log('[UploadDataProvider] AWS returned', awsData.length, 'uploads');
      } catch (err) {
        console.error('[UploadDataProvider] AWS fetch failed:', err);
        // Continue with empty array - will try test data
      }
    }

    // Add test data if enabled
    if (API_CONFIG.USE_TEST_DATA) {
      const testData = TEST_UPLOADS.map(t => ({ ...t }));
      console.log('[UploadDataProvider] Adding', testData.length, 'test uploads');
      uploads = this.merge(uploads, testData);
    }

    // Rank by time-decay algorithm (recent + upvoted first, downvoted sinks)
    uploads = rankUploads(uploads);

    // Cache result
    this.cache = uploads;
    this.cacheTime = Date.now();
    this.cacheUserId = userId || null;

    console.log('[UploadDataProvider] Loaded', uploads.length, 'total uploads');
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
    console.log('[UploadDataProvider] Filtered to', filtered.length, 'uploads in bounds');
    return filtered;
  }

  /**
   * Invalidate cache (call after creating new upload)
   */
  invalidate(): void {
    console.log('[UploadDataProvider] Cache invalidated');
    this.cache = null;
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
    // Fetch uploads and user's votes in parallel
    const [items, userVotesMap] = await Promise.all([
      getAllUploads(),
      userId ? getUserVotesMap(userId) : Promise.resolve({} as Record<string, 'up' | 'down'>),
    ]);

    console.log('[UploadDataProvider] Got', items.length, 'items from DynamoDB');
    console.log('[UploadDataProvider] User has', Object.keys(userVotesMap).length, 'votes');

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
            console.error('[UploadDataProvider] Failed to get media URL for', item.mediaKey, err);
          }
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
        };
      })
    );

    // Filter out uploads with empty media URLs
    return uploads.filter(u => u.data && u.data.length > 0);
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
