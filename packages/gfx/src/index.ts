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
export { isLookAtCamera, computeCameraMatrix } from './camera'
export { createRoot, createNode, createRootNode, type GfxNode, type GlNode, type GlContext, type MeshSpan } from './node'
export { TransformStack } from './transform-stack'
export type { InstanceData } from './renderer/gl/instanced'
export * from './components'
export * from './types'
export * from './utils'
export { loadGLB, loadGLBAssets } from './utils/gltf'
export type { LoadedGLTF } from './utils/gltf'

// Re-export renderer utilities for advanced usage
export { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './renderer/gl/shader'
export type { BatchItem, SealedMesh, GroupStreams, TextureHandle, BlendMode } from './renderer/base'
export { ShadowRenderer } from './renderer/gl/shadow'

// The WebGPU renderer and its WGSL. Same layer as BatchRenderer above: one
// renderer per graphics API, no invented vocabulary in between.
export { WebGPURenderer, getWebGPURenderer, type WebGPURendererOptions } from './renderer/gpu/index'
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
