/**
 * Batch renderer - combines multiple shapes into single draw call
 * Supports both 2D (z=0) and 3D rendering
 */

import type { Color } from '../types'
import type { Gl2Context, GlContext } from '../node'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER, DEFAULT_VERTEX_SHADER_ES3, DEFAULT_FRAGMENT_SHADER_ES3 } from './shader'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

/** 2D blend equation (affects the GL blend function). Used for both 2D shapes
 *  and 2D-style meshes that emulate an additive/multiply/screen draw. */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen'

interface BatchItem {
  vertices: Float32Array
  color: Color
  transform: Mat4x4f
  uv?: Float32Array
  texture?: WebGLTexture | null
  /** Optional per-vertex colors (RGB per vertex, overrides uniform color). */
  vertexColors?: Float32Array
  /** Optional per-vertex world-space normals (enables per-pixel lighting). */
  normals?: Float32Array
  /** Disable depth writing (e.g. skybox). Defaults to true. */
  depthWrite?: boolean
  /** Render layer (0 = main world, others = overlay passes). Default 0. */
  layer?: number
  /** Skip tonemapping (e.g. skybox keeps its original vivid colours). */
  skipTonemap?: boolean
  /** Use premultiplied-alpha blending (ONE, ONE_MINUS_SRC_ALPHA). Required
   *  for atlases exported with premultiplied alpha (pma:true). Default false
   *  uses straight-alpha blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA). */
  premultiplied?: boolean
  /** 2D blend equation (normal/additive/multiply/screen). Default normal. */
  blendMode?: BlendMode
  /** Optional triangle index list into `vertices` (3 entries per triangle).
   * When EVERY item in a group carries indices, the group draws via
   * drawElements: unique vertices are transformed and uploaded once instead
   * of once per triangle (~3× less CPU transform work and upload on
   * shared-vertex meshes). WebGL2 only; on WebGL1 (frozen) and in mixed
   * groups, indexed items are expanded through the index list inside the
   * batch transform loop. */
  indices?: Uint16Array | number[]
  /** Hint that `transform` is a pure translation matrix (only source[12..14]
   * non-zero, all other diagonal=1 off-diagonal=0). The transform pass then
   * skips 9 multiplies per vertex and adds source[12..14] directly. */
  translationOnly?: boolean
  /** Opt-in RGBA8 packed color. Two forms accepted:
   *  - `Uint8Array` of length 4 * vertexCount (per-vertex RGBA8 stream)
   *  - a `{ r, g, b, a }` uniform color object — the batch renderer
   *    expands it once into the group's packed stream (avoids caller-side
   *    per-frame allocation for the common single-tint-per-shape case).
   * Mutually exclusive with `vertexColors`. When set, the group is uploaded
   * via UNSIGNED_BYTE + normalized=true (shader still sees vec4 [0,1]). */
  packedColor?: Uint8Array | Color
}

/** Max textures merged into one draw call (sampler array size in the ES 3.00
 * fragment shader). Validated by benchmark/gfx A/B E4. */
const MAX_TEXTURES_PER_DRAW = 4

/** Item-level grouping key for the WebGL2 merged flush. Every component is
 * an item-level boolean so groups are flag-homogeneous — the some()/every()
 * derivations in drawGroup then reduce to the shared item value and per-item
 * output matches the legacy (texture, blend) grouping exactly. */
function mergedGroupKey(it: BatchItem): string {
  return `${it.blendMode ?? 'normal'}|${it.texture ? 'T' : 'S'}|${it.premultiplied === true ? 1 : 0}|${it.skipTonemap === true ? 1 : 0}|${it.depthWrite === false ? 1 : 0}|${it.normals && it.normals.length > 0 ? 1 : 0}`
}

export class BatchRenderer {
  private shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private normalBuffer: WebGLBuffer | null = null
  private batchItems: BatchItem[] = []
  private maxBatchSize = 100000

  private positionsArray: Float32Array | null = null
  private colorsArray: Float32Array | null = null
  /** Packed RGBA8 per-vertex color stream (opt-in via BatchItem.packedColor).
   * Used when caller knows colors are already 8-bit-quantized and wants to
   // skip the 16-byte float upload. Shader still sees vec4 [0,1] via
   * UNSIGNED_BYTE + normalized=true. */
  private packedColorsArray: Uint8Array | null = null
  private uvsArray: Float32Array | null = null
  private normalsArray: Float32Array | null = null
  private currentCapacity = 0

