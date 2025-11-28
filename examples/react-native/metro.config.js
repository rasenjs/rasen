const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Get the monorepo root
const monorepoRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration for Yarn Workspaces monorepo
 * https://reactnative.dev/docs/metro
 *
 * 注意：由于 metro 在 monorepo 中的路径解析问题，
 * 需要从根目录运行打包命令：
 *
 *   cd /path/to/rasen
 *   npx metro build examples/react-native/index.js -O examples/react-native/bundle.js -p ios
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: monorepoRoot,
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@rasenjs/core': path.resolve(monorepoRoot, 'packages/core'),
      '@rasenjs/react-native': path.resolve(monorepoRoot, 'packages/react-native'),
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

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
