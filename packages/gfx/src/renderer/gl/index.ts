/**
 * WebGL renderer — the WebGL implementation of {@link Renderer}.
 *
 * Everything device-agnostic (batching decisions, grouping, staging, the
 * transform loop, the frame loop) lives in the base class. This file executes
 * the GL calls: shader/UBO/VAO setup, buffer uploads, draw calls, the
 * shadow-map and dual-camera overlay passes, and depth state.
 *
 * WebGL2 fast path (VAO + bufferSubData). WebGL1 is FROZEN and always takes
 * the legacy per-group path (bufferData + pointer setup per group).
 */

import type { Gl2Context, GlContext } from '../../node'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER, DEFAULT_VERTEX_SHADER_ES3, DEFAULT_FRAGMENT_SHADER_ES3 } from './shader'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'
import { createTexture as createGLTexture, type TextureOptions } from '../../utils'
import { Renderer, type BatchItem, type TextureHandle } from '../base'
export { Renderer }
import { computeCameraMatrix, isLookAtCamera, type CameraConfig } from '../../camera'
import { ShadowRenderer } from './shadow'
import { InstancedRenderer } from './instanced'

export class WebGLRenderer extends Renderer {
  get ctx(): unknown {
    return this.gl
  }
  private readonly gl: GlContext
  private readonly shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private normalBuffer: WebGLBuffer | null = null
  private indexBuffer: WebGLBuffer | null = null
  /** GL-side buffer capacity in vertices; grown via bufferData (orphaning),
   * then filled per group via bufferSubData. 0 = nothing allocated yet. */
  private bufferCapacity = 0
  /** GPU element-buffer capacity in indices; grown via bufferData. */
  private indexBufferCapacity = 0

  /** WebGL2 fast path (VAO + bufferSubData). WebGL1 is FROZEN and always
   * takes the legacy per-group path. Probed once via 'createVertexArray' in
   * gl (WebGL2 core); the jsdom test mock intentionally lacks it, so unit
   * tests exercise the legacy path. Validated by benchmark/gfx A/B (E1+E2). */
  private readonly isWebGL2: boolean
  /** WebGL2-only entry point; null on WebGL1 (all uses are isWebGL2-gated). */
  private readonly gl2: Gl2Context | null
  /** VAOs with attrib pointers baked in, one per (normals × uv × packedColor)
   * enable combination — the legacy path toggles those attribs per group.
   * Indexed [hasNormals ? 4 : 0] | [hasTexture ? 2 : 0] | [packedColor ? 1 : 0]. */
  private vaos: (WebGLVertexArrayObject | null)[] = [null, null, null, null, null, null, null, null]
  /** WebGL2-only UBO holding the Frame block (view + projection, 128 B
   * std140). Uploaded once per frame via frameDirty instead of per group —
   * validated by benchmark/gfx A/B E3. */
  private readonly ubo: WebGLBuffer | null = null
  private readonly frameData = new Float32Array(32)
  /** Per-vertex texture index for multi-texture merged draws (WebGL2 only,
   * A/B E4). WebGL1 keeps one texture per group and never touches this. */
  private texIndexBuffer: WebGLBuffer | null = null
  /** True after a multi-texture upload: the buffer holds non-zero slot
   * indices, so the next single-texture group must re-zero it once before
   * uploads can be skipped again (stale indices would sample unbound
   * u_tex units → wrong colors). */
  private texIndexStale = false

  // --- sealed-run clean-stream upload skip ---------------------------------
  // A sealed mesh may declare a stream "unchanged" (producer did not restage
  // it — see SealedMesh.unchangedUv). The GPU buffers are persistent across
  // frames, so if THIS renderer knows the buffer still holds that stream's
  // content for the mesh's exact range, the bufferSubData is a no-op and can
  // be skipped. Validity is tracked per run range and invalidated by three
  // events: a legacy group uploading over the low offsets of the same buffer,
  // a buffer reallocation (orphaning bufferData wipes all content), and a
  // range's geometry changing. Positions are never skipped (animated
  // producers rewrite them every frame), so they double as the per-frame
  // liveness proof that the range's record is still the current occupant.
  /** Vertex-stream validity per vBase: did the uv / packed-color streams
   *  reach the GPU buffers at the current buffer epoch? */
  private sealedVertexStreams = new Map<number, { vCount: number; epoch: number; uvValid: boolean; colValid: boolean }>()
  /** Index-stream validity per iBase. */
  private sealedIndexStreams = new Map<number, { iCount: number; epoch: number }>()
  /** Bumped whenever the vertex buffers are reallocated (bufferData
   *  orphaning) — all previously uploaded content is gone. */
  private vertexBufferEpoch = 0
  /** Bumped whenever the element buffer is reallocated. */
  private indexBufferEpoch = 0

  /** A legacy group uploaded packed/float colors to colorBuffer over
   *  [0, byteEnd): any sealed run whose color bytes start below byteEnd was
   *  overwritten and must re-upload. */
  private invalidateSealedColorsBelow(byteEnd: number): void {
    for (const [vBase, rec] of this.sealedVertexStreams) {
      if (vBase * 4 < byteEnd) rec.colValid = false
    }
  }

  /** A legacy group uploaded uvs to texCoordBuffer over [0, byteEnd). */
  private invalidateSealedUvsBelow(byteEnd: number): void {
    for (const [vBase, rec] of this.sealedVertexStreams) {
      if (vBase * 8 < byteEnd) rec.uvValid = false
    }
  }

