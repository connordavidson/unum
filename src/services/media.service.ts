/**
 * Media Service
 *
 * Business logic for media upload/download operations.
 * Handles local caching and S3 uploads.
 */

import { FEATURE_FLAGS } from '../shared/constants';
import type { MediaType, Coordinates } from '../shared/types';
import { writeUploadExif } from './exif.service';
import {
  getLocalMediaRepository,
  LocalMediaRepository,
} from '../repositories/local';
import {
  getS3MediaRepository,
  S3MediaRepository,
} from '../repositories/remote';
import type {
  PresignedUrl,
  UploadProgressCallback,
  MediaUploadResult,
} from '../repositories/interfaces/media.repository';
import { getLoggingService } from './logging.service';
import {
  getAWSCredentialsService,
  AuthenticationRequiredError,
} from './aws-credentials.service';

const log = getLoggingService().createLogger('Media');

// ============ Types ============

export interface MediaServiceConfig {
  useRemote: boolean;
}

export interface UploadMediaParams {
  localPath: string;
  uploadId: string;
  mediaType: MediaType;
  coordinates?: Coordinates;
  timestamp?: string;
  uploaderId?: string;
  onProgress?: UploadProgressCallback;
}

// ============ Service Implementation ============

/**
 * Media Service
 *
 * Provides media operations with offline-first strategy:
 * - Always caches media locally
 * - When online and USE_AWS_BACKEND is enabled, uploads to S3
 * - Downloads prefer local cache, fetches from S3 if not cached
 */
export class MediaService {
  private localRepo: LocalMediaRepository;
  private remoteRepo: S3MediaRepository;
  private config: MediaServiceConfig;

  constructor(config: MediaServiceConfig) {
    this.config = config;
    this.localRepo = getLocalMediaRepository();
    this.remoteRepo = getS3MediaRepository();
  }

  /**
   * Check if remote operations are enabled
   */
  private get useRemote(): boolean {
    return this.config.useRemote && FEATURE_FLAGS.USE_AWS_BACKEND;
  }

  // ============ Upload ============

  /**
   * Upload media from a local file
   * Always caches locally, uploads to S3 if remote is enabled
   */
  async upload(params: UploadMediaParams): Promise<MediaUploadResult> {
    const { localPath, uploadId, mediaType, coordinates, timestamp, uploaderId, onProgress } = params;

    log.debug('upload() start', { useRemote: String(this.useRemote), localPath, mediaType });

    // Embed EXIF metadata for photos before upload
    let processedPath = localPath;
    if (mediaType === 'photo' && coordinates) {
      log.debug('Writing EXIF metadata to photo', { lat: coordinates[0], lon: coordinates[1] });
      try {
        processedPath = await writeUploadExif(
          localPath,
          coordinates,
          timestamp || new Date().toISOString(),
          uploaderId || 'unknown'
        );
        log.debug('EXIF write complete', { newPath: processedPath });
      } catch (exifError) {
        log.warn('EXIF write failed, continuing with original', { error: String(exifError) });
        // Continue with original path
      }
    } else {
      log.debug('Skipping EXIF', { isPhoto: String(mediaType === 'photo'), hasCoords: String(!!coordinates) });
    }

    // Always cache locally first
    const localResult = await this.localRepo.upload(
      processedPath,
      uploadId,
      mediaType,
      (progress) => {
        // Local upload is fast, use 0-20% of progress
        if (onProgress) {
          onProgress(Math.round(progress * 0.2));
        }
      }
    );

    // If remote is not enabled, return local result
    if (!this.useRemote) {
      log.debug('Remote not enabled, returning local result');
      if (onProgress) {
        onProgress(100);
      }
      return localResult;
    }

    // Pre-validate credentials before attempting S3 upload
    const credService = getAWSCredentialsService();
    const isAuthenticated = await credService.waitForAuthenticated();
    if (!isAuthenticated) {
      log.error('Upload aborted: credentials not authenticated');
      throw new AuthenticationRequiredError(
        'Your session has expired. Please sign in again to upload.'
      );
    }

    // Upload to S3
    try {
      const remoteResult = await this.remoteRepo.upload(
        processedPath,
        uploadId,
        mediaType,
        (progress) => {
          // Remote upload uses 20-100% of progress
          if (onProgress) {
            onProgress(20 + Math.round(progress * 0.8));
          }
        }
      );

      return remoteResult;
    } catch (error) {
      // Propagate auth errors - don't swallow them
      if (error instanceof AuthenticationRequiredError) {
        throw error;
      }
      log.error('S3 upload failed, returning local result', error);
      if (onProgress) onProgress(100);
      return localResult;
    }
  }

  // ============ Download ============

