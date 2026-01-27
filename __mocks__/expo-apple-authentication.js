// Mock for expo-apple-authentication
module.exports = {
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  signInAsync: jest.fn(),
  getCredentialStateAsync: jest.fn(),
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
};
