/**
 * Upload Data Provider
 *
 * Single source of truth for all upload data.
 * Handles fetching, caching, filtering, and deduplication.
 */

import { FEATURE_FLAGS, API_CONFIG } from '../shared/constants';
import { TEST_UPLOADS } from '../data/testUploads';
import { getAllUploads } from '../api/clients/dynamodb.client';
import { getMediaService } from '../services/media.service';
import type { Upload, BoundingBox } from '../shared/types';

class UploadDataProvider {
  private cache: Upload[] | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Get all uploads (cached)
   */
  async getAll(): Promise<Upload[]> {
    // Return cache if valid
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      console.log('[UploadDataProvider] Using cached data:', this.cache.length, 'uploads');
      return this.cache;
    }

    let uploads: Upload[] = [];

    // Fetch from AWS if enabled
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      try {
        console.log('[UploadDataProvider] Fetching from AWS...');
        const awsData = await this.fetchFromAWS();
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

    // Sort by timestamp descending
    uploads.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Cache result
    this.cache = uploads;
    this.cacheTime = Date.now();

    console.log('[UploadDataProvider] Loaded', uploads.length, 'total uploads');
    return uploads;
  }

  /**
   * Get uploads within bounding box
   */
  async getInBounds(bbox: BoundingBox): Promise<Upload[]> {
    const all = await this.getAll();
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
   */
  private async fetchFromAWS(): Promise<Upload[]> {
    const items = await getAllUploads();
    console.log('[UploadDataProvider] Got', items.length, 'items from DynamoDB');

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

        return {
          id: item.id,
          type: item.type,
          data: mediaUrl,
          coordinates: [item.latitude, item.longitude] as [number, number],
          timestamp: item.timestamp,
          caption: item.caption,
          votes: item.voteCount,
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
