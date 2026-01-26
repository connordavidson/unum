/**
 * API Layer Types
 * Types for AWS SDK interactions and API responses
 */

import type { MediaType, Coordinates } from '../../shared/types';

// ============ AWS Configuration ============

export interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  s3Bucket: string;
  dynamoTableName: string;
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============ S3 Types ============

export interface PresignedUrlRequest {
  uploadId: string;
  mediaType: MediaType;
  contentType: string;
  operation: 'upload' | 'download';
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
}

export interface S3UploadOptions {
  key: string;
  contentType: string;
  localFilePath: string;
  onProgress?: (progress: number) => void;
}

export interface S3DownloadOptions {
  key: string;
  destinationPath: string;
}

// ============ DynamoDB Types ============

export interface DynamoUploadItem {
  PK: string;                    // "UPLOAD#<id>"
  SK: string;                    // "METADATA"
  GSI1PK: string;                // "GEOHASH#<geohash>"
  GSI1SK: string;                // "<timestamp>"
  id: string;
  type: MediaType;
  mediaKey: string;              // S3 object key
  thumbnailKey?: string;
  latitude: number;
  longitude: number;
  geohash: string;
  timestamp: string;
  caption?: string;
  voteCount: number;
  userId: string;                // Apple user ID (authenticated user)
  deviceId: string;              // Device identifier
  createdAt: string;
  updatedAt: string;
}

export interface DynamoVoteItem {
  PK: string;                    // "UPLOAD#<uploadId>"
  SK: string;                    // "VOTE#<deviceId>"
  GSI1PK: string;                // "DEVICE#<deviceId>"
  GSI1SK: string;                // "VOTE#<uploadId>"
  uploadId: string;
  deviceId: string;
  voteType: 'up' | 'down';
  timestamp: string;
}

export interface DynamoQueryOptions {
  tableName: string;
  indexName?: string;
  keyCondition: string;
  expressionValues: Record<string, unknown>;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  scanIndexForward?: boolean;
}

// ============ Request/Response DTOs ============

export interface CreateUploadRequest {
  type: MediaType;
  localMediaPath: string;
  coordinates: Coordinates;
  caption?: string;
  deviceId: string;
}

export interface CreateUploadResponse {
  uploadId: string;
  presignedUploadUrl: string;
  mediaKey: string;
}

export interface QueryUploadsByLocationRequest {
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  limit?: number;
  cursor?: string;
}

export interface QueryUploadsResponse {
  uploads: Array<{
    id: string;
    type: MediaType;
    mediaUrl: string;
    coordinates: Coordinates;
    timestamp: string;
    caption?: string;
    voteCount: number;
  }>;
  nextCursor?: string;
}

export interface CastVoteRequest {
  uploadId: string;
  deviceId: string;
  voteType: 'up' | 'down';
}

export interface CastVoteResponse {
  success: boolean;
  newVoteCount: number;
}
