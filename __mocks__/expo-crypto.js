// Mock for expo-crypto
module.exports = {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
};
