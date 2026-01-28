import Constants from "expo-constants";

// Get config from expo-constants (populated from .env via app.config.ts)
const extra = Constants.expoConfig?.extra ?? {};

// ============ Environment Configuration ============
export const APP_ENV = {
  name: (extra.appEnv as string) || 'development',
  isProduction: extra.isProduction ?? false,
  isDevelopment: !extra.isProduction,
};

// ============ Map Configuration ============
export const MAP_CONFIG = {
  DEFAULT_CENTER: {
    latitude: 38.8951,
    longitude: -77.0252,
  },
  DEFAULT_ZOOM: 15,
  DEFAULT_DELTA: {
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  },
  ZOOM_THRESHOLD: 13,
  UNCLUSTERED_MIN_ZOOM: 10,
};

// ============ Clustering Configuration ============
export const CLUSTER_CONFIG = {
  THRESHOLD_METERS: 2000,
  MIN_FOR_CIRCLE: 4,
  RADIUS_PADDING: 200,
};

// ============ Location Configuration ============
export const LOCATION_CONFIG = {
  CACHE_KEY: "unum_user_location",
  UPDATE_INTERVAL_MS: 60000,
};

// ============ Camera Configuration ============
export const CAMERA_CONFIG = {
  HOLD_DELAY_MS: 500,
  ZOOM_SCALE_PX: 400,
  MAX_VIDEO_DURATION: 60,
  PHOTO_QUALITY: 0.8,
};

// ============ Storage Keys ============
export const STORAGE_KEYS = {
  UPLOADS: "unum_uploads",
  VOTES: "unum_votes",
  USER_VOTES: "unum_user_votes",
  LOCATION: "unum_user_location",
};

// ============ API Configuration ============
export const API_CONFIG = {
  BASE_URL: "/api",
  USE_TEST_DATA: extra.useTestData ?? true,
};

// ============ Feed Configuration ============
export const FEED_CONFIG = {
  CAPTION_MAX_LENGTH: 60,
};

// ============ UI Configuration ============
export const UI_CONFIG = {
  HEADER_HEIGHT: 60,
  TRANSITION_DURATION_MS: 300,
};

// ============ Bottom Sheet Snap Points ============
export const SHEET_SNAP_POINTS = {
  MINIMIZED: 75, // Fixed height: handle + header with border
  COLLAPSED: "60%",
  EXPANDED: "100%",
};

// ============ Theme Colors ============
export const COLORS = {
  PRIMARY: "#333",
  SUCCESS: "#4CAF50",
  DANGER: "#f44336",
  TEXT_PRIMARY: "#000",
  TEXT_SECONDARY: "#666",
  TEXT_TERTIARY: "#999",
  BORDER: "#eee",
  BACKGROUND: "#fff",
  BACKGROUND_LIGHT: "#f5f5f5",
  UPVOTE_BG: "#e8f5e9",
  DOWNVOTE_BG: "#ffebee",
  OVERLAY: "rgba(0, 0, 0, 0.5)",
};

// ============ Shadow Styles ============
export const SHADOWS = {
  SMALL: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  MEDIUM: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  LARGE: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

// ============ Button Sizes ============
export const BUTTON_SIZES = {
  SMALL: 44,
  MEDIUM: 50,
  LARGE: 56,
  XLARGE: 60,
  CAPTURE: 80,
};

// Re-export from utils for backward compatibility
export { circularButtonStyle } from '../utils/styles';

// ============ Feature Flags ============
export const FEATURE_FLAGS = {
  USE_AWS_BACKEND: extra.useAwsBackend ?? false,
  ENABLE_OFFLINE_SYNC: extra.enableOfflineSync ?? true,
  ENABLE_BACKGROUND_SYNC: extra.enableBackgroundSync ?? false,
};

// ============ BFF Configuration ============
export const BFF_CONFIG = {
  SYNC_INTERVAL_MS: 30000, // 30 seconds
  SYNC_RETRY_DELAY_MS: 5000, // 5 seconds base retry delay
  MAX_SYNC_RETRIES: 3,
  SYNC_BATCH_SIZE: 10, // Max items to sync at once
};

// ============ Additional Storage Keys for BFF ============
export const BFF_STORAGE_KEYS = {
  DEVICE_ID: "unum_device_id",
  SYNC_QUEUE: "unum_sync_queue",
  LAST_SYNC: "unum_last_sync",
  CACHED_UPLOADS: "unum_cached_uploads",
  MIGRATION_STATUS: "unum_migration_status",
};

// ============ Auth Storage Keys ============
export const AUTH_STORAGE_KEYS = {
  /** Apple user ID (stored in SecureStore) */
  APPLE_USER_ID: 'unum_apple_user_id',
  /** Apple identity token for Cognito (stored in SecureStore) */
  APPLE_IDENTITY_TOKEN: 'unum_apple_identity_token',
  /** User profile data (stored in AsyncStorage) */
  USER_PROFILE: 'unum_user_profile',
  /** Refresh token for auth backend (stored in SecureStore) */
  REFRESH_TOKEN: 'unum_refresh_token',
  /** Session ID from auth backend (stored in SecureStore) */
  SESSION_ID: 'unum_session_id',
};

// ============ Migration Configuration ============
export const MIGRATION_CONFIG = {
  CURRENT_VERSION: 1,
  AUTO_MIGRATE: true, // Automatically run migrations on app start
};

// ============ Data Mode Configuration ============
export type DataMode = "local-only" | "dual-write" | "remote-first";

/**
 * Current data mode:
 * - 'local-only': All data stays local (default, USE_AWS_BACKEND = false)
 * - 'dual-write': Write to local first, then sync to remote
 * - 'remote-first': Prefer remote data, cache locally
 */
export const DATA_MODE: DataMode = FEATURE_FLAGS.USE_AWS_BACKEND
  ? FEATURE_FLAGS.ENABLE_OFFLINE_SYNC
    ? "dual-write"
    : "remote-first"
  : "local-only";