  /** CPU staging for the group's combined index list (per-item lists joined
   * with base vertex offsets). WebGL2 indexed path only. */
  private indicesArray: Uint32Array | null = null
  private indexCapacity = 0
  /** GL element buffer + its capacity in indices (grown via bufferData
   * orphaning, filled per group via bufferSubData). WebGL2 only. */
  private indexBuffer: WebGLBuffer | null = null
  private indexBufferCapacity = 0

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

  private viewMatrix: Mat4x4f
  private projectionMatrix: Mat4x4f

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
  /** GL-side buffer capacity in vertices; grown via bufferData (orphaning),
   * then filled per group via bufferSubData. 0 = nothing allocated yet. */
  private bufferCapacity = 0
  /** WebGL2-only UBO holding the Frame block (view + projection, 128 B
   * std140). Uploaded once per frame via frameDirty instead of per group —
   * validated by benchmark/gfx A/B E3. */
  private readonly ubo: WebGLBuffer | null = null
  private readonly frameData = new Float32Array(32)
  private frameDirty = true
  /** Per-vertex texture index for multi-texture merged draws (WebGL2 only,
   * A/B E4). WebGL1 keeps one texture per group and never touches this. */
  private texIndexBuffer: WebGLBuffer | null = null
  private texIndicesArray: Float32Array | null = null
  private texIndexLoc: number = -1
  /** Location of the ES 3.00 sampler array u_tex[4] (null on WebGL1). */
  private textureArrayLoc: WebGLUniformLocation | null = null

  constructor(
    private gl: GlContext,
    projectionMatrix: Mat4x4f | number[]
  ) {
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

    if (projectionMatrix instanceof Mat4x4f) {
      this.projectionMatrix = projectionMatrix
    } else {
      this.projectionMatrix = mat4x4f(projectionMatrix)
    }

    this.viewMatrix = Mat4x4f.identity()

    // Default directional light (matches the Godot scene's Sun transform):
    // propagation = (0.906, -0.324, 0.272) → toward-light = (-0.906, 0.324, -0.272).
    // Brighter ambient + sun to match the original's bright ground.
    this.shader.use()
    // Sampler array u_tex[4] → texture units 0..3 (fixed mapping, set once).
    // WebGL2 only — the ES 1.00 program has no sampler array (and minimal GL
    // mocks report fake locations for unknown uniforms).
    if (this.gl2 && this.textureArrayLoc) this.gl2.uniform1iv(this.textureArrayLoc, [0, 1, 2, 3])
    if (this.lightDirLoc) gl.uniform3f(this.lightDirLoc, -0.906308, 0.323744, -0.271654)
    if (this.ambientLoc) gl.uniform3f(this.ambientLoc, 0.66, 0.7, 0.76)
  }

  setViewMatrix(view: Mat4x4f) {
    this.viewMatrix = view
    this.frameDirty = true
  }

  setProjectionMatrix(projection: Mat4x4f) {
    this.projectionMatrix = projection
    this.frameDirty = true
  }

  /**
   * Expose the pending batch items (used by the shadow pass before flush).
   */
  getBatchItems(): BatchItem[] {
    return this.batchItems
  }

  /**
   * Enable/disable shadow mapping for the next draw.
   * @param shadowMap depth texture
   * @param shadowMatrix light view-projection matrix (maps world → light clip)
   */
  setShadowMap(shadowMap: WebGLTexture | null, shadowMatrix: Mat4x4f | null) {
    this.activeShadow = shadowMap && shadowMatrix ? { map: shadowMap, matrix: shadowMatrix } : null
  }

  private activeShadow: { map: WebGLTexture; matrix: Mat4x4f } | null = null

