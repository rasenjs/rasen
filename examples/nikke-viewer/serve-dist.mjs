#!/usr/bin/env node
/* eslint-disable */

/**
 * Serves the built app (dist/) with SPA fallback, so the deployed artifact can be
 * exercised locally.
 *
 * Why not `vite preview`: it resolves `outDir` against the project root, so
 * pointing it at the dist DIRECTORY makes it look for dist/dist, and invoking it
 * from another working directory is easy to get wrong. The viewer also needs a
 * history fallback for /char/<id>, and a static preview server does not add one —
 * which matters because the deployed site does (see dist/vercel.json).
 *
 * Usage: node serve-dist.mjs [port]
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'dist')
const port = Number(process.argv[2] || 5192)

if (!fs.existsSync(dist)) {
  console.error(`no build at ${dist} — run \`yarn build\` first`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.skel': 'application/octet-stream',
  '.atlas': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml'
}

/** Resolve a URL path inside dist, refusing anything that escapes it. */
function resolveSafe(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  const p = path.normalize(path.join(dist, clean))
  return p.startsWith(dist) ? p : null
}

const server = http.createServer((req, res) => {
  let file = resolveSafe(req.url || '/')

  // SPA fallback: /char/c405 and friends are client routes, not files. The
  // deployed site serves index.html for them, so serving locally has to match or
  // the routes under test are not the routes that ship.
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const indexed = file && path.join(file, 'index.html')
    if (indexed && fs.existsSync(indexed)) file = indexed
    else file = path.join(dist, 'index.html')
  }

  try {
    const body = fs.readFileSync(file)
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': String(body.length),
      // No caching: the point of this server is to observe rendering behaviour,
      // and a cached bundle would silently serve the previous build.
      'Cache-Control': 'no-store'
    })
    res.end(body)
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found: ' + req.url)
  }
})

server.listen(port, () => {
  console.log(`serving ${path.relative(process.cwd(), dist)} (SPA fallback) on http://localhost:${port}/`)
})
