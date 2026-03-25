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

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource)
    if (!vertexShader) return false

    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource)
    if (!fragmentShader) return false

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

    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    return true
  }

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

  use() {
    if (this.program) {
      this.gl.useProgram(this.program)
    }
  }

  getAttribLocation(name: string): number {
    if (!this.attribLocations.has(name)) {
      if (!this.program) return -1
      const location = this.gl.getAttribLocation(this.program, name)
      this.attribLocations.set(name, location)
    }
    return this.attribLocations.get(name)!
  }

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

  setUniform(name: string, value: number | number[] | Float32Array) {
    const location = this.getUniformLocation(name)
    if (!location) return

    const gl = this.gl

    if (typeof value === 'number') {
      gl.uniform1f(location, value)
    } else {
      const arr = value instanceof Float32Array ? value : new Float32Array(value)
      switch (arr.length) {
        case 2:
          gl.uniform2fv(location, arr)
          break
        case 3:
          gl.uniform3fv(location, arr)
          break
        case 4:
          gl.uniform4fv(location, arr)
          break
        case 9:
          gl.uniformMatrix3fv(location, false, arr)
          break
        case 16:
          gl.uniformMatrix4fv(location, false, arr)
          break
      }
    }
  }

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
 * Unified 2D/3D vertex shader
 * Uses vec3 positions and mat4x4 transforms
 * 2D mode: z=0, orthographic projection
 * 3D mode: z varies, perspective projection
 */
export const DEFAULT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec4 a_color;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

varying vec4 v_color;

void main() {
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  vec4 viewPos = u_view * worldPos;
  gl_Position = u_projection * viewPos;
  v_color = a_color;
}
`

/**
 * Default fragment shader
 */
export const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`

/**
 * WebGL2 instanced vertex shader (3D unified)
 */
export const INSTANCED_VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_translation;
in vec3 a_rotation;
in vec3 a_scale;
in vec4 a_color;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec4 v_color;

mat4 createRotationMatrix(vec3 rot) {
  float cx = cos(rot.x), sx = sin(rot.x);
  float cy = cos(rot.y), sy = sin(rot.y);
  float cz = cos(rot.z), sz = sin(rot.z);
  
  mat4 rx = mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, cx, sx, 0.0,
    0.0, -sx, cx, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
  
  mat4 ry = mat4(
    cy, 0.0, -sy, 0.0,
    0.0, 1.0, 0.0, 0.0,
    sy, 0.0, cy, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
  
  mat4 rz = mat4(
    cz, sz, 0.0, 0.0,
    -sz, cz, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
  
  return rz * ry * rx;
}

void main() {
  mat4 scaleMat = mat4(
    a_scale.x, 0.0, 0.0, 0.0,
    0.0, a_scale.y, 0.0, 0.0,
    0.0, 0.0, a_scale.z, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
  
  mat4 rotationMat = createRotationMatrix(a_rotation);
  
  vec4 scaledPos = scaleMat * vec4(a_position, 1.0);
  vec4 rotatedPos = rotationMat * scaledPos;
  vec4 worldPos = rotatedPos + vec4(a_translation, 0.0);
  
  vec4 viewPos = u_view * worldPos;
  gl_Position = u_projection * viewPos;
  v_color = a_color;
}
`

/**
 * WebGL2 instanced fragment shader
 */
export const INSTANCED_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`
