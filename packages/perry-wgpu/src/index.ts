/**
 * @rasenjs/perry-wgpu — WebGPU for the Perry TypeScript-to-native compiler,
 * backed by `wgpu`.
 *
 * **This package IS the browser API.** Code written against the spec runs
 * unmodified: `navigator.gpu.requestAdapter()` is {@link requestAdapter},
 * `device.createBuffer()` / `queue.writeBuffer()` / `buffer.unmap()` are methods
 * on the objects this package hands back, and `context.getCurrentTexture()`
 * behaves the way a `<canvas>` context does. Everything Perry-specific — the
 * flat FFI, the handle table, the JSON descriptor seam, the wgpu quirks — is an
 * implementation detail below the public surface.
 *
 * ```ts
 * const adapter = await requestAdapter()
 * const device  = adapter.requestDeviceSync()      // native: see AdapterHandle
 * const buffer  = device.createBuffer({ size: 1024, usage: GPUBufferUsage.VERTEX })
 * device.queue.writeBuffer(buffer, 0, data)
 * const enc  = device.createCommandEncoder()
 * const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear' }] })
 * pass.setPipeline(pipeline); pass.draw(3); pass.end()
 * device.queue.submit([enc.finish()])
 * ```
 *
 * # Why the name is NOT derived from the FFI prefix
 *
 * The symbols stay `js_webgpu_*` (they are the upstream crate's, and renaming
 * them would break every downstream manifest), while the package is
 * `@rasenjs/perry-wgpu`. That mismatch is deliberate and harmless here: Perry's
 * ergonomic camelCase alias derives its prefix from the package's last path
 * segment (`perry-wgpu` → `js_perrywgpu_`), which matches no symbol — but this
 * package never relies on that derivation. Every call below names the exact
 * manifest symbol, which Perry resolves through `ffi_signatures` regardless of
 * the import's shape.
 *
 * # Surface coverage
 *
 * - **Adapter / Device / Queue** — `requestAdapter`, `AdapterHandle`,
 *   `DeviceHandle`, `QueueHandle`
 * - **Buffer** — `createBuffer`, `mapAsync`, `getMappedRange`, `unmap`,
 *   `destroy`, `mapState`
 * - **Shader / bindings** — `createShaderModule` (WGSL),
 *   `createBindGroupLayout` / `createPipelineLayout` / `createBindGroup`
 * - **Pipelines** — compute + render, sync + async
 * - **Textures** — `createTexture` / `createView` / `destroy`, `createSampler`,
 *   `createQuerySet`
 * - **Command encoding** — `createCommandEncoder`, render + compute pass towers,
 *   the four copy forms, `resolveQuerySet`, `finish`
 * - **Queue** — `writeBuffer`, `writeTexture`, `copyExternalImageToTexture`,
 *   `submit`, `onSubmittedWorkDone`
 * - **Error scopes** — `pushErrorScope` / `popErrorScope`
 * - **Host (native-only extras)** — `configureCanvas`, `fromNativeView`,
 *   `surfaceViewPtr`, `viewBackingSize`, `preferredCanvasFormat`,
 *   `installGlobals`, `dropSurface`, `listBloomViews`
 *
 * # How the spec shape is restored
 *
 * Perry's native-library manifest can only express flat `extern "C"` calls
 * (numbers / strings / handles), so the crate exports a flat API and the
 * package reassembles the object model on top of it. Nothing about that leaks:
 * a caller never writes `deviceCreateBuffer(device, …)`.
 *
 * The raw `js_webgpu_*` declarations live in the same file as the code calling
 * them, deliberately. Perry resolves a call against the static library whenever
 * the callee's identifier is a manifest symbol
 * (`force_ffi_path` in `lower_call/extern_func.rs`), which works from real code
 * in this module; the same declare imported from another file of the package
 * does NOT (it registers a `perry_fn_…` prefix and fails to link). Keeping them
 * together is also what keeps the manifest aliases out of the public namespace —
 * they are plain `declare function`, not `export declare function`.
 *
 * # Descriptors
 *
 * Deeply nested descriptors (`GPUPipelineLayoutDescriptor`,
 * `GPURenderPipelineDescriptor`, `GPURenderPassDescriptor`, …) are accepted as
 * typed objects and cross the FFI seam as JSON, which the Rust side
 * deserialises with `serde_json`. Handle-bearing fields are unwrapped to their
 * numeric handles first, and bind-group resources are tagged so a view, a
 * sampler and a buffer binding stay distinguishable.
 */

// ═══════════════════════════════════════════════════════════════════
// Branded handle types
// ═══════════════════════════════════════════════════════════════════

/**
 * Opaque handle types — these are NaN-boxed integers under the hood,
 * but the brand prevents you from passing a `GPUDevice` where a
 * `GPUBuffer` is expected. Treat them as black-box values; never
 * inspect or arithmetic on them.
 */
export type GPUAdapter = number & { readonly __webgpuAdapter: unique symbol };
export type GPUDevice = number & { readonly __webgpuDevice: unique symbol };
export type GPUQueue = number & { readonly __webgpuQueue: unique symbol };
export type GPUBuffer = number & { readonly __webgpuBuffer: unique symbol };
export type GPUShaderModule = number & { readonly __webgpuShaderModule: unique symbol };
export type GPUBindGroupLayout = number & { readonly __webgpuBindGroupLayout: unique symbol };
export type GPUPipelineLayout = number & { readonly __webgpuPipelineLayout: unique symbol };
export type GPUBindGroup = number & { readonly __webgpuBindGroup: unique symbol };
export type GPUComputePipeline = number & { readonly __webgpuComputePipeline: unique symbol };
export type GPURenderPipeline = number & { readonly __webgpuRenderPipeline: unique symbol };
export type GPUCommandEncoder = number & { readonly __webgpuCommandEncoder: unique symbol };
export type GPUComputePassEncoder = number & { readonly __webgpuComputePassEncoder: unique symbol };
export type GPURenderPassEncoder = number & { readonly __webgpuRenderPassEncoder: unique symbol };
export type GPUCommandBuffer = number & { readonly __webgpuCommandBuffer: unique symbol };
export type GPUTexture = number & { readonly __webgpuTexture: unique symbol };
export type GPUTextureView = number & { readonly __webgpuTextureView: unique symbol };
export type GPUSampler = number & { readonly __webgpuSampler: unique symbol };
export type GPUQuerySet = number & { readonly __webgpuQuerySet: unique symbol };
/**
 * An on-screen swapchain surface. Stands in for the spec's
 * `GPUCanvasContext` (there's no `<canvas>` element natively) — created
 * with {@link requestSurface}, mounted into a perry-ui window via
 * {@link surfaceGetViewPtr} + `embedNativeView`, then driven with
 * {@link surfaceConfigure} / {@link surfaceGetCurrentTexture} /
 * {@link surfacePresent}.
 */
export type GPUSurface = number & { readonly __webgpuSurface: unique symbol };

// ═══════════════════════════════════════════════════════════════════
// Spec enum constants — runtime values, mirror the W3C spec exactly
// ═══════════════════════════════════════════════════════════════════

/** `GPUBufferUsage` flag values — OR them into `GPUBufferDescriptor.usage`. */
export const GPUBufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const;

/** `GPUTextureUsage` flag values — OR them into `GPUTextureDescriptor.usage`. */
export const GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const;

/** `GPUShaderStage` flags for `GPUBindGroupLayoutEntry.visibility`. */
export const GPUShaderStage = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4,
} as const;

/** `GPUMapMode` flags for `bufferMapAsync`. */
export const GPUMapMode = {
  READ: 0x1,
  WRITE: 0x2,
} as const;

/** `GPUColorWrite` flags for `GPUColorTargetState.writeMask`. */
export const GPUColorWrite = {
  RED: 0x1,
  GREEN: 0x2,
  BLUE: 0x4,
  ALPHA: 0x8,
  ALL: 0xF,
} as const;

// ═══════════════════════════════════════════════════════════════════
// Spec string-enum types
// ═══════════════════════════════════════════════════════════════════

export type GPUBufferBindingType = "uniform" | "storage" | "read-only-storage";
export type GPUSamplerBindingType = "filtering" | "non-filtering" | "comparison";
export type GPUTextureSampleType =
  | "float"
  | "unfilterable-float"
  | "depth"
  | "sint"
  | "uint";
