/**
 * @rasenjs/webgl - WebGL renderer for Rasen
 * 
 * Provides GPU-accelerated 2D rendering with the same API as canvas-2d
 */

export { RenderContext, type RenderContextOptions } from './render-context'
export type { InstanceData } from './renderer/instanced'
export * from './components'
export * from './types'
export * from './utils'

// Re-export renderer utilities for advanced usage
export { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './renderer/shader'
export { BatchRenderer } from './renderer/batch'
