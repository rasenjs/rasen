const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for React Native example in monorepo
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  watchFolders: [__dirname],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
    ],
    extraNodeModules: {
      '@rasenjs/core': path.resolve(__dirname, 'packages/core'),
      '@rasenjs/react-native': path.resolve(__dirname, 'packages/react-native'),
      '@rasenjs/reactive-vue': path.resolve(__dirname, 'packages/reactive-vue'),
    },
    // Disable hierarchical lookup to avoid path issues
    disableHierarchicalLookup: false,
    // Custom resolver to fix react-native internal paths
    resolveRequest: (context, moduleName, platform) => {
      // Check if it's a react-native internal require
      if (context.originModulePath.includes('node_modules/react-native/') && moduleName.startsWith('./')) {
        // Resolve relative to the react-native package
        const rnPath = path.resolve(__dirname, 'node_modules/react-native');
        const resolvedPath = path.resolve(path.dirname(context.originModulePath), moduleName);
        
        // Try to find the file with platform extensions
        const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
        const platformExt = platform ? [`.${platform}.js`, `.native.js`] : [];
        
        for (const ext of [...platformExt, ...extensions]) {
          const fullPath = resolvedPath + ext;
          try {
            require.resolve(fullPath);
            return { filePath: fullPath, type: 'sourceFile' };
          } catch {}
        }
      }
      
      // Fall back to default resolver
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    babelTransformerPath: require.resolve('@react-native/metro-babel-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
