const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const monorepoRoot = path.resolve(__dirname, '../..')
const vueRNPath = path.join(monorepoRoot, 'packages/vue-rn/dist')
const reactNativePath = path.join(monorepoRoot, 'node_modules/react-native')
const rnDomPath = path.join(monorepoRoot, 'packages/rn-dom/dist')

const defaultConfig = getDefaultConfig(__dirname)

const config = {
  transformer: {
    babelTransformerPath: require.resolve('@rasenjs/vue-rn/transformer/vue-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    sourceExts: [...defaultConfig.resolver.sourceExts, 'vue'],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
        const subPath = moduleName === 'react-native' ? 'index.js' : moduleName.slice('react-native/'.length) + '.js'
        return {
          filePath: path.join(reactNativePath, subPath),
          type: 'sourceFile',
        }
      }
      if (moduleName === '@rasenjs/vue-rn') {
        return {
          filePath: path.join(vueRNPath, 'index.js'),
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
    vueRNPath,
    rnDomPath,
  ],
}

module.exports = mergeConfig(defaultConfig, config)
