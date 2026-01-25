/**
 * Expo App Configuration
 *
 * This file extends app.json and adds environment variable support.
 * Environment variables are loaded from .env file and exposed to the app
 * via expo-constants.
 *
 * Usage in app:
 *   import Constants from 'expo-constants';
 *   const { awsRegion } = Constants.expoConfig?.extra ?? {};
 */

import 'dotenv/config';
import { ExpoConfig, ConfigContext } from 'expo/config';

// Load from app.json
import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...appJson.expo,
    ...config,

    // Add environment variables to extra
    extra: {
      ...config.extra,

      // AWS Configuration
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      dynamoTable: process.env.DYNAMO_TABLE || 'unum-data-dev',
      s3Bucket: process.env.S3_BUCKET || 'unum-media-dev',

      // Feature Flags
      useAwsBackend: process.env.USE_AWS_BACKEND === 'true',
      enableOfflineSync: process.env.ENABLE_OFFLINE_SYNC !== 'false',
      enableBackgroundSync: process.env.ENABLE_BACKGROUND_SYNC === 'true',

      // Development
      useTestData: process.env.USE_TEST_DATA !== 'false',
      debug: process.env.DEBUG === 'true',

      // EAS Build
      eas: {
        projectId: process.env.EAS_PROJECT_ID || '',
      },
    },
  };
};
