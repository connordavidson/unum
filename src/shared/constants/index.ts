// ============ Map Configuration ============
export const MAP_CONFIG = {
  DEFAULT_CENTER: {
    latitude: 38.8867,
    longitude: -77.0276,
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
  CACHE_KEY: 'unum_user_location',
  UPDATE_INTERVAL_MS: 60000,
};

// ============ Camera Configuration ============
export const CAMERA_CONFIG = {
  HOLD_DELAY_MS: 500,
};

// ============ Storage Keys ============
export const STORAGE_KEYS = {
  UPLOADS: 'unum_uploads',
  VOTES: 'unum_votes',
  USER_VOTES: 'unum_user_votes',
  LOCATION: 'unum_user_location',
};

// ============ API Configuration ============
export const API_CONFIG = {
  BASE_URL: '/api',
  USE_TEST_DATA: true,
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
  MINIMIZED: '12%',
  COLLAPSED: '35%',
  EXPANDED: '90%',
};

// ============ Theme Colors ============
export const COLORS = {
  PRIMARY: '#333',
  SUCCESS: '#4CAF50',
  DANGER: '#f44336',
  TEXT_PRIMARY: '#000',
  TEXT_SECONDARY: '#666',
  TEXT_TERTIARY: '#999',
  BORDER: '#eee',
  BACKGROUND: '#fff',
  BACKGROUND_LIGHT: '#f5f5f5',
  UPVOTE_BG: '#e8f5e9',
  DOWNVOTE_BG: '#ffebee',
  OVERLAY: 'rgba(0, 0, 0, 0.5)',
};
