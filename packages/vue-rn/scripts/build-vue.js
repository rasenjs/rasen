/**
 * Pre-bundle @vue/runtime-core + adapter into one Hermes-compatible CJS file.
 * Using esbuild with target 'es6' (Vue CJS uses computed keys that es5 can't handle).
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src', 'index.ts')
const OUT = path.join(ROOT, 'dist', 'index.js')

fs.mkdirSync(path.dirname(OUT), { recursive: true })

esbuild.buildSync({
  entryPoints: [SRC],
  bundle: true,
  format: 'cjs',
  target: 'es6',
  platform: 'node',
  outfile: OUT,
  external: ['@rasenjs/rn-dom', '@vue/runtime-core', '@vue/reactivity', '@vue/shared'],
})

const size = fs.statSync(OUT).size
const lines = fs.readFileSync(OUT, 'utf8').split('\n').length
console.log(`OK: vue-rn bundle ${OUT} (${size} bytes, ${lines} lines)`)
