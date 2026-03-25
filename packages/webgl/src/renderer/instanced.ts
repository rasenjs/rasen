/**
 * Instanced renderer for WebGL2
 * Supports both 2D (z=0) and 3D rendering
 */

import type { Color } from '../types'
import { ShaderProgram, INSTANCED_VERTEX_SHADER, INSTANCED_FRAGMENT_SHADER } from './shader'
import { Mat4x4f, mat4x4f } from '@rasenjs/math'

export interface InstanceData {
  translation: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: Color
}

export class InstancedRenderer {
  private shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private translationBuffer: WebGLBuffer | null = null
  private rotationBuffer: WebGLBuffer | null = null
  private scaleBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null

  private instances: InstanceData[] = []
  private maxInstances = 10000

  private viewMatrix: Mat4x4f
  private projectionMatrix: Mat4x4f

  private positionLoc: number = -1
  private translationLoc: number = -1
  private rotationLoc: number = -1
  private scaleLoc: number = -1
  private colorLoc: number = -1

  constructor(
    private gl: WebGL2RenderingContext,
    projectionMatrix: Mat4x4f | number[]
  ) {
    this.shader = new ShaderProgram(gl)
    this.shader.compile(INSTANCED_VERTEX_SHADER, INSTANCED_FRAGMENT_SHADER)

    this.positionBuffer = gl.createBuffer()
    this.translationBuffer = gl.createBuffer()
    this.rotationBuffer = gl.createBuffer()
    this.scaleBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()

    if (projectionMatrix instanceof Mat4x4f) {
      this.projectionMatrix = projectionMatrix
    } else {
      this.projectionMatrix = mat4x4f(projectionMatrix)
    }

    this.viewMatrix = Mat4x4f.identity()

    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.translationLoc = this.shader.getAttribLocation('a_translation')
    this.rotationLoc = this.shader.getAttribLocation('a_rotation')
    this.scaleLoc = this.shader.getAttribLocation('a_scale')
    this.colorLoc = this.shader.getAttribLocation('a_color')
  }

  setViewMatrix(view: Mat4x4f) {
    this.viewMatrix = view
  }

  setProjectionMatrix(projection: Mat4x4f) {
    this.projectionMatrix = projection
  }

  setBaseGeometry(vertices: Float32Array) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  }

  addInstance(data: InstanceData) {
    this.instances.push(data)
    if (this.instances.length >= this.maxInstances) {
      this.flush()
    }
  }

  flush() {
    if (this.instances.length === 0) return

    const gl = this.gl
    const count = this.instances.length

    const translations = new Float32Array(count * 3)
    const rotations = new Float32Array(count * 3)
    const scales = new Float32Array(count * 3)
    const colors = new Float32Array(count * 4)

    for (let i = 0; i < count; i++) {
      const inst = this.instances[i]
      translations[i * 3] = inst.translation[0]
      translations[i * 3 + 1] = inst.translation[1]
      translations[i * 3 + 2] = inst.translation[2]

      rotations[i * 3] = inst.rotation[0]
      rotations[i * 3 + 1] = inst.rotation[1]
      rotations[i * 3 + 2] = inst.rotation[2]

      scales[i * 3] = inst.scale[0]
      scales[i * 3 + 1] = inst.scale[1]
      scales[i * 3 + 2] = inst.scale[2]

      colors[i * 4] = inst.color.r
      colors[i * 4 + 1] = inst.color.g
      colors[i * 4 + 2] = inst.color.b
      colors[i * 4 + 3] = inst.color.a
    }

    this.shader.use()

    this.shader.setUniform('u_view', this.viewMatrix.source)
    this.shader.setUniform('u_projection', this.projectionMatrix.source)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.translationBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, translations, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.translationLoc)
    gl.vertexAttribPointer(this.translationLoc, 3, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(this.translationLoc, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.rotationBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, rotations, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.rotationLoc)
    gl.vertexAttribPointer(this.rotationLoc, 3, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(this.rotationLoc, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.scaleBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scales, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.scaleLoc)
    gl.vertexAttribPointer(this.scaleLoc, 3, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(this.scaleLoc, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.colorLoc)
    gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(this.colorLoc, 1)

    const vertexCount = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 12
    gl.drawArraysInstanced(gl.TRIANGLES, 0, vertexCount, count)

    this.instances = []
  }

  destroy() {
    const gl = this.gl
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
    if (this.translationBuffer) gl.deleteBuffer(this.translationBuffer)
    if (this.rotationBuffer) gl.deleteBuffer(this.rotationBuffer)
    if (this.scaleBuffer) gl.deleteBuffer(this.scaleBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    this.shader.destroy()
  }
}
