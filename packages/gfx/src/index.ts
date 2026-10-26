/**
 * @rasenjs/gfx - WebGL renderer for Rasen
 * 
 * Provides GPU-accelerated 2D rendering with the same API as canvas-2d
 */

export {
  Renderer,
  WebGLRenderer,
  getRenderContext,
  hasRenderContext,
  type RenderContextOptions,
} from './renderer/gl/index'
export type { CameraConfig } from './camera'

export { orthoCameraFromTile, transformForTile } from './iso'
export type { IsoTileSize, IsoModelPlacement } from './iso'
export { isLookAtCamera, computeCameraMatrix } from './camera'
export { createRoot, createNode, createRootNode, type GfxNode, type ShapeOptions, type GlNode, type GlContext, type CanvasSurface, type GpuCanvasContext, type MeshSpan } from './node'
export { gfxHostHooks } from './host-hooks'
export { TransformStack } from './transform-stack'
export type { InstanceData } from './renderer/gl/instanced'
export * from './components'

// Physically based shading: the BRDF, its uniforms and its attributes. The
// renderer's default program only has a directional Lambert term, so a material
// pass compiles this program instead.
export {
  PBR_ATTRIBUTES,
  PBR_FRAGMENT_SHADER,
  PBR_UNIFORMS,
  PBR_VERTEX_SHADER,
  PBR_WGSL,
  DEFAULT_PBR_LIGHTING,
  DEFAULT_PBR_MATERIAL,
  type PbrLighting,
  type PbrMaterial,
} from './materials/pbr'
export * from './types'
export * from './utils'
export { loadGLB, loadGLBAssets } from './utils/gltf'
export type { LoadedGLTF } from './utils/gltf'

// Re-export renderer utilities for advanced usage
export { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './renderer/gl/shader'
export type { BatchItem, SealedMesh, GroupStreams, TextureHandle, BlendMode } from './renderer/base'
// Shader passes: WGSL pipelines the caller describes completely — bindings,
// vertex layout and targets. Exported as types because the interface *is* the
// feature: what a caller states is exactly what reaches WebGPU.
export type {
  ShaderStageName,
  ShaderBindingKind,
  ShaderSampleType,
  ShaderViewDimension,
  ShaderStorageAccess,
  ShaderSamplerType,
  ShaderBindingDeclaration,
  ShaderBindGroupDeclaration,
  ShaderStageSource,
  ShaderVertexAttribute,
  ShaderVertexBuffer,
  ShaderColorTarget,
  ShaderPipelineOptions,
  ShaderPipelineHandle,
  ShaderBindGroupHandle,
  ShaderBindingResource,
  ShaderBindGroupOptions,
  ShaderPipelineResult,
  ShaderPassDraw,
  ShaderDispatch,
} from './renderer/base'
export { ShadowRenderer } from './renderer/gl/shadow'

// The WebGPU renderer and its WGSL. Same layer as BatchRenderer above: one
// renderer per graphics API, no invented vocabulary in between.
export {
  WebGPURenderer,
  getWebGPURenderer,
  isRawPixelSource,
  type WebGPURendererOptions,
  type RawPixelSource,
} from './renderer/gpu/index'
export { createWebGPURoot } from './renderer/gpu/index'
export {
  DEFAULT_VERTEX_WGSL,
  DEFAULT_FRAGMENT_WGSL,
  FRAME_LAYOUT,
  FRAME_FIELDS,
  ENGINE_BINDINGS,
  ENGINE_UNIFORMS_WGSL,
} from './renderer/gpu/shaders'

// Re-export math library for convenience
export * from '@rasenjs/math'
