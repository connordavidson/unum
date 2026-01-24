/**
 * Media Repository Interface
 *
 * Defines the contract for media file storage operations.
 * Implementations can use local file system or S3.
 */

import type { MediaType } from '../../shared/types';

/**
 * Presigned URL response
 */
export interface PresignedUrl {
  url: string;
  key: string;
  expiresAt: Date;
}

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Media upload result
 */
export interface MediaUploadResult {
  key: string;                 // S3 key or local path
  url: string;                 // Accessible URL
  size: number;                // File size in bytes
  contentType: string;
}

/**
 * Media Repository Interface
 */
export interface IMediaRepository {
  // ============ Presigned URLs (Remote only) ============

  /**
   * Get a presigned URL for uploading media
   */
  getUploadUrl(
    uploadId: string,
    mediaType: MediaType
  ): Promise<PresignedUrl>;

  /**
   * Get a presigned URL for downloading media
   */
  getDownloadUrl(key: string): Promise<PresignedUrl>;

  // ============ Upload ============

  /**
   * Upload media from a local file path
   */
  upload(
    localPath: string,
    uploadId: string,
    mediaType: MediaType,
    onProgress?: UploadProgressCallback
  ): Promise<MediaUploadResult>;

  // ============ Download ============

  /**
   * Download media to local cache
   * Returns the local file path
   */
  downloadToCache(key: string): Promise<string>;

  /**
   * Get the display URL for media
   * For local: returns the local path
   * For remote: returns presigned URL or cached local path
   */
  getDisplayUrl(keyOrUrl: string): Promise<string>;

  // ============ Cache Management ============

  /**
   * Check if media is cached locally
   */
  isCached(key: string): Promise<boolean>;

  /**
   * Get the local cache path for a key
   */
  getCachedPath(key: string): Promise<string | null>;

  /**
   * Clear cached media older than the specified date
   */
  clearCache(olderThan?: Date): Promise<number>;

  /**
   * Get total cache size in bytes
   */
  getCacheSize(): Promise<number>;

  // ============ Delete ============

  /**
   * Delete media by key
   */
  delete(key: string): Promise<void>;

  // ============ Utilities ============

  /**
   * Generate a unique media key
   */
  generateKey(uploadId: string, mediaType: MediaType): string;

  /**
   * Extract upload ID from a media key
   */
  extractUploadId(key: string): string | null;
}
