/**
 * S3 Media Repository
 *
 * S3-based implementation of IMediaRepository.
 * Uses presigned URLs for uploads and downloads with local caching.
 */

import * as FileSystem from 'expo-file-system';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  uploadToS3,
  downloadFromS3,
  getCachedOrDownload,
  deleteFromS3,
  generateMediaKey,
  getContentType,
  validateFileSize,
  objectExists,
} from '../../api/clients/s3.client';
import type { MediaType } from '../../shared/types';
import type {
  IMediaRepository,
  PresignedUrl,
  UploadProgressCallback,
  MediaUploadResult,
} from '../interfaces/media.repository';

// Access legacy properties that may not be in types but exist at runtime
const FileSystemCompat = FileSystem as typeof FileSystem & {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
};

/**
 * Get the cache directory for media files
 */
function getCacheDirectory(): string {
  const baseDir = FileSystemCompat.cacheDirectory || FileSystemCompat.documentDirectory || '';
  return `${baseDir}s3-media-cache/`;
}

/**
 * S3 Media Repository Implementation
 */
export class S3MediaRepository implements IMediaRepository {
  private cacheDir: string;
  private initialized: boolean = false;

  constructor() {
    this.cacheDir = getCacheDirectory();
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDir(): Promise<void> {
    if (this.initialized) return;

    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
    }
    this.initialized = true;
  }

  // ============ Presigned URLs ============

  async getUploadUrl(
    uploadId: string,
    mediaType: MediaType
  ): Promise<PresignedUrl> {
    const result = await getPresignedUploadUrl(uploadId, mediaType);
    return {
      url: result.url,
      key: result.key,
      expiresAt: new Date(result.expiresAt),
    };
  }

  async getDownloadUrl(key: string): Promise<PresignedUrl> {
    const result = await getPresignedDownloadUrl(key);
    return {
      url: result.url,
      key: result.key,
      expiresAt: new Date(result.expiresAt),
    };
  }

  // ============ Upload ============

  async upload(
    localPath: string,
    uploadId: string,
    mediaType: MediaType,
    onProgress?: UploadProgressCallback
  ): Promise<MediaUploadResult> {
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (!fileInfo.exists) {
      throw new Error(`Source file not found: ${localPath}`);
    }

    // Validate file size
    const fileSize = (fileInfo as { size?: number }).size || 0;
    const validation = validateFileSize(fileSize, mediaType);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate key and content type
    const key = generateMediaKey(uploadId, mediaType);
    const contentType = getContentType(mediaType);

    // Upload to S3
    const result = await uploadToS3({
      key,
      contentType,
      localFilePath: localPath,
      onProgress,
    });

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Get presigned download URL for immediate use
    const downloadUrl = await getPresignedDownloadUrl(key);

    return {
      key,
      url: downloadUrl.url,
      size: fileSize,
      contentType,
    };
  }

  // ============ Download ============

  async downloadToCache(key: string): Promise<string> {
    await this.ensureCacheDir();

    // Check if already cached
    const cached = await this.getCachedPath(key);
    if (cached) {
      return cached;
    }

    // Download from S3
    const localPath = `${this.cacheDir}${key.replace(/\//g, '_')}`;
    const result = await downloadFromS3({
      key,
      destinationPath: localPath,
    });

    if (!result.success) {
      throw new Error(result.error || 'Download failed');
    }

    return result.localPath;
  }

  async getDisplayUrl(keyOrUrl: string): Promise<string> {
    // If it's already a full URL, check if it's still valid
    if (keyOrUrl.startsWith('http')) {
      // Could add URL expiry checking here
      return keyOrUrl;
    }

    // If it's a local file path, return as-is
    if (keyOrUrl.startsWith('file://') || keyOrUrl.startsWith('/')) {
      return keyOrUrl;
    }

    // It's an S3 key - check cache first
    const cached = await this.getCachedPath(keyOrUrl);
    if (cached) {
      return cached;
    }

    // Generate presigned URL
    const presigned = await this.getDownloadUrl(keyOrUrl);
    return presigned.url;
  }

  // ============ Cache Management ============

  async isCached(key: string): Promise<boolean> {
    const localPath = `${this.cacheDir}${key.replace(/\//g, '_')}`;
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  }

  async getCachedPath(key: string): Promise<string | null> {
    const localPath = `${this.cacheDir}${key.replace(/\//g, '_')}`;
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists ? localPath : null;
  }

  async clearCache(olderThan?: Date): Promise<number> {
    await this.ensureCacheDir();

    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(this.cacheDir);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = `${this.cacheDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists) {
        const shouldDelete =
          !olderThan ||
          ((fileInfo as { modificationTime?: number }).modificationTime || 0) * 1000 <
            olderThan.getTime();

        if (shouldDelete) {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  async getCacheSize(): Promise<number> {
    await this.ensureCacheDir();

    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(this.cacheDir);
    let totalSize = 0;

    for (const file of files) {
      const filePath = `${this.cacheDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        totalSize += (fileInfo as { size?: number }).size || 0;
      }
    }

    return totalSize;
  }

  // ============ Delete ============

  async delete(key: string): Promise<void> {
    // Delete from S3
    await deleteFromS3(key);

    // Also delete from local cache if present
    const cached = await this.getCachedPath(key);
    if (cached) {
      await FileSystem.deleteAsync(cached, { idempotent: true });
    }
  }

  // ============ Utilities ============

  generateKey(uploadId: string, mediaType: MediaType): string {
    return generateMediaKey(uploadId, mediaType);
  }

  extractUploadId(key: string): string | null {
    // Key format: photos/YYYY/MM/DD/uploadId.jpg or videos/YYYY/MM/DD/uploadId.mp4
    const match = key.match(/\/([^/]+)\.(jpg|mp4)$/);
    return match ? match[1] : null;
  }
}

// Singleton instance
let instance: S3MediaRepository | null = null;

export function getS3MediaRepository(): S3MediaRepository {
  if (!instance) {
    instance = new S3MediaRepository();
  }
  return instance;
}
