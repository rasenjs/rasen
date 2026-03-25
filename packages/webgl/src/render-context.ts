/**
 * WebGL Render Context - manages component registration and rendering
 * Unified 2D/3D support
 */

import type { Bounds } from './types'
import { boundsIntersect, mergeBounds } from '@rasenjs/core/utils'
import { BatchRenderer } from './renderer/batch'
import { InstancedRenderer } from './renderer/instanced'
import { Mat4x4f } from '@rasenjs/math'

export interface ComponentInstance {
  bounds: () => Bounds | null
  draw: () => void
  lastDrawnBounds?: Bounds | null
}

/**
 * Transform state for group hierarchy (2D/3D unified)
 * rotation is an alias for rotationZ for backward compatibility
 */
export interface TransformState {
  tx: number
  ty: number
  tz: number
  rotation: number      // Alias for rotationZ (2D compatibility)
  rotationX: number
  rotationY: number
  rotationZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
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
  batching?: boolean
  instancing?: boolean
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
  private instancedRenderer: InstancedRenderer | null = null
  private projectionMatrix: Mat4x4f
  private viewMatrix: Mat4x4f
  private transformStack: TransformState[] = []
  private currentTransform: TransformState = {
    tx: 0,
    ty: 0,
    tz: 0,
    rotation: 0,           // Alias for rotationZ
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
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
    
    this.setupWebGL()
    
    const canvas = gl.canvas as HTMLCanvasElement
    const logicalWidth = canvas.dataset.logicalWidth 
      ? parseInt(canvas.dataset.logicalWidth, 10)
      : (canvas.clientWidth || canvas.width)
    const logicalHeight = canvas.dataset.logicalHeight
      ? parseInt(canvas.dataset.logicalHeight, 10)
      : (canvas.clientHeight || canvas.height)
    
    this.projectionMatrix = Mat4x4f.ortho(0, logicalWidth, 0, logicalHeight, -1000, 1000)
    this.viewMatrix = Mat4x4f.identity()
    
    if (this.options.instancing && gl instanceof WebGL2RenderingContext) {
      this.instancedRenderer = new InstancedRenderer(gl, this.projectionMatrix)
    } else if (this.options.batching) {
      this.batchRenderer = new BatchRenderer(gl, this.projectionMatrix)
    }
    
    setRenderContext(gl, this)
  }

  private setupWebGL() {
    const gl = this.gl
    
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  }

  register(instance: ComponentInstance): symbol {
    const id = Symbol()
    
    const groupContext = getCurrentGroupContext(this.gl)
    if (groupContext) {
      groupContext.childDrawFunctions.push(() => instance.draw())
      groupContext.childComponentIds.push(id)
    } else {
      this.components.set(id, instance)
    }
    
    return id
  }

  unregister(id: symbol) {
    this.components.delete(id)
  }

  markDirty(bounds?: Bounds) {
    if (this.options.dirtyTracking && bounds) {
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

  manualUpdate() {
    this.needsFullRedraw = true
    this.draw()
  }

  private scheduleDraw() {
    if (this.rafId !== null) return
    
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.draw()
    })
  }

