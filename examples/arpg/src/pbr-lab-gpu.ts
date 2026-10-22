/**
 * PBR on WebGPU — the same BRDF, the same physical invariants, but through the
 * WGSL shader `gfx` exports and a WebGPU pipeline.
 *
 * Why a separate page from the GL lab: the two backends do not share a shading
 * language, so each needs its own evidence. The uniform packing is the contract
 * between them (`MaterialOptions.uniforms`: one 16-byte slot per declared
 * uniform in order, then `u_viewProj` and `u_model` as two mat4s), and this page
 * writes that layout by hand so a mismatch shows up as wrong pixels rather than
 * as a silent no-op.
 *
 * Renders into an offscreen texture rather than the canvas: a swap-chain texture
 * cannot be copied from, and `copyTextureToBuffer` is how the pixels are read.
 */

import { PBR_WGSL } from '@rasenjs/gfx'

interface RunParams {
  baseColor: [number, number, number]
  metallic: number
  roughness: number
  light?: { direction: [number, number, number]; color: [number, number, number]; ambient: [number, number, number] }
}

const SIZE = 256
const CAMERA_DISTANCE = 4.6
const CAMERA_POS: [number, number, number] = [0, 0, CAMERA_DISTANCE]

const MEASURE_LIGHT = {
  direction: [0.5, 0.8, 0.6] as [number, number, number],
  color: [0.75, 0.75, 0.75] as [number, number, number],
  ambient: [0.03, 0.03, 0.04] as [number, number, number],
}

/** Interleaved position+normal, expanded to a triangle list. */
function sphereTriangles(segments = 96, rings = 64): Float32Array {
  const vertices: number[] = []
  const at = (ring: number, segment: number): number[] => {
    const phi = (ring / rings) * Math.PI
    const theta = (segment / segments) * Math.PI * 2
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)
    return [x, y, z, x, y, z]
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = at(ring, segment)
      const b = at(ring + 1, segment)
      const c = at(ring, segment + 1)
      const d = at(ring + 1, segment + 1)
      vertices.push(...a, ...b, ...c, ...b, ...d, ...c)
    }
  }
  return new Float32Array(vertices)
}

/** Column-major matrices, matching what WGSL expects for `mat4x4<f32>`. */
function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ])
}

function viewMatrix(distance: number): Float32Array {
  // Camera on +Z looking at the origin: a pure translation.
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1])
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + j] * b[i * 4 + k]
      out[i * 4 + j] = sum
    }
  }
  return out
}

async function main(): Promise<void> {
  const publish = (value: unknown): void => {
    ;(window as unknown as { __pbrGpu?: unknown }).__pbrGpu = value
  }

  if (!navigator.gpu) {
    publish({ ok: false, error: 'navigator.gpu missing' })
    return
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) {
    publish({ ok: false, error: 'no adapter' })
    return
  }
  const device = await adapter.requestDevice()

  const format: GPUTextureFormat = 'rgba8unorm'
  const module = device.createShaderModule({ code: PBR_WGSL })
  const compilation = await module.getCompilationInfo()
  const messages = compilation.messages.filter((m) => m.type === 'error')
  if (messages.length > 0) {
    publish({ ok: false, error: messages.map((m) => `${m.lineNum}: ${m.message}`).join('\n') })
    return
  }

  // Uniform layout: 7 declared vec4 slots, then viewProj and model.
  const UNIFORM_FLOATS = 7 * 4 + 16 + 16
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
    // Without a depth attachment the sphere's back faces are drawn over its
    // front ones, which washes out the lit/unlit contrast this lab measures.
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  })
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  })

  const vertices = sphereTriangles()
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(vertexBuffer, 0, vertices as unknown as GPUAllowSharedBufferSource)

  const target = device.createTexture({
    size: [SIZE, SIZE],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const depth = device.createTexture({
    size: [SIZE, SIZE],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const bytesPerRow = SIZE * 4
  const readback = device.createBuffer({
    size: bytesPerRow * SIZE,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const viewProj = multiply(
    perspective(Math.PI / 4, 1, 0.1, 100),
    viewMatrix(CAMERA_DISTANCE),
  )

  const draw = async (params: RunParams): Promise<Uint8Array> => {
    const light = params.light ?? MEASURE_LIGHT
    const data = new Float32Array(UNIFORM_FLOATS)
    let at = 0
    const slot = (values: readonly number[], count = 4): void => {
      for (let i = 0; i < values.length && i < count; i++) data[at + i] = values[i]
      at += 4
    }
    // Order must match the WGSL struct: baseColor, metallic, roughness,
    // lightDir, lightColor, ambient, cameraPos, viewProj, model.
    slot(params.baseColor, 3)
    slot([params.metallic])
    slot([params.roughness])
    slot(light.direction, 3)
    slot(light.color, 3)
    slot(light.ambient, 3)
    slot(CAMERA_POS, 3)
    data.set(viewProj, at)
    at += 16
    // model = identity
    data[at] = 1; data[at + 5] = 1; data[at + 10] = 1; data[at + 15] = 1
    device.queue.writeBuffer(uniformBuffer, 0, data as unknown as GPUAllowSharedBufferSource)

    const encoder = device.createCommandEncoder({})
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.setVertexBuffer(0, vertexBuffer)
    pass.draw(vertices.length / 6)
    pass.end()
    encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [SIZE, SIZE])
    device.queue.submit([encoder.finish()])

    await readback.mapAsync(GPUMapMode.READ)
    const pixels = new Uint8Array(readback.getMappedRange().slice(0))
    readback.unmap()
    return pixels
  }

  const measure = (pixels: Uint8Array) => {
    let maxLum = 0
    let sumLum = 0
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let covered = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (r > 2 || g > 2 || b > 2) {
        covered++
        sumLum += lum
        sumR += r
        sumG += g
        sumB += b
        if (lum > maxLum) maxLum = lum
      }
    }
    const peak = maxLum * 0.6
    let brightArea = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      if (lum > peak) brightArea++
    }
    // copyTextureToBuffer rows are top-down; the corner is still background.
    const corner = 0
    const round = (v: number): number => Math.round(v * 100) / 100
    return {
      maxLum: round(maxLum),
      meanLum: covered ? round(sumLum / covered) : 0,
      meanR: covered ? round(sumR / covered) : 0,
      meanG: covered ? round(sumG / covered) : 0,
      meanB: covered ? round(sumB / covered) : 0,
      coverage: Math.round((covered / (SIZE * SIZE)) * 10000) / 10000,
      brightArea,
      cornerLum: round(
        0.2126 * pixels[corner] + 0.7152 * pixels[corner + 1] + 0.0722 * pixels[corner + 2],
      ),
    }
  }

  const run = async (params: RunParams) => measure(await draw(params))

  const pixelAt = async (params: RunParams, x: number, y: number) => {
    const pixels = await draw(params)
    const at = (y * SIZE + x) * 4
    return { r: pixels[at], g: pixels[at + 1], b: pixels[at + 2] }
  }

  publish({ ok: true, adapter: adapter.info ? { ...adapter.info } : {}, run, pixelAt })
}

main().catch((error) => {
  ;(window as unknown as { __pbrGpu?: unknown }).__pbrGpu = { ok: false, error: String(error) }
})