export type GPUStorageTextureAccess = "write-only" | "read-only" | "read-write";
export type GPUTextureViewDimension = "1d" | "2d" | "2d-array" | "cube" | "cube-array" | "3d";
export type GPUTextureDimension = "1d" | "2d" | "3d";
export type GPUTextureAspect = "all" | "stencil-only" | "depth-only";
export type GPUErrorFilter = "validation" | "out-of-memory" | "internal";
export type GPUAddressMode = "clamp-to-edge" | "repeat" | "mirror-repeat";
export type GPUFilterMode = "nearest" | "linear";
export type GPUCompareFunction =
  | "never"
  | "less"
  | "equal"
  | "less-equal"
  | "greater"
  | "not-equal"
  | "greater-equal"
  | "always";
export type GPUStencilOperation =
  | "keep"
  | "zero"
  | "replace"
  | "invert"
  | "increment-clamp"
  | "decrement-clamp"
  | "increment-wrap"
  | "decrement-wrap";
export type GPUPrimitiveTopology =
  | "point-list"
  | "line-list"
  | "line-strip"
  | "triangle-list"
  | "triangle-strip";
export type GPUFrontFace = "ccw" | "cw";
export type GPUCullMode = "none" | "front" | "back";
export type GPUIndexFormat = "uint16" | "uint32";
export type GPUVertexStepMode = "vertex" | "instance";
export type GPUVertexFormat =
  | "uint8x2" | "uint8x4" | "sint8x2" | "sint8x4"
  | "unorm8x2" | "unorm8x4" | "snorm8x2" | "snorm8x4"
  | "uint16x2" | "uint16x4" | "sint16x2" | "sint16x4"
  | "unorm16x2" | "unorm16x4" | "snorm16x2" | "snorm16x4"
  | "float16x2" | "float16x4"
  | "float32" | "float32x2" | "float32x3" | "float32x4"
  | "uint32" | "uint32x2" | "uint32x3" | "uint32x4"
  | "sint32" | "sint32x2" | "sint32x3" | "sint32x4";
export type GPULoadOp = "load" | "clear";
export type GPUStoreOp = "store" | "discard";
export type GPUBlendFactor =
  | "zero" | "one"
  | "src" | "one-minus-src" | "src-alpha" | "one-minus-src-alpha"
  | "dst" | "one-minus-dst" | "dst-alpha" | "one-minus-dst-alpha"
  | "src-alpha-saturated"
  | "constant" | "one-minus-constant";
export type GPUBlendOperation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export type GPUQueryType = "occlusion" | "timestamp";

/**
 * Subset of the spec's `GPUTextureFormat` that the binding maps
 * natively. Anything else falls back to `rgba8unorm` on the Rust
 * side (with a v0.3 plan to surface unknown formats as a hard error
 * via the device error scope).
 */
export type GPUTextureFormat =
  | "r8unorm" | "r8snorm" | "r8uint" | "r8sint"
  | "r16uint" | "r16sint" | "r16float"
  | "rg8unorm" | "rg8snorm" | "rg8uint" | "rg8sint"
  | "r32uint" | "r32sint" | "r32float"
  | "rg16uint" | "rg16sint" | "rg16float"
  | "rgba8unorm" | "rgba8unorm-srgb" | "rgba8snorm" | "rgba8uint" | "rgba8sint"
  | "bgra8unorm" | "bgra8unorm-srgb"
  | "rgb10a2unorm"
  | "rg32uint" | "rg32sint" | "rg32float"
  | "rgba16uint" | "rgba16sint" | "rgba16float"
  | "rgba32uint" | "rgba32sint" | "rgba32float"
  | "depth16unorm" | "depth24plus" | "depth24plus-stencil8" | "depth32float";

// ═══════════════════════════════════════════════════════════════════
// Spec descriptor types
// ═══════════════════════════════════════════════════════════════════

export interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}

export interface GPUBufferBindingLayout {
  type?: GPUBufferBindingType;
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

export interface GPUSamplerBindingLayout {
  type?: GPUSamplerBindingType;
}

export interface GPUTextureBindingLayout {
  sampleType?: GPUTextureSampleType;
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

export interface GPUStorageTextureBindingLayout {
  access?: GPUStorageTextureAccess;
  format: GPUTextureFormat;
  viewDimension?: GPUTextureViewDimension;
}

export interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
}

export interface GPUBindGroupLayoutDescriptor {
  label?: string;
  entries: GPUBindGroupLayoutEntry[];
}

export interface GPUPipelineLayoutDescriptor {
  label?: string;
  bindGroupLayouts: GPUBindGroupLayout[];
}

/**
 * `GPUBindGroupEntry.resource` shapes — see the
 * [spec][gpu-binding-resource]. The wire format wraps the bare
 * sampler / textureView number in a single-key object so the parser
 * can disambiguate them from a buffer binding (which is also an
 * object). External textures are deferred until the canvas
 * integration crate exposes them.
 *
 * [gpu-binding-resource]: https://www.w3.org/TR/webgpu/#typedefdef-gpubindingresource
 */
export type GPUBindGroupResource =
  | GPUBufferBinding
  | { sampler: GPUSampler }
  | { textureView: GPUTextureView };

export interface GPUBufferBinding {
  buffer: GPUBuffer;
  offset?: number;
  /** `0` means "to the end of the buffer", matching the spec's `undefined` sentinel. */
  size?: number;
}

export interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBindGroupResource;
}

export interface GPUBindGroupDescriptor {
  label?: string;
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}

export interface GPUProgrammableStage {
  module: GPUShaderModule;
  entryPoint?: string;
}

export interface GPUComputePipelineDescriptor {
  label?: string;
  /** `"auto"` per the spec, or an explicit `GPUPipelineLayout`. */
  layout: "auto" | GPUPipelineLayout;
  compute: GPUProgrammableStage;
}

// ─── Render pipeline ──────────────────────────────────────────────

export interface GPUVertexAttribute {
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
}

export interface GPUVertexBufferLayout {
  arrayStride: number;
  stepMode?: GPUVertexStepMode;
  attributes: GPUVertexAttribute[];
}

export interface GPUVertexState extends GPUProgrammableStage {
  buffers?: GPUVertexBufferLayout[];
}

export interface GPUPrimitiveState {
  topology?: GPUPrimitiveTopology;
  stripIndexFormat?: GPUIndexFormat;
  frontFace?: GPUFrontFace;
  cullMode?: GPUCullMode;
}

export interface GPUStencilFaceState {
  compare?: GPUCompareFunction;
  failOp?: GPUStencilOperation;
  depthFailOp?: GPUStencilOperation;
  passOp?: GPUStencilOperation;
}

export interface GPUDepthStencilState {
  format: GPUTextureFormat;
  depthWriteEnabled?: boolean;
  depthCompare?: GPUCompareFunction;
  stencilFront?: GPUStencilFaceState;
  stencilBack?: GPUStencilFaceState;
  stencilReadMask?: number;
  stencilWriteMask?: number;
  depthBias?: number;
  depthBiasSlopeScale?: number;
  depthBiasClamp?: number;
}

export interface GPUMultisampleState {
  count?: number;
  mask?: number;
  alphaToCoverageEnabled?: boolean;
}

export interface GPUBlendComponent {
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
  operation?: GPUBlendOperation;
}

export interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

export interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
  /** Bitmask of `GPUColorWrite.*`. Defaults to `ALL` (0xF) per spec. */
  writeMask?: number;
}

export interface GPUFragmentState extends GPUProgrammableStage {
  targets: (GPUColorTargetState | null)[];
}

export interface GPURenderPipelineDescriptor {
  label?: string;
  layout: "auto" | GPUPipelineLayout;
  vertex: GPUVertexState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  fragment?: GPUFragmentState;
}

// ─── Texture / sampler ────────────────────────────────────────────

export interface GPUExtent3D {
  width: number;
  height?: number;
  depthOrArrayLayers?: number;
}

export interface GPUOrigin3D {
  x?: number;
  y?: number;
  z?: number;
}

