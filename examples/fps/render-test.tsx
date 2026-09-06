/**
 * Minimal render-layer test — isolates the reactive → render update chain.
 *
 * Drives a single billboard + camera directly and verifies that render
 * output updates when:
 *   1. billboard position ref changes
 *   2. camera yaw/pitch ref changes (billboard must re-face the camera)
 *   3. billboard visible ref toggles
 *   4. billboard texture ref changes
 *   5. billboard is unmounted entirely (each-style removal)
 *
 * The render context is forced via `manualUpdate()` between steps because
 * the automated browser may not run rAF. All state is exposed on
 * `window.__rt`.
 */

import { configureTags, com } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import { ref } from '@rasenjs/reactive-signals'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { billboard, getRenderContext, type CameraConfig } from '@rasenjs/webgl'
import { forwardVector } from '@rasenjs/math'

useReactiveRuntime()
configureTags({ '': { billboard } })

const log = document.getElementById('log')!

// --- Reactive state ---
const eye = ref({ x: 0, y: 1.6, z: 0 })
const yaw = ref(0)
const pitch = ref(0)
const bx = ref(0)
const by = ref(1.6)
const bz = ref(-4)
const bVisible = ref(true)
const bTexture = ref(makeTex('#ff0000'))

// Camera config from yaw/pitch (replaces the FirstPersonCamera component).
// A plain getter keeps it reactive while avoiding the ComputedRef/PropValue
// structural mismatch.
const camera = (): CameraConfig => {
  const ep = eye.value
  const fwd = forwardVector(yaw.value, pitch.value)
  return {
    x: ep.x, y: ep.y, z: ep.z,
    target: { x: ep.x + fwd.x, y: ep.y + fwd.y, z: ep.z + fwd.z },
    fov: (80 * Math.PI) / 180,
    near: 0.1,
    far: 200,
  }
}

function makeTex(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#fff'
  ctx.fillRect(24, 24, 16, 16)
  return c
}

// Draw counters — patch the batch renderer to count billboard submissions
let lastBatchCount = 0

const App = com((_p: unknown) => {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas width={800} height={600} contextType="webgl2"
        camera={camera}
        contextOptions={{ clearColor: '#87CEEB', preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%', display: 'block' }}>
        <billboard x={bx} y={by} z={bz} width={0.5} height={0.5} texture={bTexture} visible={bVisible} mode="full" />
      </canvas>
    </div>
  )
})

mount(App({}), document.getElementById('app')!)

const canvasEl = document.querySelector('canvas')!
const gl = canvasEl.getContext('webgl2')!
const rc = getRenderContext(gl)

// Read the actual pixel color at a screen position (canvas Y is flipped).
function pixelAt(sx: number, sy: number): [number, number, number, number] {
  const px = new Uint8Array(4)
  gl.readPixels(Math.round(sx), Math.round(sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
  return [px[0], px[1], px[2], px[3]]
}

// Hue-based color counts (robust to ACES tonemapping).
function countHue(kind: 'red' | 'green' | 'blue' | 'magenta'): number {
  const w = canvasEl.width, h = canvasEl.height
  const px = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
  let n = 0
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max - min < 24) continue // grey-ish, skip
    const hueOk =
      kind === 'red' ? r > 90 && r > g * 2 && r > b * 2 :
      kind === 'green' ? g > 90 && g > r * 2 && g > b * 2 :
      kind === 'blue' ? b > 90 && b > r * 2 && b > g * 2 :
      r > 90 && b > 90 && g < max * 0.7 && r > g * 1.5 && b > g * 1.5
    if (hueOk) n++
  }
  return n
}

// --- Debug harness ---
;(window as unknown as { __rt: unknown }).__rt = {
  state: () => ({ bx: bx.value, by: by.value, bz: bz.value, visible: bVisible.value, yaw: yaw.value, pitch: pitch.value }),
  move: (x: number, y: number, z: number) => { bx.value = x; by.value = y; bz.value = z; },
  rotate: (y: number, p: number) => { yaw.value = y; pitch.value = p; },
  setVisible: (v: boolean) => { bVisible.value = v; },
  setTexture: (color: string) => { bTexture.value = makeTex(color); },
  render: () => rc.manualUpdate(),
  countRed: () => countHue('red'),
  countGreen: () => countHue('green'),
  countBlue: () => countHue('blue'),
  countMagenta: () => countHue('magenta'),
  batchCount: () => {
    // Batch items that remain queued after a render (should be small)
    return rc.batchRenderer ? rc.batchRenderer.getBatchItems().length : -1
  },
}

log.textContent = 'render-test ready'
