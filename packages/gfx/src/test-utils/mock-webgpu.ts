/**
 * Minimal mock WebGPU objects for unit-testing the WebGPURenderer's
 * command-recording logic without a real adapter.
 *
 * The mock records enough of the GPUCompilerSemaphore — actually, of the
 * queue's writeBuffer calls and the pass encoder's draw calls — to assert the * deferred-queue semantics the real backend must uphold:
 *
 *   - every draw's vertex/index upload lands in a NON-overlapping region
 *     (WebGPU executes all queue work at submit; a later write to the same
 *     offset clobbers what an earlier recorded draw reads)
 *   - sealed runs upload their staging indices and rebase via
 *     firstIndex/baseVertex
 *   - the skipTonemap bind group variant is selected per draw
 *
 * Not a spec-compliant implementation — just the surface the renderer
 * touches, with identity-preserving buffer objects so cache keys and
 * liveness behave like the real thing.
 */

import type { GpuCanvasContext } from '../node'

export interface RecordedWrite {
  buffer: MockGPUBuffer
  offset: number
  size: number
  label: string
}

export class MockGPUBuffer {
  destroyed = false
  size: number
  constructor(
    public desc: { size: number; usage: number; label?: string; mappedAtCreation?: boolean },
    public device: MockGPUDevice
  ) {
    this.size = desc.size
  }
  destroy(): void {
    this.destroyed = true
    this.device.destroyedBuffers.push(this)
  }
  /** Support mappedAtCreation buffers (the white-texture staging upload). */
  getMappedRange(): ArrayBuffer {
    return new ArrayBuffer(this.size || 4)
  }
  unmap(): void {}
  /** MAP_READ buffers are mapped through this; the frame readback awaits it. */
  mapAsync(): Promise<void> {
    return Promise.resolve()
  }
}

export class MockGPUTexture {
  destroyed = false
  constructor(
    public desc: { size: { width: number; height: number }; format: string; usage: number },
    public device: MockGPUDevice
  ) {}
  createView(): { texture: MockGPUTexture } {
    return { texture: this }
  }
  destroy(): void {
    this.destroyed = true
    this.device.destroyedTextures.push(this)
  }
  /** The renderer tags textures with __filter for sampler selection. */
  __filter?: 'nearest' | 'linear'
}

export class MockGPUDevice {
  queues: MockQueue[] = []
  destroyedBuffers: MockGPUBuffer[] = []
  destroyedTextures: MockGPUTexture[] = []
  buffers: MockGPUBuffer[] = []
  textures: MockGPUTexture[] = []
  readonly queue: MockQueue = new MockQueue(this)

  createBuffer(desc: { size: number; usage: number; label?: string }): MockGPUBuffer {
    const b = new MockGPUBuffer(desc, this)
    this.buffers.push(b)
    return b
  }
  createTexture(desc: { size: { width: number; height: number }; format: string; usage: number }): MockGPUTexture {
    const t = new MockGPUTexture(desc, this)
    this.textures.push(t)
    return t
  }
  /** The most recently created encoder, so a test can inspect what a frame
   *  recorded (render-pass descriptors, copy sizes) without threading a handle
   *  through the renderer. */
  lastCommandEncoder: MockCommandEncoder | null = null
  createCommandEncoder(): MockCommandEncoder {
    const encoder = new MockCommandEncoder()
    this.lastCommandEncoder = encoder
    return encoder
  }
  createShaderModule(): object {
    return {}
  }
  createSampler(): object {
    return {}
  }
  createBindGroupLayout(): object {
    return {}
  }
  createPipelineLayout(): object {
    return {}
  }
  createRenderPipeline(): object {
    return {}
  }
  createBindGroup(desc: { entries: { binding: number; resource: unknown }[] }): MockBindGroup {
    return { entries: desc.entries }
  }
  pushErrorScope(): void {}
  popErrorScope(): Promise<null> {
    return Promise.resolve(null)
  }
}

export interface MockBindGroup {
  entries: { binding: number; resource: unknown }[]
}