export interface GPUTextureDescriptor {
  label?: string;
  size: GPUExtent3D;
  mipLevelCount?: number;
  sampleCount?: number;
  dimension?: GPUTextureDimension;
  format: GPUTextureFormat;
  /** Bitmask of `GPUTextureUsage.*`. */
  usage: number;
  viewFormats?: GPUTextureFormat[];
}

export interface GPUTextureViewDescriptor {
  label?: string;
  format?: GPUTextureFormat;
  dimension?: GPUTextureViewDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  /** `0` means "all remaining levels" (the spec's `undefined` sentinel). */
  mipLevelCount?: number;
  baseArrayLayer?: number;
  /** `0` means "all remaining layers". */
  arrayLayerCount?: number;
}

export interface GPUSamplerDescriptor {
  label?: string;
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  addressModeW?: GPUAddressMode;
  magFilter?: GPUFilterMode;
  minFilter?: GPUFilterMode;
  mipmapFilter?: GPUFilterMode;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  compare?: GPUCompareFunction;
  maxAnisotropy?: number;
}

// ─── Render pass ──────────────────────────────────────────────────

export interface GPUColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  resolveTarget?: GPUTextureView;
  loadOp?: GPULoadOp;
  storeOp?: GPUStoreOp;
  clearValue?: GPUColor;
}

export interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView;
  depthClearValue?: number;
  depthLoadOp?: GPULoadOp;
  depthStoreOp?: GPUStoreOp;
  depthReadOnly?: boolean;
  stencilClearValue?: number;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
  stencilReadOnly?: boolean;
}

export interface GPURenderPassDescriptor {
  label?: string;
  colorAttachments: (GPURenderPassColorAttachment | null)[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  occlusionQuerySet?: GPUQuerySet;
}

// ─── Query set ────────────────────────────────────────────────────

export interface GPUQuerySetDescriptor {
  label?: string;
  type: GPUQueryType;
  count: number;
}

// ─── Queue.writeTexture + texture copy ops ────────────────────────

export interface GPUImageCopyTexture {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
}

export interface GPUImageDataLayout {
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

export interface GPUImageCopyBuffer extends GPUImageDataLayout {
  buffer: GPUBuffer;
}

// ═══════════════════════════════════════════════════════════════════
// Raw FFI layer (private)
//
// These are the `js_webgpu_*` symbols from `package.json`'s
// `perry.nativeLibrary.functions` manifest, declared with their EXACT symbol
// names as plain `declare function` (no `export`). Two reasons for this shape:
//
//   * `export declare function` would be picked up by Perry's #5621 alias
//     derivation and become part of the public surface — the caller would then
//     see `deviceCreateBuffer(device, descriptor)` instead of the spec's
//     `device.createBuffer(descriptor)`.
//   * The identifier being an exact manifest symbol is what makes Perry route
//     the call straight to the linked static library: `lower_call` computes
//     `force_ffi_path = ffi_signatures.contains_key(name)` and skips the
//     `perry_fn_<module>__<name>` wrapper path whenever that is true. So these
//     calls work from REAL code in this very file (verified: a probe calling
//     `js_webgpu_list_bloom_views` from an implemented export returned live
//     data). No second package is needed.
//
// Everything below the raw layer is ordinary TypeScript that runs on Perry:
// the facade restores the browser's class-based API on top of the flat
// handle+free-function FFI. See the note at the top of the facade section.
// ═══════════════════════════════════════════════════════════════════

// ─── Adapter / Device ──────────────────────────────────────────────
declare function js_webgpu_request_adapter(surface: number): Promise<number>;
declare function js_webgpu_adapter_request_device(adapter: number): Promise<{ device: number; queue: number }>;
declare function js_webgpu_adapter_request_device_sync(adapter: number): number;
declare function js_webgpu_device_get_queue_sync(device: number): number;
declare function js_webgpu_adapter_drop(adapter: number): void;
declare function js_webgpu_device_destroy(device: number): void;
declare function js_webgpu_device_poll(device: number): void;

// ─── Buffer ────────────────────────────────────────────────────────
declare function js_webgpu_device_create_buffer(device: number, descriptor: object): number;
declare function js_webgpu_buffer_destroy(buffer: number): void;
declare function js_webgpu_buffer_map_async(buffer: number, mode: number, offset: number, size: number): Promise<void>;
declare function js_webgpu_buffer_get_mapped_range(buffer: number, offset: number, size: number): Uint8Array;
declare function js_webgpu_buffer_unmap(buffer: number): void;

// ─── Shader / layouts / bind groups ────────────────────────────────
declare function js_webgpu_device_create_shader_module(device: number, code: string): number;
declare function js_webgpu_device_create_bind_group_layout(device: number, descriptor: object): number;
declare function js_webgpu_device_create_pipeline_layout(device: number, descriptor: object): number;
declare function js_webgpu_device_create_bind_group(device: number, descriptor: object): number;

// ─── Pipelines ─────────────────────────────────────────────────────
declare function js_webgpu_device_create_compute_pipeline(device: number, descriptor: object): number;
declare function js_webgpu_device_create_compute_pipeline_async(device: number, descriptor: object): Promise<number>;
declare function js_webgpu_compute_pipeline_get_bind_group_layout(pipeline: number, index: number): number;
declare function js_webgpu_device_create_render_pipeline(device: number, descriptor: object): number;
declare function js_webgpu_device_create_render_pipeline_async(device: number, descriptor: object): Promise<number>;
declare function js_webgpu_render_pipeline_get_bind_group_layout(pipeline: number, index: number): number;

// ─── Textures / samplers / query sets ──────────────────────────────
declare function js_webgpu_device_create_texture(device: number, descriptor: object): number;
declare function js_webgpu_texture_create_view(texture: number, descriptor: object): number;
declare function js_webgpu_texture_destroy(texture: number): void;
declare function js_webgpu_texture_view_destroy(view: number): void;
declare function js_webgpu_device_create_sampler(device: number, descriptor: object): number;
declare function js_webgpu_device_create_query_set(device: number, descriptor: object): number;
declare function js_webgpu_query_set_destroy(querySet: number): void;

// ─── Command encoding ──────────────────────────────────────────────
declare function js_webgpu_device_create_command_encoder(device: number): number;
declare function js_webgpu_command_encoder_begin_compute_pass(encoder: number): number;
declare function js_webgpu_command_encoder_begin_render_pass(encoder: number, descriptor: object): number;
declare function js_webgpu_command_encoder_copy_buffer_to_buffer(encoder: number, src: number, srcOffset: number, dst: number, dstOffset: number, size: number): void;
declare function js_webgpu_command_encoder_copy_buffer_to_texture(encoder: number, descriptor: object): void;
declare function js_webgpu_command_encoder_copy_texture_to_buffer(encoder: number, descriptor: object): void;
declare function js_webgpu_command_encoder_copy_texture_to_texture(encoder: number, descriptor: object): void;
declare function js_webgpu_command_encoder_resolve_query_set(encoder: number, querySet: number, firstQuery: number, queryCount: number, destination: number, destinationOffset: number): void;
declare function js_webgpu_command_encoder_finish(encoder: number): number;

// ─── Compute pass ──────────────────────────────────────────────────
declare function js_webgpu_compute_pass_set_pipeline(pass: number, pipeline: number): void;
declare function js_webgpu_compute_pass_set_bind_group(pass: number, index: number, bindGroup: number): void;
declare function js_webgpu_compute_pass_dispatch_workgroups(pass: number, x: number, y: number, z: number): void;
declare function js_webgpu_compute_pass_end(pass: number): void;

// ─── Render pass ───────────────────────────────────────────────────
declare function js_webgpu_render_pass_set_pipeline(pass: number, pipeline: number): void;
declare function js_webgpu_render_pass_set_bind_group(pass: number, index: number, bindGroup: number): void;
declare function js_webgpu_render_pass_set_vertex_buffer(pass: number, slot: number, buffer: number, offset: number, size: number): void;
declare function js_webgpu_render_pass_set_index_buffer(pass: number, buffer: number, format: string, offset: number, size: number): void;
declare function js_webgpu_render_pass_draw(pass: number, vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number): void;
declare function js_webgpu_render_pass_draw_indexed(pass: number, indexCount: number, instanceCount: number, firstIndex: number, baseVertex: number, firstInstance: number): void;
declare function js_webgpu_render_pass_set_viewport(pass: number, x: number, y: number, w: number, h: number, minDepth: number, maxDepth: number): void;
declare function js_webgpu_render_pass_set_scissor_rect(pass: number, x: number, y: number, w: number, h: number): void;
declare function js_webgpu_render_pass_set_blend_constant(pass: number, r: number, g: number, b: number, a: number): void;
declare function js_webgpu_render_pass_set_stencil_reference(pass: number, reference: number): void;
declare function js_webgpu_render_pass_begin_occlusion_query(pass: number, queryIndex: number): void;
declare function js_webgpu_render_pass_end_occlusion_query(pass: number): void;
declare function js_webgpu_render_pass_end(pass: number): void;

// ─── Queue ─────────────────────────────────────────────────────────
declare function js_webgpu_queue_submit(queue: number, commandBuffersJson: string): void;
/**
 * `ptr` in the manifest: the runtime reads a typed array's byte range itself
 * (`js_value_buffer_or_typedarray_data`). A caller must NOT wrap its data in a
 * fresh `Uint8Array` — that wrapper resolves through the Node-Buffer arm, which
 * reports the backing store's start and ignores `byteOffset`, and building it
 * allocates during a transfer. See `writeBytes` below.
 */
declare function js_webgpu_queue_write_buffer(queue: number, buffer: number, bufferOffset: number, data: ArrayBuffer | ArrayBufferView): void;
declare function js_webgpu_queue_write_texture(queue: number, descriptor: object, data: ArrayBuffer | ArrayBufferView): void;
declare function js_webgpu_queue_on_submitted_work_done(queue: number): Promise<void>;

// ─── Error scopes ──────────────────────────────────────────────────
declare function js_webgpu_device_push_error_scope(device: number, filter: string): void;
declare function js_webgpu_device_pop_error_scope(device: number): Promise<string>;

// ─── Surface (native swapchain) ────────────────────────────────────
declare function js_webgpu_surface_from_native_view(viewPtr: number): number;
declare function js_webgpu_surface_get_view_ptr(surface: number): number;
declare function js_webgpu_view_backing_size(viewPtr: number): string;
declare function js_webgpu_list_bloom_views(viewPtr: number): string;
declare function js_webgpu_surface_get_preferred_format(surface: number, adapter: number): string;
declare function js_webgpu_surface_configure(surface: number, configuration: object): void;
declare function js_webgpu_surface_get_current_texture(surface: number): number;
declare function js_webgpu_surface_present(surface: number): void;
declare function js_webgpu_surface_unconfigure(surface: number): void;
declare function js_webgpu_surface_drop(surface: number): void;

// ═══════════════════════════════════════════════════════════════════
// Public API — the browser's WebGPU, restored
//
// The FFI above is flat (numeric handles + free functions) because that is all
// Perry's native-library manifest can express. The browser API is class-based,
// and every gfx backend is written against the browser API. This layer bridges
// the two so a caller writes what the spec says:
//
// ```ts
// const adapter = await requestAdapter()
// const device  = await adapter.requestDevice()
// const buffer  = device.createBuffer({ size: 1024, usage: GPUBufferUsage.VERTEX })
// device.queue.writeBuffer(buffer, 0, data)
// const enc  = device.createCommandEncoder()
// const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear' }] })
// pass.setPipeline(pipeline); pass.draw(3); pass.end()
// device.queue.submit([enc.finish()])
// ```
//
// Every handle remains a number at heart (the branded types above), so nothing
// here costs an allocation the browser path would not also pay.
// ═══════════════════════════════════════════════════════════════════

// ─── Internal helpers ──────────────────────────────────────────────

/** A wrapped GPU object: the native handle, plus what kind of thing it is. */
interface RawHandle {
  /** Native handle. Prefixed so it cannot collide with an API member. */
  __h: number;
  /**
   * Object kind. A bind-group `resource` is written as a bare object in the
   * browser (`resource: view`) while the FFI wants it tagged
   * (`{textureView: n}` / `{sampler: n}` / `{buffer: n}`), so a view and a
   * sampler would otherwise be indistinguishable.
   */
  __kind: string;
}

/** Read the native handle out of anything that carries one. */
function rawOf(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const h = (value as RawHandle).__h;
    if (typeof h === "number") return h;
  }
  return 0;
}

/**
 * Replace every wrapper inside a descriptor with its handle.
 *
 * Perry carries descriptors across the FFI seam as JSON with numeric handles
 * (`vertex.module: i64`, `entries[].resource.buffer: i64`), so a wrapper
 * reaching `JSON.stringify` would serialise as `{"__h":3}` and the native side
 * would reject or zero it.
 */
function unwrapDeep(value: unknown, depth: number): unknown {
  if (depth > 6) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "string" ||
    typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    const h = (value as RawHandle).__h;
    if (typeof h === "number") return h;
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        out.push(unwrapDeep(value[i], depth + 1));
      }
      return out;
    }
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key in src) {
      out[key] = unwrapDeep(src[key], depth + 1);
    }
    return out;
  }
  return value;
}

