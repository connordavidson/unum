// Mock for react-native-reanimated
module.exports = {
  default: {
    call: () => {},
  },
  useSharedValue: jest.fn((init) => ({ value: init })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn((value) => value),
  withSpring: jest.fn((value) => value),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
  },
};
