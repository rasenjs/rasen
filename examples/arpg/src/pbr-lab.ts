/**
 * PBR lab — draws with the shader through **`gfx`'s own renderer**, so the
 * material path is exercised end to end rather than in a private GL context.
 *
 * Everything here is the API a game would use:
 *
 *   const renderer = new WebGLRenderer(gl, options)
 *   const material = renderer.createMaterial({ vertex, fragment, attributes, uniforms })
 *   renderer.drawMaterial({ material, vertices, uniforms })
 *   renderer.requestRedraw()
 *
 * The numbers this page reports are what `tools/verify-pbr.mjs` asserts on. It is
 * not part of the game.
 */

import {
  PBR_ATTRIBUTES,
  PBR_FRAGMENT_SHADER,
  PBR_UNIFORMS,
  PBR_VERTEX_SHADER,
  WebGLRenderer,
  type PbrLighting,
  type PbrMaterial,
} from '@rasenjs/gfx'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

interface RunParams extends PbrMaterial {
  light?: PbrLighting
}

interface Stats {
  maxLum: number
  meanLum: number
  meanR: number
  meanG: number
  meanB: number
  /** Fraction of the frame the sphere covers. */
  coverage: number
  /** Pixels within 60% of this frame's own peak — the highlight's extent. */
  brightArea: number
  /** Pure-magenta pixels, which is how this driver surfaces a NaN. */
  magenta: number
  /** Luminance at the bottom-left corner, outside the sphere. */
  cornerLum: number
}

const SIZE = 256
const CAMERA_DISTANCE = 4.6
const CAMERA_POS: [number, number, number] = [0, 0, CAMERA_DISTANCE]

/**
 * A dim measurement light.
 *
 * The default lighting is tuned to look good, which means its highlight clips to
 * white — and a clipped highlight cannot be compared between roughness values.
 * These numbers keep the peak inside range so "tighter highlight" is measurable.
 */
const MEASURE_LIGHT: PbrLighting = {
  direction: [0.5, 0.8, 0.6],
  color: [0.75, 0.75, 0.75],
  ambient: [0.03, 0.03, 0.04],
}

/** An analytic UV sphere, interleaved as position+normal — the material's layout. */
function sphere(segments = 96, rings = 64): Float32Array {
  const data: number[] = []
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI
    for (let segment = 0; segment <= segments; segment++) {
      const theta = (segment / segments) * Math.PI * 2
      const x = Math.sin(phi) * Math.cos(theta)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(theta)
      data.push(x, y, z, x, y, z)
    }
  }
  return new Float32Array(data)
}