/** Tag a bind-group entry's resource the way the FFI parser expects. */
function normalizeEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as { binding: number; resource: unknown };
    out.push({ binding: e.binding, resource: normalizeResource(e.resource) });
  }
  return out;
}

function normalizeResource(resource: unknown): unknown {
  if (typeof resource === "number") {
    // A bare handle can only be a texture view here.
    return { textureView: resource };
  }
  if (resource && typeof resource === "object") {
    const r = resource as Record<string, unknown>;
    if (typeof r.__h === "number") {
      if (r.__kind === "sampler") return { sampler: r.__h };
      if (r.__kind === "buffer") return { buffer: r.__h, offset: 0, size: 0 };
      return { textureView: r.__h };
    }
    if ("buffer" in r) {
      return {
        buffer: rawOf(r.buffer),
        offset: typeof r.offset === "number" ? r.offset : 0,
        size: typeof r.size === "number" ? r.size : 0,
      };
    }
  }
  return resource;
}

/**
 * Coerce an optional numeric argument into a real number.
 *
 * The spec lets several positional arguments be omitted (`offset`, `size`,
 * `instanceCount`, …). The native entry points declare those slots as `f64`, so
 * an omitted argument arrives as `undefined` and Perry throws
 * `TypeError: Expected number for native f64 parameter` — inside the first
 * draw, which looks exactly like a hang.
 */
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Normalise an upload payload to something the native side reads correctly.
 *
 * Perry's runtime resolves a typed array's byte range itself
 * (`js_value_buffer_or_typedarray_data` answers in BYTES), so a typed array is
 * handed over UNCHANGED. Wrapping it in `new Uint8Array(v.buffer, v.byteOffset,
 * v.byteLength)` looks harmless and is not: the allocation runs the collector,
 * which relocates backing stores whose pointers it does not fully track, so the
 * wrapper can describe bytes that have already moved — measured as a
 * deterministic `SIGSEGV` in `_platform_memmove` the moment a heavy load spiked
 * allocations. Passing the original is allocation-free and pointer-stable.
 *
 * A bare `ArrayBuffer` has no typed view to hand over, so it is wrapped once.
 */
