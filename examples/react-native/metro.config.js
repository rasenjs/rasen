const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Get the monorepo root
const monorepoRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration for Yarn Workspaces monorepo
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // Project root is examples/react-native (where index.js is)
  projectRoot: __dirname,
  // Watch the entire monorepo to detect changes in packages
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@rasenjs/core': path.resolve(monorepoRoot, 'packages/core/dist'),
      '@rasenjs/core/utils': path.resolve(monorepoRoot, 'packages/core/dist/utils.js'),
      '@rasenjs/router': path.resolve(monorepoRoot, 'packages/router/dist'),
      '@rasenjs/router/components': path.resolve(monorepoRoot, 'packages/router/dist/components/index.js'),
      '@rasenjs/react-native': path.resolve(monorepoRoot, 'packages/react-native/dist'),
      '@rasenjs/react-native-router': path.resolve(monorepoRoot, 'packages/react-native-router/dist'),
      '@rasenjs/reactive-vue': path.resolve(monorepoRoot, 'packages/reactive-vue/dist'),
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