  /**
   * Get display URL for media
   * Prefers local cache, generates presigned URL for uncached S3 content
   */
  async getDisplayUrl(keyOrUrl: string): Promise<string> {
    // Check local cache first
    const cached = await this.localRepo.getCachedPath(keyOrUrl);
    if (cached) {
      return cached;
    }

    // If it's a local file path or full URL, return as-is
    if (
      keyOrUrl.startsWith('file://') ||
      keyOrUrl.startsWith('/') ||
      keyOrUrl.startsWith('http')
    ) {
      return keyOrUrl;
    }

    // If remote is enabled, get presigned URL from S3
    if (this.useRemote) {
      try {
        const presigned = await this.remoteRepo.getDownloadUrl(keyOrUrl);
        return presigned.url;
      } catch (error) {
        log.error('Failed to get S3 presigned URL', error);
      }
    }

    // Fall back to the key itself (might be a local path)
    return keyOrUrl;
  }

  /**
   * Download media to local cache
   */
  async downloadToCache(key: string): Promise<string> {
    // Check if already cached
    const cached = await this.localRepo.getCachedPath(key);
    if (cached) {
      return cached;
    }

    // If remote is enabled, download from S3
    if (this.useRemote) {
      try {
        return await this.remoteRepo.downloadToCache(key);
      } catch (error) {
        log.error('Failed to download from S3', error);
        throw error;
      }
    }

    throw new Error(`Media not found: ${key}`);
  }

  /**
   * Prefetch media to local cache
   * Non-blocking, used for preloading content
   */
  async prefetch(keys: string[]): Promise<void> {
    if (!this.useRemote) return;

    // Download in parallel, ignore errors
    await Promise.allSettled(
      keys.map((key) => this.downloadToCache(key).catch(() => {}))
    );
  }

  // ============ Presigned URLs ============

  /**
   * Get presigned upload URL (remote only)
   */
  async getUploadUrl(uploadId: string, mediaType: MediaType): Promise<PresignedUrl> {
    if (this.useRemote) {
      return this.remoteRepo.getUploadUrl(uploadId, mediaType);
    }
    return this.localRepo.getUploadUrl(uploadId, mediaType);
  }

  /**
   * Get presigned download URL (remote only)
   */
  async getDownloadUrl(key: string): Promise<PresignedUrl> {
    if (this.useRemote) {
      return this.remoteRepo.getDownloadUrl(key);
    }
    return this.localRepo.getDownloadUrl(key);
  }

  // ============ Cache Management ============

  /**
   * Check if media is cached locally
   */
  async isCached(key: string): Promise<boolean> {
    return this.localRepo.isCached(key);
  }

  /**
   * Get local cache path
   */
  async getCachedPath(key: string): Promise<string | null> {
    return this.localRepo.getCachedPath(key);
  }

  /**
   * Clear cached media
   */
  async clearCache(olderThan?: Date): Promise<number> {
    let count = await this.localRepo.clearCache(olderThan);

    if (this.useRemote) {
      count += await this.remoteRepo.clearCache(olderThan);
    }

    return count;
  }

  /**
   * Get total cache size
   */
  async getCacheSize(): Promise<number> {
    let size = await this.localRepo.getCacheSize();

    if (this.useRemote) {
      size += await this.remoteRepo.getCacheSize();
    }

    return size;
  }

  // ============ Delete ============

  /**
   * Delete media
   */
  async delete(key: string): Promise<void> {
    // Delete locally
    await this.localRepo.delete(key);

    // Delete from S3 if remote is enabled
    if (this.useRemote) {
      try {
        await this.remoteRepo.delete(key);
      } catch (error) {
        log.error('Failed to delete from S3', error);
      }
    }
  }

  // ============ Utilities ============

  /**
   * Generate a media key
   */
  generateKey(uploadId: string, mediaType: MediaType): string {
    if (this.useRemote) {
      return this.remoteRepo.generateKey(uploadId, mediaType);
    }
    return this.localRepo.generateKey(uploadId, mediaType);
  }

  /**
   * Extract upload ID from a key
   */
  extractUploadId(key: string): string | null {
    if (this.useRemote) {
      return this.remoteRepo.extractUploadId(key);
    }
    return this.localRepo.extractUploadId(key);
  }
}

// ============ Factory ============

let serviceInstance: MediaService | null = null;

export function getMediaService(config?: Partial<MediaServiceConfig>): MediaService {
  if (!serviceInstance) {
    serviceInstance = new MediaService({
      useRemote: config?.useRemote ?? FEATURE_FLAGS.USE_AWS_BACKEND,
    });
  }
  return serviceInstance;
}

export function resetMediaService(): void {
  serviceInstance = null;
}