  addShape(
    vertices: Float32Array,
    color: Color,
    transform: Mat4x4f | Float32Array | number[],
    uv?: Float32Array,
    texture?: WebGLTexture | null,
    vertexColors?: Float32Array,
    depthWrite?: boolean,
    normals?: Float32Array,
    layer?: number,
    skipTonemap?: boolean,
    premultiplied?: boolean,
    blendMode?: BlendMode,
    indices?: Uint16Array | number[],
    translationOnly?: boolean,
    packedColor?: Uint8Array | Color,
  ) {
    const transformMatrix = transform instanceof Mat4x4f
      ? transform
      : mat4x4f(transform instanceof Float32Array ? Array.from(transform) : transform)
    let effectiveTranslationOnly = !!translationOnly
    if (!effectiveTranslationOnly) {
      const s = transformMatrix.source
      if (s[0] === 1 && s[5] === 1 && s[10] === 1 && s[1] === 0 && s[2] === 0 && s[4] === 0 && s[6] === 0 && s[8] === 0 && s[9] === 0) {
        effectiveTranslationOnly = true
      }
    }

    this.batchItems.push({ vertices, color, transform: transformMatrix, uv, texture, vertexColors, depthWrite, normals, layer: layer ?? 0, skipTonemap, premultiplied, blendMode, indices, translationOnly: effectiveTranslationOnly, packedColor })
    this._pendingVertexCount += vertices.length / 3

    if (this._pendingVertexCount >= this.maxBatchSize) {
      this.flush()
    }
  }

  /** O(1) pending-vertex counter (getTotalVertices used to be an O(n) reduce
   * called on EVERY addShape — O(n^2) per frame with high-volume shape
   * scenes). */
  private _pendingVertexCount = 0



  /**
   * Flush buffered items. Pass a `filterLayer` to flush only that layer's
   * items (leaving others queued for a later pass); omit to flush everything.
   */
  flush(filterLayer?: number) {
    if (this.batchItems.length === 0) return

    const toDraw = filterLayer === undefined
      ? this.batchItems
      : this.batchItems.filter((it) => it.layer === filterLayer)
    if (toDraw.length === 0) return

    // WebGL1 (frozen): contiguous runs of (texture, blendMode) — one texture
    // per draw. WebGL2: merged grouping (see flushMerged).
    if (this.gl2) {
      this.flushMerged(toDraw)
    } else {
      let start = 0
      let curTexture = toDraw[0].texture ?? null
      let curBlend: BlendMode = toDraw[0].blendMode ?? 'normal'
      for (let i = 1; i <= toDraw.length; i++) {
        const item = i < toDraw.length ? toDraw[i] : null
        const tex = item ? item.texture ?? null : null
        const blend: BlendMode = item ? item.blendMode ?? 'normal' : curBlend
        if (i === toDraw.length || tex !== curTexture || blend !== curBlend) {
          this.drawGroup(toDraw.slice(start, i), [curTexture])
          start = i
          curTexture = tex
          curBlend = blend
        }
      }
    }

    // Remove flushed items, keep other layers queued for later passes.
    if (filterLayer === undefined) {
      this.batchItems = []
      this._pendingVertexCount = 0
    } else {
      const kept = this.batchItems.filter((it) => it.layer !== filterLayer)
      this.batchItems = kept
      this._pendingVertexCount = 0
      for (const it of kept) this._pendingVertexCount += it.vertices.length / 3
    }
  }

  /** WebGL2 flush: CONTIGUOUS runs of (blendMode, hasTexture, per-item
   * flags), then chunks of ≤ MAX_TEXTURES_PER_DRAW distinct textures per
   * draw. Every key component is an item-level boolean, so each group is
   * flag-homogeneous and the some()/every() derivations in drawGroup reduce
   * to the shared item value — per-item output is identical to the legacy
   * grouping; only same-flag different-texture neighbours merge into one
   * draw call (validated by benchmark/gfx A/B E4). Draw order is preserved
   * (item order is preserved — important for painter's-order draws). */
  private flushMerged(toDraw: BatchItem[]): void {
    let start = 0
    while (start < toDraw.length) {
      const key = mergedGroupKey(toDraw[start])
      const textures: WebGLTexture[] = []
      const slots = new Map<WebGLTexture, number>()
      let i = start
      while (i < toDraw.length) {
        const it = toDraw[i]
        if (mergedGroupKey(it) !== key) break
        const tex = it.texture ?? null
        if (tex && !slots.has(tex)) {
          if (textures.length >= MAX_TEXTURES_PER_DRAW) break
          slots.set(tex, textures.length)
          textures.push(tex)
        }
        i++
      }
      this.drawGroup(toDraw.slice(start, i), textures.length > 0 ? textures : [null])
      start = i
    }
  }

