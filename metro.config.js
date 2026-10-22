const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('path');

const config = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {
    extraNodeModules: {
      /**
       * react-native-image-colors@2.x statically imports expo-modules-core,
       * which does not exist in a bare React Native app. Metro resolves that
       * import at bundle time no matter where it appears, so the whole bundle
       * failed and the app red-screened on launch before running any of its own
       * code. See src/shims/expo-modules-core.js for the full reasoning and the
       * real fix (`npx install-expo-modules@latest`).
       */
      'expo-modules-core': path.resolve(__dirname, 'src/shims/expo-modules-core.js'),
    },
  },
});

module.exports = config;
