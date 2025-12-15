/**
 * Shader program management
 */

export class ShaderProgram {
  private program: WebGLProgram | null = null
  private uniformLocations = new Map<string, WebGLUniformLocation>()
  private attribLocations = new Map<string, number>()

  constructor(private gl: WebGLRenderingContext | WebGL2RenderingContext) {}

  /**
   * Compile and link shader program
   */
  compile(vertexSource: string, fragmentSource: string): boolean {
    const gl = this.gl

    // Compile vertex shader
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource)
    if (!vertexShader) return false

    // Compile fragment shader
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource)
    if (!fragmentShader) return false

    // Link program
    const program = gl.createProgram()
    if (!program) return false

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(program))
      return false
    }

    this.program = program

    // Clean up shaders (no longer needed after linking)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    return true
  }

  /**
   * Compile a single shader
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (!shader) return null

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }

    return shader
  }

  /**
   * Use this shader program
   */
  use() {
    if (this.program) {
      this.gl.useProgram(this.program)
    }
  }

  /**
   * Get attribute location (cached)
   */
  getAttribLocation(name: string): number {
    if (!this.attribLocations.has(name)) {
      if (!this.program) return -1
      const location = this.gl.getAttribLocation(this.program, name)
      this.attribLocations.set(name, location)
    }
    return this.attribLocations.get(name)!
  }

  /**
   * Get uniform location (cached)
   */
  getUniformLocation(name: string): WebGLUniformLocation | null {
    if (!this.uniformLocations.has(name)) {
      if (!this.program) return null
      const location = this.gl.getUniformLocation(this.program, name)
      if (location) {
        this.uniformLocations.set(name, location)
      }
    }
    return this.uniformLocations.get(name) || null
  }

  /**
   * Set uniform value
   */
  setUniform(name: string, value: number | number[]) {
    const location = this.getUniformLocation(name)
    if (!location) return

    const gl = this.gl

    if (typeof value === 'number') {
      gl.uniform1f(location, value)
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2:
          gl.uniform2fv(location, value)
          break
        case 3:
          gl.uniform3fv(location, value)
          break
        case 4:
          gl.uniform4fv(location, value)
          break
        case 9:
          gl.uniformMatrix3fv(location, false, value)
          break
        case 16:
          gl.uniformMatrix4fv(location, false, value)
          break
      }
    }
  }

  /**
   * Destroy shader program
   */
  destroy() {
    if (this.program) {
      this.gl.deleteProgram(this.program)
      this.program = null
    }
    this.uniformLocations.clear()
    this.attribLocations.clear()
  }
}

/**
 * Default 2D vertex shader
 */
export const DEFAULT_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;

uniform mat3 u_matrix;
uniform mat3 u_projection;

varying vec4 v_color;

void main() {
  vec3 position = u_projection * u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
  v_color = a_color;
}
`

/**
 * Default 2D fragment shader
 */
export const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`