  /** A legacy group uploaded indices to the element buffer over [0, byteEnd). */
  private invalidateSealedIndicesBelow(byteEnd: number): void {
    for (const [iBase] of this.sealedIndexStreams) {
      if (iBase * 4 < byteEnd) this.sealedIndexStreams.delete(iBase)
    }
  }
  private texIndexLoc: number = -1
  /** Location of the ES 3.00 sampler array u_tex[4] (null on WebGL1). */
  private textureArrayLoc: WebGLUniformLocation | null = null
  private positionLoc: number = -1
  private colorLoc: number = -1
  private texCoordLoc: number = -1
  private normalLoc: number = -1
  private textureLoc: WebGLUniformLocation | null = null
  private useTextureLoc: WebGLUniformLocation | null = null
  private useLightingLoc: WebGLUniformLocation | null = null
  private lightDirLoc: WebGLUniformLocation | null = null
  private ambientLoc: WebGLUniformLocation | null = null
  private shadowMapLoc: WebGLUniformLocation | null = null
  private shadowMatrixLoc: WebGLUniformLocation | null = null
  private useShadowLoc: WebGLUniformLocation | null = null
  private skipTonemapLoc: WebGLUniformLocation | null = null

  private glOptions: {
    batching: boolean
    instancing: boolean
    logicalWidth?: number
    logicalHeight?: number
    camera?: CameraConfig
    clearColor: string
    continuousRender: boolean
  }
  private lastCamera: CameraConfig | undefined
  private instancedRenderer: InstancedRenderer | null = null

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
  private blitProgram: ShaderProgram | null = null
  private blitQuad: WebGLBuffer | null = null
  /** Number of active depth users (3D cameras); > 0 enables depth testing. */
  private depthCount = 0
  private logicalWidth?: number
  private logicalHeight?: number

  constructor(
    gl: GlContext,
    options: {
      batching?: boolean
      instancing?: boolean
      dirtyTracking?: boolean
      clearColor?: string
      continuousRender?: boolean
      logicalWidth?: number
      logicalHeight?: number
      camera?: CameraConfig
      schedule?: (cb: () => void) => () => void
      projectionMatrix?: Mat4x4f | number[]
    } = {}
  ) {
    super(options)
    this.gl = gl
    this.glOptions = {
      batching: options.batching ?? true,
      instancing: options.instancing ?? false,
      logicalWidth: options.logicalWidth,
      logicalHeight: options.logicalHeight,
      camera: options.camera,
      clearColor: options.clearColor ?? '#000000',
      continuousRender: options.continuousRender ?? false,
    }
    this.lastCamera = options.camera

    this.shader = new ShaderProgram(gl)

    this.positionBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()
    this.texCoordBuffer = gl.createBuffer()
    this.normalBuffer = gl.createBuffer()
    this.texIndexBuffer = gl.createBuffer()
    this.indexBuffer = gl.createBuffer()

    this.isWebGL2 = 'createVertexArray' in gl
    this.gl2 = this.isWebGL2 ? (gl as Gl2Context) : null
    if (this.gl2) {
      // ES 3.00 variants + Frame UBO (view/proj once per frame, not per group)
      this.shader.compile(DEFAULT_VERTEX_SHADER_ES3, DEFAULT_FRAGMENT_SHADER_ES3)
      this.ubo = this.gl2.createBuffer()
      this.gl2.bindBuffer(this.gl2.UNIFORM_BUFFER, this.ubo)
      this.gl2.bufferData(this.gl2.UNIFORM_BUFFER, 128, this.gl2.DYNAMIC_DRAW)
      const blockIndex = this.shader.getUniformBlockIndex('Frame')
      this.gl2.uniformBlockBinding(this.shader.getProgram()!, blockIndex, 0)
      this.gl2.bindBufferBase(this.gl2.UNIFORM_BUFFER, 0, this.ubo)
    } else {
      this.shader.compile(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER)
    }

    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.colorLoc = this.shader.getAttribLocation('a_color')
    this.texCoordLoc = this.shader.getAttribLocation('a_texCoord')
    this.normalLoc = this.shader.getAttribLocation('a_normal')
    this.texIndexLoc = this.shader.getAttribLocation('a_texIndex')
    this.textureLoc = this.shader.getUniformLocation('u_texture')
    this.textureArrayLoc = this.shader.getUniformLocation('u_tex')
    this.useTextureLoc = this.shader.getUniformLocation('u_useTexture')
    this.useLightingLoc = this.shader.getUniformLocation('u_useLighting')
    this.lightDirLoc = this.shader.getUniformLocation('u_lightDir')
    this.ambientLoc = this.shader.getUniformLocation('u_ambient')
    this.shadowMapLoc = this.shader.getUniformLocation('u_shadowMap')
    this.shadowMatrixLoc = this.shader.getUniformLocation('u_shadowMatrix')
    this.useShadowLoc = this.shader.getUniformLocation('u_useShadow')
    this.skipTonemapLoc = this.shader.getUniformLocation('u_skipTonemap')

    this.shader.use()
    // Sampler array u_tex[4] → texture units 0..3 (fixed mapping, set once).
    // WebGL2 only — the ES 1.00 program has no sampler array (and minimal GL
    // mocks report fake locations for unknown uniforms).
    if (this.gl2 && this.textureArrayLoc) this.gl2.uniform1iv(this.textureArrayLoc, [0, 1, 2, 3])
    if (this.lightDirLoc) gl.uniform3f(this.lightDirLoc, -0.906308, 0.323744, -0.271654)
    if (this.ambientLoc) gl.uniform3f(this.ambientLoc, 0.66, 0.7, 0.76)

    this.setupWebGL()

    if (this.glOptions.instancing && 'drawArraysInstanced' in gl) {
      this.instancedRenderer = new InstancedRenderer(gl as Gl2Context, this.projectionMatrix)
    }

    // Camera matrices from config (2D default: ortho with pan/zoom), or an
    // explicit projection matrix (tests / headless construct with one).
    if (options.projectionMatrix !== undefined) {
      this.projectionMatrix =
        options.projectionMatrix instanceof Mat4x4f
          ? options.projectionMatrix
          : mat4x4f(options.projectionMatrix)
    } else {
      this.applyCameraProjection()
    }

    // Enable depth testing for 3D (lookAt) cameras — through the same
    // accounting as enableDepth(), because clearBuffers() reads depthCount to
    // decide whether to clear the depth buffer. Enabling the GL state behind
    // its back left the depth buffer uncleared: stale depths then reject each
    // new frame's geometry and the scene smears as the camera turns.
    if (isLookAtCamera(options.camera)) {
      this.depthCount++
      this.activateDepth()
    }

    renderContextMap.set(gl, this)
  }

