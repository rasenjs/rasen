const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const monorepoRoot = path.resolve(__dirname, '../..')
const rnDomPath = path.join(monorepoRoot, 'packages/rn-dom/dist')
const reactNativePath = path.join(monorepoRoot, 'node_modules/react-native')

const defaultConfig = getDefaultConfig(__dirname)

const config = {
  transformer: {
    hermesParser: true,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      // Redirect react-native and deep imports to root node_modules
      if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
        const subPath = moduleName === 'react-native' ? 'index.js' : moduleName.slice('react-native/'.length) + '.js'
        return {
          filePath: path.join(reactNativePath, subPath),
          type: 'sourceFile',
        }
      }
      if (moduleName === '@rasenjs/rn-dom') {
        return {
          filePath: path.join(rnDomPath, 'index.js'),
          type: 'sourceFile',
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
  watchFolders: [
    monorepoRoot,
    rnDomPath,
  ],
}

module.exports = mergeConfig(defaultConfig, config)
