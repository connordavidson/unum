// Mock for expo-camera
module.exports = {
  Camera: {
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    requestMicrophonePermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  },
  CameraType: { back: 'back', front: 'front' },
};
