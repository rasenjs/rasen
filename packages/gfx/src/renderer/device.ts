/**
 * GPU device abstraction — the seam between the engine and a graphics API.
 *
 * RULE: no WebGL* or GPU* identifier may appear in this file, and none may
 * appear in the engine layer above it (components, node graph, render-context
 * orchestration, batch decisions). `packages/gfx/src/__tests__/layering.test.ts`
 * enforces this; without an automated guard GL types creep back within a few
 * commits and the WebGPU backend becomes impossible to add.
 *
 * The vocabulary deliberately follows the EXPLICIT model (WebGPU-shaped:
 * pipelines, bind groups, recorded frames) rather than WebGL's implicit global
 * state machine. WebGL is the adapter that hides its own statefulness; designing
 * this the other way round would make WebGPU unimplementable.
 *
 * See docs/GPU-BACKEND-DESIGN.md for the staged plan and the list of backend
 * differences this interface has to absorb.
 */

/** Opaque backend-owned handles. The engine only ever passes these around. */
export interface GpuBufferHandle {
  readonly byteLength: number
  destroy(): void
}

export interface GpuTextureHandle {
  readonly width: number
  readonly height: number
  destroy(): void
}

export interface GpuPipelineHandle {
  destroy(): void
}

export interface GpuBindGroupHandle {
  destroy(): void
}

export interface GpuRenderTargetHandle {
  readonly width: number
  readonly height: number
  /** Backend-specific colour texture, exposed for a later sampling pass. */
  readonly color: GpuTextureHandle
  destroy(): void
}

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export type BufferUsage = 'vertex' | 'index' | 'uniform' | 'storage'

export interface BufferDesc {
  usage: BufferUsage
  /** Initial contents. Optional: a buffer may be sized and filled later. */
  data?: ArrayBufferView
  /** Required when `data` is omitted. */
  byteLength?: number
  /** Hint only; backends may ignore it (WebGPU infers from usage patterns). */
  dynamic?: boolean
  label?: string
}

export type TextureFormat = 'rgba8unorm' | 'bgra8unorm' | 'depth24plus'

export interface TextureDesc {
  width: number
  height: number
  format?: TextureFormat
  /** Sampling filter; `nearest` is used by pixel-art atlases. */
  filter?: 'nearest' | 'linear'
  wrap?: 'clamp' | 'repeat'
  /** Render-target textures are not sampled; sampled ones are not written. */
  renderTarget?: boolean
  depth?: boolean
  label?: string
}

export type ShaderStage = 'vertex' | 'fragment'

/** A shader module in the backend's own language (GLSL for WebGL, WGSL for WebGPU). */
export interface ShaderModuleDesc {
  stage: ShaderStage
  source: string
  label?: string
}

/** One attribute of a vertex buffer layout. */
export interface VertexAttribute {
  /** Name as written in the shader; WebGL resolves it to a location. */
  shaderLocation: string
  /** Byte offset inside the vertex stride. */
  offset: number
  format: VertexFormat
  /** Attribute advances once per instance rather than once per vertex. */
  instanced?: boolean
  /** Divisor for instanced attributes (WebGL); WebGPU derives it from `instanced`. */
  instancedDivisor?: number
}

export type VertexFormat =
  | 'float32'
  | 'float32x2'
  | 'float32x3'
  | 'float32x4'
  | 'uint8x4'
  | 'uint16x2'
  | 'uint32'

export interface VertexBufferLayout {
  /** Index in the `setVertexBuffers` array. */
  slot: number
  stride: number
  attributes: VertexAttribute[]
}

export interface BlendState {
  enabled: boolean
  srcColor: BlendFactor
  dstColor: BlendFactor
  srcAlpha: BlendFactor
  dstAlpha: BlendFactor
}

export type BlendFactor =
  | 'one'
  | 'zero'
  | 'src-alpha'
  | 'one-minus-src-alpha'
  | 'one-minus-src-color'
  | 'dst-alpha'
  | 'one-minus-dst-alpha'

export interface DepthState {
  test: boolean
  write: boolean
  compare?: 'less' | 'less-equal' | 'always'
}

/**
 * What a bind group binds. Kept declarative so a backend can translate it to
 * GLSL uniforms (WebGL) or a uniform buffer layout (WebGPU).
 */
