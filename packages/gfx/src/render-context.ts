/**
 * WebGL Render Context - manages component registration and rendering
 * Unified 2D/3D support
 */

import type { Gl2Context, GlContext } from './node'
import { BatchRenderer } from './renderer/batch'
import { InstancedRenderer } from './renderer/instanced'
import { ShadowRenderer } from './renderer/shadow'
import { ShaderProgram } from './renderer/shader'
import { Mat4x4f } from '@rasenjs/math'
import { parseColor } from './utils'
import type { CameraConfig } from './camera'
import { computeCameraMatrix, isLookAtCamera } from './camera'

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
 * WebGL Render Context options
 */
export interface RenderContextOptions {
  batching?: boolean
  /**
   * Opt-in WebGL2 instanced-quad fast path (massive uniform quads, e.g. the
   * million-rects benchmark). NOT on by default: the draw pass treats the
   * instanced renderer and the batch renderer as MUTUALLY EXCLUSIVE paths —
   * enabling this bypasses every addShape submission (skeletal / mesh / shape
   * / glTF). Requires WebGL2 (probed via 'drawArraysInstanced' in gl); on
   * WebGL1 the option is silently ignored and the batch path is used.
   */
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
  /**
   * 逻辑尺寸（CSS 像素）：投影矩阵的宽高来源。缺省退化为
   * gl.canvas 的绘图缓冲尺寸。由桥接方（dom <canvas>）显式传入，
   * 替代旧的 dataset 传递。
   */
  logicalWidth?: number
  logicalHeight?: number
  /**
   * Camera configuration — intrinsic to the canvas, not a child component.
   *
   * - 2D (default): `{ x?, y?, zoom? }` or omit entirely
   * - 3D perspective: `{ x, y, z, target, fov, ... }`
   * - 3D orthographic: `{ x, y, z, target }` (no fov)
   *
   * @see CameraConfig
   */
  camera?: CameraConfig
  /**
   * 帧调度注入（宿主适配点）。返回值即取消函数——调度与取消一体。
   * 缺省：环境有 requestAnimationFrame 用之；测试/SSR 环境退化为
   * queueMicrotask。
   */
  schedule?: (cb: () => void) => () => void
}

/**
 * WebGL Render Context
 */
export type GlPointerEventType = 'click' | 'pointerdown'

/**
 * Pointer handler registered by scene components (e.g. the spine pick).
 * Receives canvas-local CSS coordinates. Returns true if the event was
 * consumed (stops bubbling to remaining handlers).
 */
export type GlPointerHandler = (type: GlPointerEventType, x: number, y: number) => boolean
export class RenderContext {
  /** 场景树渲染根（顶层组件挂载时注册） */
  private roots: import('./node').GlNode[] = []
  /** 已调度但未执行的绘制取消函数（null = 无待执行绘制） */
  private cancelScheduled: (() => void) | null = null
  /** 连续渲染循环的取消函数 */
  private cancelContinuous: (() => void) | null = null
  private needsFullRedraw: boolean = true
  private options: Omit<RenderContextOptions, 'dirtyTracking'> & {
    batching: boolean
    instancing: boolean
    dirtyTracking: boolean
    clearColor: string
    continuousRender: boolean
  }
  /** 解析后的帧调度器（构造期确定，不依赖全局探测时序） */
  private readonly scheduleFrame: (cb: () => void) => () => void
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

  private batchRenderer: BatchRenderer | null = null
  private instancedRenderer: InstancedRenderer | null = null
  private projectionMatrix: Mat4x4f
  private viewMatrix: Mat4x4f
  /** Last camera config — kept so a logical-size change can recompute the
   *  projection with the same camera (the aspect must track the viewport,
   *  otherwise a resized canvas stretches the scene). */
  private lastCamera: CameraConfig | undefined
  private transformStack: TransformState[] = []
  /** Scene-registered pointer handlers (pure — fed by the host adapter). */
  private pointerHandlers = new Set<GlPointerHandler>()

