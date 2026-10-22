/**
 * model-test — the single-model rendering inspection page.
 *
 * One staged character model on one canvas, one variable at a time:
 *
 * - `model` picks the model, `count` places 1..8 instances (the batching
 *   stress axis), `mode` swaps the draw pass: the textured path (the SAME
 *   `Gr2Model` element the game's actor layer submits), UVs painted as
 *   red/green (settles "is the UV wrong" with no texture in the picture),
 *   normals as colors, or textured with UVs clamped to [0,1].
 * - `swap=<modelKey>` draws this model's parts with ANOTHER model's first
 *   texture — the pair test that separates "the parts are wrong" from "the
 *   texture is wrong".
 *
 * The camera is fitted to the model's own bounds on load and fully free
 * after that: drag rotates, shift/right-drag pans, the wheel zooms, and the
 * auto-orbit toggle spins it. Every case is a URL (`?model=&count=&mode=&
 * swap=&rot=`) so a screenshot is reproducible; `window.__modelTest` exposes
 * the decoded geometry's numbers for probes.
 */

import { com } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import type { PropValue } from '@rasenjs/core'
import { DEFAULT_FRAGMENT_SHADER, DEFAULT_VERTEX_SHADER, element, group, unref, type CameraConfig, type GfxNode } from '@rasenjs/gfx'
import { ref } from '@rasenjs/reactive-signals'
import { MODEL_SOURCES, loadModelParts, Gr2Model, type PartSpec } from './three-d/model'

const WIDTH = 960
const HEIGHT = 640
const WHITE = { r: 1, g: 1, b: 1, a: 1 }

const CANVAS_STYLE = { display: 'block', touchAction: 'none' }
const RENDER_OPTIONS = { clearColor: '#22262c' }
const CONTEXT_OPTIONS = { alpha: true, preserveDrawingBuffer: true }

const params = new URLSearchParams(location.search)
const modelKey = params.get('model') ?? 'amazon-head'
const swapKey = params.get('swap')
const count = Math.max(1, Math.min(8, Number(params.get('count') ?? '1')))
const mode = params.get('mode') ?? 'textured'

// ---------------------------------------------------------------------------
// Camera state — fitted on load, free afterwards
// ---------------------------------------------------------------------------

const yaw = ref((Number(params.get('rot') ?? '0') * Math.PI) / 180)
const pitch = ref(0.35)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const tick = ref(0)
/** Model-space point the camera looks at, and the distance that frames it. */
let target = { x: 0, y: 0, z: 0 }
let radius = 1

const camera = (): CameraConfig => {
  tick.value
  const d = (radius * 2.8) / zoom.value
  const cy = Math.cos(pitch.value)
  return {
    x: target.x + Math.sin(yaw.value) * d * cy + panX.value,
    y: target.y + Math.sin(pitch.value) * d + panY.value,
    z: target.z + Math.cos(yaw.value) * d * cy,
    target: { x: target.x + panX.value, y: target.y + panY.value, z: target.z },
    fov: Math.PI / 4,
    near: Math.max(d / 1000, 0.01),
    far: d * 40,
  }
}

function attachCameraControls(stage: HTMLElement): void {
  let dragging: 'orbit' | 'pan' | null = null
  let lastX = 0
  let lastY = 0
  stage.addEventListener('pointerdown', (e) => {
    dragging = e.shiftKey || e.button === 2 ? 'pan' : 'orbit'
    lastX = e.clientX
    lastY = e.clientY
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', (e) => {
    if (dragging === null) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    if (dragging === 'orbit') {
      yaw.value -= dx * 0.008
      pitch.value = Math.max(-1.35, Math.min(1.35, pitch.value + dy * 0.008))
    } else {
      const k = radius * 0.0025 / zoom.value
      panX.value -= dx * k
      panY.value += dy * k
    }
    tick.value = tick.value + 1
  })
  const stop = (): void => {
    dragging = null
  }
  stage.addEventListener('pointerup', stop)
  stage.addEventListener('pointercancel', stop)
  stage.addEventListener('contextmenu', (e) => e.preventDefault())
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      zoom.value = Math.max(0.05, Math.min(20, zoom.value * (e.deltaY > 0 ? 0.9 : 1.1)))
      tick.value = tick.value + 1
    },
    { passive: false },
  )
}

