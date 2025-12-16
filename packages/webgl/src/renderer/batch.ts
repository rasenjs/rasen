/**
 * Batch renderer - combines multiple shapes into single draw call
 */

import type { Color } from '../types'
import { ShaderProgram, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER } from './shader'

interface BatchItem {
  vertices: Float32Array
  color: Color
  tx: number  // translation x (optimized: store only needed values)
  ty: number  // translation y
}

export class BatchRenderer {
  private shader: ShaderProgram
  private positionBuffer: WebGLBuffer | null = null
  private colorBuffer: WebGLBuffer | null = null
  private batchItems: BatchItem[] = []
  private maxBatchSize = 10000 // Max vertices per batch
  
  // Reusable buffers to avoid allocation every frame
  private positionsArray: Float32Array | null = null
  private colorsArray: Float32Array | null = null
  private currentCapacity = 0
  
  // Cache attribute locations to avoid repeated lookups
  private positionLoc: number = -1
  private colorLoc: number = -1

  constructor(
    private gl: WebGLRenderingContext | WebGL2RenderingContext,
    private projectionMatrix: number[]
  ) {
    this.shader = new ShaderProgram(gl)
    this.shader.compile(DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER)
    
    // Create buffers
    this.positionBuffer = gl.createBuffer()
    this.colorBuffer = gl.createBuffer()
    
    // Cache attribute locations
    this.positionLoc = this.shader.getAttribLocation('a_position')
    this.colorLoc = this.shader.getAttribLocation('a_color')
  }

  /**
   * Add shape to batch
   */
  addShape(vertices: Float32Array, color: Color, transform: Float32Array | number[]) {
    // Extract translation values (avoid storing full matrix)
    const tx = transform[6]
    const ty = transform[7]
    this.batchItems.push({ vertices, color, tx, ty })
    
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
    
    // Ensure buffers have enough capacity
    if (!this.positionsArray || this.currentCapacity < totalVertices) {
      // Grow capacity by 1.5x to avoid frequent reallocations
      this.currentCapacity = Math.max(totalVertices, Math.ceil(this.currentCapacity * 1.5))
      this.positionsArray = new Float32Array(this.currentCapacity * 2)
      this.colorsArray = new Float32Array(this.currentCapacity * 4)
    }
    
    // Reuse existing arrays
    const positions = this.positionsArray
    const colors = this.colorsArray
    
    if (!positions || !colors) {
      return
    }
    
    let posOffset = 0
    let colorOffset = 0
    
    for (const item of this.batchItems) {
      const vertexCount = item.vertices.length / 2
      
      // Transform and add vertices
      for (let i = 0; i < vertexCount; i++) {
        const x = item.vertices[i * 2]
        const y = item.vertices[i * 2 + 1]
        
        // Apply translation
        positions[posOffset++] = x + item.tx
        positions[posOffset++] = y + item.ty
        
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
    
    // Position attribute - use cached location
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions!.subarray(0, totalVertices * 2), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0)
    
    // Color attribute - use cached location
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors!.subarray(0, totalVertices * 4), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.colorLoc)
    gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, 0, 0)
    
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
