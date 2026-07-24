/**
 * Pre-bundle @vue/runtime-core + adapter into one Hermes-compatible CJS file.
 * Using esbuild with target 'es6' (Vue CJS uses computed keys that es5 can't handle).
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')

const ENTRIES = [
  { in: path.join(ROOT, 'src', 'index.ts'), out: 'index' },
  { in: path.join(ROOT, 'src', 'router.ts'), out: 'router' },
]

for (const entry of ENTRIES) {
  esbuild.buildSync({
    entryPoints: [entry.in],
    bundle: true,
    format: 'cjs',
    target: 'es6',
    platform: 'node',
    outfile: path.join(ROOT, 'dist', `${entry.out}.js`),
    external: ['@rasenjs/rn-dom', '@vue/runtime-core', '@vue/reactivity', '@vue/shared', 'vue-router'],
  })

  const size = fs.statSync(path.join(ROOT, 'dist', `${entry.out}.js`)).size
  const lines = fs.readFileSync(path.join(ROOT, 'dist', `${entry.out}.js`), 'utf8').split('\n').length
  console.log(`OK: vue-rn bundle dist/${entry.out}.js (${size} bytes, ${lines} lines)`)
}
