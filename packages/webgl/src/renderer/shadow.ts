/**
 * Shadow renderer — renders scene depth from the light's point of view into
 * a depth texture (shadow map). The main pass then samples this texture to
 * decide which fragments are in shadow.
 *
 * Directional-light only (orthographic projection), which matches the FPS
 * scene's sun. Works on both WebGL1 (WEBGL_depth_texture ext) and WebGL2.
 */

import { ShaderProgram } from './shader'
import { Mat4x4f } from '@rasenjs/math'

export interface ShadowItem {
  vertices: Float32Array
  transform: Mat4x4f
}

const SHADOW_VERTEX_SHADER = `
attribute vec3 a_position;
uniform mat4 u_lightMatrix;
void main() {
  // a_position is already in WORLD space (batch pre-transforms on CPU),
  // so apply the light view-projection directly.
  gl_Position = u_lightMatrix * vec4(a_position, 1.0);
}
`

const SHADOW_FRAGMENT_SHADER = `
precision mediump float;
void main() {
  // gl_FragDepth is written by the depth buffer automatically.
}
`

export class ShadowRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext
  private shader: ShaderProgram
  private framebuffer: WebGLFramebuffer
  private depthTexture: WebGLTexture
  private size = 2048
  private isWebGL2: boolean

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl
    this.isWebGL2 = gl instanceof WebGL2RenderingContext

    // Depth texture
    this.depthTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture)
    const internalFormat = this.isWebGL2 ? (gl as WebGL2RenderingContext).DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, this.size, this.size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)

    // Framebuffer (depth attachment only)
    this.framebuffer = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0)
    if (this.isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext
      gl2.drawBuffers([gl2.NONE])
      gl2.readBuffer(gl2.NONE)
    } else if (!gl.getExtension('WEBGL_depth_texture')) {
      throw new Error('WEBGL_depth_texture extension required for shadow maps')
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Shadow framebuffer incomplete: ${status}`)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this.shader = new ShaderProgram(gl)
    this.shader.compile(SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER)
  }

  getDepthTexture(): WebGLTexture {
    return this.depthTexture
  }

  getSize(): number {
    return this.size
  }

  /**
   * Render the given items' depths from the light's perspective.
   * `items` must contain world-space vertices (BatchItem with transform applied
   * — we apply the transform here on the CPU, matching the batch pipeline).
   */
  render(items: ShadowItem[], lightMatrix: Mat4x4f) {
    const gl = this.gl
    if (items.length === 0) return

    // Compute total vertices to size scratch buffers
    const totalVerts = items.reduce((s, it) => s + it.vertices.length / 3, 0)
    const positions = new Float32Array(totalVerts * 3)
    let offset = 0

    for (const item of items) {
      const m = item.transform.source
      const v = item.vertices
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2]
        positions[offset++] = m[0] * x + m[4] * y + m[8] * z + m[12]
        positions[offset++] = m[1] * x + m[5] * y + m[9] * z + m[13]
        positions[offset++] = m[2] * x + m[6] * y + m[10] * z + m[14]
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.viewport(0, 0, this.size, this.size)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    // Disable color writes (depth only)
    gl.colorMask(false, false, false, false)

    this.shader.use()
    this.shader.setUniform('u_lightMatrix', lightMatrix.source)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    const loc = this.shader.getAttribLocation('a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, totalVerts)

    gl.deleteBuffer(buffer)
    gl.colorMask(true, true, true, true)

    // Restore default framebuffer + viewport (caller re-sets viewport)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  destroy() {
    const gl = this.gl
    gl.deleteTexture(this.depthTexture)
    gl.deleteFramebuffer(this.framebuffer)
    this.shader.destroy()
  }
}