// ---------------------------------------------------------------------------
// Calibration quad — a texture and UVs both fully known, so "is the model or
// the pipeline at fault" can be answered on ANY machine from one screenshot
// ---------------------------------------------------------------------------

function gridTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#c23' : '#26c'
      ctx.fillRect(x * 32, y * 32, 32, 32)
    }
  }
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 28px monospace'
  ctx.fillText('U 0\u21921', 8, 34)
  ctx.fillText('V 0\u21921', 130, 240)
  return c
}

const GRID_QUAD: PartSpec = (() => {
  const s = 1.4
  return {
    vertices: new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, -s, 0, s, s, 0, -s, s, 0]),
    uv: new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    normalColors: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    textureSource: gridTexture(),
  }
})()

/**
 * Compile the batch's own shaders on THIS machine's GL and report the log.
 * An empty canvas with correct geometry elsewhere usually means the shader
 * never compiled — which is silent by default and invisible from outside.
 */
function shaderReport(): string {
  const probe = document.createElement('canvas')
  const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null
  if (gl === null) return 'no context'
  const try1 = (type: number, source: string): string => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, source)
    gl.compileShader(sh)
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) as boolean
    const log = gl.getShaderInfoLog(sh) ?? ''
    gl.deleteShader(sh)
    return ok ? 'ok' : `FAIL: ${log.slice(0, 220)}`
  }
  return `vs[${try1(gl.VERTEX_SHADER, DEFAULT_VERTEX_SHADER)}] fs[${try1(gl.FRAGMENT_SHADER, DEFAULT_FRAGMENT_SHADER)}]`
}

/** What this machine's GL stack reports — the one fact I cannot see remotely. */
function gpuReport(): string {
  const probe = document.createElement('canvas')
  const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null
  if (gl === null) return 'no webgl context'
  const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null
  const name = ext !== null ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : 'renderer hidden'
  return `${gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1'} · ${name}`
}

// ---------------------------------------------------------------------------
// Draw passes
// ---------------------------------------------------------------------------

/** Textured pass with UVs clamped into [0,1] — isolates the u>1 tiling. */
const ClampedTextureParts = (props: { parts: PropValue<PartSpec[]>; flipV?: boolean; uSwap?: boolean; uFlip?: boolean }) =>
  element({
    getBounds: () => null,
    draw: (node: GfxNode) => {
      const transform = node.getCurrentTransform()
      for (const part of unref(props.parts)) {
        const uv = new Float32Array(part.uv.length)
        for (let i = 0; i < uv.length; i += 1) uv[i] = Math.min(1, Math.max(0, part.uv[i]))
        if (props.flipV === true) {
          for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]
        }
        if (props.uSwap === true) {
          for (let i = 0; i < uv.length; i += 2) {
            const t = uv[i]
            uv[i] = uv[i + 1]
            uv[i + 1] = t
          }
        }
        if (props.uFlip === true) {
          for (let i = 0; i < uv.length; i += 2) uv[i] = 1 - uv[i]
        }
        const texture = node.createTexture(part.textureSource ?? new ImageData(1, 1), { wrapS: 0x2901, wrapT: 0x2901 })
        node.addShape('clamped', part.vertices, WHITE, transform, uv, texture, undefined, undefined, undefined)
      }
    },
    deps: () => [unref(props.parts)],
  })

/** One element painting every part with per-vertex colors from uv or normals. */
const DebugParts = (props: { parts: PropValue<PartSpec[]>; source: 'uv' | 'normals' }) =>
  element({
    getBounds: () => null,
    draw: (node: GfxNode) => {
      const transform = node.getCurrentTransform()
      for (const part of unref(props.parts)) {
        const vertexCount = part.vertices.length / 3
        const colors = new Float32Array(part.vertices.length)
        if (props.source === 'uv') {
          for (let v = 0; v < vertexCount; v += 1) {
            colors[v * 3] = part.uv[v * 2]
            colors[v * 3 + 1] = part.uv[v * 2 + 1]
            colors[v * 3 + 2] = 0
          }
        } else {
          colors.set(part.normalColors)
        }
        node.addShape('model-test', part.vertices, WHITE, transform, undefined, null, colors, undefined, undefined)
      }
    },
    deps: () => [unref(props.parts)],
  })

