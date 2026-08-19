/**
 * @rasenjs/react-native — devtools client tests.
 *
 * Verifies connectRasenDevTools() installs the instrumentation hook and
 * registers the RPC handlers (socket.io mocked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDevtoolsHook, setDevtoolsHook, collectPerf } from '../instrument'

// Mock socket.io-client before importing the module under test.
const mockOn = vi.fn()
const mockDisconnect = vi.fn()
const mockIo = vi.fn((_url: string, _opts: unknown) => ({
  on: mockOn,
  disconnect: mockDisconnect,
}))

vi.mock('socket.io-client', () => ({
  default: (url: string, opts: unknown) => mockIo(url, opts),
}))

import { connectRasenDevTools } from '../index'

describe('connectRasenDevTools', () => {
  beforeEach(() => {
    setDevtoolsHook(null)
    mockOn.mockClear()
    mockDisconnect.mockClear()
    mockIo.mockClear()
  })

  it('installs the instrumentation hook', () => {
    const disconnect = connectRasenDevTools({ verbose: false })
    expect(getDevtoolsHook()).not.toBeNull()
    disconnect()
  })

  it('connects to the default host and port', () => {
    connectRasenDevTools({ verbose: false })
    expect(mockIo).toHaveBeenCalledWith(
      'http://localhost:8099',
      expect.objectContaining({ transports: ['websocket'] }),
    )
  })

  it('honors custom host and port', () => {
    connectRasenDevTools({ host: 'http://10.0.2.2', port: 9000, verbose: false })
    expect(mockIo).toHaveBeenCalledWith(
      'http://10.0.2.2:9000',
      expect.anything(),
    )
  })

  it('registers the RPC handlers', () => {
    connectRasenDevTools({ verbose: false })
    expect(mockOn).toHaveBeenCalledWith('rasen:getTree', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('rasen:getPerf', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('rasen:resetPerf', expect.any(Function))
  })

  it('the hook records render stats', () => {
    connectRasenDevTools({ verbose: false })
    const hook = getDevtoolsHook()!
    hook.renderStart?.('View')
    hook.renderEnd?.('View', 2.5)
    const perf = collectPerf()
    const view = perf.find(s => s.tagName === 'View')
    expect(view?.count).toBe(1)
    expect(view?.totalMs).toBeCloseTo(2.5)
  })

  it('disconnect removes the hook and disconnects the socket', () => {
    const disconnect = connectRasenDevTools({ verbose: false })
    disconnect()
    expect(getDevtoolsHook()).toBeNull()
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
