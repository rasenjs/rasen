const path = require('path')
const fs = require('fs')
const monorepoRoot = path.resolve(__dirname, '../..')
const reactNativeDir = path.join(monorepoRoot, 'node_modules/react-native')

module.exports = {
  project: {
    ios: {},
    android: {},
  },
  dependencies: {
    'react-native': {
      root: reactNativeDir,
    },
  },
}