/** One flat quad per unique texture, so the decode itself is on trial. */
function atlasQuads(parts: PartSpec[]): PartSpec[] {
  const seen = new Map<HTMLCanvasElement, PartSpec>()
  for (const part of parts) {
    const tex = part.textureSource
    if (tex === null || seen.has(tex)) continue
    const s = 1.2
    seen.set(tex, {
      vertices: new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, -s, 0, s, s, 0, -s, s, 0]),
      uv: new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]),
      normals: new Float32Array(18).fill(0),
      normalColors: new Float32Array(18).fill(0.5),
      textureSource: tex,
    })
  }
  return [...seen.values()]
}

// `com` must be called at module top level (vite-plugin-rasen's HMR contract).
const App = com((props: { parts: PartSpec[]; source: 'uv' | 'normals' | 'textured' | 'clamped' | 'grid' | 'vflip' | 'uswap' | 'uflip' | 'atlas' | 'pbr' }) => {
  const style = CANVAS_STYLE
  const renderOptions = RENDER_OPTIONS
  const contextOptions = CONTEXT_OPTIONS
  // One group per instance, spread in a row when count > 1.
  const children = []
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * radius * 2.2
    const draw =
      props.source === 'grid'
        ? ClampedTextureParts({ parts: [GRID_QUAD] })
        : props.source === 'atlas'
          ? ClampedTextureParts({ parts: props.parts })
        : props.source === 'vflip'
          ? ClampedTextureParts({ parts: props.parts, flipV: true })
          : props.source === 'uswap'
            ? ClampedTextureParts({ parts: props.parts, uSwap: true })
            : props.source === 'uflip'
              ? ClampedTextureParts({ parts: props.parts, uFlip: true })
              : props.source === 'clamped'
        ? ClampedTextureParts({ parts: props.parts })
        : props.source === 'textured'
          ? Gr2Model({ parts: props.parts, normalsMode: false, orbit: tick })
          : props.source === 'pbr'
            ? Gr2Model({ parts: props.parts, normalsMode: false, pbr: true, order: 0, orbit: tick })
            : DebugParts({ parts: props.parts, source: props.source })
    children.push(group({ x: spread, children: [draw] }))
  }
  return (
    <div style={{ position: 'absolute', left: '0px', top: '0px' }}>
      <canvas
        width={WIDTH}
        height={HEIGHT}
        contextType="webgl"
        contextOptions={contextOptions}
        camera={camera}
        renderOptions={renderOptions}
        style={style}
      >
        {children}
      </canvas>
    </div>
  )
})

function buildControls(): void {
  const modelSelect = document.getElementById('model') as HTMLSelectElement
  for (const source of MODEL_SOURCES) {
    const option = document.createElement('option')
    option.value = source.id
    option.textContent = `${source.label} (${source.id})`
    if (source.id === modelKey) option.selected = true
    modelSelect.append(option)
  }
  const countInput = document.getElementById('count') as HTMLInputElement
  countInput.value = String(count)
  const modeSelect = document.getElementById('mode') as HTMLSelectElement
  modeSelect.value = mode

  // Model/count/mode navigate (a URL is a test case); the camera controls are
  // live and never navigate.
  const navigate = (): void => {
    location.search = new URLSearchParams({
      model: modelSelect.value,
      count: countInput.value,
      mode: modeSelect.value,
      rot: String((((yaw.value * 180) / Math.PI) % 360 + 360) % 360),
    }).toString()
  }
  modelSelect.addEventListener('change', navigate)
  countInput.addEventListener('change', navigate)
  modeSelect.addEventListener('change', navigate)
}

