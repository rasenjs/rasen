/**
 * bench.js — Run vitest benchmarks for vue-rn
 *
 * 1. Syncs ReactFabric-dev.js from real react-native into mock package
 * 2. Runs vitest bench with the bench config
 * 3. Reports results
 *
 * Usage:
 *   yarn bench                    # run all benchmarks
 *   yarn bench style              # filter: style
 *   yarn bench reorder --verbose  # filter + verbose
 */

const { spawn } = require('child_process')
const path = require('path')

const PKG_DIR = path.resolve(__dirname, '..')

// ── 1. Sync Fabric renderer ────────────────────────────────────
console.log('')
console.log('═'.repeat(50))
console.log('  🧪  vue-rn benchmark')
console.log('═'.repeat(50))
console.log('')

const syncScript = path.resolve(PKG_DIR, 'scripts/sync-bench-rn.js')
try {
  require(syncScript)
} catch (e) {
  console.error(`[bench] ❌  sync-bench-rn failed:`, e.message)
  process.exit(1)
}

// ── 2. Build vitest args ───────────────────────────────────────
const args = [
  'vitest', 'bench',
  '--config', path.resolve(PKG_DIR, 'vitest.bench.config.ts'),
]

// Pass through filter (first non-option arg)
const filter = process.argv[2]
if (filter && !filter.startsWith('-')) {
  args.push(filter)
}

// Pass through --verbose etc.
for (let i = 3; i < process.argv.length; i++) {
  args.push(process.argv[i])
}

// ── 3. Run vitest ──────────────────────────────────────────────
console.log(`  > vitest bench --run ${args.slice(2).join(' ')}`)
console.log('')

const child = spawn('npx', args, {
  cwd: PKG_DIR,
  stdio: 'inherit',
  env: { ...process.env },
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
