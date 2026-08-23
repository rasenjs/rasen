// Shared server entry for benchmark packages.
//
// Decoupled contract with the benchmark harness (bench.js):
//   - The harness picks a FREE port and passes it via the `PORT` env var.
//   - The harness also passes a `BENCH_READY_SIGNAL` string.
//   - This script starts the package's preview server on `PORT`, waits until
//     it actually responds, then prints `BENCH_READY_SIGNAL` to stdout so the
//     harness knows it can begin testing.
//   - It keeps running (forwarding vite output) until it is killed by the
//     harness, which closes the server after each package is measured.
//
// This keeps the harness completely build-tool agnostic: every package just
// needs a `start` script that runs this file, and reads `PORT`.

import { spawn } from 'child_process'
import http from 'http'
import process from 'process'

const PORT = process.env.PORT
const SIGNAL = process.env.BENCH_READY_SIGNAL || 'Benchmark Ready'

if (!PORT) {
  console.error('start-server: PORT env var is required')
  process.exit(1)
}

// npm runs this script with cwd = the package directory.
const cwd = process.cwd()

function poll(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'))
        else setTimeout(tick, 300)
      })
      req.setTimeout(2000, () => req.destroy())
    }
    tick()
  })
}

const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
})

child.stdout.on('data', (d) => process.stdout.write(d))
child.stderr.on('data', (d) => process.stderr.write(d))
child.on('exit', (code) => process.exit(code ?? 0))

poll(`http://localhost:${PORT}/`, 30000)
  .then(() => {
    // Signal readiness to the harness.
    console.log(SIGNAL)
  })
  .catch((e) => {
    console.error(`start-server: server did not become ready: ${e.message}`)
    child.kill('SIGKILL')
    process.exit(1)
  })
