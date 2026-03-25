/**
 * Batch renderer - combines multiple shapes into single draw call
 * Supports both 2D (z=0) and 3D rendering
 */

import type { Color } from '../types'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './shader'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

interface BatchItem {
  vertices: Float32Array
  color: Color
  transform: Mat4x4f
}

export class BatchRenderer {
  private shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private batchItems: BatchItem[] = []
  private maxBatchSize = 10000

  private positionsArray: Float32Array | null = null
  private colorsArray: Float32Array | null = null
  private currentCapacity = 0

  private positionLoc: number = -1
  private colorLoc: number = -1

  private viewMatrix: Mat4x4f
  private projectionMatrix: Mat4x4f

  constructor(
    private gl: WebGLRenderingContext | WebGL2RenderingContext,
    projectionMatrix: Mat4x4f | number[]
  ) {
    this.shader = new ShaderProgram(gl)
    this.shader.compile(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER)

    this.positionBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()

    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.colorLoc = this.shader.getAttribLocation('a_color')

    if (projectionMatrix instanceof Mat4x4f) {
      this.projectionMatrix = projectionMatrix
    } else {
      this.projectionMatrix = mat4x4f(projectionMatrix)
    }

    this.viewMatrix = Mat4x4f.identity()
  }

  setViewMatrix(view: Mat4x4f) {
    this.viewMatrix = view
  }

  setProjectionMatrix(projection: Mat4x4f) {
    this.projectionMatrix = projection
  }

  addShape(vertices: Float32Array, color: Color, transform: Mat4x4f | Float32Array | number[]) {
    const transformMatrix = transform instanceof Mat4x4f 
      ? transform 
      : mat4x4f(transform instanceof Float32Array ? Array.from(transform) : transform)
    
    this.batchItems.push({ vertices, color, transform: transformMatrix })

    if (this.getTotalVertices() >= this.maxBatchSize) {
      this.flush()
    }
  }

  private getTotalVertices(): number {
    return this.batchItems.reduce((sum, item) => sum + item.vertices.length / 3, 0)
  }

  flush() {
    if (this.batchItems.length === 0) return

    const gl = this.gl
    const totalVertices = this.getTotalVertices()

    if (!this.positionsArray || this.currentCapacity < totalVertices) {
      this.currentCapacity = Math.max(totalVertices, Math.ceil(this.currentCapacity * 1.5))
      this.positionsArray = new Float32Array(this.currentCapacity * 3)
      this.colorsArray = new Float32Array(this.currentCapacity * 4)
    }

    const positions = this.positionsArray
    const colors = this.colorsArray

    if (!positions || !colors) {
      return
    }

    let posOffset = 0
    let colorOffset = 0

    for (const item of this.batchItems) {
      const vertexCount = item.vertices.length / 3

      const m = item.transform.source

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

        colors[colorOffset++] = item.color.r
        colors[colorOffset++] = item.color.g
        colors[colorOffset++] = item.color.b
        colors[colorOffset++] = item.color.a
      }
    }

    this.shader.use()

    this.shader.setUniform('u_model', this.viewMatrix.source)
    this.shader.setUniform('u_view', Mat4x4f.identity().source)
    this.shader.setUniform('u_projection', this.projectionMatrix.source)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions!.subarray(0, totalVertices * 3), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors!.subarray(0, totalVertices * 4), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.colorLoc)
    gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, totalVertices)

    this.batchItems = []
  }

  destroy() {
    const gl = this.gl
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    this.shader.destroy()
  }
}
