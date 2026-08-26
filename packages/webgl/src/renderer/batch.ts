/**
 * Batch renderer - combines multiple shapes into single draw call
 * Supports both 2D (z=0) and 3D rendering
 */

import type { Color } from '../types'
import type { GlContext } from '../node'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './shader'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

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
  private uvsArray: Float32Array | null = null
  private normalsArray: Float32Array | null = null
  private currentCapacity = 0

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

  constructor(
    private gl: GlContext,
    projectionMatrix: Mat4x4f | number[]
  ) {
    this.shader = new ShaderProgram(gl)
    this.shader.compile(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER)

    this.positionBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()
    this.texCoordBuffer = gl.createBuffer()
    this.normalBuffer = gl.createBuffer()

    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.colorLoc = this.shader.getAttribLocation('a_color')
    this.texCoordLoc = this.shader.getAttribLocation('a_texCoord')
    this.normalLoc = this.shader.getAttribLocation('a_normal')
    this.textureLoc = this.shader.getUniformLocation('u_texture')
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
    if (this.lightDirLoc) gl.uniform3f(this.lightDirLoc, -0.906308, 0.323744, -0.271654)
    if (this.ambientLoc) gl.uniform3f(this.ambientLoc, 0.66, 0.7, 0.76)
  }

  setViewMatrix(view: Mat4x4f) {
    this.viewMatrix = view
  }

  setProjectionMatrix(projection: Mat4x4f) {
    this.projectionMatrix = projection
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
  ) {
    const transformMatrix = transform instanceof Mat4x4f
      ? transform
      : mat4x4f(transform instanceof Float32Array ? Array.from(transform) : transform)

    this.batchItems.push({ vertices, color, transform: transformMatrix, uv, texture, vertexColors, depthWrite, normals, layer: layer ?? 0, skipTonemap })

    if (this.getTotalVertices() >= this.maxBatchSize) {
      this.flush()
    }
  }

  private getTotalVertices(): number {
    return this.batchItems.reduce((sum, item) => sum + item.vertices.length / 3, 0)
  }

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

    // Group by texture so each group is one draw call with its texture bound.
    const groups = new Map<WebGLTexture | null, BatchItem[]>()
    for (const item of toDraw) {
      const key = item.texture ?? null
      let arr = groups.get(key)
      if (!arr) {
        arr = []
        groups.set(key, arr)
      }
      arr.push(item)
    }

    for (const [texture, items] of groups) {
      this.drawGroup(items, texture)
    }

    // Remove flushed items, keep other layers queued for later passes.
    if (filterLayer === undefined) {
      this.batchItems = []
    } else {
      this.batchItems = this.batchItems.filter((it) => it.layer !== filterLayer)
    }
  }

  private drawGroup(items: BatchItem[], texture: WebGLTexture | null) {
    const gl = this.gl
    const totalVertices = items.reduce((sum, item) => sum + item.vertices.length / 3, 0)
    const hasTexture = texture !== null

    if (!this.positionsArray || this.currentCapacity < totalVertices) {
      this.currentCapacity = Math.max(totalVertices, Math.ceil(this.currentCapacity * 1.5))
      this.positionsArray = new Float32Array(this.currentCapacity * 3)
      this.colorsArray = new Float32Array(this.currentCapacity * 4)
      this.uvsArray = new Float32Array(this.currentCapacity * 2)
      this.normalsArray = new Float32Array(this.currentCapacity * 3)
    }

    const positions = this.positionsArray
    const colors = this.colorsArray
    const uvs = this.uvsArray
    const normals = this.normalsArray
    if (!positions || !colors || !uvs || !normals) return

    // Does any item carry normals? (enables per-pixel lighting for the group)
    const hasNormals = items.some((item) => item.normals && item.normals.length > 0)

    let posOffset = 0
    let colorOffset = 0
    let uvOffset = 0
    let normOffset = 0

    for (const item of items) {
      const vertexCount = item.vertices.length / 3
      const m = item.transform.source
      const itemUv = item.uv
      const itemNormals = item.normals

      for (let i = 0; i < vertexCount; i++) {
        const x = item.vertices[i * 3]
        const y = item.vertices[i * 3 + 1]
        const z = item.vertices[i * 3 + 2] || 0

        const transformedX = m[0] * x + m[4] * y + m[8] * z + m[12]
        const transformedY = m[1] * x + m[5] * y + m[9] * z + m[13]
        const transformedZ = m[2] * x + m[6] * y + m[10] * z + m[14]

        positions[posOffset++] = transformedX
        positions[posOffset++] = transformedY
        positions[posOffset++] = transformedZ

        // Transform normals by the model matrix's 3x3 (rotation+scale) part,
        // then normalize in the shader. Good enough for uniform-ish scales.
        if (itemNormals) {
          const nx = itemNormals[i * 3]
          const ny = itemNormals[i * 3 + 1]
          const nz = itemNormals[i * 3 + 2]
          normals[normOffset++] = m[0] * nx + m[4] * ny + m[8] * nz
          normals[normOffset++] = m[1] * nx + m[5] * ny + m[9] * nz
          normals[normOffset++] = m[2] * nx + m[6] * ny + m[10] * nz
        } else {
          normals[normOffset++] = 0
          normals[normOffset++] = 0
          normals[normOffset++] = 0
        }

        // Per-vertex color: use vertexColors if available, else uniform color
        if (item.vertexColors) {
          colors[colorOffset++] = item.vertexColors[i * 3]
          colors[colorOffset++] = item.vertexColors[i * 3 + 1]
          colors[colorOffset++] = item.vertexColors[i * 3 + 2]
        } else {
          colors[colorOffset++] = item.color.r
          colors[colorOffset++] = item.color.g
          colors[colorOffset++] = item.color.b
        }
        colors[colorOffset++] = item.color.a

        if (itemUv) {
          uvs[uvOffset++] = itemUv[i * 2]
          uvs[uvOffset++] = itemUv[i * 2 + 1]
        } else {
          uvs[uvOffset++] = 0
          uvs[uvOffset++] = 0
        }
      }
    }

    this.shader.use()
    // Vertices are pre-transformed to world space on the CPU (per-item model
    // matrix) so all items share one VBO — that's what makes batching work.
    // The GPU then applies view + projection, i.e. gl_Position = proj * view * worldPos.
    this.shader.setUniform('u_view', this.viewMatrix.source)
    this.shader.setUniform('u_projection', this.projectionMatrix.source)

    // Bind shadow map (if active) — used by every fragment in this group.
    // Skip shadow for background/skybox groups (depthWrite=false).
    const shadowActive = this.activeShadow && !items.some((it) => it.depthWrite === false)
    if (shadowActive && this.useShadowLoc) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.activeShadow!.map)
      if (this.shadowMapLoc) gl.uniform1i(this.shadowMapLoc, 1)
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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, totalVertices * 3), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, totalVertices * 4), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.colorLoc)
    gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, 0, 0)

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

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (this.textureLoc) gl.uniform1i(this.textureLoc, 0)
      if (this.useTextureLoc) gl.uniform1i(this.useTextureLoc, 1)
    } else {
      gl.disableVertexAttribArray(this.texCoordLoc)
      if (this.useTextureLoc) gl.uniform1i(this.useTextureLoc, 0)
    }

    // Skybox / background groups disable depth writing so scene geometry
    // drawn afterwards still passes depth test and covers them correctly.
    const depthWrite = items.every((item) => item.depthWrite === false)
    if (depthWrite) gl.depthMask(false)

    gl.drawArrays(gl.TRIANGLES, 0, totalVertices)

    if (depthWrite) gl.depthMask(true)
  }

  destroy() {
    const gl = this.gl
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    this.shader.destroy()
  }
}
