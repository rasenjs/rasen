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
import fs from 'fs'
import path from 'path'

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

/**
 * Spawn vite's own entry point, NOT `npx vite`.
 *
 * `npx` is an extra process in the middle: killing it leaves vite orphaned and
 * still holding the port, which is how a finished run used to poison the next
 * one. Running node on vite's bin makes this process the parent of the server
 * itself, so a single kill is enough. (Resolved through the .bin symlink
 * because vite's package `exports` does not expose `./bin/vite.js`.)
 */
function viteBin() {
  const link = path.join(cwd, 'node_modules', '.bin', 'vite')
  try {
    return fs.realpathSync(link)
  } catch {
    // Workspaces hoist to the repo root; fall back to walking up.
    let dir = cwd
    for (let i = 0; i < 4; i++) {
      dir = path.dirname(dir)
      try {
        return fs.realpathSync(path.join(dir, 'node_modules', '.bin', 'vite'))
      } catch {}
    }
    throw new Error('start-server: cannot locate the vite binary')
  }
}

const child = spawn(
  process.execPath,
  [viteBin(), 'preview', '--port', String(PORT), '--strictPort'],
  {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  }
)

child.stdout.on('data', (d) => process.stdout.write(d))
child.stderr.on('data', (d) => process.stderr.write(d))

// The harness kills THIS process, not the vite grandchild, and `npx` sits in
// between. Without killing the child on the way out, the vite server outlives
// the run and keeps holding the port — the next run then polls the STALE
// server, sees it answer, and reports "ready" right before the new vite dies
// with "Port is already in use". So die with the child.
let childGone = false
function shutdown(signal) {
  if (!childGone) child.kill('SIGKILL')
  process.exit(signal === 'SIGINT' ? 130 : 143)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGHUP', () => shutdown('SIGHUP'))
process.on('exit', () => {
  if (!childGone) child.kill('SIGKILL')
})

child.on('exit', (code) => {
  childGone = true
  process.exit(code ?? 0)
})

poll(`http://localhost:${PORT}/`, 30000)
  .then(() => {
    // A port that answers is not proof that OUR server is the one answering:
    // a leftover from a previous run would answer too. If our child has since
    // exited (the "port in use" case), this is not a success.
    if (childGone) {
      console.error(`start-server: port ${PORT} answered, but our vite already exited`)
      process.exit(1)
    }
    // Signal readiness to the harness.
    console.log(SIGNAL)
  })
  .catch((e) => {
    console.error(`start-server: server did not become ready: ${e.message}`)
    child.kill('SIGKILL')
    process.exit(1)
  })
