/**
 * WebGL Render Context - manages component registration and rendering
 */

import type { Bounds } from './types'
import { boundsIntersect, mergeBounds } from '@rasenjs/core/utils'
import { BatchRenderer } from './renderer/batch'
import { InstancedBatchRenderer } from './renderer/instanced'
import { createOrthoMatrix } from './utils'

export interface ComponentInstance {
  bounds: () => Bounds | null
  draw: () => void
  lastDrawnBounds?: Bounds | null  // Bounds when last drawn, for dirty checking
}

/**
 * Transform state for group hierarchy
 */
export interface TransformState {
  tx: number
  ty: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
}

/**
 * Group context - collects child components
 */
export interface GroupContext {
  childDrawFunctions: (() => void)[]
  childComponentIds: symbol[]
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
   * Enable instanced rendering (default: false)
   * Use GPU instancing for massive performance (WebGL2 only)
   * Note: When enabled, overrides batching option
   */
  instancing?: boolean
  
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
  private instancedRenderer: InstancedBatchRenderer | null = null
  private projectionMatrix: number[]
  private transformStack: TransformState[] = []
  private currentTransform: TransformState = {
    tx: 0,
    ty: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1
  }

  constructor(
    private gl: WebGLRenderingContext | WebGL2RenderingContext,
    options: RenderContextOptions = {}
  ) {
    this.options = {
      batching: options.batching ?? true,
      instancing: options.instancing ?? false,
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
    
    // Create renderers based on options
    if (this.options.instancing && gl instanceof WebGL2RenderingContext) {
      // Use instanced rendering (WebGL2 only)
      this.instancedRenderer = new InstancedBatchRenderer(gl, this.projectionMatrix)
    } else if (this.options.batching) {
      // Fallback to regular batch rendering
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
    
    // Check if inside a group context
    const groupContext = getCurrentGroupContext(this.gl)
    if (groupContext) {
      // Add to group's child collection instead of global components
      groupContext.childDrawFunctions.push(() => instance.draw())
      groupContext.childComponentIds.push(id)
      // Don't add to global components - only group manages children
    } else {
      // Normal registration - only non-grouped components go here
      this.components.set(id, instance)
    }
    
    return id
  }

  /**
   * Unregister component
   */
  unregister(id: symbol) {
    // Component might not be in components map if it was part of a group
    this.components.delete(id)
  }

  /**
   * Mark dirty region
   */
  markDirty(bounds?: Bounds) {
    if (this.options.dirtyTracking && bounds) {
      // Limit dirty regions to avoid excessive array operations
      // When too many regions are dirty, just do full redraw
      if (this.dirtyRegions.length < 50) {
        this.dirtyRegions.push(bounds)
      } else {
        this.needsFullRedraw = true
      }
    } else {
      this.needsFullRedraw = true
    }
    this.scheduleDraw()
  }

  /**
   * Manually trigger full redraw (bypasses watch system)
   * Use this for batch updates in animation loops
   */
  manualUpdate() {
    this.needsFullRedraw = true
    this.draw()
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
      // Full redraw - no bounds tracking needed
      gl.clear(gl.COLOR_BUFFER_BIT)
      
      // Just draw, skip bounds calculation
      for (const component of this.components.values()) {
        component.draw()
      }
      
      // Flush batch or instanced renderer
      if (this.instancedRenderer) {
        this.instancedRenderer.flush()
      } else if (this.batchRenderer) {
        this.batchRenderer.flush()
      }
      
      this.needsFullRedraw = false
    } else if (this.dirtyRegions.length > 0) {
      // Dirty region rendering
      const dirtyBounds = mergeBounds(this.dirtyRegions)
      
      if (dirtyBounds) {
        // Clear entire canvas (WebGL doesn't have partial clear)
        gl.clear(gl.COLOR_BUFFER_BIT)
        
        // Redraw components that intersect with dirty region
        for (const component of this.components.values()) {
          const currentBounds = component.bounds()
          const lastBounds = component.lastDrawnBounds
          
          let shouldDraw = false
          // Check current bounds
          if (currentBounds && boundsIntersect(currentBounds, dirtyBounds)) {
            shouldDraw = true
          }
          // Check last drawn bounds (might have moved away from there)
          if (!shouldDraw && lastBounds && boundsIntersect(lastBounds, dirtyBounds)) {
            shouldDraw = true
          }
          
          if (shouldDraw) {
            component.draw()
          }
          
          // Update lastDrawnBounds for next frame dirty tracking
          component.lastDrawnBounds = currentBounds ? { ...currentBounds } : null
        }
        
        // Flush batch or instanced renderer
        if (this.instancedRenderer) {
          this.instancedRenderer.flush()
        } else if (this.batchRenderer) {
          this.batchRenderer.flush()
        }
      }
    }
    
    this.dirtyRegions = []
  }

  /**
   * Add a shape to render (unified interface)
   * Automatically uses instanced or batch renderer based on options
   */
  addShape(
    batchKey: string,
    vertices: Float32Array,
    color: { r: number; g: number; b: number; a: number },
    transform: {
      tx: number
      ty: number
      rotation?: number
      scaleX?: number
      scaleY?: number
    }
  ) {
    if (this.instancedRenderer) {
      // Use instanced rendering
      this.instancedRenderer.addInstance(batchKey, vertices, {
        tx: transform.tx,
        ty: transform.ty,
        rotation: transform.rotation ?? 0,
        scaleX: transform.scaleX ?? 1,
        scaleY: transform.scaleY ?? 1,
        color
      })
    } else if (this.batchRenderer) {
      // Use batch rendering - create full transform matrix
      const matrix = this.createTransformMatrix(
        transform.tx,
        transform.ty,
        transform.rotation ?? 0,
        transform.scaleX ?? 1,
        transform.scaleY ?? 1
      )
      this.batchRenderer.addShape(vertices, color, matrix)
    }
  }

  /**
   * Create full 2D transform matrix (translation + rotation + scale)
   */
  private createTransformMatrix(
    tx: number,
    ty: number,
    rotation: number,
    scaleX: number,
    scaleY: number
  ): number[] {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    
    // 2D transformation matrix in column-major order for WebGL
    // [scaleX*cos, scaleX*sin, 0]
    // [-scaleY*sin, scaleY*cos, 0]
    // [tx, ty, 1]
    return [
      scaleX * cos,
      scaleX * sin,
      0,
      -scaleY * sin,
      scaleY * cos,
      0,
      tx,
      ty,
      1
    ]
  }

  /**
   * Get batch renderer
   */
  getBatchRenderer(): BatchRenderer | null {
    return this.batchRenderer
  }

  /**
   * Get instanced renderer
   */
  getInstancedRenderer(): InstancedBatchRenderer | null {
    return this.instancedRenderer
  }

  /**
   * Get projection matrix
   */
  getProjectionMatrix(): number[] {
    return this.projectionMatrix
  }

  /**
   * Push transform state (for group hierarchy)
   */
  pushTransform(transform: Partial<TransformState>) {
    // Save current transform to stack
    this.transformStack.push({ ...this.currentTransform })
    
    // Get transform values with defaults
    const tx = transform.tx ?? 0
    const ty = transform.ty ?? 0
    const rotation = transform.rotation ?? 0
    const scaleX = transform.scaleX ?? 1
    const scaleY = transform.scaleY ?? 1
    const opacity = transform.opacity ?? 1
    
    // Accumulate transforms (multiply matrices conceptually)
    const parent = this.currentTransform
    
    // Apply parent rotation to child position
    const cos = Math.cos(parent.rotation)
    const sin = Math.sin(parent.rotation)
    const rotatedX = tx * cos - ty * sin
    const rotatedY = tx * sin + ty * cos
    
    this.currentTransform = {
      tx: parent.tx + rotatedX * parent.scaleX,
      ty: parent.ty + rotatedY * parent.scaleY,
      rotation: parent.rotation + rotation,
      scaleX: parent.scaleX * scaleX,
      scaleY: parent.scaleY * scaleY,
      opacity: parent.opacity * opacity
    }
  }
  
  /**
   * Pop transform state
   */
  popTransform() {
    const previous = this.transformStack.pop()
    if (previous) {
      this.currentTransform = previous
    }
  }
  
  /**
   * Get current accumulated transform
   */
  getCurrentTransform(): TransformState {
    return { ...this.currentTransform }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
    }
    if (this.batchRenderer) {
      this.batchRenderer.destroy()
    }
    if (this.instancedRenderer) {
      this.instancedRenderer.destroy()
    }
    this.components.clear()
    this.transformStack = []
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

// Group context stack management
const groupContextStack = new WeakMap<
  WebGLRenderingContext | WebGL2RenderingContext,
  GroupContext[]
>()

/**
 * Enter group context - collect child components
 */
export function enterGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): GroupContext {
  const groupContext: GroupContext = {
    childDrawFunctions: [],
    childComponentIds: []
  }
  
  let stack = groupContextStack.get(gl)
  if (!stack) {
    stack = []
    groupContextStack.set(gl, stack)
  }
  stack.push(groupContext)
  
  return groupContext
}

/**
 * Exit group context
 */
export function exitGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): void {
  const stack = groupContextStack.get(gl)
  if (stack && stack.length > 0) {
    stack.pop()
  }
}

/**
 * Get current group context (if inside a group)
 */
export function getCurrentGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): GroupContext | null {
  const stack = groupContextStack.get(gl)
  if (stack && stack.length > 0) {
    return stack[stack.length - 1]
  }
  return null
}
