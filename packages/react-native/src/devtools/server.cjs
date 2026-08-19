/**
 * @rasenjs/react-native — devtools server (no Electron)
 *
 * Serves the Rasen RN devtools web frontend and bridges it to the running
 * app over socket.io. The app side connects via `connectRasenDevTools()`
 * (`@rasenjs/react-native/devtools`).
 *
 * Usage:
 *   npx rasen-devtools            # default 8099
 *   PORT=9000 npx rasen-devtools  # custom port
 *
 * Open http://localhost:8099/ in a browser for the devtools UI.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { Server } = require('socket.io')

const PORT = Number(process.env.PORT) || 8099

// Web frontend lives next to this file (dist/devtools/web/).
const webRoot = path.join(__dirname, 'web')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]
  const filePath = path.normalize(path.join(webRoot, url === '/' ? 'index.html' : url))

  // Prevent path traversal.
  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'text/plain',
    })
    res.end(data)
  })
})

const io = new Server(server, { cors: { origin: '*' } })

/** The app socket (first connection). */
let appSocket = null

/** Proxy an RPC request from a browser client to the app socket. */
function proxyRpc(socket, eventName, ack) {
  if (appSocket && appSocket !== socket) {
    appSocket.emit(eventName, (payload) => {
      if (typeof ack === 'function') ack(payload)
    })
  } else if (typeof ack === 'function') {
    ack(null)
  }
}

io.on('connection', (socket) => {
  if (!appSocket) {
    appSocket = socket
    // eslint-disable-next-line no-console
    console.log('[rasen-devtools] app connected')
  }

  socket.on('rasen:getTree', (ack) => proxyRpc(socket, 'rasen:getTree', ack))
  socket.on('rasen:getPerf', (ack) => proxyRpc(socket, 'rasen:getPerf', ack))
  socket.on('rasen:resetPerf', (ack) => proxyRpc(socket, 'rasen:resetPerf', ack))

  socket.on('disconnect', () => {
    if (socket === appSocket) {
      appSocket = null
      // eslint-disable-next-line no-console
      console.log('[rasen-devtools] app disconnected')
    }
  })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[rasen-devtools] server at http://localhost:${PORT}`)
})