  private drawGroup(items: BatchItem[], textures: (WebGLTexture | null)[]) {
    const gl = this.gl
    // Indexed path (WebGL2 only — GL1 is frozen and always takes the legacy
    // path): when EVERY item carries an index list, unique vertices are
    // transformed and uploaded ONCE and triangles reference them through a
    // shared ELEMENT_ARRAY_BUFFER (drawElements). Shared-vertex meshes save ~2/3 of
    // their vertices across triangles, so this cuts the per-frame CPU
    // transform loop and upload by ~3×. Mixed groups fall back to the
    // non-indexed path; indexed items are then expanded through their index
    // list inside the transform loop, which keeps GL1 and mixed groups
    // correct with zero extra buffers.
    const allIndexed = this.isWebGL2 && items.every((it) => it.indices !== undefined && it.indices.length > 0)
    // Staging/draw vertex count: unique vertices on the indexed path,
    // index-expanded vertices on the fallback path.
    const totalVertices = allIndexed
      ? items.reduce((sum, item) => sum + item.vertices.length / 3, 0)
      : items.reduce((sum, item) => sum + (item.indices && item.indices.length > 0 ? item.indices.length : item.vertices.length / 3), 0)
    const totalIndices = allIndexed ? items.reduce((sum, item) => sum + item.indices!.length, 0) : 0
    const hasTexture = textures[0] !== null
    // WebGL1 legacy path draws one texture per group (textures.length === 1).
    const texture = textures[0]

    // 2D blend modes (matches the standard Porter-Duff / additive / multiply / screen factors).
    // `premultiplied` swaps the src RGB factor for PMA atlases (ONE instead of
    // SRC_ALPHA). A group shares one texture + blend mode, so all its items
    // agree on the flags.
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

    if (!this.positionsArray || this.currentCapacity < totalVertices) {
      this.currentCapacity = Math.max(totalVertices, Math.ceil(this.currentCapacity * 1.5))
      this.positionsArray = new Float32Array(this.currentCapacity * 3)
      this.colorsArray = new Float32Array(this.currentCapacity * 4)
      this.packedColorsArray = new Uint8Array(this.currentCapacity * 4)
      this.uvsArray = new Float32Array(this.currentCapacity * 2)
      this.normalsArray = new Float32Array(this.currentCapacity * 3)
      this.texIndicesArray = new Float32Array(this.currentCapacity)
    }

    const positions = this.positionsArray
    const colors = this.colorsArray
    const packedColors = this.packedColorsArray
    const uvs = this.uvsArray
    const normals = this.normalsArray
    const texIndices = this.texIndicesArray
    if (!positions || !colors || !packedColors || !uvs || !normals || !texIndices) return

    // Does any item carry normals? (enables per-pixel lighting for the group)
    const hasNormals = items.some((item) => item.normals && item.normals.length > 0)
    // Every item opting into the packed-color stream means the group can use
    // the UNSIGNED_BYTE + normalized=true path. Mixed groups fall back to
    // the float-color path (vertexColors take precedence for the few non-
    // packed items, the rest pay the float upload).
    const allPackedColor = items.length > 0 && items.every((item) => item.packedColor !== undefined)

    // texture → slot within this group (multi-texture merge, A/B E4)
    const slotOf = new Map<WebGLTexture, number>()
    for (let s = 0; s < textures.length; s++) {
      const t = textures[s]
      if (t) slotOf.set(t, s)
    }

    let posOffset = 0
    let colorOffset = 0
    let packedColorOffset = 0
    let uvOffset = 0
    let normOffset = 0
    let texIdxOffset = 0

    for (const item of items) {
      const vertexCount = item.vertices.length / 3
      // Fallback path indirection: output vertex i reads source vertex
      // idx[i] (index expansion). The allIndexed path transforms each unique
      // vertex once — idx stays null and sources read sequentially.
      const idx = allIndexed ? null : item.indices && item.indices.length > 0 ? item.indices : null
      const outCount = idx ? idx.length : vertexCount
      const m = item.transform.source
      const itemUv = item.uv
      const itemNormals = item.normals
      const texSlot = (item.texture ? slotOf.get(item.texture) : undefined) ?? 0
      const transOnly = !!item.translationOnly
      const tx = m[12]
      const ty = m[13]
      const tz = m[14]

      for (let i = 0; i < outCount; i++) {
        const s = idx ? idx[i] : i
        const x = item.vertices[s * 3]
        const y = item.vertices[s * 3 + 1]
        const z = item.vertices[s * 3 + 2] || 0

        if (transOnly) {
          positions[posOffset++] = x + tx
          positions[posOffset++] = y + ty
          positions[posOffset++] = z + tz
        } else {
          const transformedX = m[0] * x + m[4] * y + m[8] * z + m[12]
          const transformedY = m[1] * x + m[5] * y + m[9] * z + m[13]
          const transformedZ = m[2] * x + m[6] * y + m[10] * z + m[14]
          positions[posOffset++] = transformedX
          positions[posOffset++] = transformedY
          positions[posOffset++] = transformedZ
        }

        // Transform normals by the model matrix's 3x3 (rotation+scale) part,
        // then normalize in the shader. Good enough for uniform-ish scales.
        if (itemNormals) {
          if (transOnly) {
            normals[normOffset++] = itemNormals[s * 3]
            normals[normOffset++] = itemNormals[s * 3 + 1]
            normals[normOffset++] = itemNormals[s * 3 + 2]
          } else {
            const nx = itemNormals[s * 3]
            const ny = itemNormals[s * 3 + 1]
            const nz = itemNormals[s * 3 + 2]
            normals[normOffset++] = m[0] * nx + m[4] * ny + m[8] * nz
            normals[normOffset++] = m[1] * nx + m[5] * ny + m[9] * nz
            normals[normOffset++] = m[2] * nx + m[6] * ny + m[10] * nz
          }
        } else {
          normals[normOffset++] = 0
          normals[normOffset++] = 0
          normals[normOffset++] = 0
        }

        // Per-vertex color: prefer the optional packedColor stream (opt-in, 4
// bytes/vertex), then vertexColors (per-vertex float, 16 bytes), then
// uniform color (4 floats). PackedColor writes into packedColors (Uint8Array);
// non-packed writes into colors (Float32Array). Each item picks one stream.
        if (item.packedColor !== undefined) {
          if (item.packedColor instanceof Uint8Array) {
            const pc = item.packedColor
            packedColors[packedColorOffset++] = pc[s * 4]
            packedColors[packedColorOffset++] = pc[s * 4 + 1]
            packedColors[packedColorOffset++] = pc[s * 4 + 2]
            packedColors[packedColorOffset++] = pc[s * 4 + 3]
          } else {
            // Uniform Color form: expand once per output vertex. The caller
            // saves a per-slot Uint8Array allocation; the batch renderer
            // pays 4 small writes per vertex (the same cost as the float
            // path, minus the float upload).
            const c = item.packedColor
            packedColors[packedColorOffset++] = (c.r * 255) | 0
            packedColors[packedColorOffset++] = (c.g * 255) | 0
            packedColors[packedColorOffset++] = (c.b * 255) | 0
            packedColors[packedColorOffset++] = (c.a * 255) | 0
          }
        } else if (item.vertexColors) {
          colors[colorOffset++] = item.vertexColors[s * 3]
          colors[colorOffset++] = item.vertexColors[s * 3 + 1]
          colors[colorOffset++] = item.vertexColors[s * 3 + 2]
          colors[colorOffset++] = item.color.a
        } else {
          colors[colorOffset++] = item.color.r
          colors[colorOffset++] = item.color.g
          colors[colorOffset++] = item.color.b
          colors[colorOffset++] = item.color.a
        }

        if (itemUv) {
          uvs[uvOffset++] = itemUv[s * 2]
          uvs[uvOffset++] = itemUv[s * 2 + 1]
        } else {
          uvs[uvOffset++] = 0
          uvs[uvOffset++] = 0
        }
        texIndices[texIdxOffset++] = texSlot
      }
    }

    if (allIndexed) {
      // Join the per-item index lists into one group index list, offsetting
      // each item's indices by its base vertex position in the staging area.
      if (!this.indicesArray || this.indexCapacity < totalIndices) {
        this.indexCapacity = Math.max(totalIndices, Math.ceil(this.indexCapacity * 1.5))
        this.indicesArray = new Uint32Array(this.indexCapacity)
      }
      const dst = this.indicesArray
      let io = 0
      let base = 0
      for (const item of items) {
        const itemIndices = item.indices!
        for (let i = 0; i < itemIndices.length; i++) dst[io++] = itemIndices[i] + base
        base += item.vertices.length / 3
      }
    }

    this.shader.use()
    // Vertices are pre-transformed to world space on the CPU (per-item model
    // matrix) so all items share one VBO — that's what makes batching work.
    // The GPU then applies view + projection, i.e. gl_Position = proj * view * worldPos.
    this.uploadFrameUniforms()

    // Bind shadow map (if active) — used by every fragment in this group.
    // Skip shadow for background/skybox groups (depthWrite=false).
    // WebGL2 puts the shadow map on unit 15 so units 0..3 stay free for
    // multi-texture merged draws (A/B E4); WebGL1 (frozen) keeps unit 1.
    const shadowUnit = this.gl2 ? 15 : 1
    const shadowActive = this.activeShadow && !items.some((it) => it.depthWrite === false)
    if (shadowActive && this.useShadowLoc) {
      gl.activeTexture(gl.TEXTURE0 + shadowUnit)
      gl.bindTexture(gl.TEXTURE_2D, this.activeShadow!.map)
      if (this.shadowMapLoc) gl.uniform1i(this.shadowMapLoc, shadowUnit)
      if (this.shadowMatrixLoc) gl.uniformMatrix4fv(this.shadowMatrixLoc, false, this.activeShadow!.matrix.source)
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
        this.ensureIndexCapacity(totalIndices)
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indicesArray!.subarray(0, totalIndices))
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, totalVertices * 3))
      if (allPackedColor) {
        // 4 bytes/vertex RGBA8 (vs 16 bytes for float) — 75% upload cut.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, packedColors!.subarray(0, packedColorOffset))
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors!.subarray(0, colorOffset))
      }
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
        // Single-texture groups always sample u_tex[0] → a_texIndex can stay
        // at whatever stale values are in the buffer. Skip the upload.
        // Multi-texture merged draws (textures.length > 1) need it.
        if (textures.length > 1) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, texIndices.subarray(0, totalVertices))
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
        gl.bufferData(gl.ARRAY_BUFFER, packedColors!.subarray(0, packedColorOffset), gl.DYNAMIC_DRAW)
      } else {
        gl.bufferData(gl.ARRAY_BUFFER, colors!.subarray(0, colorOffset), gl.DYNAMIC_DRAW)
      }
      gl.enableVertexAttribArray(this.colorLoc)
      gl.vertexAttribPointer(this.colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0)

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
        for (let s = 0; s < textures.length; s++) {
          gl.activeTexture(gl.TEXTURE0 + s)
          gl.bindTexture(gl.TEXTURE_2D, textures[s]!)
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
    // Packed RGBA8 (4 bytes/vertex, normalized → [0,1] in shader).
    gl2.vertexAttribPointer(this.colorLoc, 4, gl2.UNSIGNED_BYTE, true, 0, 0)
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

  /** Allocate GL buffer storage once per capacity level (orphaning via
   * bufferData); per-group fills use bufferSubData on top of it.
   * bufferData(number) sizes in BYTES — 4 bytes per float vertex component. */
  private ensureBufferCapacity(totalVertices: number): void {
    if (totalVertices <= this.bufferCapacity) return
    const gl = this.gl
    const next = Math.max(totalVertices, Math.ceil(this.bufferCapacity * 1.5))
    this.bufferCapacity = next
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 3 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    // color is packed RGBA8 (1 byte per component, 4 components per vertex)
    gl.bufferData(gl.ARRAY_BUFFER, next * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 2 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 3 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texIndexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, next * 4, gl.DYNAMIC_DRAW)
  }

  /** Allocate element-buffer storage once per capacity level (orphaning via
   * bufferData); per-group fills use bufferSubData. WebGL2 indexed path. */
  private ensureIndexCapacity(totalIndices: number): void {
    if (totalIndices <= this.indexBufferCapacity) return
    const gl = this.gl
    const next = Math.max(totalIndices, Math.ceil(this.indexBufferCapacity * 1.5))
    this.indexBufferCapacity = next
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, next * 4, gl.DYNAMIC_DRAW)
  }

  destroy() {
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
    this.shader.destroy()
  }
}