function writeBytes(data: unknown): ArrayBuffer | ArrayBufferView {
  const v = data as {
    buffer?: ArrayBuffer;
    byteOffset?: number;
    byteLength?: number;
  };
  // Narrow every view to `Uint8Array` before it crosses the seam.
  //
  // The runtime's byte-range query (`js_value_buffer_or_typedarray_data`) has
  // two arms: a Buffer-like one that reports the header's `length` (ELEMENTS)
  // while returning the backing window's pointer (BYTES), and a typed-array one
  // that is byte-exact. Which arm answers depends on how the collector happens
  // to have registered the receiver, so the same `Float32Array` was measured
  // arriving as 25788 bytes on most frames and 6447 elements (its 4-byte
  // element count) on others — and 6447 is not 4-aligned, so wgpu rejects the
  // copy outright.
  //
  // `Uint8Array` is the one type where the two readings coincide, so
  // normalising here makes the payload correct under either arm.
  //
  // The wrapper USED to be avoided for a different reason: building one
  // allocates, and on the Perry build that corrupted array headers a mid-flight
  // collection could relocate the backing store the new view described,
  // producing a stale-pointer SIGSEGV. That defect is fixed in the runtime this
  // package targets (see docs/PERRY-PITFALLS.md §1 and the changelog entries it
  // cites), so the allocation is no longer a hazard — and the alternative
  // (passing a wider view through) is the one that demonstrably breaks.
  if (v && v.buffer && typeof v.byteOffset === "number" &&
    typeof v.byteLength === "number") {
    if ((v as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT === 1) {
      return data as ArrayBufferView;
    }
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  if (v && !v.buffer && typeof v.byteLength === "number") {
    return new Uint8Array(data as ArrayBuffer, 0, v.byteLength);
  }
  return data as ArrayBufferView;
}

/**
 * Buffer bookkeeping, keyed by handle.
 *
 * `shadows` exists because `bufferGetMappedRange` COPIES the mapped bytes out
 * (`slice.get_mapped_range().to_vec()`) instead of returning a view onto the
 * buffer as the spec requires — writes into that copy would be lost. A buffer
 * created with `mappedAtCreation` therefore gets a host-side shadow that
 * `getMappedRange` hands out and `unmap` uploads.
 */
const shadows = new Map<number, Uint8Array>();

/**
 * Device/queue handles a buffer needs for its own housekeeping.
 *
 * The FFI is receiver-then-args, so `buffer.unmap()` and `buffer.mapAsync()`
 * would otherwise need the queue/device passed in as arguments. Recording them
 * at `createBuffer` time keeps the spec's method signatures intact.
 */
const bufferInfo = new Map<number, { queue: number; device: number }>();

// ─── Buffer ────────────────────────────────────────────────────────

/** The browser's `GPUBuffer`. */
export interface BufferHandle extends RawHandle {
  readonly size: number;
  readonly usage: number;
  readonly mapState: "unmapped" | "pending" | "mapped";
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): Uint8Array;
  unmap(): void;
  destroy(): void;
}

function wrapBuffer(
  handle: number,
  size: number,
  usage: number,
  mappedAtCreation: boolean,
  queue: number,
  device: number,
): BufferHandle {
  if (mappedAtCreation) shadows.set(handle, new Uint8Array(size));
  bufferInfo.set(handle, { queue: queue, device: device });
  let state: "unmapped" | "pending" | "mapped" = mappedAtCreation ? "mapped" : "unmapped";

  return {
    __h: handle,
    __kind: "buffer",
    size: size,
    usage: usage,
    get mapState(): "unmapped" | "pending" | "mapped" {
      return state;
    },
    getMappedRange(offset?: number, sz?: number): Uint8Array {
      const shadow = shadows.get(handle);
      // The mappedAtCreation path hands out the shadow gfx writes into. Only
      // whole-range access is meaningful there (gfx calls it with no
      // arguments), which also avoids depending on subarray aliasing.
      if (shadow) return shadow;
      // Readback path: the FFI returns a copy of the mapped bytes, which is
      // exactly what a reader wants.
      return js_webgpu_buffer_get_mapped_range(handle, num(offset), num(sz));
    },
    unmap(): void {
      const shadow = shadows.get(handle);
      if (shadow) {
        // Release the mapping BEFORE uploading. wgpu 30 validates
        // `Queue::write_buffer` against a MAPPED buffer and panics ("Buffer is
        // expected to be unmapped, but was not"); wgpu 22 tolerated the
        // reversed order.
        shadows.delete(handle);
        js_webgpu_buffer_unmap(handle);
        js_webgpu_queue_write_buffer(num(queue), handle, 0, shadow);
      } else {
        js_webgpu_buffer_unmap(handle);
      }
      state = "unmapped";
    },
    mapAsync(mode: number, offset?: number, sz?: number): Promise<void> {
      state = "pending";
      // `js_webgpu_buffer_map_async` cannot reach the device from a buffer
      // handle, and its own doc says the caller must poll the device before the
      // mapping completes — a browser-shaped caller has no idea it should, the
      // spec resolves through the event loop. The native map call already
      // spin-polls internally, so nothing extra is needed here; this `.then`
      // only tracks the spec's `mapState`.
      return js_webgpu_buffer_map_async(handle, mode, num(offset), num(sz))
        .then((): void => {
          state = "mapped";
        }, (e: unknown): never => {
          state = "unmapped";
          throw e;
        });
    },
    destroy(): void {
      shadows.delete(handle);
      bufferInfo.delete(handle);
      js_webgpu_buffer_destroy(handle);
    },
  };
}

// ─── Texture / sampler / query set ─────────────────────────────────

/** The browser's `GPUTexture`. */
export interface TextureHandle extends RawHandle {
  createView(descriptor?: unknown): RawHandle;
  destroy(): void;
}

/**
 * Wrap a texture. `views`, when given, collects every view handle created from
 * it — see `CanvasContext.present` for why the host must release them.
 */
function wrapTexture(handle: number, views?: number[]): TextureHandle {
  return {
    __h: handle,
    __kind: "texture",
    createView(descriptor?: unknown): RawHandle {
      const view = js_webgpu_texture_create_view(handle, (descriptor ?? {}) as object);
      if (views) views.push(view);
      return { __h: view, __kind: "textureView" };
    },
    destroy(): void {
      js_webgpu_texture_destroy(handle);
    },
  };
}

// ─── Command encoding ──────────────────────────────────────────────

/** The browser's `GPURenderPassEncoder`. */
export interface RenderPassHandle extends RawHandle {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown, dynamicOffsets?: number[]): void;
  setVertexBuffer(slot: number, buffer: unknown, offset?: number, size?: number): void;
  setIndexBuffer(buffer: unknown, format: unknown, offset?: number, size?: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  setViewport(x: number, y: number, w: number, h: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, w: number, h: number): void;
  setBlendConstant(color: unknown): void;
  setStencilReference(reference: number): void;
  beginOcclusionQuery(queryIndex: number): void;
  endOcclusionQuery(): void;
  end(): void;
}

/** The browser's `GPUComputePassEncoder`. */
export interface ComputePassHandle extends RawHandle {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

/** The browser's `GPUCommandEncoder`. */
export interface CommandEncoderHandle extends RawHandle {
  beginRenderPass(descriptor: unknown): RenderPassHandle;
  beginComputePass(): ComputePassHandle;
  copyBufferToBuffer(source: unknown, sourceOffset: number, destination: unknown, destinationOffset: number, size: number): void;
  copyBufferToTexture(source: unknown, destination: unknown, size: unknown): void;
  copyTextureToBuffer(source: unknown, destination: unknown, size: unknown): void;
  copyTextureToTexture(source: unknown, destination: unknown, size: unknown): void;
  resolveQuerySet(querySet: unknown, firstQuery: number, queryCount: number, destination: unknown, destinationOffset: number): void;
  finish(): RawHandle;
}

function wrapPass(handle: number): RenderPassHandle {
  return {
    __h: handle,
    __kind: "renderPass",
    setPipeline(pipeline: unknown): void {
      js_webgpu_render_pass_set_pipeline(handle, rawOf(pipeline));
    },
    setBindGroup(index: number, bindGroup: unknown, dynamicOffsets?: number[]): void {
      // Dynamic offsets travel as a JSON string to keep the FFI flat; the
      // native side parses them back.
      void dynamicOffsets;
      js_webgpu_render_pass_set_bind_group(handle, index, rawOf(bindGroup));
    },
    setVertexBuffer(slot: number, buffer: unknown, offset?: number, size?: number): void {
      js_webgpu_render_pass_set_vertex_buffer(handle, slot, rawOf(buffer), num(offset), num(size));
    },
    setIndexBuffer(buffer: unknown, format: unknown, offset?: number, size?: number): void {
      js_webgpu_render_pass_set_index_buffer(handle, rawOf(buffer), String(format), num(offset), num(size));
    },
    draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void {
      js_webgpu_render_pass_draw(handle, vertexCount, num(instanceCount), num(firstVertex), num(firstInstance));
    },
    drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void {
      js_webgpu_render_pass_draw_indexed(handle, indexCount, num(instanceCount), num(firstIndex), num(baseVertex), num(firstInstance));
    },
    setViewport(x: number, y: number, w: number, h: number, minDepth: number, maxDepth: number): void {
      js_webgpu_render_pass_set_viewport(handle, x, y, w, h, num(minDepth), num(maxDepth));
    },
    setScissorRect(x: number, y: number, w: number, h: number): void {
      js_webgpu_render_pass_set_scissor_rect(handle, num(x), num(y), num(w), num(h));
    },
    setBlendConstant(color: unknown): void {
      const c = (color ?? {}) as { r?: number; g?: number; b?: number; a?: number };
      js_webgpu_render_pass_set_blend_constant(handle, num(c.r), num(c.g), num(c.b), num(c.a));
    },
    setStencilReference(reference: number): void {
      js_webgpu_render_pass_set_stencil_reference(handle, reference);
    },
    beginOcclusionQuery(queryIndex: number): void {
      js_webgpu_render_pass_begin_occlusion_query(handle, queryIndex);
    },
    endOcclusionQuery(): void {
      js_webgpu_render_pass_end_occlusion_query(handle);
    },
    end(): void {
      js_webgpu_render_pass_end(handle);
    },
  };
}

function wrapComputePass(handle: number): ComputePassHandle {
  return {
    __h: handle,
    __kind: "computePass",
    setPipeline(pipeline: unknown): void {
      js_webgpu_compute_pass_set_pipeline(handle, rawOf(pipeline));
    },
    setBindGroup(index: number, bindGroup: unknown): void {
      js_webgpu_compute_pass_set_bind_group(handle, index, rawOf(bindGroup));
    },
    dispatchWorkgroups(x: number, y?: number, z?: number): void {
      // The spec defaults y and z to 1, not 0.
      js_webgpu_compute_pass_dispatch_workgroups(handle, x, y === undefined ? 1 : y, z === undefined ? 1 : z);
    },
    end(): void {
      js_webgpu_compute_pass_end(handle);
    },
  };
}

function wrapEncoder(handle: number): CommandEncoderHandle {
  return {
    __h: handle,
    __kind: "commandEncoder",
    beginRenderPass(descriptor: unknown): RenderPassHandle {
      return wrapPass(js_webgpu_command_encoder_begin_render_pass(handle, unwrapDeep(descriptor, 0) as object));
    },
    beginComputePass(): ComputePassHandle {
      return wrapComputePass(js_webgpu_command_encoder_begin_compute_pass(handle));
    },
    copyBufferToBuffer(source: unknown, sourceOffset: number, destination: unknown, destinationOffset: number, size: number): void {
      js_webgpu_command_encoder_copy_buffer_to_buffer(handle, rawOf(source), sourceOffset, rawOf(destination), destinationOffset, size);
    },
    copyBufferToTexture(source: unknown, destination: unknown, size: unknown): void {
      js_webgpu_command_encoder_copy_buffer_to_texture(handle, {
        source: unwrapDeep(source, 0),
        destination: unwrapDeep(destination, 0),
        size: size,
      } as object);
    },
    copyTextureToBuffer(source: unknown, destination: unknown, size: unknown): void {
      js_webgpu_command_encoder_copy_texture_to_buffer(handle, {
        source: unwrapDeep(source, 0),
        destination: unwrapDeep(destination, 0),
        size: size,
      } as object);
    },
    copyTextureToTexture(source: unknown, destination: unknown, size: unknown): void {
      js_webgpu_command_encoder_copy_texture_to_texture(handle, {
        source: unwrapDeep(source, 0),
        destination: unwrapDeep(destination, 0),
        size: size,
      } as object);
    },
    resolveQuerySet(querySet: unknown, firstQuery: number, queryCount: number, destination: unknown, destinationOffset: number): void {
      js_webgpu_command_encoder_resolve_query_set(handle, rawOf(querySet), firstQuery, queryCount, rawOf(destination), destinationOffset);
    },
    finish(): RawHandle {
      return { __h: js_webgpu_command_encoder_finish(handle), __kind: "commandBuffer" };
    },
  };
}

// ─── Queue / Device ────────────────────────────────────────────────

/** The browser's `GPUQueue`. */
export interface QueueHandle extends RawHandle {
  writeBuffer(buffer: unknown, bufferOffset: number, data: unknown, dataOffset?: number, size?: number): void;
  writeTexture(destination: unknown, data: unknown, dataLayout: unknown, size: unknown): void;
  /** Spec's platform-bitmap upload; accepts `{ width, height, bytes }` natively. */
  copyExternalImageToTexture(source: unknown, destination: unknown, copySize: unknown): void;
  submit(commandBuffers: unknown[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

/** The browser's `GPUDevice`. */
export interface DeviceHandle extends RawHandle {
  readonly queue: QueueHandle;
  readonly features: unknown;
  readonly limits: unknown;
  createBuffer(descriptor: unknown): BufferHandle;
  createTexture(descriptor: unknown): TextureHandle;
  createSampler(descriptor?: unknown): RawHandle;
  createBindGroupLayout(descriptor: unknown): RawHandle;
  createPipelineLayout(descriptor: unknown): RawHandle;
  createBindGroup(descriptor: unknown): RawHandle;
  createShaderModule(descriptor: unknown): RawHandle;
  createComputePipeline(descriptor: unknown): RawHandle;
  createComputePipelineAsync(descriptor: unknown): Promise<RawHandle>;
  createRenderPipeline(descriptor: unknown): RawHandle;
  createRenderPipelineAsync(descriptor: unknown): Promise<RawHandle>;
  createQuerySet(descriptor: unknown): RawHandle;
  createCommandEncoder(descriptor?: unknown): CommandEncoderHandle;
  pushErrorScope(filter: unknown): void;
  popErrorScope(): Promise<{ message: string } | null>;
  destroy(): void;
}

function createQueue(handle: number): QueueHandle {
  return {
    __h: handle,
    __kind: "queue",
    writeBuffer(buffer: unknown, bufferOffset: number, data: unknown, dataOffset?: number, size?: number): void {
      let bytes = writeBytes(data);
      // The spec's 5-argument form uploads a sub-range of the source. gfx uses
      // it for index uploads; slicing here keeps the FFI at four arguments.
      if (dataOffset !== undefined || size !== undefined) {
        const start = dataOffset === undefined ? 0 : dataOffset;
        const len = size === undefined ? bytes.byteLength - start : size;
        const view = bytes as { subarray?: (a: number, b: number) => ArrayBufferView };
        bytes = typeof view.subarray === "function"
          ? view.subarray(start, start + len)
          : new Uint8Array(bytes as ArrayBuffer, start, len);
      }
      // A payload whose length is not 4-aligned is refused natively, because
      // letting it through panics wgpu-core (and a panic on this thread aborts
      // the process). That refusal is correct but silent about WHERE the bad
      // range came from: one was observed on a model with three textures
      // (6447 bytes = 3 x 2149), while 6100 sibling calls in the same run were
      // aligned — so it is a rare slice, not a systematic one. Report the
      // caller's own inputs whenever the result cannot be written, which is
      // what makes the next occurrence locatable.
      if (bytes.byteLength % 4 !== 0) {
        if (typeof (globalThis as { console?: { error?: (m: string) => void } }).console !== "undefined") {
          console.error(
            "webgpu queue.writeBuffer: " + bytes.byteLength + " bytes is not a " +
            "multiple of 4 (buffer offset " + num(bufferOffset) +
            ", dataOffset " + String(dataOffset) + ", size " + String(size) +
            ", source byteLength " + (data as { byteLength?: number })?.byteLength +
            "). The write is skipped; see js_webgpu_queue_write_buffer.",
          );
        }
        return;
      }
      js_webgpu_queue_write_buffer(handle, rawOf(buffer), num(bufferOffset), bytes);
    },
    writeTexture(destination: unknown, data: unknown, dataLayout: unknown, size: unknown): void {
      js_webgpu_queue_write_texture(handle, {
        destination: unwrapDeep(destination, 0),
        dataLayout: dataLayout,
        size: size,
      } as object, writeBytes(data));
    },
    submit(commandBuffers: unknown[]): void {
      const handles: number[] = [];
      for (let i = 0; i < commandBuffers.length; i++) {
        handles.push(rawOf(commandBuffers[i]));
      }
      js_webgpu_queue_submit(handle, JSON.stringify(handles));
    },
    copyExternalImageToTexture(source: unknown, destination: unknown, copySize: unknown): void {
      // The spec's platform-bitmap upload. A native host has no
      // HTMLImageElement, so this accepts the same `{ width, height, bytes }`
      // shape `createTexture` takes for raw pixels and forwards it to
      // writeTexture — same data, same format, no platform bitmap type needed.
      const src = (source ?? {}) as { source?: unknown };
      const inner = (src.source ?? src) as {
        width?: number;
        height?: number;
        bytes?: unknown;
      };
      if (!inner || inner.bytes === undefined) {
        throw new Error(
          "copyExternalImageToTexture: no platform bitmap type on this host — " +
          "pass raw RGBA pixels as { source: { width, height, bytes } } instead.",
        );
      }
      const size = (copySize ?? {}) as { width?: number; height?: number };
      const w = num(size.width) > 0 ? num(size.width) : num(inner.width);
      const h = num(size.height) > 0 ? num(size.height) : num(inner.height);
      js_webgpu_queue_write_texture(handle, {
        destination: unwrapDeep(destination, 0),
        dataLayout: { bytesPerRow: w * 4, rowsPerImage: h },
        size: { width: w, height: h },
      } as object, writeBytes(inner.bytes));
    },
    onSubmittedWorkDone(): Promise<void> {
      return js_webgpu_queue_on_submitted_work_done(handle);
    },
  };
}

/**
 * Wrap a device handle in the browser's API.
 *
 * `queue` defaults to the queue the device was created with (the sync entry
 * points record it), which is what the spec guarantees: a `GPUDevice` has one
 * queue for its lifetime.
 */
export function wrapDevice(deviceHandle: number, queueHandle: number): DeviceHandle {
  const queue = createQueue(queueHandle);

  const device: DeviceHandle = {
    // The handle matters: every descriptor that carries this device (a
    // `canvas.configure({ device })`, most importantly) is unwrapped through
    // `rawOf`, so a wrapper without one would silently configure against
    // handle 0 and leave the surface unconfigured.
    __h: deviceHandle,
    __kind: "device",
    queue: queue,
    features: new Set<string>(),
    limits: {},

    createBuffer(descriptor: unknown): BufferHandle {
      const d = (descriptor ?? {}) as {
        size?: number;
        usage?: number;
        mappedAtCreation?: boolean;
      };
      const handle = js_webgpu_device_create_buffer(deviceHandle, {
        label: (descriptor as { label?: string })?.label,
        size: d.size,
        usage: d.usage,
        mappedAtCreation: d.mappedAtCreation === true,
      } as object);
      return wrapBuffer(handle, num(d.size), num(d.usage), d.mappedAtCreation === true, queueHandle, deviceHandle);
    },

    createTexture(descriptor: unknown): TextureHandle {
      const d = (descriptor ?? {}) as Record<string, unknown>;
      const handle = js_webgpu_device_create_texture(deviceHandle, {
        label: d.label,
        size: d.size,
        format: d.format,
        usage: d.usage,
        mipLevelCount: d.mipLevelCount,
        sampleCount: d.sampleCount,
        dimension: d.dimension,
        viewFormats: d.viewFormats,
      } as object);
      return wrapTexture(handle);
    },

    createSampler(descriptor?: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_sampler(deviceHandle, (descriptor ?? {}) as object),
        __kind: "sampler",
      };
    },

    createBindGroupLayout(descriptor: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_bind_group_layout(deviceHandle, unwrapDeep(descriptor, 0) as object),
        __kind: "bindGroupLayout",
      };
    },

    createPipelineLayout(descriptor: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_pipeline_layout(deviceHandle, unwrapDeep(descriptor, 0) as object),
        __kind: "pipelineLayout",
      };
    },

    createBindGroup(descriptor: unknown): RawHandle {
      const d = (descriptor ?? {}) as { label?: string; layout?: unknown; entries?: unknown };
      return {
        __h: js_webgpu_device_create_bind_group(deviceHandle, {
          label: d.label,
          layout: rawOf(d.layout),
          entries: normalizeEntries(d.entries),
        } as object),
        __kind: "bindGroup",
      };
    },

    createShaderModule(descriptor: unknown): RawHandle {
      // The FFI takes the WGSL source directly rather than a descriptor.
      const code = (descriptor as { code?: string })?.code;
      return {
        __h: js_webgpu_device_create_shader_module(deviceHandle, code === undefined ? "" : code),
        __kind: "shaderModule",
      };
    },

    createComputePipeline(descriptor: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_compute_pipeline(deviceHandle, unwrapDeep(descriptor, 0) as object),
        __kind: "computePipeline",
      };
    },

    createComputePipelineAsync(descriptor: unknown): Promise<RawHandle> {
      return js_webgpu_device_create_compute_pipeline_async(deviceHandle, unwrapDeep(descriptor, 0) as object)
        .then((h: number): RawHandle => ({ __h: h, __kind: "computePipeline" }));
    },

    createRenderPipeline(descriptor: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_render_pipeline(deviceHandle, unwrapDeep(descriptor, 0) as object),
        __kind: "renderPipeline",
      };
    },

    createRenderPipelineAsync(descriptor: unknown): Promise<RawHandle> {
      return js_webgpu_device_create_render_pipeline_async(deviceHandle, unwrapDeep(descriptor, 0) as object)
        .then((h: number): RawHandle => ({ __h: h, __kind: "renderPipeline" }));
    },

    createQuerySet(descriptor: unknown): RawHandle {
      return {
        __h: js_webgpu_device_create_query_set(deviceHandle, unwrapDeep(descriptor, 0) as object),
        __kind: "querySet",
      };
    },

    createCommandEncoder(_descriptor?: unknown): CommandEncoderHandle {
      return wrapEncoder(js_webgpu_device_create_command_encoder(deviceHandle));
    },

    pushErrorScope(filter: unknown): void {
      js_webgpu_device_push_error_scope(deviceHandle, String(filter));
    },

    popErrorScope(): Promise<{ message: string } | null> {
      // The FFI resolves a JSON-encoded error (or an empty payload); the spec
      // resolves an error object or null.
      return js_webgpu_device_pop_error_scope(deviceHandle)
        .then((raw: string): { message: string } | null => {
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as { message?: string } | null;
            if (!parsed) return null;
            return { message: parsed.message ? parsed.message : "webgpu validation error" };
          } catch (_e) {
            return { message: raw };
          }
        });
    },

    destroy(): void {
      js_webgpu_device_destroy(deviceHandle);
    },
  };

  return device;
}

