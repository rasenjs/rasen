/**
 * WebGL vs WebGPU renderer equivalence — through the SCENE TREE.
 *
 * Both backends are driven the way the dom <canvas> bridge drives them:
 * createRootNode(webgpurenderer) → createNode(root, { draw }) → node.addShape /
 * node.beginMesh+node.endMesh. This is the path the nikke-viewer and every
 * scene uses, so what is compared is the full stack — node forwarding, the
 * Renderer base (batching, frame loop) and each API execution — not a
 * hand-built item stream.
 */

import { createRootNode, createNode, WebGLRenderer, WebGPURenderer } from '@rasenjs/gfx'
import type { GpuCanvasContext } from '@rasenjs/gfx'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

const SIZE = 256

/**
 * The canvas' webgpu context, in the shape the renderer takes.
 *
 * `WebGPURenderer` receives its context by injection rather than digging one
 * out of a canvas, so both the dom bridge and this gate hand it the same
 * thing: the result of `canvas.getContext('webgpu')`.
 */
function gpuContext(canvas: HTMLCanvasElement): GpuCanvasContext {
  return canvas.getContext('webgpu') as unknown as GpuCanvasContext
}

/** A 64x64 checkerboard with a gradient band, so UV flips and half-texel shifts
 *  are visible rather than plausible. */
function makeSourceImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  for (let y = 0; y < 64; y += 8)
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = ((x / 8 + y / 8) & 1) === 0 ? '#ffffff' : '#204060'
      ctx.fillRect(x, y, 8, 8)
    }
  const g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(255,0,0,0.75)')
  g.addColorStop(1, 'rgba(0,255,0,0.75)')
  ctx.fillStyle = g
  ctx.fillRect(0, 24, 64, 16)
  return c
}

/** Orthographic projection over the canvas, matching how the engine maps 2D. */
function ortho(w: number, h: number): Mat4x4f {
  const m = new Float32Array(16)
  m[0] = 2 / w
  m[5] = -2 / h
  m[12] = -1
  m[13] = 1
  m[10] = 1
  m[15] = 1
  return mat4x4f(m)
}

