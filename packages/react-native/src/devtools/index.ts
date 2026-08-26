/**
 * @rasenjs/react-native — devtools client (RN side)
 *
 * Connects a running Rasen RN app to the devtools server
 * (`npx rasen-devtools`, default port 8099) over socket.io and exposes RPC
 * endpoints for the web frontend:
 *
 *  - `rasen:getTree`   → serialized rn-dom node tree
 *  - `rasen:getPerf`   → render performance stats
 *  - `rasen:resetPerf` → reset the stats
 *
 * Usage (index.ts, __DEV__ only):
 * ```ts
 * if (__DEV__) {
 *   const { connectRasenDevTools } = require('@rasenjs/react-native/devtools')
 *   connectRasenDevTools() // before registerApp()
 * }
 * ```
 *
 * N notes:
 *  - iOS simulator:    http://localhost
 *  - Android emulator: http://10.0.2.2
 *  - physical device:  http://<Mac LAN IP>
 */

import io from 'socket.io-client'
import { RNDocument } from '@rasenjs/rn-dom'
import {
  setDevtoolsHook,
  recordRender,
  collectPerf,
  collectNodeTree,
  resetPerf,
} from './instrument'

export interface ConnectRasenDevToolsOptions {
  /** Devtools server host (default http://localhost, overridable via RASEN_DEVTOOLS_HOST). */
  host?: string
  /** Devtools server port (default 8099, overridable via RASEN_DEVTOOLS_PORT). */
  port?: number | null
  /** Print connection logs (default true). */
  verbose?: boolean
}

/**
 * Connect the app to the devtools server and start collecting render stats.
 * Must be called before `registerApp()` so the instrumentation hook is in
 * place for the first mount.
 *
 * @returns a disconnect function
 */
export function connectRasenDevTools(
  options: ConnectRasenDevToolsOptions = {},
): () => void {
  const g = globalThis as Record<string, unknown>
  const host = options.host ?? (g.RASEN_DEVTOOLS_HOST as string | undefined) ?? 'http://localhost'
  const port = options.port !== undefined
    ? options.port
    : (g.RASEN_DEVTOOLS_PORT as number | undefined) ?? 8099
  const fullHost = port != null ? `${host}:${port}` : host
  const verbose = options.verbose !== false

  // Install the instrumentation hook so element() records render times.
  setDevtoolsHook({
    renderStart: () => {},
    renderEnd: (tagName, elapsedMs) => recordRender(tagName, elapsedMs),
  })

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log('[rasen] connecting devtools →', fullHost)
  }

  const socket = io(fullHost, { transports: ['websocket'] })

  socket.on('connect', () => {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('[rasen] devtools connected')
    }
  })

  // ── RPC endpoints ────────────────────────────────────────────────
  socket.on('rasen:getTree', (ack: (tree: unknown) => void) => {
    const doc = RNDocument.getOrCreate(1)
    ack(collectNodeTree(doc))
  })

  socket.on('rasen:getPerf', (ack: (perf: unknown) => void) => {
    ack(collectPerf())
  })

  socket.on('rasen:resetPerf', (ack?: () => void) => {
    resetPerf()
    ack?.()
  })

  return () => {
    setDevtoolsHook(null)
    socket.disconnect()
  }
}