/**
 * sync-bench-rn.js
 *
 * Syncs ReactFabric-dev.js from the real react-native package into the
 * benchmark mock package (rn-local-pkg). Run after upgrading react-native.
 *
 * The mock package needs its own copy because Vite's CJS processing can't
 * handle `import typeof` syntax in the real react-native package.
 *
 * Usage:  node scripts/sync-bench-rn.js
 * Hook:   Added to postinstall in package.json
 */

const fs = require('fs')
const path = require('path')

const PKG_DIR = path.resolve(__dirname, '..')
const REAL_RN = path.resolve(PKG_DIR, '../../node_modules/react-native')
const MOCK_DIR = path.resolve(PKG_DIR, 'src/__bench__/__mocks__/rn-local-pkg/react-native')

const FILES = [
  {
    src: 'Libraries/Renderer/implementations/ReactFabric-dev.js',
    dst: 'Libraries/Renderer/implementations/ReactFabric-dev.js',
    required: true,
  },
]

let copied = 0
let errors = 0

for (const f of FILES) {
  const srcPath = path.resolve(REAL_RN, f.src)
  const dstPath = path.resolve(MOCK_DIR, f.dst)

  if (!fs.existsSync(srcPath)) {
    if (f.required) {
      console.error(`[sync-bench-rn] ❌  Source not found: ${srcPath}`)
      errors++
    }
    continue
  }

  const dstDir = path.dirname(dstPath)
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true })
  }

  fs.copyFileSync(srcPath, dstPath)
  const stat = fs.statSync(dstPath)
  console.log(`[sync-bench-rn] ✅  Copied ${f.dst} (${(stat.size / 1024).toFixed(0)}KB)`)
  copied++
}

if (errors > 0) {
  console.error(`[sync-bench-rn] ❌  ${errors} file(s) failed to copy`)
  process.exit(1)
}

console.log(`[sync-bench-rn] ✅  Done. ${copied} file(s) synced.`)
