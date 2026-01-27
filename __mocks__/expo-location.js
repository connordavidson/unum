// Mock for expo-location
module.exports = {
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({
    coords: { latitude: 37.7749, longitude: -122.4194 }
  })),
};