  private draw() {
    const gl = this.gl
    
    if (this.needsFullRedraw) {
      gl.clear(gl.COLOR_BUFFER_BIT)
      
      for (const component of this.components.values()) {
        component.draw()
      }
      
      if (this.instancedRenderer) {
        this.instancedRenderer.flush()
      } else if (this.batchRenderer) {
        this.batchRenderer.flush()
      }
      
      this.needsFullRedraw = false
    } else if (this.dirtyRegions.length > 0) {
      const dirtyBounds = mergeBounds(this.dirtyRegions)
      
      if (dirtyBounds) {
        gl.clear(gl.COLOR_BUFFER_BIT)
        
        for (const component of this.components.values()) {
          const currentBounds = component.bounds()
          const lastBounds = component.lastDrawnBounds
          
          let shouldDraw = false
          if (currentBounds && boundsIntersect(currentBounds, dirtyBounds)) {
            shouldDraw = true
          }
          if (!shouldDraw && lastBounds && boundsIntersect(lastBounds, dirtyBounds)) {
            shouldDraw = true
          }
          
          if (shouldDraw) {
            component.draw()
          }
          
          component.lastDrawnBounds = currentBounds ? { ...currentBounds } : null
        }
        
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
   * Add a shape to render (unified 2D/3D interface)
   */
  addShape(
    _batchKey: string,
    vertices: Float32Array,
    color: { r: number; g: number; b: number; a: number },
    transform: {
      tx: number
      ty: number
      tz?: number
      rotationX?: number
      rotationY?: number
      rotationZ?: number
      scaleX?: number
      scaleY?: number
      scaleZ?: number
    }
  ) {
    const matrix = this.createTransformMatrix(
      transform.tx,
      transform.ty,
      transform.tz ?? 0,
      transform.rotationX ?? 0,
      transform.rotationY ?? 0,
      transform.rotationZ ?? 0,
      transform.scaleX ?? 1,
      transform.scaleY ?? 1,
      transform.scaleZ ?? 1
    )
    
    if (this.batchRenderer) {
      this.batchRenderer.addShape(vertices, color, matrix)
    }
  }

  /**
   * Create 4x4 transform matrix (2D/3D unified)
   */
  private createTransformMatrix(
    tx: number,
    ty: number,
    tz: number,
    rotationX: number,
    rotationY: number,
    rotationZ: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number
  ): Mat4x4f {
    return Mat4x4f.identity()
      .multiply(Mat4x4f.translate(tx, ty, tz))
      .multiply(Mat4x4f.rotateX(rotationX))
      .multiply(Mat4x4f.rotateY(rotationY))
      .multiply(Mat4x4f.rotateZ(rotationZ))
      .multiply(Mat4x4f.scale(scaleX, scaleY, scaleZ))
  }

  getBatchRenderer(): BatchRenderer | null {
    return this.batchRenderer
  }

  getInstancedRenderer(): InstancedRenderer | null {
    return this.instancedRenderer
  }

  getProjectionMatrix(): Mat4x4f {
    return this.projectionMatrix
  }

  setProjectionMatrix(matrix: Mat4x4f) {
    this.projectionMatrix = matrix
    if (this.batchRenderer) {
      this.batchRenderer.setProjectionMatrix(matrix)
    }
    if (this.instancedRenderer) {
      this.instancedRenderer.setProjectionMatrix(matrix)
    }
  }

  getViewMatrix(): Mat4x4f {
    return this.viewMatrix
  }

  setViewMatrix(matrix: Mat4x4f) {
    this.viewMatrix = matrix
    if (this.batchRenderer) {
      this.batchRenderer.setViewMatrix(matrix)
    }
    if (this.instancedRenderer) {
      this.instancedRenderer.setViewMatrix(matrix)
    }
  }

  pushTransform(transform: Partial<TransformState>) {
    this.transformStack.push({ ...this.currentTransform })
    
    const tx = transform.tx ?? 0
    const ty = transform.ty ?? 0
    const tz = transform.tz ?? 0
    const rotationX = transform.rotationX ?? 0
    const rotationY = transform.rotationY ?? 0
    const rotationZ = transform.rotationZ ?? 0
    const scaleX = transform.scaleX ?? 1
    const scaleY = transform.scaleY ?? 1
    const scaleZ = transform.scaleZ ?? 1
    const opacity = transform.opacity ?? 1
    
    const parent = this.currentTransform
    
    const cos = Math.cos(parent.rotationZ)
    const sin = Math.sin(parent.rotationZ)
    const rotatedX = tx * cos - ty * sin
    const rotatedY = tx * sin + ty * cos
    
    this.currentTransform = {
      tx: parent.tx + rotatedX * parent.scaleX,
      ty: parent.ty + rotatedY * parent.scaleY,
      tz: parent.tz + tz * parent.scaleZ,
      rotation: parent.rotationZ + rotationZ,  // Alias for rotationZ
      rotationX: parent.rotationX + rotationX,
      rotationY: parent.rotationY + rotationY,
      rotationZ: parent.rotationZ + rotationZ,
      scaleX: parent.scaleX * scaleX,
      scaleY: parent.scaleY * scaleY,
      scaleZ: parent.scaleZ * scaleZ,
      opacity: parent.opacity * opacity
    }
  }
  
  popTransform() {
    const previous = this.transformStack.pop()
    if (previous) {
      this.currentTransform = previous
    }
  }
  
  getCurrentTransform(): TransformState {
    return { ...this.currentTransform }
  }

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

const renderContextMap = new WeakMap<
  WebGLRenderingContext | WebGL2RenderingContext,
  RenderContext
>()

export function setRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  context: RenderContext
) {
  renderContextMap.set(gl, context)
}

export function getRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): RenderContext {
  const context = renderContextMap.get(gl)
  if (!context) {
    throw new Error('RenderContext not found for WebGL context')
  }
  return context
}

export function hasRenderContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): boolean {
  return renderContextMap.has(gl)
}

const groupContextStack = new WeakMap<
  WebGLRenderingContext | WebGL2RenderingContext,
  GroupContext[]
>()

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

export function exitGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): void {
  const stack = groupContextStack.get(gl)
  if (stack && stack.length > 0) {
    stack.pop()
  }
}

export function getCurrentGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): GroupContext | null {
  const stack = groupContextStack.get(gl)
  if (stack && stack.length > 0) {
    return stack[stack.length - 1]
  }
  return null
}
