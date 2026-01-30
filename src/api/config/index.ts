/**
 * AWS Configuration
 *
 * Configuration values are loaded from environment variables via app.config.ts
 * and exposed through expo-constants.
 *
 * Security: This configuration contains NO secrets. AWS credentials are obtained
 * at runtime via Cognito Identity Pools after user authenticates with Apple Sign-In.
 *
 * To configure:
 * 1. Set environment variables in .env.development or .env.production
 * 2. Run Terraform to create the Cognito Identity Pool
 * 3. Update COGNITO_IDENTITY_POOL_ID with the Terraform output
 */

import Constants from 'expo-constants';
import type { AWSConfig } from '../types';

// Get config from expo-constants (populated from app.config.ts)
const extra = Constants.expoConfig?.extra ?? {};

// Environment info
export const appEnv = {
  name: extra.appEnv || 'development',
  isProduction: extra.isProduction ?? false,
  isDevelopment: !extra.isProduction,
};

export const awsConfig: AWSConfig = {
  region: extra.awsRegion || 'us-east-1',
  cognitoIdentityPoolId: extra.cognitoIdentityPoolId || '',
  s3Bucket: extra.s3Bucket || `unum-${appEnv.name}-media`,
  dynamoTableName: extra.dynamoTable || `unum-${appEnv.name}-data`,
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
