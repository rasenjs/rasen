const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const monorepoRoot = path.resolve(__dirname, '../..')
const vueRNPath = path.join(monorepoRoot, 'packages/vue-rn/dist')
const reactNativePath = path.join(monorepoRoot, 'node_modules/react-native')
const rnDomPath = path.join(monorepoRoot, 'packages/rn-dom/dist')
const vueRuntimeCorePath = path.join(monorepoRoot, 'node_modules/@vue/runtime-core')

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
    sourceExts: [...defaultConfig.resolver.sourceExts, 'vue', 'mjs'],
    resolveRequest: (context, moduleName, platform) => {
      // nostics is ESM-only (no main entry). vue-router requires it via CJS.
      if (moduleName === 'nostics') {
        return {
          filePath: path.resolve(__dirname, '__stubs__/nostics.cjs'),
          type: 'sourceFile',
        }
      }
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
      // Redirect 'vue' to @vue/runtime-core to avoid pulling in @vue/runtime-dom
      // (which references document.createElement etc. — crashes in Hermes).
      // vue-router imports from 'vue', so this is required for compatibility.
      if (moduleName === 'vue') {
        return {
          filePath: path.join(vueRuntimeCorePath, 'dist/runtime-core.cjs.js'),
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
    vueRuntimeCorePath,
  ],
}

module.exports = mergeConfig(defaultConfig, config)