  constructor(
    private gl: GlContext,
    options: RenderContextOptions = {}
  ) {
    this.options = {
      batching: options.batching ?? true,
      instancing: options.instancing ?? false,
      dirtyTracking: options.dirtyTracking ?? true,
      clearColor: options.clearColor ?? '#000000',
      continuousRender: options.continuousRender ?? false,
      logicalWidth: options.logicalWidth,
      logicalHeight: options.logicalHeight,
      camera: options.camera
    }
    this.lastCamera = options.camera

    // 帧调度：注入优先；缺省 rAF，环境缺失（测试/SSR）退化 queueMicrotask
    this.scheduleFrame =
      options.schedule ??
      (typeof requestAnimationFrame !== 'undefined'
        ? (cb) => {
            const id = requestAnimationFrame(cb)
            return () => cancelAnimationFrame(id)
          }
        : (cb) => {
            queueMicrotask(cb)
            return () => {}
          })

    this.setupWebGL()

    // Continuous mode: redraw every frame regardless of dirty events. This is
    // the sane mode for 3D/game scenes — event-driven redraws (markDirty →
    // scheduleDraw) are then redundant and skipped.
    if (this.options.continuousRender) {
      const loop = () => {
        this.needsFullRedraw = true
        this.draw()
        this.cancelContinuous = this.scheduleFrame(loop)
      }
      this.cancelContinuous = this.scheduleFrame(loop)
    }

    const logicalWidth =
      this.options.logicalWidth ?? gl.canvas.width
    const logicalHeight =
      this.options.logicalHeight ?? gl.canvas.height

    // Compute camera matrices from config (2D default: ortho with pan/zoom)
    const { projection, view } = computeCameraMatrix(
      options.camera,
      logicalWidth,
      logicalHeight
    )
    this.projectionMatrix = projection
    this.viewMatrix = view

    // Enable depth testing for 3D (lookAt) cameras
    if (isLookAtCamera(options.camera)) {
      gl.enable(gl.DEPTH_TEST)
    }

    // WebGL2 能力探测：不依赖 DOM 全局 instanceof；in 收窄到 Gl2Context
    if (this.options.instancing && 'drawArraysInstanced' in gl) {
      this.instancedRenderer = new InstancedRenderer(gl as Gl2Context, this.projectionMatrix)
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

  /** 顶层组件挂载时注册为渲染根 */
  addRoot(node: import('./node').GlNode): void {
    this.roots.push(node)
    this.markDirty()
  }

  removeRoot(node: import('./node').GlNode): void {
    const i = this.roots.indexOf(node)
    if (i >= 0) this.roots.splice(i, 1)
    this.markDirty()
  }

  /** 标脏：调度一次重绘（v1 一律全量重绘） */
  markDirty() {
    this.needsFullRedraw = true
    this.scheduleDraw()
  }

  /**
   * 宿主显式请求重绘（如 dom <canvas> 改了绘图缓冲尺寸后调用）。
   * 与 markDirty 的区别：无视 continuousRender 模式（连续模式下
   * scheduleDraw 是 no-op，但宿主主动触发的重绘仍应执行）。
   */
  requestRedraw() {
    this.needsFullRedraw = true
    this.scheduleDraw()
  }

  private scheduleDraw() {
    // Continuous mode redraws every frame — no need to schedule event-driven
    // redraws on top of that.
    if (this.options.continuousRender) return
    if (this.cancelScheduled !== null) return

    const cancel = this.scheduleFrame(() => {
      this.cancelScheduled = null
      this.draw()
    })
    // Wrap: external cancel must also reset the pending state, otherwise
    // subsequent markDirty calls would be dead-locked.
    this.cancelScheduled = () => {
      cancel()
      this.cancelScheduled = null
    }
  }

  private draw() {
    // Viewport follows the canvas' current size (it can change via the canvas
    // component's reactive width/height without re-mounting the context).
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height)

    if (this.needsFullRedraw) {
      this.clearBuffers()

      // Pre-order traversal of the scene-tree roots. Group nodes push their
      // transform before recursing children and pop afterwards, so subtree
      // transforms compose naturally.
      for (const root of this.roots) {
        root.draw()
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
    }
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
    transform:
      | Mat4x4f
      | {
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
    premultiplied?: boolean,
    blendMode?: import('./renderer/batch').BlendMode,
    indices?: Uint16Array | number[],
    translationOnly?: boolean,
    packedColor?: Uint8Array | { r: number; g: number; b: number; a: number },
  ) {
    // Mat4x4f passthrough skips createTransformMatrix (which allocates ~11
    // matrices per call). High-volume shape scenes pass a shared prebuilt
    // matrix instead of the per-shape object form.
    const matrix = transform instanceof Mat4x4f
      ? transform
      : this.createTransformMatrix(
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
      this.batchRenderer.addShape(vertices, color, matrix, uv, texture, vertexColors, depthWrite, normals, layer, skipTonemap, premultiplied, blendMode, indices, translationOnly, packedColor)
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
    console.log('RenderContext.setProjectionMatrix:', Array.from(matrix.source.slice(0, 4)))
    this.projectionMatrix = matrix
    if (this.batchRenderer) {
      console.log('BatchRenderer.setProjectionMatrix:', Array.from(matrix.source.slice(0, 4)))
      this.batchRenderer.setProjectionMatrix(matrix)
    } else {
      console.log('BatchRenderer is null!')
    }
    if (this.instancedRenderer) {
      this.instancedRenderer.setProjectionMatrix(matrix)
    }
  }

  getViewMatrix(): Mat4x4f {
    return this.viewMatrix
  }

  /**
   * The overlay (weapon) camera's view matrix — the matrix the overlay pass
   * actually renders layer-2 items with. Components drawn in the overlay pass
   * (e.g. a first-person weapon) should position themselves with THIS matrix's
   * inverse, not the main view's: the main view is updated asynchronously
   * (reactive watch → microtask) and can lag one frame behind the overlay view
   * during mouse look, which makes overlay items jitter.
   */
  getOverlayViewMatrix(): Mat4x4f {
    return this.overlayView
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

  /**
   * Update camera from a configuration object. Recomputes projection and
   * view matrices, then requests a redraw.
   *
   * For 2D: pass `{ x, y, zoom }`.
   * For 3D: pass `{ x, y, z, target, fov?, ... }`.
   */
  setCamera(config: CameraConfig) {
    this.lastCamera = config
    const w = this.options.logicalWidth ?? this.gl.canvas.width
    const h = this.options.logicalHeight ?? this.gl.canvas.height
    const { projection, view } = computeCameraMatrix(config, w, h)
    this.setProjectionMatrix(projection)
    this.setViewMatrix(view)
    // Depth test for 3D (lookAt) cameras
    if (isLookAtCamera(config)) {
      this.gl.enable(this.gl.DEPTH_TEST)
    } else {
      this.gl.disable(this.gl.DEPTH_TEST)
    }
    this.requestRedraw()
  }

  /**
   * Update the logical (CSS px) size the projection aspect derives from.
   *
   * The dom <canvas> bridge calls this when the element resizes. The logical
   * size is captured once at mount (before the first ResizeObserver callback,
   * so usually a placeholder); without this update the projection keeps the
   * mount-time aspect while the viewport uses the real one — the scene is
   * drawn stretched. Recomputes the projection with the last camera config.
   */
  setLogicalSize(w: number, h: number) {
    this.options.logicalWidth = w
    this.options.logicalHeight = h
    const { projection, view } = computeCameraMatrix(this.lastCamera, w, h)
    this.setProjectionMatrix(projection)
    this.setViewMatrix(view)
    this.requestRedraw()
  }

  /** Get the current camera configuration (undefined if default 2D). */
  get camera(): CameraConfig | undefined {
    return this.options.camera
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

  /**
   * Register a scene pointer handler (pure — the host adapter owns native
   * listeners and feeds canvas-local CSS coordinates via dispatchPointer).
   * Returns an unregister function.
   */
  addPointerHandler(handler: GlPointerHandler): () => void {
    this.pointerHandlers.add(handler)
    return () => {
      this.pointerHandlers.delete(handler)
    }
  }

  /**
   * PUBLIC entry for host adapters: dispatch a pointer event (canvas-local
   * CSS coordinates) to registered scene handlers. The renderer never sees
   * native event objects — same contract as the canvas-2d dispatchPointer.
   */
  dispatchPointer(type: GlPointerEventType, x: number, y: number): void {
    for (const handler of this.pointerHandlers) {
      if (handler(type, x, y)) return
    }
  }

  destroy() {
    this.pointerHandlers.clear()
    if (this.cancelScheduled !== null) {
      this.cancelScheduled()
      this.cancelScheduled = null
    }
    if (this.cancelContinuous !== null) {
      this.cancelContinuous()
      this.cancelContinuous = null
    }
    if (this.batchRenderer) {
      this.batchRenderer.destroy()
    }
    if (this.instancedRenderer) {
      this.instancedRenderer.destroy()
    }
    this.roots = []
    this.transformStack = []
    renderContextMap.delete(this.gl)
  }
}

const renderContextMap = new WeakMap<
  GlContext,
  RenderContext
>()

export function setRenderContext(
  gl: GlContext,
  context: RenderContext
) {
  renderContextMap.set(gl, context)
}

export function getRenderContext(
  gl: GlContext
): RenderContext {
  const context = renderContextMap.get(gl)
  if (!context) {
    throw new Error('RenderContext not found for WebGL context')
  }
  return context
}

export function hasRenderContext(
  gl: GlContext
): boolean {
  return renderContextMap.has(gl)
}