  /**
   * Turn the GL depth state on. Pure state — the ref-count and the "turn it
   * back off" decision live at the call sites, so both entry points (a lookAt
   * camera in the options, and an explicit enableDepth) stay accounted for.
   *
   * Back-face culling is intentionally NOT enabled: the lookAt view matrix
   * mirrors winding order, so the classic CCW-front convention flips and
   * visible faces get culled. Depth testing alone is correct for the scenes
   * this renderer targets.
   */
  private activateDepth(): void {
    const gl = this.gl
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.CULL_FACE)
  }

  private setupWebGL() {
    const gl = this.gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    const clear = parseColor(this.glOptions.clearColor)
    gl.clearColor(clear[0], clear[1], clear[2], clear[3])
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  }

  private applyCameraProjection() {
    const w = this.logicalWidth ?? this.gl.canvas.width
    const h = this.logicalHeight ?? this.gl.canvas.height
    const { projection, view } = computeCameraMatrix(this.lastCamera, w, h)
    this.projectionMatrix = projection
    this.viewMatrix = view
  }


  protected get mergedGrouping(): boolean {
    return this.isWebGL2
  }

  createTexture(source: Parameters<typeof createGLTexture>[1], options?: TextureOptions): WebGLTexture {
    return createGLTexture(this.gl, source, options)
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture)
  }

  /** Allocate GL buffer storage once per capacity level (orphaning via
   * bufferData); per-group fills use bufferSubData on top of it.
   * bufferData(number) sizes in BYTES — 4 bytes per float vertex component. */
  protected ensureBufferCapacity(totalVertices: number): void {
    if (totalVertices <= this.bufferCapacity) return
    const gl = this.gl
    const next = Math.max(totalVertices, Math.ceil(this.bufferCapacity * 1.5))
    this.bufferCapacity = next
    // Orphaning: new storage, zero old content — every sealed-run clean-stream
    // record is stale until its range is uploaded again.
    this.vertexBufferEpoch++
    this.sealedVertexStreams.clear()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 3 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    // Sized for the FLOAT path (4 floats × 4 bytes = 16 B/vertex); the packed
    // RGBA8 path (4 B/vertex) fits inside it.
    gl.bufferData(gl.ARRAY_BUFFER, next * 4 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 2 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 3 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 4, gl.DYNAMIC_DRAW)
  }

  /** Allocate element-buffer storage once per capacity level (orphaning via
   * bufferData); per-group fills use bufferSubData. */
  protected growIndexBuffer(indexCapacity: number): void {
    if (indexCapacity <= this.indexBufferCapacity) return
    const gl = this.gl
    const next = Math.max(indexCapacity, Math.ceil(this.indexBufferCapacity * 1.5))
    this.indexBufferCapacity = next
    this.indexBufferEpoch++
    this.sealedIndexStreams.clear()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, next * 4, gl.DYNAMIC_DRAW)
  }

  protected drawOverlay(): void {
    if (this.overlayLayer !== null && this.overlayFbo) {
      this.renderOverlayPass()
    }
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

  /** Enable shadow mapping (directional light). Pass null to disable. */
  enableShadows(lightMatrix: Mat4x4f | null) {
    if (lightMatrix) {
      if (!this.shadowRenderer) {
        this.shadowRenderer = new ShadowRenderer(this.gl)
      }
      this.shadowMatrix = lightMatrix
    } else {
      this.shadowMatrix = null
    }
    this.markDirty()
  }

  /**
   * Enable depth testing (typically called by a 3D camera on mount).
   *
   * Ref-counted: the first caller enables depth, and depth turns off only
   * after every caller has called `disableDepth`. This replaces the old
   * 2D/3D mode switch — depth is just a per-scene flag, and 2D scenes
   * (no camera) never enable it.
   */
  enableDepth() {
    this.depthCount++
    if (this.depthCount === 1) {
      this.activateDepth()
      this.needsFullRedraw = true
      this.scheduleDrawPublic()
    }
  }

  /** Disable depth testing (typically called by a 3D camera on unmount). */
  disableDepth() {
    this.depthCount--
    if (this.depthCount <= 0) {
      this.depthCount = 0
      this.gl.disable(this.gl.DEPTH_TEST)
      this.needsFullRedraw = true
      this.scheduleDrawPublic()
    }
  }

  /** Is depth testing currently active? */
  getDepthEnabled(): boolean {
    return this.depthCount > 0
  }

  private renderOverlayPass() {
    const gl = this.gl
    if (!this.overlayFbo || this.overlayLayer === null) return

    // Render overlay layer into its own transparent framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.overlayFbo)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    this.setViewMatrix(this.overlayView)
    this.setProjectionMatrix(this.overlayProj)
    this.flush(this.overlayLayer)
    // CRITICAL: restore the MAIN camera matrices — the camera component only
    // re-applies them when its reactive deps change, so without this the main
    // pass would keep using the weapon (overlay) matrices on idle frames,
    // causing alternating-frame corruption (flicker).
    this.setViewMatrix(this.viewMatrix)
    this.setProjectionMatrix(this.projectionMatrix)

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
      // The fragment stage needs an explicit float precision: GLSL ES 1.00
      // gives vertex shaders a default (highp) but leaves fragment shaders
      // with none, and the compiler rejects the whole program without it —
      // which silently cost the overlay composite.
      this.blitProgram.compile(
        `attribute vec2 a_uv;
         varying vec2 v_uv;
         void main() {
           v_uv = a_uv;
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
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }
  }

  protected endFrame(): void {
    // WebGL presents implicitly; nothing to do.
  }

  /** exposed scheduling for depth toggles (base markDirty does the same job) */
  private scheduleDrawPublic() {
    this.markDirty()
  }

  protected beginFrame(): void {
    // Viewport follows the canvas' current size (it can change via the canvas
    // component's reactive width/height without re-mounting the context).
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height)
    this.clearBuffers()
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

  protected drawWorld(): void {
    // Shadow pass: render scene depth from the light's view, then draw
    // the main view sampling that shadow map. Only layer 0 (world) casts
    // shadows — overlays (weapon) do not.
    if (this.shadowRenderer && this.shadowMatrix) {
      // Only opaque world geometry (layer 0) casts shadows — exclude
      // background/skybox items (depthWrite === false).
      const items = this.getBatchItems()
        .filter((it) => (it.layer ?? 0) === 0 && it.depthWrite !== false)
      this.shadowRenderer.render(items, this.shadowMatrix)
      this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height)
      this.setShadowMap(this.shadowRenderer.getDepthTexture(), this.shadowMatrix)
    } else {
      this.setShadowMap(null, null)
    }

    // Pass 1: main world (layer 0) with the main camera.
    if (this.instancedRenderer) {
      this.instancedRenderer.flush()
    } else {
      this.flush(0)
    }
  }


  /** Draw a run of consecutive fast-lane markers as one drawElements call:
   * their staging ranges are contiguous by construction (beginMesh reserves
   * from a monotonic watermark), so one bufferSubData per attribute covers
   * the merged range. */
  protected drawSealedRun(items: BatchItem[], start: number, end: number): void {
    const gl = this.gl
    const first = items[start].sealed!
    const last = items[end - 1].sealed!
    const vBase = first.vBase
    const vCount = last.vBase + last.vCount - vBase
    const iBase = first.iBase
    const iCount = last.iBase + last.iCount - iBase

    // Blend state — the run is key-homogeneous, read from the first marker.
    const blendMode = first.blendMode
    const pma = first.premultiplied
    const srcRgb = pma ? gl.ONE : gl.SRC_ALPHA
    const blendSep = (gl as { blendFuncSeparate?: (srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number) => void }).blendFuncSeparate
    const blend = (srcRgb: number, dstRgb: number, srcA: number, dstA: number): void => {
      if (blendSep) blendSep.call(gl, srcRgb, dstRgb, srcA, dstA)
      else gl.blendFunc(srcRgb, dstRgb)
    }
    switch (blendMode) {
      case 'additive': blend(srcRgb, gl.ONE, gl.ONE, gl.ONE); break
      case 'multiply': blend(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break
      case 'screen': blend(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_COLOR); break
      default: blend(srcRgb, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    }

    this.shader.use()
    this.uploadFrameUniforms()

    // Shadow map: fast-lane items are opaque world geometry by default;
    // honor the same depthWrite rule as legacy (skip for depthWrite=false).
    const shadow = this.getShadow()
    const shadowActive = shadow && !first.skipTonemap
    if (shadowActive && this.useShadowLoc) {
      const shadowUnit = this.gl2 ? 15 : 1
      gl.activeTexture(gl.TEXTURE0 + shadowUnit)
      gl.bindTexture(gl.TEXTURE_2D, shadow!.map)
      if (this.shadowMapLoc) gl.uniform1i(this.shadowMapLoc, shadowUnit)
      if (this.shadowMatrixLoc) gl.uniformMatrix4fv(this.shadowMatrixLoc, false, shadow!.matrix.source)
      gl.uniform1i(this.useShadowLoc, 1)
      gl.activeTexture(gl.TEXTURE0)
    } else if (this.useShadowLoc) {
      gl.uniform1i(this.useShadowLoc, 0)
    }
    if (this.skipTonemapLoc) gl.uniform1i(this.skipTonemapLoc, first.skipTonemap ? 1 : 0)

    // Fast-lane groups draw through the packedColor VAO variant (the color
    // staging is RGBA8). Fast-lane producers don't carry normals; a future
    // producer that does can key its own VAO lane.
    const vao = this.getVao(false, true, true)
    this.gl2!.bindVertexArray(vao)

    // Position stride = 12 bytes (3 floats); color = 4 bytes (RGBA8);
    // uv = 8 bytes (2 floats). The byte offsets differ per attribute.
    const staging = this.getStaging()

    // Clean-stream skip bookkeeping (see the field docs above). The position
    // upload below is unconditional, so a record whose epoch matches and
    // whose vCount matches proves this exact range was drawn by this run
    // shape at the current buffer generation — i.e. the uv/color bytes in
    // the GPU buffers are this run's content unless something overwrote them
    // since (legacy uploads, buffer growth), which the invalidation helpers
    // handle by clearing the records.
    //
    // The declarations are per MESH but the upload below covers the RUN, so the
    // skip is only valid when EVERY item in the run declares the stream
    // unchanged. Reading it off `first` alone let a later item keep stale GPU
    // bytes: when an attachment appears or disappears mid-animation its
    // submission slot shifts, so that mesh stops being "owned" and rewrites its
    // uv/color into staging — but the first item in the same run still declared
    // unchanged, the run-level upload was skipped, and the mesh sampled whatever
    // the GPU buffer happened to hold (a wrong region of the atlas, appearing as
    // extra geometry for the frames until the run's first item changed and
    // forced an upload).
    let allUvUnchanged = true
    let allColUnchanged = true
    let allIdxUnchanged = true
    for (let k = start; k < end; k++) {
      const s = items[k].sealed!
      if (s.unchangedUv !== true) allUvUnchanged = false
      if (s.unchangedColor !== true) allColUnchanged = false
      if (s.unchangedIndices !== true) allIdxUnchanged = false
      // Nothing left to prove — stop paying for the rest of the run.
      if (!allUvUnchanged && !allColUnchanged && !allIdxUnchanged) break
    }
    let vrec = this.sealedVertexStreams.get(vBase)
    const vertexKnown =
      vrec !== undefined && vrec.vCount === vCount && vrec.epoch === this.vertexBufferEpoch
    const skipUv = allUvUnchanged && vertexKnown && vrec!.uvValid
    const skipCol = allColUnchanged && vertexKnown && vrec!.colValid
    if (!vertexKnown) vrec = undefined

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, vBase * 12, staging.positions!.subarray(vBase * 3, (vBase + vCount) * 3))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    if (!skipCol) {
      gl.bufferSubData(gl.ARRAY_BUFFER, vBase * 4, staging.packedColors!.subarray(vBase * 4, (vBase + vCount) * 4))
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    if (skipUv) {
      // unchanged — the GPU buffer still holds this run's uv bytes.
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, vBase * 8, staging.uvs!.subarray(vBase * 2, (vBase + vCount) * 2))
    }
    // Record (or refresh) what the GPU buffers now hold for this range.
    if (vrec === undefined) {
      vrec = { vCount, epoch: this.vertexBufferEpoch, uvValid: !skipUv, colValid: !skipCol }
      this.sealedVertexStreams.set(vBase, vrec)
    } else {
      vrec.uvValid = true
      vrec.colValid = true
    }
    // texIndex: fast-lane groups are single-texture (u_tex[0]) — same stale
    // policy as the legacy single-texture path. The re-zero upload must write
    // ZEROS, not the staging content: fast-lane producers never stage
    // texIndices, so the texIndicesArray[vBase..] holds stale values from
    // previous legacy (multi-texture) groups — uploading them would make the
    // group sample unbound texture units.
    if (this.texIndexStale) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
      const zeros = this.zeroTexIndices(vCount)
      gl.bufferSubData(gl.ARRAY_BUFFER, vBase * 4, zeros)
      this.texIndexStale = false
    }

    // Texture: single texture per sealed run (flushMerged splits runs on
    // texture change — multi-page atlases alternate pages between
    // consecutive attachments).
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, first.textures[0]!)
    if (this.useTextureLoc) gl.uniform1i(this.useTextureLoc, 1)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    const irec = this.sealedIndexStreams.get(iBase)
    const indexKnown =
      irec !== undefined && irec.iCount === iCount && irec.epoch === this.indexBufferEpoch
    // Same run-vs-item rule as uv/color above: one upload covers every index in
    // the run, so the skip needs the whole run to declare unchanged.
    if (!(allIdxUnchanged && indexKnown)) {
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, iBase * 4, staging.indices!.subarray(iBase, iBase + iCount))
      this.sealedIndexStreams.set(iBase, { iCount, epoch: this.indexBufferEpoch })
    }

    if (first.skipTonemap) gl.depthMask(false)
    // Draw from the run's own element range: the indices were uploaded at
    // byte offset iBase*4, so the draw offset must match. Offset 0 reads the
    // START of the element buffer — the first run's (or a previous frame's
    // legacy group's) indices — which rendered every sealed run after the
    // first as garbage triangles (the c223/c233 multi-page "shredded
    // character" regression; c310's single run with iBase=0 hid it entirely).
    gl.drawElements(gl.TRIANGLES, iCount, gl.UNSIGNED_INT, iBase * 4)

    if (this.gl2) this.gl2.bindVertexArray(null)
    if (first.skipTonemap) gl.depthMask(true)
  }

  protected drawGroup(items: BatchItem[], textures: (TextureHandle | null)[]): void {
    const gl = this.gl
    const s = this.transformGroup(items, textures, this.isWebGL2)
    const {
      positions, colors, packedColors, uvs, normals, texIndices,
      totalVertices, totalIndices, allIndexed, hasNormals, allPackedColor, hasTexture,
      colorCount, packedColorCount,
    } = s

    // WebGL1 legacy path draws one texture per group (textures.length === 1).
    const texture = textures[0]

    // 2D blend modes (matches the standard Porter-Duff / additive / multiply /
    // screen factors). `premultiplied` swaps the src RGB factor for PMA
    // atlases (ONE instead of SRC_ALPHA). A group shares one texture + blend
    // mode, so all its items agree on the flags.
    const blendMode = items[0]?.blendMode ?? 'normal'
    const pma = items.some((it) => it.premultiplied === true)
    const srcRgb = pma ? gl.ONE : gl.SRC_ALPHA
    // blendFuncSeparate is core in both WebGL1 and WebGL2, but minimal GL
    // mocks (jsdom test env) may omit it — read it as optional (NOT via the
    // `in` operator, which would narrow the GlContext union to never in the
    // negative branch) and degrade to plain blendFunc when absent.
    const blendSep = (gl as { blendFuncSeparate?: (srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number) => void }).blendFuncSeparate
    const blend = (srcRgb: number, dstRgb: number, srcA: number, dstA: number): void => {
      if (blendSep) blendSep.call(gl, srcRgb, dstRgb, srcA, dstA)
      else gl.blendFunc(srcRgb, dstRgb)
    }
    switch (blendMode) {
      case 'additive':
        blend(srcRgb, gl.ONE, gl.ONE, gl.ONE)
        break
      case 'multiply':
        blend(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        break
      case 'screen':
        blend(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_COLOR)
        break
      default:
        blend(srcRgb, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    }

    // Vertices are pre-transformed to world space on the CPU (per-item model
    // matrix) so all items share one VBO — that's what makes batching work.
    // The GPU then applies view + projection, i.e. gl_Position = proj * view *
    // worldPos.
    this.shader.use()
    this.uploadFrameUniforms()

    // Bind shadow map (if active) — used by every fragment in this group.
    // Skip shadow for background/skybox groups (depthWrite=false).
    // WebGL2 puts the shadow map on unit 15 so units 0..3 stay free for
    // multi-texture merged draws (A/B E4); WebGL1 (frozen) keeps unit 1.
    const shadowUnit = this.gl2 ? 15 : 1
    const shadow = this.getShadow()
    const shadowActive = shadow && !items.some((it) => it.depthWrite === false)
    if (shadowActive && this.useShadowLoc) {
      gl.activeTexture(gl.TEXTURE0 + shadowUnit)
      gl.bindTexture(gl.TEXTURE_2D, shadow!.map)
      if (this.shadowMapLoc) gl.uniform1i(this.shadowMapLoc, shadowUnit)
      if (this.shadowMatrixLoc) gl.uniformMatrix4fv(this.shadowMatrixLoc, false, shadow!.matrix.source)
      gl.uniform1i(this.useShadowLoc, 1)
      // restore active texture 0 for main texture sampling
      gl.activeTexture(gl.TEXTURE0)
    } else if (this.useShadowLoc) {
      gl.uniform1i(this.useShadowLoc, 0)
    }

    // Skybox / background items keep their original colours (skip ACES).
    const skipTonemap = items.every((it) => it.skipTonemap === true)
    if (this.skipTonemapLoc) gl.uniform1i(this.skipTonemapLoc, skipTonemap ? 1 : 0)

    if (this.isWebGL2) {
      // WebGL2 fast path: attrib pointers live in a per-combination VAO
      // (configured once), buffers are allocated once at capacity and filled
      // per group with bufferSubData — no per-group reallocation or pointer
      // setup. Validated by benchmark/gfx A/B E1+E2.
      const vao = this.getVao(hasNormals, hasTexture, allPackedColor)
      this.gl2!.bindVertexArray(vao)
      this.ensureBufferCapacity(totalVertices)

      if (allIndexed) {
        // The VAO captured the shared index buffer at creation (getVao), so
        // the element binding is already correct here; bind + fill it.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
        this.growIndexBuffer(totalIndices)
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, s.indices.subarray(0, totalIndices))
        this.invalidateSealedIndicesBelow(totalIndices * 4)
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, totalVertices * 3))
      if (allPackedColor) {
        // 4 bytes/vertex RGBA8 (vs 16 bytes for float) — 75% upload cut.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, packedColors.subarray(0, packedColorCount))
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors.subarray(0, colorCount))
      }
      // Legacy groups upload at offset 0 into the SAME buffers sealed runs
      // use at vBase > 0 — the sealed runs' low-range records are stale now.
      this.invalidateSealedColorsBelow(allPackedColor ? packedColorCount : colorCount * 4)
      if (hasNormals) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals.subarray(0, totalVertices * 3))
        if (this.useLightingLoc) gl.uniform1i(this.useLightingLoc, 1)
      } else if (this.useLightingLoc) {
        gl.uniform1i(this.useLightingLoc, 0)
      }
      if (hasTexture) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, uvs.subarray(0, totalVertices * 2))
        this.invalidateSealedUvsBelow(totalVertices * 8)
        // a_texIndex is always enabled in the VAO, so the buffer must not
        // hold stale slot indices from a previous MULTI-texture group when a
        // SINGLE-texture group samples u_tex[0] only. Skip the upload only
        // while the buffer is known-zero (the transform loop writes texSlot=0
        // for single groups); after any multi upload, the next single group
        // re-zeroes once. (Golden caught the naive skip: stale indices made
        // single groups sample unbound units → 6% pixel drift.)
        if (textures.length > 1) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, texIndices.subarray(0, totalVertices))
          this.texIndexStale = true
        } else if (this.texIndexStale) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, texIndices.subarray(0, totalVertices))
          this.texIndexStale = false
        }
      }
    } else {
      // Legacy WebGL1 path (frozen): per-group reallocation + pointer setup.
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, totalVertices * 3), gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(this.positionLoc)
      gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
      if (allPackedColor) {
        gl.bufferData(gl.ARRAY_BUFFER, packedColors.subarray(0, packedColorCount), gl.DYNAMIC_DRAW)
      } else {
        gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, colorCount), gl.DYNAMIC_DRAW)
      }
      gl.enableVertexAttribArray(this.colorLoc)
      gl.vertexAttribPointer(
        this.colorLoc, 4,
        allPackedColor ? gl.UNSIGNED_BYTE : gl.FLOAT,
        allPackedColor, 0, 0
      )

      // Normals (world space) — enables per-pixel directional lighting
      if (hasNormals) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, normals.subarray(0, totalVertices * 3), gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(this.normalLoc)
        gl.vertexAttribPointer(this.normalLoc, 3, gl.FLOAT, false, 0, 0)
        if (this.useLightingLoc) gl.uniform1i(this.useLightingLoc, 1)
      } else {
        gl.disableVertexAttribArray(this.normalLoc)
        if (this.useLightingLoc) gl.uniform1i(this.useLightingLoc, 0)
      }

      if (hasTexture) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, uvs.subarray(0, totalVertices * 2), gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(this.texCoordLoc)
        gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0)
      } else {
        gl.disableVertexAttribArray(this.texCoordLoc)
      }
    }

    if (hasTexture) {
      if (this.gl2) {
        // Merged draw: bind the group's textures to units 0..n-1 (sampler
        // array mapping set once at init).
        for (let s2 = 0; s2 < textures.length; s2++) {
          gl.activeTexture(gl.TEXTURE0 + s2)
          gl.bindTexture(gl.TEXTURE_2D, textures[s2]!)
        }
      } else {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture!)
        if (this.textureLoc) gl.uniform1i(this.textureLoc, 0)
      }
      if (this.useTextureLoc) gl.uniform1i(this.useTextureLoc, 1)
    } else if (this.useTextureLoc) {
      gl.uniform1i(this.useTextureLoc, 0)
    }

    // Skybox / background groups disable depth writing so scene geometry
    // drawn afterwards still passes depth test and covers them correctly.
    const depthWrite = items.every((item) => item.depthWrite === false)
    if (depthWrite) gl.depthMask(false)

    if (allIndexed) {
      // Uint32 indices: a merged group can hold ~100k unique vertices (the
      // maxBatchSize flush cap), past the Uint16 index range. Unsigned-int
      // element buffers are WebGL2 core.
      gl.drawElements(gl.TRIANGLES, totalIndices, gl.UNSIGNED_INT, 0)
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, totalVertices)
    }

    // Leave a neutral VAO bound — the shadow/blit passes configure their own
    // attrib state on the default VAO and must not see ours.
    if (this.gl2) this.gl2.bindVertexArray(null)

    if (depthWrite) gl.depthMask(true)
  }

  /** Upload view + projection. WebGL2: once per frame into the Frame UBO
   * (dirty-flagged — layered flushes with unchanged matrices skip the
   * upload). WebGL1 (frozen): per-group regular uniforms. */
  private uploadFrameUniforms(): void {
    if (this.gl2) {
      if (!this.frameDirty) return
      this.frameDirty = false
      this.frameData.set(this.viewMatrix.source, 0)
      this.frameData.set(this.projectionMatrix.source, 16)
      this.gl2.bindBuffer(this.gl2.UNIFORM_BUFFER, this.ubo)
      this.gl2.bufferSubData(this.gl2.UNIFORM_BUFFER, 0, this.frameData)
    } else {
      this.shader.setUniform('u_view', this.viewMatrix.source)
      this.shader.setUniform('u_projection', this.projectionMatrix.source)
    }
  }

  /** VAO for the (normals, uv, packedColor) enable combination — configured
   * lazily, once. Buffer growth does NOT invalidate the VAO: pointers
   * reference the buffer objects, and bufferData orphaning keeps the bindings. */
  private getVao(hasNormals: boolean, hasTexture: boolean, packedColor: boolean): WebGLVertexArrayObject {
    const index = (hasNormals ? 4 : 0) | (hasTexture ? 2 : 0) | (packedColor ? 1 : 0)
    const gl2 = this.gl2!
    let vao = this.vaos[index]
    if (vao) return vao
    vao = gl2.createVertexArray()
    if (!vao) throw new Error('createVertexArray failed')
    this.vaos[index] = vao

    gl2.bindVertexArray(vao)
    // Capture the shared index buffer in this VAO's ELEMENT_ARRAY_BUFFER
    // binding (element bindings are VAO state). Every group binds the same
    // buffer, so the captured binding stays valid across groups.
    gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.positionBuffer)
    gl2.enableVertexAttribArray(this.positionLoc)
    gl2.vertexAttribPointer(this.positionLoc, 3, gl2.FLOAT, false, 0, 0)
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.colorBuffer)
    gl2.enableVertexAttribArray(this.colorLoc)
    // Color attribute type follows the group kind: packed groups upload
    // RGBA8 (UNSIGNED_BYTE, normalized → vec4 [0,1]); non-packed groups
    // upload Float32Array vec4. Binding UNSIGNED_BYTE for float data (or
    // vice versa) reinterprets the bytes → garbage colors (golden caught
    // this: 6.2% drift on the shapes scene).
    if (packedColor) {
      gl2.vertexAttribPointer(this.colorLoc, 4, gl2.UNSIGNED_BYTE, true, 0, 0)
    } else {
      gl2.vertexAttribPointer(this.colorLoc, 4, gl2.FLOAT, false, 0, 0)
    }
    if (hasNormals) {
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.normalBuffer)
      gl2.enableVertexAttribArray(this.normalLoc)
      gl2.vertexAttribPointer(this.normalLoc, 3, gl2.FLOAT, false, 0, 0)
    } else {
      gl2.disableVertexAttribArray(this.normalLoc)
    }
    if (hasTexture) {
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.texCoordBuffer)
      gl2.enableVertexAttribArray(this.texCoordLoc)
      gl2.vertexAttribPointer(this.texCoordLoc, 2, gl2.FLOAT, false, 0, 0)
    } else {
      gl2.disableVertexAttribArray(this.texCoordLoc)
    }
    // Texture index (multi-texture merge) — always enabled; solid groups
    // leave stale values in the buffer, which the u_useTexture=0 branch
    // never samples.
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.texIndexBuffer)
    gl2.enableVertexAttribArray(this.texIndexLoc)
    gl2.vertexAttribPointer(this.texIndexLoc, 1, gl2.FLOAT, false, 0, 0)
    gl2.bindVertexArray(null)
    return vao
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
    this.camera = config
    const w = this.logicalWidth ?? this.gl.canvas.width
    const h = this.logicalHeight ?? this.gl.canvas.height
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
    this.logicalWidth = w
    this.logicalHeight = h
    const { projection, view } = computeCameraMatrix(this.lastCamera, w, h)
    this.setProjectionMatrix(projection)
    this.setViewMatrix(view)
    this.requestRedraw()
  }

  getBatchRenderer(): WebGLRenderer | null {
    return this
  }

  getInstancedRenderer(): InstancedRenderer | null {
    return this.instancedRenderer
  }

  /**
   * Overlay camera's view matrix (for billboard-style overlays that need the
   * overlay camera's inverse, not the main view's: the main view is updated
   * asynchronously (reactive watch → microtask) and can lag one frame behind
   * the overlay view during mouse look, which makes overlay items jitter.
   */
  getOverlayViewMatrix(): Mat4x4f {
    return this.overlayView
  }

  override setViewMatrix(view: Mat4x4f) {
    super.setViewMatrix(view)
    if (this.instancedRenderer) {
      this.instancedRenderer.setViewMatrix(view)
    }
  }

  override setProjectionMatrix(projection: Mat4x4f) {
    super.setProjectionMatrix(projection)
    if (this.instancedRenderer) {
      this.instancedRenderer.setProjectionMatrix(projection)
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
    if (this.instancedRenderer) {
      this.instancedRenderer.destroy()
    }
    this.children.length = 0
    this.transforms.reset()
    const gl = this.gl
    if (this.gl2) {
      for (const vao of this.vaos) if (vao) this.gl2.deleteVertexArray(vao)
      this.vaos = [null, null, null, null]
      if (this.ubo) this.gl2.deleteBuffer(this.ubo)
    }
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    if (this.texIndexBuffer) gl.deleteBuffer(this.texIndexBuffer)
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer)
    if (this.overlayFbo) gl.deleteFramebuffer(this.overlayFbo)
    if (this.overlayTex) gl.deleteTexture(this.overlayTex)
    if (this.overlayDepthRb) gl.deleteRenderbuffer(this.overlayDepthRb)
    if (this.blitProgram) this.blitProgram.destroy()
    this.shader.destroy()
    renderContextMap.delete(this.gl)
  }

}

const renderContextMap = new WeakMap<GlContext, WebGLRenderer>()

export function getRenderContext(gl: GlContext): WebGLRenderer {
  const context = renderContextMap.get(gl)
  if (!context) {
    throw new Error('RenderContext not found for WebGL context')
  }
  return context
}

export function hasRenderContext(gl: GlContext): boolean {
  return renderContextMap.has(gl)
}

function parseColor(s: string): [number, number, number, number] {
  const rgba = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (rgba) return [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255, rgba[4] ? Number(rgba[4]) : 1]
  if (s.startsWith('#')) {
    const h = s.slice(1)
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    ]
  }
  return [0, 0, 0, 0]
}

export type RenderContextOptions = {
  batching?: boolean
  instancing?: boolean
  dirtyTracking?: boolean
  clearColor?: string
  continuousRender?: boolean
  logicalWidth?: number
  logicalHeight?: number
  camera?: CameraConfig
  schedule?: (cb: () => void) => () => void
  projectionMatrix?: Mat4x4f | number[]
}

