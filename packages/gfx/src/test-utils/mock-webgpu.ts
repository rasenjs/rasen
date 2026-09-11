/**
 * Minimal mock WebGPU objects for unit-testing the WebGPURenderer's
 * command-recording logic without a real adapter.
 *
 * The mock records enough of the GPUCompilerSemaphore — actually, of the
 * queue's writeBuffer calls and the pass encoder's draw calls — to assert the
 * deferred-queue semantics the real backend must uphold:
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
  createCommandEncoder(): MockCommandEncoder {
    return new MockCommandEncoder()
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
  beginRenderPass(): MockRenderPassEncoder {
    this.calls.push('beginRenderPass')
    return new MockRenderPassEncoder(this)
  }
  copyTextureToBuffer(): void {
    this.calls.push('copyTextureToBuffer')
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
export function createMockGPUCanvas(): HTMLCanvasElement {
  const device: MockGPUDevice = new MockGPUDevice()
  const currentTexture = new MockGPUTexture(
    { size: { width: 256, height: 256 }, format: 'bgra8unorm', usage: 0 },
    device
  )
  const canvas = {
    width: 256,
    height: 256,
    getContext: (type: string) => {
      if (type !== 'webgpu') return null
      return {
        configure: (cfg: { device: MockGPUDevice }) => {
          ;(canvas as unknown as { __device?: MockGPUDevice }).__device = cfg.device
        },
        getCurrentTexture: () => currentTexture
      }
    }
  } as unknown as HTMLCanvasElement
  ;(canvas as unknown as { __mockDevice?: MockGPUDevice }).__mockDevice = device
  return canvas
}

/** Preferred-format stub: the renderer reads navigator.gpu.getPreferredCanvasFormat. */
export function installMockNavigatorGPU(): void {
  ;(globalThis as unknown as { navigator: object }).navigator = {
    gpu: { getPreferredCanvasFormat: () => 'bgra8unorm' }
  }
}
