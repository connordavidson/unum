// Babel config for Jest tests
// Uses simpler presets to avoid react-native-reanimated plugin issues
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      '@babel/preset-typescript',
      ['@babel/preset-react', { runtime: 'automatic' }],
    ],
    plugins: [],
  };
};