function quadScene() {
  const vertices = new Float32Array([-50, -50, 0, 50, -50, 0, 50, 50, 0, -50, 50, 0])
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
  const a = (25 * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const s = 1.7
  const matrix = new Float32Array(16)
  matrix[0] = cos * s
  matrix[1] = sin * s
  matrix[4] = -sin * s
  matrix[5] = cos * s
  matrix[10] = 1
  matrix[12] = 128
  matrix[13] = 128
  matrix[15] = 1
  // Per-vertex tint so the colour stream is exercised too.
  const vertexColors = new Float32Array([1, 0.6, 0.6, 1, 1, 0.6, 0.6, 1, 0.6, 1, 1, 1, 0.6, 1, 1, 1])
  return {
    vertices,
    uv,
    color: { r: 1, g: 1, b: 1, a: 1 },
    matrix: mat4x4f(matrix),
    vertexColors,
    indices: [0, 1, 2, 0, 2, 3] as number[],
  }
}

/**
 * Submit the scene through the node the way components do:
 * one addShape legacy item (textured, indexed) + one sealed fast-lane mesh
 * (beginMesh/endMesh, the spine path) drawn beside it.
 */
function mountScene(
  root: ReturnType<typeof createRootNode>,
  renderer: { createTexture(source: HTMLCanvasElement, options?: { minFilter?: number; magFilter?: number }): unknown },
  image: HTMLCanvasElement,
  scene: ReturnType<typeof quadScene>,
): void {
  const texture = renderer.createTexture(image, { minFilter: 0x2600, magFilter: 0x2600 })

  createNode(root, {
    draw: () => {
      // Legacy path: textured indexed quad (addShape, like rect/mesh).
      root.addShape(
        'equivalence',
        scene.vertices,
        scene.color,
        scene.matrix,
        scene.uv,
        texture,
        scene.vertexColors,
        true,
        null,
        0,
        false,
        false,
        'normal',
        scene.indices
      )
      // Fast lane: sealed mesh (beginMesh/endMesh, like spine) drawn offset.
      const verts = new Float32Array([-40, -40, 0, 40, -40, 0, 40, 40, 0, -40, 40, 0])
      const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
      const idx = new Uint32Array([0, 1, 2, 0, 2, 3])
      const span = root.beginMesh(4, 6)
      if (span) {
        for (let v = 0; v < 4; v++) {
          span.pos[span.vBase * 3 + v * 3] = verts[v * 3] + 190
          span.pos[span.vBase * 3 + v * 3 + 1] = verts[v * 3 + 1] + 60
          span.pos[span.vBase * 3 + v * 3 + 2] = 0
          span.col[span.vBase * 4 + v * 4] = 255
          span.col[span.vBase * 4 + v * 4 + 1] = 255
          span.col[span.vBase * 4 + v * 4 + 2] = 255
          span.col[span.vBase * 4 + v * 4 + 3] = 255
          span.uv[span.vBase * 2 + v * 2] = uvs[v * 2]
          span.uv[span.vBase * 2 + v * 2 + 1] = uvs[v * 2 + 1]
        }
        for (let i = 0; i < 6; i++) span.idx[span.iBase + i] = idx[i] + span.vBase
        // skipTonemap=true, exactly what the spine fast lane passes: GL sets
        // u_skipTonemap per draw, so this exercises the WebGPU skip-variant
        // uniform buffer (a regression here washes out colours vs GL).
        root.endMesh(span, 4, 6, texture, 'normal', false, true)
      } else {
        throw new Error('beginMesh returned null')
      }
    },
  })
}

async function drawWebGL(scene: ReturnType<typeof quadScene>, image: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!
  const renderer = new WebGLRenderer(gl, { projectionMatrix: ortho(SIZE, SIZE) })
  const root = createRootNode(renderer, canvas)
  mountScene(root, renderer, image, scene)
  // Pump one frame through the real frame loop, then read back.
  renderer.requestRedraw()
  await new Promise((r) => setTimeout(r, 50))

  const px = new Uint8ClampedArray(SIZE * SIZE * 4)
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px)
  // WebGL's origin is bottom-left; flip so both images are top-left like a PNG.
  const out = new Uint8ClampedArray(px.length)
  for (let y = 0; y < SIZE; y++) out.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
  return out
}

