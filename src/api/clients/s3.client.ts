/**
 * S3 Client
 *
 * Handles all S3 operations including presigned URL generation
 * and media upload/download coordination.
 *
 * Security: Uses Cognito Identity Pool for temporary credentials.
 * Credentials are refreshed automatically before each operation.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as FileSystem from 'expo-file-system/legacy';
import { awsConfig, s3Config } from '../config';
import { withRetry } from './retry';
import { getAWSCredentialsService } from '../../services/aws-credentials.service';
import type { MediaType } from '../../shared/types';
import type {
  PresignedUrlResponse,
  S3UploadOptions,
  S3DownloadOptions,
} from '../types';

// Access legacy properties that may not be in types but exist at runtime
const FileSystemCompat = FileSystem as typeof FileSystem & {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  FileSystemUploadType?: {
    BINARY_CONTENT: number;
    MULTIPART: number;
  };
};

// FileSystemUploadType enum values (may not be exported in newer versions)
const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
};

// ============ Client Setup ============

// Cache for the S3 client - recreated when credentials change
let cachedS3Client: S3Client | null = null;
let cachedCredentialsExpiration: Date | null = null;
let cachedReadOnlyS3Client: S3Client | null = null;
let cachedReadOnlyCredentialsExpiration: Date | null = null;

/**
 * Get an S3 Client with current credentials
 * Credentials are obtained from Cognito Identity Pool
 * Use this for WRITE operations (requires authenticated user)
 */
async function getS3Client(): Promise<S3Client> {
  const credentialsService = getAWSCredentialsService();
  const credentials = await credentialsService.getCredentials();

  // Reuse cached client if credentials haven't changed
  if (
    cachedS3Client &&
    cachedCredentialsExpiration &&
    cachedCredentialsExpiration.getTime() === credentials.expiration.getTime()
  ) {
    return cachedS3Client;
  }

  // Create new client with fresh credentials
  cachedS3Client = new S3Client({
    region: awsConfig.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  cachedCredentialsExpiration = credentials.expiration;

  return cachedS3Client;
}

/**
 * Get an S3 Client with read-only credentials
 * Uses unauthenticated (guest) credentials - no sign-in required
 * Use this for READ operations (presigned URLs for viewing)
 */
async function getReadOnlyS3Client(): Promise<S3Client> {
  const credentialsService = getAWSCredentialsService();
  const credentials = await credentialsService.getReadOnlyCredentials();

  // Reuse cached client if credentials haven't changed
  if (
    cachedReadOnlyS3Client &&
    cachedReadOnlyCredentialsExpiration &&
    cachedReadOnlyCredentialsExpiration.getTime() === credentials.expiration.getTime()
  ) {
    return cachedReadOnlyS3Client;
  }

  // Create new client with read-only credentials
  cachedReadOnlyS3Client = new S3Client({
    region: awsConfig.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  cachedReadOnlyCredentialsExpiration = credentials.expiration;

  return cachedReadOnlyS3Client;
}

// ============ Key Generation ============

/**
 * Generate S3 key for an upload
 */
export function generateMediaKey(
  uploadId: string,
  mediaType: MediaType
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const extension = mediaType === 'photo' ? 'jpg' : 'mp4';
  const folder = mediaType === 'photo' ? 'photos' : 'videos';

  return `${folder}/${year}/${month}/${day}/${uploadId}.${extension}`;
}

/**
 * Generate S3 key for a thumbnail
 */
export function generateThumbnailKey(uploadId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `thumbnails/${year}/${month}/${day}/${uploadId}.jpg`;
}

/**
 * Get content type for media type
 */
export function getContentType(mediaType: MediaType): string {
  return s3Config.contentTypes[mediaType];
}

// ============ Presigned URLs ============

/**
 * Generate a presigned URL for uploading media
 */
export async function getPresignedUploadUrl(
  uploadId: string,
  mediaType: MediaType
): Promise<PresignedUrlResponse> {
  const key = generateMediaKey(uploadId, mediaType);
  const contentType = getContentType(mediaType);

  const command = new PutObjectCommand({
    Bucket: awsConfig.s3Bucket,
    Key: key,
    ContentType: contentType,
  });

  const s3Client = await getS3Client();
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: s3Config.presignedUrlExpiration.upload,
  });

  const expiresAt = new Date(
    Date.now() + s3Config.presignedUrlExpiration.upload * 1000
  );

  return {
    url,
    key,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Generate a presigned URL for downloading media
 * Uses read-only credentials (no sign-in required)
 */
export async function getPresignedDownloadUrl(
  key: string
): Promise<PresignedUrlResponse> {
  const command = new GetObjectCommand({
    Bucket: awsConfig.s3Bucket,
    Key: key,
  });

  const s3Client = await getReadOnlyS3Client();
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: s3Config.presignedUrlExpiration.download,
  });

  const expiresAt = new Date(
    Date.now() + s3Config.presignedUrlExpiration.download * 1000
  );

  return {
    url,
    key,
    expiresAt: expiresAt.toISOString(),
  };
}

// ============ Upload Operations ============

/**
 * Upload a file to S3 using presigned URL
 * This uses expo-file-system for React Native compatibility
 */
export async function uploadToS3(
  options: S3UploadOptions
): Promise<{ success: boolean; error?: string }> {
  return withRetry(async () => {
    const { key, contentType, localFilePath, onProgress } = options;

    // Generate presigned URL
    const command = new PutObjectCommand({
      Bucket: awsConfig.s3Bucket,
      Key: key,
      ContentType: contentType,
    });

    const s3Client = await getS3Client();
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: s3Config.presignedUrlExpiration.upload,
    });

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!fileInfo.exists) {
      throw new Error(`File not found: ${localFilePath}`);
    }

    // Upload using FileSystem
    const uploadTask = FileSystem.createUploadTask(
      presignedUrl,
      localFilePath,
      {
        httpMethod: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        uploadType: FileSystemUploadType.BINARY_CONTENT,
      },
      (progress) => {
        if (onProgress) {
          const percent = Math.round(
            (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100
          );
          onProgress(percent);
        }
      }
    );

    const result = await uploadTask.uploadAsync();

    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed with status: ${result?.status}`);
    }

    return { success: true };
  });
}

/**
 * Upload media directly using the SDK (for server-side use)
 */
export async function uploadMediaDirect(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string
): Promise<void> {
  await withRetry(async () => {
    const s3Client = await getS3Client();
    await s3Client.send(
      new PutObjectCommand({
        Bucket: awsConfig.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  });
}

// ============ Download Operations ============

/**
 * Download a file from S3 to local storage
 */
export async function downloadFromS3(
  options: S3DownloadOptions
): Promise<{ success: boolean; localPath: string; error?: string }> {
  return withRetry(async () => {
    const { key, destinationPath } = options;

    // Generate presigned URL
    const { url } = await getPresignedDownloadUrl(key);

    // Download using FileSystem
    const downloadResult = await FileSystem.downloadAsync(url, destinationPath);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status: ${downloadResult.status}`);
    }

    return {
      success: true,
      localPath: downloadResult.uri,
    };
  });
}