// ─── Adapter ───────────────────────────────────────────────────────

/** The browser's `GPUAdapter`. */
export interface AdapterHandle {
  readonly __h: number;
  readonly __kind: string;
  requestDevice(): Promise<DeviceHandle>;
  /** Spec-extra: the sync form the native runtime needs (see below). */
  requestDeviceSync(): DeviceHandle;
  destroy(): void;
}

function wrapAdapter(handle: number): AdapterHandle {
  return {
    __h: handle,
    __kind: "adapter",
    requestDevice(): Promise<DeviceHandle> {
      return js_webgpu_adapter_request_device(handle)
        .then((pair: { device: number; queue: number }): DeviceHandle =>
          wrapDevice(pair.device, pair.queue));
    },
    requestDeviceSync(): DeviceHandle {
      // Perry's native-async completion channel drops object pointers, so the
      // promise form above cannot hand back a usable device on every runtime
      // build. Device creation is already synchronous internally
      // (`pollster::block_on`), so this entry rides the same work without the
      // faulty channel.
      const device = js_webgpu_adapter_request_device_sync(handle);
      const queue = js_webgpu_device_get_queue_sync(device);
      return wrapDevice(device, queue);
    },
    destroy(): void {
      js_webgpu_adapter_drop(handle);
    },
  };
}

