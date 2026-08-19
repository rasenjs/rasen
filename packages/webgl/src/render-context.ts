/**
 * WebGL Render Context - manages component registration and rendering
 * Unified 2D/3D support
 */

import type { Bounds } from './types'
import { boundsIntersect, mergeBounds } from '@rasenjs/core/utils'
import { BatchRenderer } from './renderer/batch'
import { InstancedRenderer } from './renderer/instanced'
import { ShadowRenderer } from './renderer/shadow'
import { ShaderProgram } from './renderer/shader'
import { Mat4x4f } from '@rasenjs/math'
import { parseColor } from './utils'

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
  /** Clear (background) color — a CSS color string. Defaults to black. */
  clearColor?: string
  /**
   * Continuous render mode — redraw every animation frame (full redraw).
   * Intended for 3D / game scenes where dirty-region tracking is pointless
   * (all 3D components have null bounds → always full redraws anyway) and
   * the render must not depend on "something changes every frame" to stay
   * in sync (e.g. reactive unmounts that must clear the screen). Defaults
   * to false (event-driven redraws).
   */
  continuousRender?: boolean
}

/**
 * WebGL Render Context
 */
export class RenderContext {
  private components = new Map<symbol, ComponentInstance>()
  private dirtyRegions: Bounds[] = []
  private rafId: number | null = null
  private onCanvasResize: (() => void) | null = null
  private needsFullRedraw: boolean = true
  private options: Required<RenderContextOptions>
  private batchRenderer: BatchRenderer | null = null
  private instancedRenderer: InstancedRenderer | null = null
  private projectionMatrix: Mat4x4f
  private viewMatrix: Mat4x4f
  private transformStack: TransformState[] = []
  /** Continuous-render loop handle (see options.continuousRender). */
  private continuousRafId: number | null = null
  /** Shadow mapping state (light view-projection + renderer). */
  private shadowMatrix: Mat4x4f | null = null
  private shadowRenderer: ShadowRenderer | null = null
  /** Overlay pass (e.g. first-person weapon rendered with its own camera). */
  private overlayLayer: number | null = null
  private overlayView: Mat4x4f = Mat4x4f.identity()
  private overlayProj: Mat4x4f = Mat4x4f.identity()
  private overlayFbo: WebGLFramebuffer | null = null
  private overlayTex: WebGLTexture | null = null
  private overlayDepthRb: WebGLRenderbuffer | null = null
  private blitProgram: import('./renderer/shader').ShaderProgram | null = null
  private blitQuad: WebGLBuffer | null = null
  /** Number of active depth users (3D cameras); > 0 enables depth testing. */
  private depthCount = 0
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
      dirtyTracking: options.dirtyTracking ?? true,
      clearColor: options.clearColor ?? '#000000',
      continuousRender: options.continuousRender ?? false
    }
    
    this.setupWebGL()

    // Continuous mode: redraw every frame regardless of dirty events. This is
    // the sane mode for 3D/game scenes — event-driven redraws (markDirty →
    // scheduleDraw) are then redundant and skipped.
    if (this.options.continuousRender) {
      const loop = () => {
        this.needsFullRedraw = true
        this.draw()
        this.continuousRafId = requestAnimationFrame(loop)
      }
      this.continuousRafId = requestAnimationFrame(loop)
    }

    // Repaint when the canvas' drawing buffer is resized (dispatched by the
    // canvas component) — even if the aspect ratio is unchanged.
    const canvasEl = gl.canvas as HTMLCanvasElement
    this.onCanvasResize = () => {
      this.needsFullRedraw = true
      this.scheduleDraw()
    }
    canvasEl.addEventListener('rasen:resize', this.onCanvasResize)

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
    const clear = this.options.clearColor ? parseColor(this.options.clearColor) : null
    gl.clearColor(clear ? clear.r : 0, clear ? clear.g : 0, clear ? clear.b : 0, clear ? clear.a : 0)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  }

  /**
   * Configure an overlay pass (e.g. a first-person weapon rendered with its
   * own camera and FOV, composited transparently over the main view).
   * Pass `layer` = the render layer rendered by this overlay camera.
   * Pass `null` layer to disable the overlay pass.
   */
  setOverlayCamera(layer: number | null, view: Mat4x4f, proj: Mat4x4f) {
    if (layer === null) {
      this.overlayLayer = null
      return
    }
    this.overlayLayer = layer
    this.overlayView = view
    this.overlayProj = proj
    this.ensureOverlayTargets()
  }

  /**
   * Enable shadow mapping. `lightMatrix` is the light view-projection matrix
   * (world space → light clip space). Call with null to disable.
   */
  enableShadows(lightMatrix: Mat4x4f | null) {
    if (lightMatrix) {
      if (!this.shadowRenderer) {
        this.shadowRenderer = new ShadowRenderer(this.gl)
      }
      this.shadowMatrix = lightMatrix
    } else {
      this.shadowMatrix = null
    }
  }

  /**
   * Enable depth testing (typically called by a 3D camera on mount).
   *
   * Ref-counted: the first caller enables depth, and depth turns off only
   * after every caller has called `disableDepth`. This replaces the old
   * 2D/3D mode switch — depth is just a per-scene flag, and 2D scenes
   * (no camera) never enable it.
   *
   * Back-face culling is intentionally NOT enabled: the lookAt view matrix
   * mirrors winding order, so the classic CCW-front convention flips and
   * visible faces get culled. Depth testing alone is correct for the scenes
   * this renderer targets.
   */
  enableDepth() {
    this.depthCount++
    if (this.depthCount === 1) {
      const gl = this.gl
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.disable(gl.CULL_FACE)
      this.needsFullRedraw = true
      this.scheduleDraw()
    }
  }

  /** Disable depth testing (typically called by a 3D camera on unmount). */
  disableDepth() {
    this.depthCount--
    if (this.depthCount <= 0) {
      this.depthCount = 0
      this.gl.disable(this.gl.DEPTH_TEST)
      this.needsFullRedraw = true
      this.scheduleDraw()
    }
  }

  /** Is depth testing currently active? */
  getDepthEnabled(): boolean {
    return this.depthCount > 0
  }

  /** Clear the active color buffer (and depth buffer when depth is on). */
  private clearBuffers() {
    const gl = this.gl
    if (this.depthCount > 0) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
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

    // Symmetric with unregister(): registering a component must refresh the
    // screen or it would never appear until some unrelated change forces a
    // redraw. 3D components return null bounds → full redraw.
    this.markDirty(instance.bounds() ?? undefined)
    
    return id
  }

  unregister(id: symbol) {
    this.components.delete(id)
    // Also remove from any active group context so a dynamically-unmounted
    // child (e.g. via `each`) stops being drawn by its parent group.
    const stack = groupContextStack.get(this.gl)
    if (stack) {
      for (const gc of stack) {
        const idx = gc.childComponentIds.indexOf(id)
        if (idx !== -1) {
          gc.childComponentIds.splice(idx, 1)
          gc.childDrawFunctions.splice(idx, 1)
        }
      }
    }
    // CRITICAL: a removed component must refresh the screen. Without this,
    // its pixels stay visible (with a stale camera-facing orientation) until
    // some unrelated change triggers a redraw — e.g. hit impacts and enemy
    // muzzle flashes that "never disappear" after the reactive list removes
    // them. Full redraw (no bounds) since 3D components have no 2D bounds.
    this.markDirty()
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
    // In continuous mode the loop redraws every frame — a synchronous draw
    // here would double-render. The caller has already updated the matrices
    // it needs; the next loop frame picks them up.
    if (this.options.continuousRender) return
    this.needsFullRedraw = true
    this.draw()
  }

  private scheduleDraw() {
    // Continuous mode redraws every frame — no need to schedule event-driven
    // redraws on top of that.
    if (this.options.continuousRender) return
    if (this.rafId !== null) return
    
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.draw()
    })
  }

  private draw() {
    // Viewport follows the canvas' current size (it can change via the canvas
    // component's reactive width/height without re-mounting the context).
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height)

    if (this.needsFullRedraw) {
      this.clearBuffers()
      
      for (const component of this.components.values()) {
        component.draw()
      }

      // Shadow pass: render scene depth from the light's view, then draw
      // the main view sampling that shadow map. Only layer 0 (world) casts
      // shadows — overlays (weapon) do not.
      if (this.batchRenderer && this.shadowRenderer && this.shadowMatrix) {
        // Only opaque world geometry (layer 0) casts shadows — exclude
        // background/skybox items (depthWrite === false).
        const items = this.batchRenderer.getBatchItems()
          .filter((it) => (it.layer ?? 0) === 0 && it.depthWrite !== false)
        this.shadowRenderer.render(items, this.shadowMatrix)
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height)
        this.batchRenderer.setShadowMap(this.shadowRenderer.getDepthTexture(), this.shadowMatrix)
      } else if (this.batchRenderer) {
        this.batchRenderer.setShadowMap(null, null)
      }

      // Pass 1: main world (layer 0) with the main camera.
      if (this.instancedRenderer) {
        this.instancedRenderer.flush()
      } else if (this.batchRenderer) {
        this.batchRenderer.flush(0)
      }

      // Pass 2: overlay (e.g. weapon) rendered with its own camera + FOV,
      // composited transparently over the main view.
      if (this.overlayLayer !== null && this.overlayFbo && this.batchRenderer) {
        this.renderOverlayPass()
      }

      this.needsFullRedraw = false
    } else if (this.dirtyRegions.length > 0) {
      const dirtyBounds = mergeBounds(this.dirtyRegions)
      
      if (dirtyBounds) {
        this.clearBuffers()
        
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

  // --- Overlay pass helpers (dual-camera compositing) ---

  private ensureOverlayTargets() {
    const gl = this.gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    if (!this.overlayFbo) {
      this.overlayTex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.overlayDepthRb = gl.createRenderbuffer()
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.overlayDepthRb)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h)
      this.overlayFbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.overlayFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.overlayTex, 0)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.overlayDepthRb)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, null)
    } else {
      // Resize if canvas changed
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.overlayDepthRb)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h)
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }
  }

  private renderOverlayPass() {
    const gl = this.gl
    if (!this.batchRenderer || !this.overlayFbo || this.overlayLayer === null) return

    // Render overlay layer into its own transparent framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.overlayFbo)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    this.batchRenderer.setViewMatrix(this.overlayView)
    this.batchRenderer.setProjectionMatrix(this.overlayProj)
    this.batchRenderer.flush(this.overlayLayer)
    // CRITICAL: restore the MAIN camera matrices — the camera component only
    // re-applies them when its reactive deps change, so without this the main
    // pass would keep using the weapon (overlay) matrices on idle frames,
    // causing alternating-frame corruption (flicker).
    this.batchRenderer.setViewMatrix(this.viewMatrix)
    this.batchRenderer.setProjectionMatrix(this.projectionMatrix)

    // Composite overlay over the main view (alpha blend).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)
    this.blitOverlayTexture()
    gl.enable(gl.DEPTH_TEST)
  }

  private blitOverlayTexture() {
    const gl = this.gl
    if (!this.overlayTex) return
    if (!this.blitProgram) {
      this.blitProgram = new ShaderProgram(gl)
      this.blitProgram.compile(
        `attribute vec2 a_uv;
         varying vec2 v_uv;
         void main() {
           v_uv = a_uv;
           vec2 p = a_uv * 2.0 - 1.0;
           gl_Position = vec4(p, 0.0, 1.0);
         }`,
        `precision mediump float;
         varying vec2 v_uv;
         uniform sampler2D u_tex;
         void main() {
           gl_FragColor = texture2D(u_tex, v_uv);
         }`,
      )
      // Full-screen quad (two triangles), UVs bottom-left = (0,0).
      this.blitQuad = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, this.blitQuad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,  1, 0,  0, 1,
        0, 1,  1, 0,  1, 1,
      ]), gl.STATIC_DRAW)
    }
    if (!this.blitProgram || !this.blitQuad) return

    this.blitProgram.use()
    const loc = this.blitProgram.getAttribLocation('a_uv')
    const texLoc = this.blitProgram.getUniformLocation('u_tex')

    // Disable the batch renderer's attributes first so the blit quad's a_uv
    // (which may share an attribute slot, e.g. slot 0 = a_position) does not
    // corrupt the main pass state that will be used next frame.
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.blitQuad)
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex)
    if (texLoc) gl.uniform1i(texLoc, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Clean up so we leave WebGL in a neutral state.
    gl.disableVertexAttribArray(loc)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
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
    },
    uv?: Float32Array,
    texture?: WebGLTexture | null,
    vertexColors?: Float32Array,
    depthWrite?: boolean,
    normals?: Float32Array,
    layer?: number,
    skipTonemap?: boolean,
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
      this.batchRenderer.addShape(vertices, color, matrix, uv, texture, vertexColors, depthWrite, normals, layer, skipTonemap)
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
    if (this.continuousRafId !== null) {
      cancelAnimationFrame(this.continuousRafId)
    }
    const canvasEl = this.gl.canvas as HTMLCanvasElement
    if (this.onCanvasResize) {
      canvasEl.removeEventListener('rasen:resize', this.onCanvasResize)
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

/**
 * Push an EXISTING group context onto the stack (without creating a new one).
 *
 * Used by `each` to re-enter the same group context when mounting/unmounting
 * dynamic children, so their draw functions register with the SAME context
 * that the parent's draw iterates (otherwise dynamically-added children end
 * up in an orphaned context that is never drawn).
 */
export function pushGroupContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  groupContext: GroupContext
): void {
  let stack = groupContextStack.get(gl)
  if (!stack) {
    stack = []
    groupContextStack.set(gl, stack)
  }
  stack.push(groupContext)
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