function triangleIndices(segments = 96, rings = 64): Uint16Array {
  const indices: number[] = []
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment
      const b = a + segments + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return new Uint16Array(indices)
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4x4f {
  const f = 1 / Math.tan(fovY / 2)
  return mat4x4f([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ])
}

/**
 * View matrix for a camera on +Z looking at the origin.
 *
 * The camera only ever sits on +Z, so this is a translation and nothing more. A
 * hand-written general lookAt is easy to get subtly wrong (axis components
 * transposed), and a wrong view matrix does not fail loudly — it just changes the
 * projection, which would make every measurement below meaningless.
 */
function viewMatrix(distance: number): Mat4x4f {
  return mat4x4f([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1])
}

function createLab(): void {
  const report: Record<string, unknown> = {}
  const publish = (extra: Record<string, unknown>): void => {
    ;(window as unknown as { __pbr?: unknown }).__pbr = { ...report, ...extra }
  }

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  document.body.appendChild(canvas)

  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) {
    publish({ ok: false, error: 'no webgl2' })
    return
  }
  report.renderer = gl.getParameter(gl.VERSION)

  const renderer = new WebGLRenderer(gl, {
    clearColor: '#000000',
    logicalWidth: SIZE,
    logicalHeight: SIZE,
  })
  renderer.setViewMatrix(viewMatrix(CAMERA_DISTANCE))
  renderer.setProjectionMatrix(perspective(Math.PI / 4, 1, 0.1, 100))

  const material = renderer.createMaterial({
    vertex: PBR_VERTEX_SHADER,
    fragment: PBR_FRAGMENT_SHADER,
    attributes: PBR_ATTRIBUTES.map((a) => ({ name: a.name, components: a.components })),
    // u_viewProj and u_model are filled by the renderer, so the host only
    // declares the material's own inputs.
    uniforms: PBR_UNIFORMS.filter((u) => u.name !== 'u_viewProj' && u.name !== 'u_model').map(
      (u) => ({ name: u.name, type: u.type }),
    ),
    depthTest: true,
    depthWrite: true,
    // The lab's sphere winding is not guaranteed CCW, and back-face culling is on
    // the default front-face convention — culling here would remove the whole
    // sphere without any GL error to say so.
    cull: 'none',
  })

  report.ok = material !== null
  if (!material) {
    publish({ error: 'createMaterial returned null (the program did not compile)' })
    return
  }

  const vertices = sphere()
  const indices = triangleIndices()

  let lastGlError = 0
  // Count the GPU calls the material pass actually issues, so a silent no-draw is
  // distinguishable from a wrong-draw.
  let elementDraws = 0
  let arrayDraws = 0
  let useProgramCalls = 0
  const originalDrawElements = gl.drawElements.bind(gl)
  const originalDrawArrays = gl.drawArrays.bind(gl)
  const originalUseProgram = gl.useProgram.bind(gl)
  gl.drawElements = (...args: Parameters<WebGL2RenderingContext['drawElements']>) => {
    elementDraws++
    return originalDrawElements(...args)
  }
  gl.drawArrays = (...args: Parameters<WebGL2RenderingContext['drawArrays']>) => {
    arrayDraws++
    return originalDrawArrays(...args)
  }
  gl.useProgram = (...args: Parameters<WebGL2RenderingContext['useProgram']>) => {
    useProgramCalls++
    return originalUseProgram(...args)
  }

  const draw = (params: RunParams): Uint8Array => {
    const light = params.light ?? MEASURE_LIGHT
    renderer.drawMaterial({
      material,
      vertices,
      indices,
      uniforms: {
        u_baseColor: params.baseColor,
        u_metallic: params.metallic,
        u_roughness: params.roughness,
        u_lightDir: light.direction,
        u_lightColor: light.color,
        u_ambient: light.ambient,
        u_cameraPos: CAMERA_POS,
      },
    })
    renderer.requestRedraw()
    // Read back only after the GPU has actually executed the draw — without this
    // the read can race the command buffer and report an empty frame.
    gl.finish()
    lastGlError = gl.getError()

    const pixels = new Uint8Array(SIZE * SIZE * 4)
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }

  const measure = (pixels: Uint8Array): Stats => {
    let maxLum = 0
    let sumLum = 0
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let covered = 0
    let magenta = 0

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      if (r === 255 && g === 0 && b === 255) magenta++
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      // The clear colour is black, so anything above a small floor is geometry.
      if (r > 2 || g > 2 || b > 2) {
        covered++
        sumLum += lum
        sumR += r
        sumG += g
        sumB += b
        if (lum > maxLum) maxLum = lum
      }
    }

    // Second pass: how much of the surface is within 60% of this frame's own
    // peak. A tight highlight covers little of the sphere; a broad one covers
    // much more. Comparing areas at a fixed luminance would instead compare
    // brightness, which is a different property.
    const peak = maxLum * 0.6
    let brightArea = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      if (lum > peak) brightArea++
    }

    const corner = (2 * SIZE + 2) * 4
    const round = (v: number): number => Math.round(v * 100) / 100
    return {
      maxLum: round(maxLum),
      meanLum: covered ? round(sumLum / covered) : 0,
      meanR: covered ? round(sumR / covered) : 0,
      meanG: covered ? round(sumG / covered) : 0,
      meanB: covered ? round(sumB / covered) : 0,
      coverage: Math.round((covered / (SIZE * SIZE)) * 10000) / 10000,
      brightArea,
      magenta,
      cornerLum: round(
        0.2126 * pixels[corner] + 0.7152 * pixels[corner + 1] + 0.0722 * pixels[corner + 2],
      ),
    }
  }

  const run = (params: RunParams): Stats => measure(draw(params))

  const pixelAt = (params: RunParams, x: number, y: number): { r: number; g: number; b: number } => {
    const pixels = draw(params)
    const at = (y * SIZE + x) * 4
    return { r: pixels[at], g: pixels[at + 1], b: pixels[at + 2] }
  }

  report.counters = () => ({ elementDraws, arrayDraws, useProgramCalls })
  report.materialsActive = () => renderer.materialsActive
  report.glErrorAfterDraw = () => lastGlError
  /**
   * Decisive check of the material machinery, independent of the PBR shader:
   * a pass-through vertex shader drawing a screen-covering triangle in a fixed
   * colour. If this is visible, attributes/draw/program binding all work and any
   * blank PBR frame is a shader-input problem; if it is blank, the pass itself is
   * not producing output.
   */
  const selfTest = (): Record<string, unknown> => {
    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = SIZE
    probeCanvas.height = SIZE
    const probeGl = probeCanvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })
    if (!probeGl) return { error: 'no webgl2' }
    const probeRenderer = new WebGLRenderer(probeGl, { clearColor: '#000000' })
    const probeMaterial = probeRenderer.createMaterial({
      vertex: `#version 300 es
in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }`,
      fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }`,
      attributes: [{ name: 'a_position', components: 3 }],
      depthTest: false,
      depthWrite: false,
    })
    if (!probeMaterial) return { error: 'createMaterial failed' }
    probeRenderer.drawMaterial({
      material: probeMaterial,
      vertices: new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
    })
    probeRenderer.requestRedraw()
    probeGl.finish()
    const pixel = new Uint8Array(4)
    probeGl.readPixels(SIZE / 2, SIZE / 2, 1, 1, probeGl.RGBA, probeGl.UNSIGNED_BYTE, pixel)
    return { ok: true, centerPixel: [pixel[0], pixel[1], pixel[2], pixel[3]], glError: probeGl.getError() }
  }

  publish({ ok: true, run, pixelAt, selfTest })
}

createLab()
