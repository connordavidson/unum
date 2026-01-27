// Mock for @react-native-firebase/crashlytics
const mockCrashlyticsInstance = {
  log: jest.fn(),
  recordError: jest.fn(),
  crash: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn().mockResolvedValue(),
  setUserId: jest.fn().mockResolvedValue(),
  setAttribute: jest.fn().mockResolvedValue(),
  setAttributes: jest.fn().mockResolvedValue(),
};

const crashlytics = jest.fn(() => mockCrashlyticsInstance);

module.exports = {
  __esModule: true,
  default: crashlytics,
};
