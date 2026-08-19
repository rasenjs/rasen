const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withRasenRN } = require('@rasenjs/react-native/metro');
const path = require('path');

// Get the monorepo root
const monorepoRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration for Yarn Workspaces monorepo
 * https://reactnative.dev/docs/metro
 *
 * `withRasenRN` handles the JSX runtime redirection (react/jsx-runtime →
 * @rasenjs/react-native/jsx-runtime) and single-instance resolution for the
 * rasen packages. The rest is monorepo-specific wiring.
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
      '@rasenjs/core': path.resolve(monorepoRoot, 'packages/core'),
      '@rasenjs/core/utils': path.resolve(monorepoRoot, 'packages/core/dist/utils.js'),
      '@rasenjs/jsx-runtime': path.resolve(monorepoRoot, 'packages/jsx-runtime'),
      '@rasenjs/router': path.resolve(monorepoRoot, 'packages/router'),
      '@rasenjs/router/components': path.resolve(monorepoRoot, 'packages/router/dist/components/index.js'),
      '@rasenjs/react-native': path.resolve(monorepoRoot, 'packages/react-native'),
      '@rasenjs/react-native-router': path.resolve(monorepoRoot, 'packages/react-native-router'),
      '@rasenjs/reactive-vue': path.resolve(monorepoRoot, 'packages/reactive-vue'),
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

module.exports = withRasenRN(mergeConfig(getDefaultConfig(__dirname), config));
