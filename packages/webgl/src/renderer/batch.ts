/**
 * Batch renderer - combines multiple shapes into single draw call
 */

import type { Color } from '../types'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './shader'

interface BatchItem {
  vertices: Float32Array
  color: Color
  transform: number[] // 3x3 matrix
}

export class BatchRenderer {
  private shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private batchItems: BatchItem[] = []
  private maxBatchSize = 10000 // Max vertices per batch

  constructor(
    private gl: WebGLRenderingContext | WebGL2RenderingContext,
    private projectionMatrix: number[]
  ) {
    this.shader = new ShaderProgram(gl)
    this.shader.compile(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER)
    
    // Create buffers
    this.positionBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()
  }

  /**
   * Add shape to batch
   */
  addShape(vertices: Float32Array, color: Color, transform: number[]) {
    this.batchItems.push({ vertices, color, transform })
    
    // Auto-flush if batch is full
    if (this.getTotalVertices() >= this.maxBatchSize) {
      this.flush()
    }
  }

  /**
   * Get total vertices in current batch
   */
  private getTotalVertices(): number {
    return this.batchItems.reduce((sum, item) => sum + item.vertices.length / 2, 0)
  }

  /**
   * Flush batch - render all accumulated shapes
   */
  flush() {
    if (this.batchItems.length === 0) return

    const gl = this.gl
    const totalVertices = this.getTotalVertices()
    
    // Combine all vertices and colors
    const positions = new Float32Array(totalVertices * 2)
    const colors = new Float32Array(totalVertices * 4)
    
    let posOffset = 0
    let colorOffset = 0
    
    for (const item of this.batchItems) {
      const vertexCount = item.vertices.length / 2
      
      // Transform and add vertices
      for (let i = 0; i < vertexCount; i++) {
        const x = item.vertices[i * 2]
        const y = item.vertices[i * 2 + 1]
        
        // Apply transform (simplified - should use full matrix multiply)
        positions[posOffset++] = x + item.transform[6] // tx
        positions[posOffset++] = y + item.transform[7] // ty
        
        // Add color
        colors[colorOffset++] = item.color.r
        colors[colorOffset++] = item.color.g
        colors[colorOffset++] = item.color.b
        colors[colorOffset++] = item.color.a
      }
    }
    
    // Upload to GPU
    this.shader.use()
    
    // Set projection matrix
    this.shader.setUniform('u_projection', this.projectionMatrix)
    this.shader.setUniform('u_matrix', [1, 0, 0, 0, 1, 0, 0, 0, 1]) // Identity for batched
    
    // Position attribute
    const positionLoc = this.shader.getAttribLocation('a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)
    
    // Color attribute
    const colorLoc = this.shader.getAttribLocation('a_color')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(colorLoc)
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0)
    
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, totalVertices)
    
    // Clear batch
    this.batchItems = []
  }

  /**
   * Destroy renderer
   */
  destroy() {
    const gl = this.gl
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    this.shader.destroy()
  }
}