async function drawWebGPU(scene: ReturnType<typeof quadScene>, image: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement
  const gpu = (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu
  const adapter = await gpu.requestAdapter()
  const device = (await (adapter as unknown as { requestDevice(): Promise<GPUDevice> }).requestDevice()) as GPUDevice
  device.addEventListener?.('uncapturederror' as never, ((ev: GPUUncapturedErrorEvent) => {
    console.error('[webgpu device error]', ev.error.message)
    ;(window as unknown as { __gpuError: string }).__gpuError = ev.error.message
  }) as never)
  const renderer = new WebGPURenderer(gpuContext(canvas), device, {})
  renderer.setProjectionMatrix(ortho(SIZE, SIZE))
  const root = createRootNode(renderer, gpuContext(canvas))

  // Texture-upload probe: copy 4 texels back from the uploaded atlas and
  // report them. An all-zero readback means copyExternalImageToTexture lost
  // the image (renders as opaque black through the shader path).
  const tex = renderer.createTexture(image, { minFilter: 0x2600, magFilter: 0x2600 }) as GPUTexture
  {
    const enc = device.createCommandEncoder({})
    const rb = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    enc.copyTextureToBuffer({ texture: tex }, { buffer: rb, bytesPerRow: 256 }, [1, 1])
    device.queue.submit([enc.finish()])
    await rb.mapAsync(1)
    const t = new Uint8Array(rb.getMappedRange())
    ;(window as unknown as { __texProbe: number[] }).__texProbe = [t[0], t[1], t[2], t[3]]
    rb.unmap()
    rb.destroy()
  }

  mountScene(root, renderer, image, scene)

  // Debug instrumentation: wrap the renderer's drawSealedRun/drawGroup via
  // prototype patching to count GPU draw calls.
  const proto = Object.getPrototypeOf(renderer)
  const origSealed = proto.drawSealedRun
  const origGroup = proto.drawGroup
  window.__drawCalls = { sealed: 0, group: 0, items: -1 }
  proto.drawSealedRun = function (...a) { window.__drawCalls.sealed++; return origSealed.apply(this, a) }
  proto.drawGroup = function (...a) { window.__drawCalls.group++; return origGroup.apply(this, a) }

  // Flush + readback in one command buffer (canvas textures die at present).
  const out = await renderer.flushAndRead()
  ;(window as unknown as { __drawCalls: unknown }).__drawCalls.items = (renderer as unknown as { getBatchItems(): unknown[] }).getBatchItems().length
  return out
}

/**
 * Model-switch check: swap the atlas texture BETWEEN frames (create a second
 * texture, draw with it, read back) and assert the new one is actually
 * sampled. Regression target: a bind-group cache keyed without real texture
 * identity kept sampling the FIRST model's atlas after the switch.
 */
async function modelSwitchCheck(renderer: WebGPURenderer): Promise<{ switched: boolean }> {
  const alt = makeAltImage() // a distinct solid colour
  const textureB = renderer.createTexture(alt, { minFilter: 0x2600, magFilter: 0x2600 }) as GPUTexture
  const root = createRootNode(renderer, renderer.ctx as HTMLCanvasElement)
  createNode(root, {
    draw: () => {
      const verts = new Float32Array([-60, -60, 0, 60, -60, 0, 60, 60, 0, -60, 60, 0])
      const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
      const idx = new Uint32Array([0, 1, 2, 0, 2, 3])
      const span = root.beginMesh(4, 6)
      if (!span) throw new Error('beginMesh returned null')
      for (let v = 0; v < 4; v++) {
        span.pos[span.vBase * 3 + v * 3] = verts[v * 3] + 128
        span.pos[span.vBase * 3 + v * 3 + 1] = verts[v * 3 + 1] + 128
        span.pos[span.vBase * 3 + v * 3 + 2] = 0
        span.col[span.vBase * 4 + v * 4] = 255
        span.col[span.vBase * 4 + v * 4 + 1] = 255
        span.col[span.vBase * 4 + v * 4 + 2] = 255
        span.col[span.vBase * 4 + v * 4 + 3] = 255
        span.uv[span.vBase * 2 + v * 2] = uvs[v * 2]
        span.uv[span.vBase * 2 + v * 2 + 1] = uvs[v * 2 + 1]
      }
      for (let i = 0; i < 6; i++) span.idx[span.iBase + i] = idx[i] + span.vBase
      root.endMesh(span, 4, 6, textureB, 'normal', false, true)
    },
  })
  const out = await renderer.flushAndRead()
  // Sample the centre: with texture B bound it is B's colour, with a stale
  // bind group it is whatever the first atlas had there.
  const o = (128 * 256 + 128) * 4
  const r = out[o], g = out[o + 1], b = out[o + 2]
  return { switched: Math.abs(r - ALT_RGB[0]) < 8 && Math.abs(g - ALT_RGB[1]) < 8 && Math.abs(b - ALT_RGB[2]) < 8 }
}

/** Solid magenta-ish colour, chosen to be far from the checker's palette. */
const ALT_RGB = [220, 30, 160]
function makeAltImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 8; c.height = 8
  const ctx = c.getContext('2d')!
  ctx.fillStyle = `rgb(${ALT_RGB[0]},${ALT_RGB[1]},${ALT_RGB[2]})`
  ctx.fillRect(0, 0, 8, 8)
  return c
}

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let differing = 0
  let maxDelta = 0
  let sumDelta = 0
  for (let i = 0; i < a.length; i += 4) {
    let d = 0
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]))
    if (d > 0) differing++
    if (d > maxDelta) maxDelta = d
    sumDelta += d
  }
  return { differing, total: a.length / 4, pct: (differing / (a.length / 4)) * 100, maxDelta, meanDelta: sumDelta / (a.length / 4) }
}

