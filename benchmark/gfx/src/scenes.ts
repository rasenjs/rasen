/**
 * Deterministic batch-renderer scene — the fixture for the gfx safety net.
 *
 * Exercises every path the WebGL2 perf refactor touches:
 *   - multi-texture batching (4 textures → contiguous-run group splits)
 *   - blend modes (normal / additive / multiply / screen → group splits)
 *   - premultiplied-alpha items (blend factor swap)
 *   - CPU vertex transform (translation + rotation matrices)
 *   - solid-color (untextured) items
 *
 * Content is STATIC and deterministic (i-based formulas, no randomness, no
 * time dependence) so consecutive frames rasterize identical pixels — that is
 * what makes the golden-image lock meaningful.
 *
 * Exposed API (consumed by golden.mjs / probe-gl-stats.mjs):
 *   window.__gfxReady      — resolves when the scene is set up and drawn once
 *   window.__gfx.canvas    — the canvas element
 *   window.__gfx.gl        — the GL context (probe reads GPU renderer string)
 *   window.__gfx.drawFrames(n) — wait n rendered frames, resolve with frame
 *                                delta stats { deltas: number[] }
 */
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { createRoot, createNode, getRenderContext } from '@rasenjs/gfx'
import { Mat4x4f } from '@rasenjs/math'
import type { GlContext } from '@rasenjs/gfx'

useReactiveRuntime()

const SIZE = 512
const QUADS = 1200

// ---------------------------------------------------------------------------
// Deterministic textures (16×16 offscreen canvases, i-based patterns)
// ---------------------------------------------------------------------------

function makeTextureCanvas(id: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const g = c.getContext('2d')!
  // Distinct hue per texture id + checker pattern (deterministic pixels).
  const hue = id * 72
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const checker = (x + y) % 2 === 0
      g.fillStyle = `hsl(${hue}, 80%, ${checker ? 60 : 35}%)`
      g.fillRect(x, y, 1, 1)
    }
  }
  return c
}

/** Column-major model matrix: rotationZ(θ) ∘ translation(x, y). */
function mat(x: number, y: number, rot: number): Mat4x4f {
  const m = new Mat4x4f()
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const s = m.source
  s[0] = cos; s[1] = sin; s[2] = 0; s[3] = 0
  s[4] = -sin; s[5] = cos; s[6] = 0; s[7] = 0
  s[8] = 0; s[9] = 0; s[10] = 1; s[11] = 0
  s[12] = x; s[13] = y; s[14] = 0; s[15] = 1
  return m
}

/** Two-triangle quad centered on the origin, size (w, h). */
function quad(w: number, h: number): Float32Array {
  const hw = w / 2
  const hh = h / 2
  return new Float32Array([
    -hw, -hh, 0, hw, -hh, 0, -hw, hh, 0,
    hw, -hh, 0, hw, hh, 0, -hw, hh, 0
  ])
}

function uvQuad(): Float32Array {
  return new Float32Array([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0])
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById('stage') as HTMLCanvasElement
// WebGL2-first: prefer webgl2, fall back to webgl (same policy as the dom bridge).
const gl = (canvas.getContext('webgl2') ??
  canvas.getContext('webgl')) as unknown as GlContext
if (!gl) throw new Error('No WebGL context available')

const textures: WebGLTexture[] = []
for (let id = 0; id < 4; id++) {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeTextureCanvas(id))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  textures.push(tex)
}

const root = createRoot(gl, {
  logicalWidth: SIZE,
  logicalHeight: SIZE,
  clearColor: '#101018',
  continuousRender: true
})

createNode(root, {
  draw: () => {
    const rc = getRenderContext(gl)
    const uv = uvQuad()
    const white = { r: 1, g: 1, b: 1, a: 1 }

    for (let i = 0; i < QUADS; i++) {
      const tex = textures[i % 4]
      const blendMode = i % 23 === 0 ? 'additive' : i % 37 === 0 ? 'multiply' : i % 53 === 0 ? 'screen' : 'normal'
      const x = 16 + (i * 97) % (SIZE - 32)
      const y = 16 + (i * 211) % (SIZE - 32)
      const size = 6 + (i % 5) * 3
      const rot = i % 7 === 0 ? (i % 21) * 0.1 : 0
      rc.addShape(
        'scene',
        quad(size, size),
        white,
        mat(x, y, rot),
        uv,
        tex,
        undefined, // vertexColors
        undefined, // depthWrite
        undefined, // normals
        0,         // layer
        true,      // skipTonemap (deterministic colors, no ACES)
        undefined, // premultiplied
        blendMode as 'normal' | 'additive' | 'multiply' | 'screen'
      )
    }

    // A few PMA items (blend factor swap path) + solid-color items (no texture).
    for (let k = 0; k < 6; k++) {
      rc.addShape(
        'scene',
        quad(20, 20),
        { r: 0.2, g: 0.9, b: 0.4, a: 0.8 },
        mat(40 + k * 70, 480, 0),
        uv,
        textures[k % 4],
        undefined, undefined, undefined, 0, true,
        true, // premultiplied
        'normal'
      )
    }
    for (let k = 0; k < 4; k++) {
      rc.addShape(
        'scene',
        quad(14, 14),
        { r: 1, g: 0.4, b: 0.2, a: 1 },
        mat(460, 60 + k * 40, 0)
      )
    }
  },
  deps: () => []
})

// ---------------------------------------------------------------------------
// Public API for the probe / golden scripts
// ---------------------------------------------------------------------------

const frameDeltas: number[] = []
let lastT = 0

function tick(t: number): void {
  if (lastT > 0) frameDeltas.push(t - lastT)
  lastT = t
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

async function drawFrames(n: number): Promise<{ deltas: number[] }> {
  const start = frameDeltas.length
  await new Promise<void>((resolve) => {
    const wait = (): void => {
      if (frameDeltas.length - start >= n) resolve()
      else requestAnimationFrame(wait)
    }
    requestAnimationFrame(wait)
  })
  return { deltas: frameDeltas.slice(start, start + n) }
}

;(window as unknown as Record<string, unknown>).__gfx = {
  canvas,
  gl,
  drawFrames
}
;(window as unknown as Record<string, unknown>).__gfxReady = new Promise<void>((resolve) => {
  // First frame is drawn by the continuous loop; resolve after two frames so
  // shaders are compiled and buffers warmed.
  let frames = 0
  const wait = (): void => {
    if (++frames >= 3) resolve()
    else requestAnimationFrame(wait)
  }
  requestAnimationFrame(wait)
})
