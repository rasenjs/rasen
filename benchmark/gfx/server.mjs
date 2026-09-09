/**
 * Minimal static file server for the built scenes page (shared by golden.mjs
 * and probe-gl-stats.mjs). Same find-free-port contract as benchmark/spine.
 */
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
}

export function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (!addr || typeof addr === 'string') return reject(new Error('no port'))
      const port = addr.port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

export function serveStatic() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = (req.url ?? '/').split('?')[0]
      const rel = url === '/' ? '/scenes.html' : url
      const file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
      if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

/**
 * rAF polyfill for headless Chrome — background pages throttle/pause
 * requestAnimationFrame, which would freeze the render loop. Injected ONLY in
 * verification/probe runs, never in benchmark measurement pages.
 */
export const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`