/**
 * Get a cached file or download it
 */
export async function getCachedOrDownload(
  key: string,
  cacheDir?: string
): Promise<string> {
  const baseDir =
    cacheDir ||
    FileSystemCompat.cacheDirectory ||
    FileSystemCompat.documentDirectory ||
    '';
  const localPath = `${baseDir}s3-cache/${key.replace(/\//g, '_')}`;

  // Check if already cached
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (fileInfo.exists) {
    return localPath;
  }

  // Ensure cache directory exists
  const cacheSubdir = `${baseDir}s3-cache/`;
  const dirInfo = await FileSystem.getInfoAsync(cacheSubdir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(cacheSubdir, { intermediates: true });
  }

  // Download
  const result = await downloadFromS3({
    key,
    destinationPath: localPath,
  });

  if (!result.success) {
    throw new Error(result.error || 'Download failed');
  }

  return result.localPath;
}

// ============ Delete Operations ============

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  await withRetry(async () => {
    const s3Client = await getS3Client();
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: awsConfig.s3Bucket,
        Key: key,
      })
    );
  });
}

/**
 * Delete multiple files from S3
 */
export async function deleteMultipleFromS3(keys: string[]): Promise<void> {
  // Delete one at a time to avoid batch complexity
  // For large batches, consider using DeleteObjectsCommand
  for (const key of keys) {
    await deleteFromS3(key);
  }
}

// ============ Utility Operations ============

/**
 * Check if an object exists in S3
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    const s3Client = await getS3Client();
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: awsConfig.s3Bucket,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get object metadata
 */
export async function getObjectMetadata(
  key: string
): Promise<{
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
} | null> {
  try {
    const s3Client = await getS3Client();
    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: awsConfig.s3Bucket,
        Key: key,
      })
    );

    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

/**
 * Get the public URL for an S3 object (if bucket is public)
 * Note: For private buckets, use presigned URLs instead
 */
export function getPublicUrl(key: string): string {
  return `https://${awsConfig.s3Bucket}.s3.${awsConfig.region}.amazonaws.com/${key}`;
}

/**
 * Validate file size before upload
 */
export function validateFileSize(
  fileSizeBytes: number,
  mediaType: MediaType
): { valid: boolean; error?: string } {
  const maxSize = s3Config.maxFileSizes[mediaType];

  if (fileSizeBytes > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    const actualSizeMB = Math.round(fileSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size (${actualSizeMB}MB) exceeds maximum allowed (${maxSizeMB}MB)`,
    };
  }

  return { valid: true };
}
