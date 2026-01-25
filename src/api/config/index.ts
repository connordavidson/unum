/**
 * AWS Configuration
 *
 * Configuration values are loaded from environment variables via app.config.ts
 * and exposed through expo-constants.
 *
 * To configure:
 * 1. Copy .env.example to .env
 * 2. Fill in your AWS credentials
 * 3. Restart the Metro bundler
 */

import Constants from 'expo-constants';
import type { AWSConfig } from '../types';

// Get config from expo-constants (populated from app.config.ts)
const extra = Constants.expoConfig?.extra ?? {};

export const awsConfig: AWSConfig = {
  region: extra.awsRegion || 'us-east-1',
  accessKeyId: extra.awsAccessKeyId || '',
  secretAccessKey: extra.awsSecretAccessKey || '',
  s3Bucket: extra.s3Bucket || 'unum-media-dev',
  dynamoTableName: extra.dynamoTable || 'unum-data-dev',
};

// Feature flags from app.config.ts
export const featureFlags = {
  useAwsBackend: extra.useAwsBackend ?? false,
  enableOfflineSync: extra.enableOfflineSync ?? true,
  enableBackgroundSync: extra.enableBackgroundSync ?? false,
  useTestData: extra.useTestData ?? true,
  debug: extra.debug ?? false,
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
