const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin that enables modular headers globally in the Podfile.
 *
 * Firebase Swift pods (FirebaseCoreInternal, FirebaseCrashlytics, FirebaseSessions)
 * depend on GoogleUtilities, GoogleDataTransport, and nanopb which don't define
 * modules by default. Setting use_modular_headers! tells CocoaPods to generate
 * module maps for all pods, which resolves the Swift interop requirement.
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.projectRoot, 'ios', 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // Add use_modular_headers! before the first target block
      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /^(target\s)/m,
          '# Enable modular headers for Firebase Swift pod dependencies\nuse_modular_headers!\n\n$1'
        );
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
