// Mock for @react-native-firebase/analytics
const analytics = jest.fn(() => ({
  logEvent: jest.fn().mockResolvedValue(),
  setUserId: jest.fn().mockResolvedValue(),
  setUserProperties: jest.fn().mockResolvedValue(),
  setAnalyticsCollectionEnabled: jest.fn().mockResolvedValue(),
}));

module.exports = {
  __esModule: true,
  default: analytics,
};
