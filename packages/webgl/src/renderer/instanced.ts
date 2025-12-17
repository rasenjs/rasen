/**
 * Instanced Batch Renderer - GPU instancing for massive performance
 * 
 * Uses WebGL2 instanced rendering to draw thousands of shapes in a single draw call.
 * Each shape type is batched separately and rendered using instancing.
 */

import type { Color } from '../types'
import { ShaderProgram } from './shader'

// Vertex shader with instancing support
const INSTANCED_VERTEX_SHADER = `#version 300 es
in vec2 a_position;      // Per-vertex: base shape vertices
in vec2 a_translation;   // Per-instance: translation
in float a_rotation;     // Per-instance: rotation
in vec2 a_scale;         // Per-instance: scale
in vec4 a_color;         // Per-instance: color

uniform mat3 u_projection;

out vec4 v_color;

void main() {
  // Apply rotation
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  mat2 rotationMatrix = mat2(c, s, -s, c);
  
  // Transform: scale -> rotate -> translate
  vec2 position = rotationMatrix * (a_position * a_scale) + a_translation;
  
  vec3 pos = u_projection * vec3(position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_color = a_color;
}
`

// Fragment shader (same as batch)
const INSTANCED_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`

/**
 * Shape instance data
 */
export interface InstanceData {
  tx: number          // translation x
  ty: number          // translation y
  rotation: number    // rotation in radians
  scaleX: number      // scale x
  scaleY: number      // scale y
  color: Color        // RGBA color
}

/**
 * Shape batch for instanced rendering
 */
interface ShapeBatch {
  vertices: Float32Array       // Base shape vertices (shared by all instances)
  instances: InstanceData[]    // Per-instance data
  vertexBuffer: WebGLBuffer | null
  instanceBuffer: WebGLBuffer | null
  instanceCapacity: number     // Current capacity of instance buffer
  instanceData: Float32Array | null  // Reusable buffer for instance data
  vao: WebGLVertexArrayObject | null  // VAO for this batch
}

/**
 * Instanced Batch Renderer
 * Renders thousands of shapes using GPU instancing
 */
export class InstancedBatchRenderer {
  private shader: ShaderProgram
  private batches = new Map<string, ShapeBatch>()
  private projectionMatrix: number[]

  // Attribute locations (cached)
  private positionLoc: number = -1
  private translationLoc: number = -1
  private rotationLoc: number = -1
  private scaleLoc: number = -1
  private colorLoc: number = -1

  constructor(
    private gl: WebGL2RenderingContext,
    projectionMatrix: number[]
  ) {
    this.projectionMatrix = projectionMatrix
    this.shader = new ShaderProgram(gl)
    this.shader.compile(INSTANCED_VERTEX_SHADER, INSTANCED_FRAGMENT_SHADER)
    
    // Cache attribute locations
    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.translationLoc = this.shader.getAttribLocation('a_translation')
    this.rotationLoc = this.shader.getAttribLocation('a_rotation')
    this.scaleLoc = this.shader.getAttribLocation('a_scale')
    this.colorLoc = this.shader.getAttribLocation('a_color')
  }

  /**
   * Add a shape instance to be rendered
   * 
   * @param batchKey - Unique key for the shape type (e.g., "circle-32", "rect")
   * @param vertices - Base shape vertices (shared by all instances)
   * @param instance - Per-instance data (position, rotation, scale, color)
   */
  addInstance(
    batchKey: string,
    vertices: Float32Array,
    instance: InstanceData
  ) {
    let batch = this.batches.get(batchKey)
    
    if (!batch) {
      // Create new batch for this shape type
      const gl = this.gl
      batch = {
        vertices,
        instances: [],
        vertexBuffer: gl.createBuffer(),
        instanceBuffer: gl.createBuffer(),
        instanceCapacity: 100,  // Initial capacity
        instanceData: null,     // Will be allocated on first use
        vao: gl.createVertexArray()
      }
      this.batches.set(batchKey, batch)
      
      // Setup VAO
      gl.bindVertexArray(batch.vao)
      
      // Upload and setup vertex buffer (shared by all instances)
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(this.positionLoc)
      gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0)
      
      // Setup instance buffer attributes (buffer data will be updated each frame)
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.instanceBuffer)
      const stride = 9 * 4
      
      // Translation (vec2)
      gl.enableVertexAttribArray(this.translationLoc)
      gl.vertexAttribPointer(this.translationLoc, 2, gl.FLOAT, false, stride, 0)
      gl.vertexAttribDivisor(this.translationLoc, 1)
      
      // Rotation (float)
      gl.enableVertexAttribArray(this.rotationLoc)
      gl.vertexAttribPointer(this.rotationLoc, 1, gl.FLOAT, false, stride, 2 * 4)
      gl.vertexAttribDivisor(this.rotationLoc, 1)
      
      // Scale (vec2)
      gl.enableVertexAttribArray(this.scaleLoc)
      gl.vertexAttribPointer(this.scaleLoc, 2, gl.FLOAT, false, stride, 3 * 4)
      gl.vertexAttribDivisor(this.scaleLoc, 1)
      
      // Color (vec4)
      gl.enableVertexAttribArray(this.colorLoc)
      gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, stride, 5 * 4)
      gl.vertexAttribDivisor(this.colorLoc, 1)
      
      gl.bindVertexArray(null)
    }
    
    batch.instances.push(instance)
  }

  /**
   * Flush all batches - render everything with instancing
   */
  flush() {
    const gl = this.gl
    
    if (this.batches.size === 0) return
    
    this.shader.use()
    this.shader.setUniform('u_projection', this.projectionMatrix)
    
    for (const batch of this.batches.values()) {
      if (batch.instances.length === 0) continue
      
      const instanceCount = batch.instances.length
      const vertexCount = batch.vertices.length / 2
      
      // Grow instance buffer if needed (1.5x growth strategy like P2)
      const requiredCapacity = instanceCount
      if (requiredCapacity > batch.instanceCapacity) {
        batch.instanceCapacity = Math.ceil(batch.instanceCapacity * 1.5)
        if (batch.instanceCapacity < requiredCapacity) {
          batch.instanceCapacity = requiredCapacity
        }
        // Reallocate buffer
        batch.instanceData = new Float32Array(batch.instanceCapacity * 9)
      } else if (!batch.instanceData) {
        // First allocation
        batch.instanceData = new Float32Array(batch.instanceCapacity * 9)
      }
      
      // Reuse buffer - optimized loop with fewer array accesses
      const instanceData = batch.instanceData!
      const instances = batch.instances
      let offset = 0
      for (let i = 0; i < instanceCount; i++) {
        const inst = instances[i]
        const color = inst.color
        instanceData[offset++] = inst.tx
        instanceData[offset++] = inst.ty
        instanceData[offset++] = inst.rotation
        instanceData[offset++] = inst.scaleX
        instanceData[offset++] = inst.scaleY
        instanceData[offset++] = color.r
        instanceData[offset++] = color.g
        instanceData[offset++] = color.b
        instanceData[offset++] = color.a
      }
      
      // Bind VAO (all attributes are already set up)
      gl.bindVertexArray(batch.vao)
      
      // Upload only the instance data
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.instanceBuffer)
      if (requiredCapacity > batch.instanceCapacity / 1.5) {
        // Reallocate GPU buffer
        gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW)
      } else {
        // Just update existing buffer
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, instanceCount * 9))
      }
      
      // Draw all instances with a single call
      gl.drawArraysInstanced(gl.TRIANGLES, 0, vertexCount, instanceCount)
    }
    
    // Unbind VAO
    gl.bindVertexArray(null)
    
    // Clear all batches for next frame
    for (const batch of this.batches.values()) {
      batch.instances = []
    }
  }

  /**
   * Clear all batches
   */
  clear() {
    for (const batch of this.batches.values()) {
      batch.instances = []
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    const gl = this.gl
    for (const batch of this.batches.values()) {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer)
      if (batch.instanceBuffer) gl.deleteBuffer(batch.instanceBuffer)
      if (batch.vao) gl.deleteVertexArray(batch.vao)
    }
    this.batches.clear()
  }
}
