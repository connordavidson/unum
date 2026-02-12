/**
 * Expo App Configuration
 *
 * Environment-aware configuration that loads the appropriate .env file
 * based on APP_ENV (development or production).
 *
 * Usage in app:
 *   import Constants from 'expo-constants';
 *   const { awsRegion, cognitoIdentityPoolId } = Constants.expoConfig?.extra ?? {};
 *
 * Environment Selection:
 *   - Local dev: APP_ENV=development npx expo start
 *   - EAS Build: Configured in eas.json build profiles
 */

import { ExpoConfig, ConfigContext } from 'expo/config';
import * as dotenv from 'dotenv';

// Determine environment from APP_ENV or default to development
const APP_ENV = process.env.APP_ENV || 'development';
const isProduction = APP_ENV === 'production';

// Load the appropriate .env file
// Note: override:true is required because Expo SDK 49+ auto-loads .env.development
// before app.config.ts runs. Without override, dotenv silently skips already-set vars.
const envFile = isProduction ? '.env.production' : '.env.development';
dotenv.config({ path: envFile, override: true });

// Fallback to .env for any vars not in the environment-specific file
dotenv.config({ path: '.env' });

// Load from app.json
import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...appJson.expo,
    ...config,

    // Environment-specific app name (helps distinguish builds)
    name: isProduction ? 'Unum' : 'Unum (Dev)',

    // Add environment variables to extra
    extra: {
      ...config.extra,

      // ============ Environment ============
      appEnv: APP_ENV,
      isProduction,

      // ============ AWS Configuration ============
      // NOTE: No credentials here - using Cognito Identity Pools
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      cognitoIdentityPoolId: process.env.COGNITO_IDENTITY_POOL_ID || '',

      // Resource names
      dynamoTable: process.env.DYNAMO_TABLE || `unum-${APP_ENV}-data`,
      s3Bucket: process.env.S3_BUCKET || `unum-${APP_ENV}-media`,

      // Auth Backend API
      authApiUrl: process.env.AUTH_API_URL || '',

      // ============ Feature Flags ============
      useAwsBackend: process.env.USE_AWS_BACKEND === 'true',
      enableOfflineSync: process.env.ENABLE_OFFLINE_SYNC !== 'false',
      enableBackgroundSync: process.env.ENABLE_BACKGROUND_SYNC === 'true',

      // ============ Development ============
      useTestData: process.env.USE_TEST_DATA === 'true',
      debug: process.env.DEBUG === 'true',

      // ============ EAS Build ============
      eas: {
        projectId: '4c5c1137-48f3-4553-a506-f3b72c5996a9',
      },
    },
  };
};
