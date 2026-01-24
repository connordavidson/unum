/**
 * AWS Configuration
 *
 * In production, these values should come from environment variables
 * or a secure configuration service.
 */

import type { AWSConfig } from '../types';

// Placeholder config - replace with actual values or env vars
export const awsConfig: AWSConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  s3Bucket: process.env.S3_BUCKET || 'unum-media-dev',
  dynamoTableName: process.env.DYNAMO_TABLE || 'unum-data-dev',
};

// S3 configuration
export const s3Config = {
  presignedUrlExpiration: {
    upload: 3600,     // 1 hour
    download: 86400,  // 24 hours
  },
  contentTypes: {
    photo: 'image/jpeg',
    video: 'video/mp4',
    thumbnail: 'image/jpeg',
  },
  maxFileSizes: {
    photo: 10 * 1024 * 1024,    // 10 MB
    video: 100 * 1024 * 1024,   // 100 MB
  },
};

// DynamoDB configuration
export const dynamoConfig = {
  tableName: awsConfig.dynamoTableName,
  gsi1Name: 'GSI1',  // Geohash index
  gsi2Name: 'GSI2',  // Device index
  geohashPrecision: 6,  // ~1.2km x 0.6km cells
};

// Retry configuration
export const retryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};
