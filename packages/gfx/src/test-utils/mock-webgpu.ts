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
  /** Everything the shader-pass path creates, in creation order, so a test can
   *  assert what actually reached the device rather than what was intended. */
  shaderModules: MockGPUShaderModule[] = []
  bindGroupLayouts: MockGPUBindGroupLayout[] = []
  pipelineLayouts: { bindGroupLayouts: unknown[]; label?: string }[] = []
  renderPipelines: MockGPURenderPipeline[] = []
  computePipelines: MockGPUComputePipeline[] = []
  bindGroups: MockBindGroup[] = []
  /** Messages `getCompilationInfo` reports — the WGSL error channel. */
  compilationMessages: { type: string; message: string; lineNum: number; linePos: number }[] = []
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
  /** Every encoder, in creation order — the only way to tell a compute pass
   *  apart from the frame's own pass, since both belong to one device. */
  encoders: MockCommandEncoder[] = []
  createCommandEncoder(): MockCommandEncoder {
    const encoder = new MockCommandEncoder()
    this.encoders.push(encoder)
    this.lastCommandEncoder = encoder
    return encoder
  }
  createShaderModule(desc?: { code?: string; label?: string }): object {
    const module = new MockGPUShaderModule(desc?.code ?? '', this)
    this.shaderModules.push(module)
    return module
  }
  createSampler(): object {
    return {}
  }
  createBindGroupLayout(desc: { entries: unknown[]; label?: string }): MockGPUBindGroupLayout {
    const layout = new MockGPUBindGroupLayout(desc.entries, desc.label)
    this.bindGroupLayouts.push(layout)
    return layout
  }
  createPipelineLayout(desc: { bindGroupLayouts: unknown[]; label?: string }): object {
    this.pipelineLayouts.push(desc)
    return { __bindGroupLayouts: desc.bindGroupLayouts }
  }
  createRenderPipeline(desc: unknown): MockGPURenderPipeline {
    const pipeline = new MockGPURenderPipeline(desc, this.pipelineLayoutFrom(desc))
    this.renderPipelines.push(pipeline)
    return pipeline
  }
  createComputePipeline(desc: unknown): MockGPUComputePipeline {
    const pipeline = new MockGPUComputePipeline(desc, this.pipelineLayoutFrom(desc))
    this.computePipelines.push(pipeline)
    return pipeline
  }
  /** The layouts of the pipeline layout a descriptor names, so a pipeline's
   *  `getBindGroupLayout(i)` answers with the SAME object the descriptor handed
   *  to `createPipelineLayout` — the property the backend relies on. */
  private pipelineLayoutFrom(desc: unknown): unknown[] {
    const layout = (desc as { layout?: { __bindGroupLayouts?: unknown[] } }).layout
    return layout?.__bindGroupLayouts ?? []
  }
  createBindGroup(desc: { entries: { binding: number; resource: unknown }[]; layout?: unknown }): MockBindGroup {
    const group: MockBindGroup = { entries: desc.entries, layout: desc.layout }
    this.bindGroups.push(group)
    return group
  }
  pushErrorScope(): void {}
  popErrorScope(): Promise<null> {
    return Promise.resolve(null)
  }
}

/** A shader module: the renderer asks for compilation info only to report WGSL
 *  errors, so what a test needs is control over the messages. */
export class MockGPUShaderModule {
  constructor(
    public code: string,
    public device: MockGPUDevice
  ) {}
  getCompilationInfo(): Promise<{ messages: { type: string; message: string; lineNum: number; linePos: number }[] }> {
    return Promise.resolve({ messages: this.device.compilationMessages })
  }
}

export class MockGPUBindGroupLayout {
  constructor(
    public entries: unknown[],
    public label?: string
  ) {}
}

export class MockGPURenderPipeline {
  constructor(
    public desc: unknown,
    public layouts: unknown[]
  ) {}
  getBindGroupLayout(index: number): unknown {
    return this.layouts[index]
  }
}

export class MockGPUComputePipeline {
  constructor(
    public desc: unknown,
    public layouts: unknown[]
  ) {}
  getBindGroupLayout(index: number): unknown {
    return this.layouts[index]
  }
}

/** A bind group as the renderer hands it over: the entries it bound, and the
 *  layout it was created against (which is what makes a layout/pipeline-layout
 *  mismatch visible in a test). */
export interface MockBindGroup {
  entries: { binding: number; resource: unknown }[]
  layout?: unknown
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
  /** Every render pass opened, so a test can reach the one a frame drew into
   *  without depending on call order. */
  passes: MockRenderPassEncoder[] = []
  lastPass: MockRenderPassEncoder | null = null
  computePasses: MockComputePassEncoder[] = []
  lastComputePass: MockComputePassEncoder | null = null
  beginRenderPass(descriptor?: unknown): MockRenderPassEncoder {
    this.calls.push('beginRenderPass')
    if (descriptor) {
      this.renderPassDescriptors.push(descriptor as {
        colorAttachments?: Array<{ clearValue?: { r: number; g: number; b: number; a: number } }>
      })
    }
    const pass = new MockRenderPassEncoder(this)
    this.lastPass = pass
    this.passes.push(pass)
    return pass
  }
  beginComputePass(): MockComputePassEncoder {
    this.calls.push('beginComputePass')
    const pass = new MockComputePassEncoder(this)
    this.lastComputePass = pass
    this.computePasses.push(pass)
    return pass
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
  /** Pipelines, bind groups and draws recorded by this pass. Kept apart from
   *  `encoder.calls` so existing assertions on that sequence are unaffected. */
  pipelines: unknown[] = []
  bindGroups: { index: number; group: MockBindGroup }[] = []
  vertexBuffers: { slot: number; buffer: unknown }[] = []
  draws: { count: number; instances: number }[] = []
  indexedDraws: { count: number; instances: number; firstIndex: number; baseVertex: number }[] = []
  constructor(public encoder: MockCommandEncoder) {}
  setPipeline(pipeline: unknown): void {
    this.pipelines.push(pipeline)
  }
  setBindGroup(_index: number, group: MockBindGroup): void {
    this.bindGroups.push({ index: _index, group })
    this.encoder.calls.push(`bindGroup:${(group as { __tag?: string }).__tag ?? 'untagged'}`)
  }
  setVertexBuffer(slot: number, buffer: unknown): void {
    this.vertexBuffers.push({ slot, buffer })
  }
  setIndexBuffer(): void {}
  drawIndexed(count: number, instances: number, firstIndex: number, baseVertex: number): void {
    this.indexedDraws.push({ count, instances, firstIndex, baseVertex })
    this.encoder.calls.push(`drawIndexed(${count},${instances},${firstIndex},${baseVertex})`)
  }
  draw(count = 0, instances = 1): void {
    this.draws.push({ count, instances })
  }
  end(): void {
    this.encoder.calls.push('end')
  }
}

export class MockComputePassEncoder {
  pipelines: unknown[] = []
  bindGroups: { index: number; group: MockBindGroup }[] = []
  workgroups: [number, number, number][] = []
  ended = false
  constructor(public encoder: MockCommandEncoder) {}
  setPipeline(pipeline: unknown): void {
    this.pipelines.push(pipeline)
  }
  setBindGroup(index: number, group: MockBindGroup): void {
    this.bindGroups.push({ index, group })
  }
  dispatchWorkgroups(x: number, y: number, z: number): void {
    this.workgroups.push([x, y, z])
  }
  end(): void {
    this.ended = true
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