export class MockQueue {
  writes: RecordedWrite[] = []
  submits: MockCommandEncoder[][] = []
  constructor(public device: MockGPUDevice) {}
  writeBuffer(
    buffer: MockGPUBuffer,
    bufferOffset: number,
    data: ArrayBuffer,
    dataOffset = 0,
    size?: number
  ): void {
    this.writes.push({
      buffer,
      offset: bufferOffset,
      // Per spec, an omitted size writes to the end of the data.
      size: size ?? data.byteLength - dataOffset,
      label: data.byteLength ? `bytes=${data.byteLength}` : ''
    })
  }
  submit(cmds: MockCommandEncoder[]): void {
    this.submits.push(cmds)
  }
  copyExternalImageToTexture(): void {}
}

export class MockCommandEncoder {
  calls: string[] = []
  /** Size argument of every texture→buffer copy, in call order. The frame
   *  readback must size its copy from the LIVE drawing buffer, so a test can
   *  assert the rectangle it asked for rather than only that it asked. */
  copiedSizes: { width: number; height: number }[] = []
  /** Descriptor of every render pass, in call order. `beginRenderPass` decides
   *  what a frame clears to, so recording the descriptor is the only way a test
   *  can assert the clear colour actually took effect. */
  renderPassDescriptors: Array<{
    colorAttachments?: Array<{ clearValue?: { r: number; g: number; b: number; a: number } }>
  }> = []
  beginRenderPass(descriptor?: unknown): MockRenderPassEncoder {
    this.calls.push('beginRenderPass')
    if (descriptor) {
      this.renderPassDescriptors.push(descriptor as {
        colorAttachments?: Array<{ clearValue?: { r: number; g: number; b: number; a: number } }>
      })
    }
    return new MockRenderPassEncoder(this)
  }
  copyTextureToBuffer(_source?: unknown, _destination?: unknown, size?: unknown): void {
    this.calls.push('copyTextureToBuffer')
    if (size) this.copiedSizes.push(size as { width: number; height: number })
  }
  copyBufferToTexture(): void {
    this.calls.push('copyBufferToTexture')
  }
  finish(): { encoder: MockCommandEncoder } {
    return { encoder: this }
  }
}

export class MockRenderPassEncoder {
  constructor(public encoder: MockCommandEncoder) {}
  setPipeline(): void {}
  setBindGroup(_index: number, group: MockBindGroup): void {
    this.encoder.calls.push(`bindGroup:${(group as { __tag?: string }).__tag ?? 'untagged'}`)
  }
  setVertexBuffer(): void {}
  setIndexBuffer(): void {}
  drawIndexed(count: number, instances: number, firstIndex: number, baseVertex: number): void {
    this.encoder.calls.push(`drawIndexed(${count},${instances},${firstIndex},${baseVertex})`)
  }
  draw(): void {}
  end(): void {
    this.encoder.calls.push('end')
  }
}

/** A context object shaped enough for `canvas.getContext('webgpu')` + configure. */
/**
 * A domlike WebGPU canvas context — the injection seam `WebGPURenderer` takes
 * (see `GpuCanvasContext`). Mirrors the real browser split: the surface size
 * lives on `canvas`, while the context carries `configure` and
 * `getCurrentTexture`. There is deliberately no canvas-of-context indirection
 * here, because the renderer never performs one.
 */
export function createMockGPUContext(): GpuCanvasContext {
  const device: MockGPUDevice = new MockGPUDevice()
  const currentTexture = new MockGPUTexture(
    { size: { width: 256, height: 256 }, format: 'bgra8unorm', usage: 0 },
    device
  )
  const ctx = {
    canvas: { width: 256, height: 256 },
    configure: () => {},
    getCurrentTexture: () => currentTexture,
    // Surfaced so a test can reach the device the renderer configured with.
    __mockDevice: device
  }
  return ctx as unknown as GpuCanvasContext
}

/** Preferred-format stub: the browser path reads
 *  `navigator.gpu.getPreferredCanvasFormat`. A host instead passes
 *  `options.format`, which is why this is only installed for browser-shaped
 *  tests. */
export function installMockNavigatorGPU(): void {
  ;(globalThis as unknown as { navigator: object }).navigator = {
    gpu: { getPreferredCanvasFormat: () => 'bgra8unorm' }
  }
}