/**
 * `navigator.gpu.requestAdapter()`.
 *
 * `compatibleSurface` is a native spec-extra: pass the surface you intend to
 * render to, and the adapter is picked compatible with it. On d3d12/vulkan this
 * is required — otherwise `canvas.configure` later fails with "no queue family
 * supports presentation". Metal ignores it. The idiomatic native order is
 * surface-first:
 *
 * ```ts
 * const surface = fromNativeView(viewPtr)
 * const adapter = await requestAdapter(surface)
 * const device  = adapter.requestDeviceSync()
 * const canvas  = configureCanvas(surface, { device, format, width, height })
 * ```
 */
export function requestAdapter(compatibleSurface?: unknown): Promise<AdapterHandle> {
  return js_webgpu_request_adapter(compatibleSurface === undefined ? 0 : rawOf(compatibleSurface))
    .then((h: number): AdapterHandle => wrapAdapter(h));
}

// ─── Canvas (native swapchain) ─────────────────────────────────────

/** The browser's `GPUCanvasContext`, plus the native `present()`. */
export interface CanvasContext {
  readonly canvas: { readonly width: number; readonly height: number };
  configure(configuration: unknown): void;
  unconfigure(): void;
  getCurrentTexture(): TextureHandle;
  /**
   * Hand the finished frame to the compositor. Spec-extra: browsers present
   * implicitly at task end, a native surface needs the explicit hand-back — the
   * one call a ported render loop must add.
   */
  present(): void;
}