export interface BindGroupEntry {
  binding: number
  kind: 'uniform-buffer' | 'texture' | 'sampler'
  /** `uniform-buffer` only: the backing buffer. */
  buffer?: GpuBufferHandle
  /** `uniform-buffer` only: byte offset and size of this binding's slice. */
  offset?: number
  size?: number
  /** `texture` only. */
  texture?: GpuTextureHandle
}

export interface BindGroupLayoutEntry {
  binding: number
  kind: 'uniform-buffer' | 'texture' | 'sampler'
  visibility: ShaderStage[]
}

export interface BindGroupDesc {
  layout: BindGroupLayoutEntry[]
  entries: BindGroupEntry[]
  label?: string
}

export interface PipelineDesc {
  vertex: ShaderModuleDesc
  fragment: ShaderModuleDesc
  layouts: VertexBufferLayout[]
  bindGroupLayout: BindGroupLayoutEntry[]
  blend: BlendState
  depth?: DepthState
  /** Primary colour attachment format; must match the frame target. */
  colorFormat?: TextureFormat
  /** Strip index format for `drawIndexed` with triangle strips; omitted = triangles. */
  topology?: 'triangle-list' | 'triangle-strip'
  /** Draw both faces; the engine's 2D work is single-sided and winding-agnostic. */
  cull?: 'none' | 'back' | 'front'
  label?: string
}

export interface RenderTargetDesc {
  width: number
  height: number
  /** Attach a depth buffer (shadow passes need one). */
  depth?: boolean
  label?: string
}

export interface ClearState {
  color?: [number, number, number, number]
  depth?: number
  /** The engine clears colour and depth together today; kept explicit for WebGPU. */
  clearColor?: boolean
  clearDepth?: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Bytes per element for the index formats the engine uses. */
export type IndexFormat = 'uint16' | 'uint32'

/**
 * Anything that can be uploaded as a texture.
 *
 * Deliberately not `TexImageSource`: that DOM type drags in `HTMLCanvasElement`,
 * `OffscreenCanvas` and friends, and this package's policy is to depend only on
 * the minimal surface it actually touches (see node.ts). Atlas uploads are
 * `HTMLImageElement`, which is structurally compatible with `CanvasImageSource`
 * in the browser and with the test fixtures here.
 */
export type GpuImageSource = CanvasImageSource

/**
 * A GPU device bound to one canvas.
 *
 * Frame model: the engine draws exactly one pass per render target per frame,
 * and the batch renderer owns draw ordering, so the interface exposes
 * `beginFrame`/`endFrame` rather than general render passes. WebGPU creates and
 * submits its command encoder there; WebGL has nothing to do.
 */
export interface GpuDevice {
  /**
   * Which API is behind this device. WebGL1 is frozen in this repo (see
   * node.ts): WebGL2-first, with WebGL1 kept working behind feature probes.
   */
  readonly api: 'webgl2' | 'webgl1' | 'webgpu'
  /** Drawing-buffer size in device pixels. */
  readonly width: number
  readonly height: number

  createBuffer(desc: BufferDesc): GpuBufferHandle
  /** Overwrite part or all of a buffer. `byteOffset` defaults to 0. */
  writeBuffer(buffer: GpuBufferHandle, data: ArrayBufferView, byteOffset?: number): void

  createTexture(desc: TextureDesc): GpuTextureHandle
  /** Upload an image source (atlas page, decoded image, canvas). */
  writeTexture(texture: GpuTextureHandle, source: GpuImageSource): void

  createPipeline(desc: PipelineDesc): GpuPipelineHandle
  createBindGroup(desc: BindGroupDesc): GpuBindGroupHandle
  createRenderTarget(desc: RenderTargetDesc): GpuRenderTargetHandle

  /** Start recording for `target` (null = the canvas), clearing as requested. */
  beginFrame(target: GpuRenderTargetHandle | null, clear: ClearState): void
  setPipeline(pipeline: GpuPipelineHandle): void
  setBindGroup(index: number, group: GpuBindGroupHandle): void
  setVertexBuffers(buffers: (GpuBufferHandle | null)[], offsets?: number[]): void
  setIndexBuffer(buffer: GpuBufferHandle, format: IndexFormat): void
  setScissor(rect: Rect | null): void
  drawIndexed(indexCount: number, indexByteOffset: number, instanceCount?: number): void
  drawArrays(vertexCount: number, firstVertex: number, instanceCount?: number): void
  endFrame(): void

  /** Reconfigure for a new drawing-buffer size. */
  resize(width: number, height: number): void
  destroy(): void
}
