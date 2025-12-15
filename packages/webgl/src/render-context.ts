/**
 * WebGL Render Context - manages component registration and rendering
 */

import type { Bounds } from './types'
import { BatchRenderer } from './renderer/batch'
import { createOrthoMatrix } from './utils'

export interface ComponentInstance {
  bounds: () => Bounds | null
  draw: () => void
}

/**
 * WebGL Render Context options
 */
export interface RenderContextOptions {
  /**
   * Enable batch rendering (default: true)
   * Combines multiple shapes into single draw call
   */
  batching?: boolean
  
  /**
   * Enable dirty region tracking (default: true)
   * Only redraws changed regions
   */
  dirtyTracking?: boolean
}

/**
 * WebGL Render Context
 */
export class RenderContext {
  private components = new Map<symbol, ComponentInstance>()
  private dirtyRegions: Bounds[] = []
  private rafId: number | null = null
  private needsFullRedraw: boolean = true
  private options: Required<RenderContextOptions>
  private batchRenderer: BatchRenderer | null = null
  private projectionMatrix: number[]

  constructor(
    private gl: WebGLRenderingContext | WebGL2RenderingContext,
    options: RenderContextOptions = {}
  ) {
    this.options = {
      batching: options.batching ?? true,
      dirtyTracking: options.dirtyTracking ?? true
    }
    
    // Setup WebGL state
    this.setupWebGL()
    
    // Create projection matrix using logical pixels
    // Use stored logical dimensions from canvas element (set by canvas component)
    const canvas = gl.canvas as HTMLCanvasElement
    const logicalWidth = canvas.dataset.logicalWidth 
      ? parseInt(canvas.dataset.logicalWidth, 10)
      : (canvas.clientWidth || canvas.width)
    const logicalHeight = canvas.dataset.logicalHeight
      ? parseInt(canvas.dataset.logicalHeight, 10)
      : (canvas.clientHeight || canvas.height)
    
    this.projectionMatrix = createOrthoMatrix(
      logicalWidth,
      logicalHeight
    )
    
    // Create batch renderer
    if (this.options.batching) {
      this.batchRenderer = new BatchRenderer(gl, this.projectionMatrix)
    }
    
    // Associate with GL context
    setRenderContext(gl, this)
  }

  /**
   * Setup WebGL initial state
   */
  private setupWebGL() {
    const gl = this.gl
    
    // Enable blending for transparency
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    
    // Set clear color
    gl.clearColor(0, 0, 0, 0)
    
    // Set viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  }

  /**
   * Register component
   */
  register(instance: ComponentInstance): symbol {
    const id = Symbol()
    this.components.set(id, instance)
    return id
  }

  /**
   * Unregister component
   */
  unregister(id: symbol) {
    this.components.delete(id)
  }

  /**
   * Mark dirty region
   */
  markDirty(bounds?: Bounds) {
    if (this.options.dirtyTracking && bounds) {
      this.dirtyRegions.push(bounds)
    } else {
      this.needsFullRedraw = true
    }
    this.scheduleDraw()
  }

  /**
   * Schedule draw on next animation frame
   */
  private scheduleDraw() {
    if (this.rafId !== null) return
    
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.draw()
    })
  }

  /**
   * Execute draw
   */
  private draw() {
    const gl = this.gl
    
    if (this.needsFullRedraw) {
      // Clear entire canvas
      gl.clear(gl.COLOR_BUFFER_BIT)
      
      // Draw all components
      for (const component of this.components.values()) {
        component.draw()
      }
      
      // Flush batch
      if (this.batchRenderer) {
        this.batchRenderer.flush()
      }
      
      this.needsFullRedraw = false
    } else if (this.dirtyRegions.length > 0) {
      // TODO: Implement dirty region rendering
      // For now, just do full redraw
      gl.clear(gl.COLOR_BUFFER_BIT)
      for (const component of this.components.values()) {
        component.draw()
      }
      if (this.batchRenderer) {
        this.batchRenderer.flush()
      }
    }
    
    this.dirtyRegions = []
  }

  /**
   * Get batch renderer
   */
  getBatchRenderer(): BatchRenderer | null {
    return this.batchRenderer
  }

  /**
   * Get projection matrix
   */
  getProjectionMatrix(): number[] {
    return this.projectionMatrix
  }

  /**
   * Destroy render context
   */
  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
    }
    if (this.batchRenderer) {
      this.batchRenderer.destroy()
    }
    this.components.clear()
    renderContextMap.delete(this.gl)
  }
}

// Global map to store RenderContext per WebGL context
const renderContextMap = new WeakMap<
  WebGLRenderingContext | WebGL2RenderingContext,
  RenderContext
>()

/**
 * Associate RenderContext with WebGL context
 */
export function setRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  context: RenderContext
) {
  renderContextMap.set(gl, context)
}

/**
 * Get RenderContext from WebGL context
 */
export function getRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): RenderContext {
  const context = renderContextMap.get(gl)
  if (!context) {
    throw new Error('RenderContext not found for WebGL context')
  }
  return context
}

/**
 * Check if RenderContext exists for WebGL context
 */
export function hasRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): boolean {
  return renderContextMap.has(gl)
}
