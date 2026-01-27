// Jest setup file
// This runs before each test file

// Silence console logs during tests (optional - uncomment to enable)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Silence Reanimated warning
global.__reanimatedWorkletInit = jest.fn();

// Note: Mocks are handled via moduleNameMapper in jest.config.js
// pointing to __mocks__/ directory