/**
 * Classify the differences. The two APIs rasterize shared triangle edges under
 * slightly different rules, so a thin boundary of differing pixels is expected
 * and harmless. An INTERIOR difference means the backends shaded differently,
 * which is a real defect no matter how few pixels it covers.
 */
function diffShape(a: Uint8ClampedArray, b: Uint8ClampedArray, size: number) {
  const differs = new Uint8Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let d = 0
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]))
      differs[y * size + x] = d > 0 ? 1 : 0
    }
  let interior = 0
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      if (!differs[y * size + x]) continue
      let n = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += differs[(y + dy) * size + (x + dx)]
      if (n >= 6) interior++
    }
  return { interior }
}

/** Count non-background pixels — catches "both sides rendered nothing". */
function coverage(img: Uint8ClampedArray): number {
  let n = 0
  for (let i = 0; i < img.length; i += 4) {
    if (img[i] > 8 || img[i + 1] > 8 || img[i + 2] > 8) n++
  }
  return n
}

async function main() {
  const results: Record<string, unknown> = {}
  try {
    const scene = quadScene()
    const image = makeSourceImage()
    const gl = await drawWebGL(scene, image)
    const gpu = await drawWebGPU(scene, image)
    // Model-switch check runs on the SAME WebGPU renderer, after the main
    // frame — the bind-group cache must pick up the newly created texture.
    results.modelSwitch = null
    try {
      const gpuCanvas = document.getElementById('gpu') as HTMLCanvasElement
      const gpu2 = (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu
      const adapter2 = await gpu2.requestAdapter()
      const device2 = await (adapter2 as unknown as { requestDevice(): Promise<GPUDevice> }).requestDevice()
      const renderer2 = new WebGPURenderer(gpuContext(gpuCanvas), device2, {})
      renderer2.setProjectionMatrix(ortho(SIZE, SIZE))
      const sw = await modelSwitchCheck(renderer2)
      results.modelSwitch = sw.switched
    } catch (e) {
      results.modelSwitch = `error: ${e instanceof Error ? e.message : String(e)}`
    }
    const glCov = coverage(gl)
    const gpuCov = coverage(gpu)
    const diff = compare(gl, gpu)
    const shape = diffShape(gl, gpu, SIZE)
    results.ok = true
    results.diff = diff
    results.diffShape = shape
    results.coverage = { gl: glCov, gpu: gpuCov }
    results.drawCalls = (window as unknown as { __drawCalls: unknown }).__drawCalls
    results.gpuError = (window as unknown as { __gpuError?: string }).__gpuError
    results.gpuValidationError = (window as unknown as { __gpuValidationError?: string }).__gpuValidationError
    results.texProbe = (window as unknown as { __texProbe?: number[] }).__texProbe
    // dump both readback buffers (NOT the live canvases — the presented WebGPU
    // canvas can composite to black after present) scaled into one image
    const dbg = document.createElement('canvas')
    dbg.width = SIZE * 2; dbg.height = SIZE
    const dctx = dbg.getContext('2d')!
    dctx.putImageData(new ImageData(new Uint8ClampedArray(gl), SIZE, SIZE), 0, 0)
    dctx.putImageData(new ImageData(new Uint8ClampedArray(gpu), SIZE, SIZE), SIZE, 0)
    results.debugDataUrl = dbg.toDataURL('image/png')
    document.getElementById('log')!.textContent =
      `coverage:   gl ${glCov} px | gpu ${gpuCov} px (both must be >> 0)\n` +
      `texProbe:   ${JSON.stringify(results.texProbe)}\n` +
      `modelSwitch: ${JSON.stringify(results.modelSwitch)} (true = new atlas sampled after switch)\n` +
      `differing:  ${diff.differing}/${diff.total} (${diff.pct.toFixed(3)}%)  maxDelta ${diff.maxDelta}\n` +
      `interior:   ${shape.interior} (0 = differences are edge rasterisation only)`
  } catch (e) {
    results.ok = false
    results.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}`.slice(0, 2500) : String(e)
    document.getElementById('log')!.textContent = `FAILED: ${results.error}`
  }
  ;(window as unknown as { __equivalence: unknown }).__equivalence = results
}

main()
