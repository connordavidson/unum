/**
 * Local Media Repository
 *
 * File system-based implementation of IMediaRepository.
 * Handles local file caching and media URL resolution.
 */

import * as FileSystem from 'expo-file-system/legacy';
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
 * Uses documentDirectory as a fallback since cacheDirectory may not be available
 */
function getCacheDirectory(): string {
  const baseDir = FileSystemCompat.documentDirectory || FileSystemCompat.cacheDirectory || '';
  return `${baseDir}media-cache/`;
}

/**
 * Get file extension for media type
 */
function getExtension(mediaType: MediaType): string {
  return mediaType === 'photo' ? 'jpg' : 'mp4';
}

/**
 * Get content type for media type
 */
function getContentType(mediaType: MediaType): string {
  return mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
}

/**
 * Local Media Repository Implementation
 */
export class LocalMediaRepository implements IMediaRepository {
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
    // For local storage, return a local file path as the "URL"
    const key = this.generateKey(uploadId, mediaType);
    const localPath = `${this.cacheDir}${key}`;

    return {
      url: localPath,
      key,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    };
  }

  async getDownloadUrl(key: string): Promise<PresignedUrl> {
    // For local storage, return the cached file path
    const localPath = `${this.cacheDir}${key}`;

    return {
      url: localPath,
      key,
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    };
  }

  // ============ Upload ============

  async upload(
    localPath: string,
    uploadId: string,
    mediaType: MediaType,
    onProgress?: UploadProgressCallback
  ): Promise<MediaUploadResult> {
    await this.ensureCacheDir();

    const key = this.generateKey(uploadId, mediaType);
    const destPath = `${this.cacheDir}${key}`;

    // Check if source file exists
    const sourceInfo = await FileSystem.getInfoAsync(localPath);
    if (!sourceInfo.exists) {
      throw new Error(`Source file not found: ${localPath}`);
    }

    // Copy file to cache
    await FileSystem.copyAsync({
      from: localPath,
      to: destPath,
    });

    // Report progress
    if (onProgress) {
      onProgress(100);
    }

    // Get file info
    const destInfo = await FileSystem.getInfoAsync(destPath);

    return {
      key,
      url: destPath,
      size: (destInfo as { size?: number }).size || 0,
      contentType: getContentType(mediaType),
    };
  }

  // ============ Download ============

  async downloadToCache(key: string): Promise<string> {
    await this.ensureCacheDir();

    const localPath = `${this.cacheDir}${key}`;
    const info = await FileSystem.getInfoAsync(localPath);

    if (!info.exists) {
      throw new Error(`File not found in cache: ${key}`);
    }

    return localPath;
  }

  async getDisplayUrl(keyOrUrl: string): Promise<string> {
    // If it's already a full path (local or remote), return as-is
    if (keyOrUrl.startsWith('file://') || keyOrUrl.startsWith('http')) {
      return keyOrUrl;
    }

    // Otherwise, assume it's a cache key
    const cached = await this.getCachedPath(keyOrUrl);
    if (cached) {
      return cached;
    }

    // Return the key as-is if not cached
    return keyOrUrl;
  }

  // ============ Cache Management ============

  async isCached(key: string): Promise<boolean> {
    const localPath = `${this.cacheDir}${key}`;
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  }

  async getCachedPath(key: string): Promise<string | null> {
    const localPath = `${this.cacheDir}${key}`;
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
    const localPath = `${this.cacheDir}${key}`;
    await FileSystem.deleteAsync(localPath, { idempotent: true });
  }

  // ============ Utilities ============

  generateKey(uploadId: string, mediaType: MediaType): string {
    const ext = getExtension(mediaType);
    return `${uploadId}.${ext}`;
  }

  extractUploadId(key: string): string | null {
    // Remove extension to get upload ID
    const match = key.match(/^(.+)\.(jpg|mp4)$/);
    return match ? match[1] : null;
  }
}

// Singleton instance
let instance: LocalMediaRepository | null = null;

export function getLocalMediaRepository(): LocalMediaRepository {
  if (!instance) {
    instance = new LocalMediaRepository();
  }
  return instance;
}
