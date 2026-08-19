/**
 * @rasenjs/webgl - WebGL renderer for Rasen
 * 
 * Provides GPU-accelerated 2D rendering with the same API as canvas-2d
 */

export { RenderContext, getRenderContext, type RenderContextOptions } from './render-context'
export type { InstanceData } from './renderer/instanced'
export * from './components'
export * from './controls'
export * from './types'
export * from './utils'
export { loadGLB, loadGLBAssets } from './utils/gltf'
export type { LoadedGLTF } from './utils/gltf'

// Re-export renderer utilities for advanced usage
export { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './renderer/shader'
export { BatchRenderer } from './renderer/batch'
export { ShadowRenderer } from './renderer/shadow'

// Re-export math library for convenience
export * from '@rasenjs/math'