async function main(): Promise<void> {
  buildControls()
  const stage = document.getElementById('stage')!
  const status = document.getElementById('status')!
  const loaded = await loadModelParts(modelKey)
  if (loaded === null) {
    status.textContent = `model "${modelKey}" is not staged (check tools/copy-gr2-samples.ts / stage-npc-models.ts)`
    return
  }

  // Fit the camera to the model's own bounds — the page must never open on
  // empty space no matter which model is selected.
  const atlasCount = mode === 'atlas' ? new Set(loaded.parts.map((part) => part.textureSource)).size : 1
  const b =
    mode === 'grid'
      ? { minX: -1.5, minY: -1.5, minZ: -1, maxX: 1.5, maxY: 1.5, maxZ: 1 }
      : mode === 'atlas'
        ? { minX: -1.5 - atlasCount, minY: -1.5, minZ: -1, maxX: 1.5 + atlasCount, maxY: 1.5, maxZ: 1 }
        : loaded.bounds
  target = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 }
  radius = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2 || 1

  let uvMinU = Infinity
  let uvMaxU = -Infinity
  let uvMinV = Infinity
  let uvMaxV = -Infinity
  let vertices = 0
  for (const part of loaded.parts) {
    vertices += part.vertices.length / 3
    for (let i = 0; i < part.uv.length; i += 2) {
      if (part.uv[i] < uvMinU) uvMinU = part.uv[i]
      if (part.uv[i] > uvMaxU) uvMaxU = part.uv[i]
      if (part.uv[i + 1] < uvMinV) uvMinV = part.uv[i + 1]
      if (part.uv[i + 1] > uvMaxV) uvMaxV = part.uv[i + 1]
    }
  }
  // The probe reports what the texture CANVASES contain — the drawn result
  // and the loaded data are separate facts and this page keeps them apart.
  const texStats = loaded.parts.map((part) => {
    const src = part.textureSource
    if (src === null) return { width: 0, height: 0, avg: null }
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let r = 0
    let g = 0
    let bl = 0
    let a = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      g += d[i + 1]
      bl += d[i + 2]
      a += d[i + 3]
    }
    const n = d.length / 4
    return { width: src.width, height: src.height, avg: [r / n, g / n, bl / n, a / n] }
  })
  ;(window as unknown as { __modelTest: unknown }).__modelTest = {
    texStats,
    modelKey,
    count,
    mode,
    parts: loaded.parts.length,
    vertices,
    uvRange: [uvMinU, uvMaxU, uvMinV, uvMaxV],
    url: loaded.url,
    bounds: loaded.bounds,
  }
  // Debug hook: export the first texture canvas as a PNG data URL, so the
  // browser's own decode can be compared with the node decode pixel-for-pixel.
  ;(window as unknown as { __texDump: () => string | null }).__texDump = () => {
    const src = loaded.parts.find((part) => part.textureSource !== null)?.textureSource
    return src === undefined || src === null ? null : src.toDataURL()
  }
  document.getElementById('readout')!.textContent =
    `${loaded.parts.length} parts · ${vertices} verts · uv u[${uvMinU.toFixed(2)}, ${uvMaxU.toFixed(2)}] v[${uvMinV.toFixed(2)}, ${uvMaxV.toFixed(2)}]`

  // Swap mode: this model's parts with ANOTHER model's first texture.
  let parts = loaded.parts
  if (mode === 'atlas') {
    parts = atlasQuads(loaded.parts).map((part, i, all) => ({
      ...part,
      vertices: part.vertices.map((v, k) => (k % 3 === 0 ? v + (i - (all.length - 1) / 2) * 2.8 : v)) as Float32Array,
    }))
    ;(window as unknown as { __modelTest: { atlasCount: number } }).__modelTest.atlasCount = parts.length
  }
  if (swapKey !== null) {
    const other = await loadModelParts(swapKey)
    if (other !== null && other.parts[0]?.textureSource != null) {
      parts = loaded.parts.map((part) => ({ ...part, textureSource: other.parts[0].textureSource }))
    }
  }

  mount(App({ parts, source: mode as never }), stage)
  attachCameraControls(stage)

  // Auto-orbit advances the yaw and repaints through the camera's tick dep.
  const spin = document.getElementById('spin') as HTMLInputElement
  const rotInput = document.getElementById('rot') as HTMLInputElement
  const syncRotSlider = (): void => {
    rotInput.value = String((((yaw.value * 180) / Math.PI) % 360 + 360) % 360)
  }
  rotInput.addEventListener('input', () => {
    yaw.value = (Number(rotInput.value) * Math.PI) / 180
    tick.value = tick.value + 1
  })
  const frame = (): void => {
    if (spin.checked) {
      yaw.value += 0.006
      syncRotSlider()
      tick.value = tick.value + 1
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  status.dataset.filled = '1'
  status.textContent =
    `drag = orbit · shift/right-drag = pan · wheel = zoom · ${count} × ${modelKey} · GL: ${gpuReport()} · shaders ${shaderReport()}` +
    (swapKey !== null ? ` (textures from ${swapKey})` : '')
}

void main()
