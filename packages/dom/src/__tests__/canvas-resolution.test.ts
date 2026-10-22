/**
 * The DOM canvas bridge must tell the 2D renderer the device-pixel ratio.
 *
 * `canvas()` sizes the backing store to `cssSize * dpr`, and canvas-2d draws in
 * CSS pixels with a base transform of `resolution`. Leaving it at its default of
 * 1 draws CSS coordinates into a buffer `dpr` times larger, so the whole scene
 * lands at `1/dpr` size in the top-left corner — visible only on a dpr > 1
 * display, which is exactly why it survived so long.
 */

import { describe, expect, it, vi } from 'vitest'

const created: Array<{ options: Record<string, unknown> | undefined }> = []

vi.mock('@rasenjs/canvas-2d', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rasenjs/canvas-2d')>()
  return {
    ...actual,
    createRoot: (_ctx: unknown, options?: Record<string, unknown>) => {
      created.push({ options })
      return actual.createRoot(_ctx as never, options as never)
    },
  }
})

import { canvas } from '../components/canvas'

describe('the canvas bridge and the device pixel ratio', () => {
  it('passes the window\'s dpr to the 2D renderer', () => {
    const original = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    created.length = 0
    // jsdom has no canvas backend: give the bridge a context shaped like a 2D
    // one, which is all it inspects before handing it to the renderer.
    const fake = {
      canvas: { width: 0, height: 0 },
      setTransform() {},
      clearRect() {},
      save() {},
      restore() {},
      scale() {},
      translate() {},
    }
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => fake) as never

    const host = document.createElement('div')
    document.body.appendChild(host)
    const mount = canvas({ width: 200, height: 100, children: [] })
    const unmount = mount(host)
    const options = created[0]?.options

    expect(options?.resolution).toBe(2)
    // The buffer is the CSS size times the same ratio, which is why the renderer
    // has to be told about it.
    const el = host.querySelector('canvas')!
    expect(el.width).toBe(400)
    expect(el.style.width).toBe('200px')

    unmount?.()
    host.remove()
    HTMLCanvasElement.prototype.getContext = getContext
    Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
  })
})