/**
 * Wrap a native surface as a canvas context.
 *
 * Three host responsibilities the browser gives for free are folded in here so
 * a render loop does not have to know about them:
 *
 *   * **Idempotent acquire.** `getCurrentTexture()` returns the SAME image for
 *     every call within a frame, which is why a renderer may call it from both
 *     its `beginFrame` and its bare-flush pass opener. wgpu's surface does the
 *     opposite — each call ACQUIRES, and a second acquire in one frame fails
 *     with "Surface image is already acquired" — so the acquired image is
 *     cached and `present` drops it.
 *   * **View release.** A wgpu surface keeps its swapchain image alive until
 *     every view derived from it is dropped, and the pool holds only about
 *     three images. Each frame's views are recorded and destroyed right after
 *     present; a browser would simply collect them.
 *   * **Canvas size.** `canvas.width/height` report the drawing buffer in
 *     PHYSICAL pixels, the same values a browser `<canvas>` exposes, because
 *     camera math in gfx reads them.
 */
export function configureCanvas(
  surfaceHandle: number,
  size: { width: number; height: number },
): CanvasContext {
  let acquired: TextureHandle | null = null;
  let frameViews: number[] = [];
  let format = "bgra8unorm";
  let deviceHandle = 0;

  const ctx: CanvasContext = {
    canvas: { width: size.width, height: size.height },

    configure(configuration: unknown): void {
      const cfg = (configuration ?? {}) as {
        device?: unknown;
        format?: unknown;
        usage?: number;
        alphaMode?: string;
        width?: number;
        height?: number;
        presentMode?: string;
        viewFormats?: string[];
      };
      deviceHandle = rawOf(cfg.device);
      if (cfg.format !== undefined) format = String(cfg.format);
      // Composite alpha is a windowing concern, and not every platform offers
      // every mode — a macOS CAMetalLayer surface reports [Opaque,
      // PostMultiplied] and REJECTS a requested PreMultiplied with a wgpu
      // validation panic (`Requested alpha mode PreMultiplied is not in the
      // list of supported alpha modes`). wgpu's `auto` means "use whatever this
      // platform supports", which is what a browser does when it accepts an
      // `alphaMode` hint, so that is the fallback. Opaque stays explicit: it is
      // the default everywhere and always supported.
      const requestedAlpha = cfg.alphaMode;
      const alphaMode = requestedAlpha === "premultiplied" ? "auto" : requestedAlpha;
      js_webgpu_surface_configure(surfaceHandle, {
        device: deviceHandle,
        format: format,
        usage: cfg.usage,
        alphaMode: alphaMode,
        width: num(cfg.width) > 0 ? num(cfg.width) : size.width,
        height: num(cfg.height) > 0 ? num(cfg.height) : size.height,
        presentMode: cfg.presentMode,
        viewFormats: cfg.viewFormats,
      } as object);
      // Reconfiguring drops any acquired image, so the cache must not survive
      // it — the next acquire would otherwise hand out a dead texture.
      acquired = null;
    },

    unconfigure(): void {
      js_webgpu_surface_unconfigure(surfaceHandle);
      acquired = null;
    },

    getCurrentTexture(): TextureHandle {
      if (acquired) return acquired;
      acquired = wrapTexture(js_webgpu_surface_get_current_texture(surfaceHandle), frameViews);
      return acquired;
    },

    present(): void {
      js_webgpu_surface_present(surfaceHandle);
      for (let i = 0; i < frameViews.length; i++) {
        js_webgpu_texture_view_destroy(frameViews[i]);
      }
      frameViews = [];
      acquired = null;
    },
  };

  return ctx;
}

/** Wrap a native view (NSView* / UIView* / HWND / ANativeWindow*) as a surface. */
export function fromNativeView(viewPtr: number): number {
  return js_webgpu_surface_from_native_view(viewPtr);
}

/** The native view pointer behind a surface — for `embedNativeView()`. */
export function surfaceViewPtr(surfaceHandle: number): number {
  return js_webgpu_surface_get_view_ptr(surfaceHandle);
}

/**
 * The backing size of a native view as `{w,h,pw,ph,scale}` (points and
 * pixels), or null when the view is gone.
 *
 * Use `pw`/`ph` for the swapchain and `w`/`h` for anything laid out in points
 * (camera aspect, fit calculations). `surfaceConfigure` takes physical pixels
 * and wgpu-hal gives the CAMetalLayer a drawable of exactly that size with
 * `kCAGravityTopLeft` and no stretching, so a swapchain whose extent disagrees
 * with the layer's real backing size is presented scaled-to-fit by
 * CoreAnimation — non-uniformly when the aspect ratios differ — and the picture
 * arrives squashed while every API call reports success.
 */
export function viewBackingSize(viewPtr: number): { w: number; h: number; pw: number; ph: number; scale: number } | null {
  const raw = String(js_webgpu_view_backing_size(viewPtr));
  if (!raw || raw.length < 2) return null;
  try {
    const o = JSON.parse(raw) as { w: number; h: number; pw: number; ph: number; scale: number };
    if (o && o.pw > 0 && o.ph > 0 && o.w > 0 && o.h > 0) return o;
  } catch (_e) {
    // fall through: the caller keeps its own assumption
  }
  return null;
}

/** Diagnostic: every BloomView host in the window's view tree, as JSON. */
export function listBloomViews(viewPtr: number): string {
  return String(js_webgpu_list_bloom_views(viewPtr));
}

/**
 * The surface's preferred swapchain format — the native analogue of
 * `navigator.gpu.getPreferredCanvasFormat()`.
 *
 * Strips the `-srgb` suffix deliberately. A browser canvas is configured with
 * the NON-SRGB format; Perry reports `bgra8unorm-srgb`. With an sRGB swapchain
 * the GPU encodes linear→sRGB on every write, but a renderer in its
 * "skip tonemap" mode already outputs sRGB-encoded values, so the frame would
 * be gamma-encoded twice — which reads as washed-out colour plus seams wherever
 * a texel is only partly transparent.
 */
export function preferredCanvasFormat(surfaceHandle: number, adapter: unknown): string {
  const preferred = String(js_webgpu_surface_get_preferred_format(surfaceHandle, rawOf(adapter)));
  if (preferred.length > 5 && preferred.substring(preferred.length - 5) === "-srgb") {
    return preferred.substring(0, preferred.length - 5);
  }
  return preferred;
}

/** Release a surface (and the view it owns, when it created one). */
export function dropSurface(surfaceHandle: number): void {
  js_webgpu_surface_drop(surfaceHandle);
}

/**
 * Publish the WebGPU enum tables as globals.
 *
 * A renderer written for the browser refers to them as bare globals
 * (`GPUBufferUsage.VERTEX`) because that is how the web exposes them, and Perry
 * provides no such globals. Call this once before any such code runs.
 */
export function installGlobals(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUBufferUsage = GPUBufferUsage;
  g.GPUTextureUsage = GPUTextureUsage;
  g.GPUShaderStage = GPUShaderStage;
  g.GPUMapMode = GPUMapMode;
  g.GPUColorWrite = GPUColorWrite;
}
