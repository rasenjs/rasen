/**
 * Shader program management
 */

import type { GlContext } from '../node'

export class ShaderProgram {
  private program: WebGLProgram | null = null
  private uniformLocations = new Map<string, WebGLUniformLocation>()
  private attribLocations = new Map<string, number>()

  constructor(private gl: GlContext) {}

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
 * Unified vertex shader
 *
 * `a_position` arrives in WORLD space: the batch renderer pre-transforms each
 * item's local vertices by its model matrix on the CPU (that is what enables
 * one VBO / one draw call for many items). The shader then applies the camera
 * view + projection: gl_Position = proj * view * worldPos.
 *
 * 2D scenes use the identity view + orthographic projection; 3D scenes use a
 * camera's lookAt view + perspective projection. Same pipeline either way.
 */
export const DEFAULT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec4 a_color;
attribute vec2 a_texCoord;
attribute vec3 a_normal;

uniform mat4 u_view;
uniform mat4 u_projection;

varying vec4 v_color;
varying vec2 v_texCoord;
varying vec3 v_normal;
varying vec3 v_worldPos;

void main() {
  vec4 viewPos = u_view * vec4(a_position, 1.0);
  gl_Position = u_projection * viewPos;
  v_color = a_color;
  v_texCoord = a_texCoord;
  v_normal = a_normal;
  // a_position is in WORLD space (batch pre-transforms on CPU)
  v_worldPos = a_position;
}
`

/**
 * Default fragment shader (supports optional texture sampling + per-pixel
 * directional lighting from world-space normals + shadow mapping).
 */
export const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;
varying vec2 v_texCoord;
varying vec3 v_normal;
varying vec3 v_worldPos;

uniform sampler2D u_texture;
uniform bool u_useTexture;
uniform bool u_useLighting;
uniform vec3 u_lightDir;
uniform vec3 u_ambient;

uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMatrix;
uniform bool u_useShadow;
uniform bool u_skipTonemap;

void main() {
  vec4 base = u_useTexture ? texture2D(u_texture, v_texCoord) : vec4(1.0, 1.0, 1.0, 1.0);
  vec3 color = base.rgb * v_color.rgb;
  float alpha = base.a * v_color.a;

  if (u_useLighting) {
    vec3 n = normalize(v_normal);
    vec3 l = normalize(u_lightDir);
    float diff = max(dot(n, l), 0.0);
    // Sun slightly stronger than ambient so lit faces stay vivid but not
    // oversaturated. Values can exceed 1.0 (HDR) → ACES tonemap below.
    color *= u_ambient + 0.8 * diff;
  }

  if (u_useShadow) {
    vec4 sp = u_shadowMatrix * vec4(v_worldPos, 1.0);
    vec3 ndc = sp.xyz / sp.w;
    vec3 uvz = ndc * 0.5 + 0.5;
    if (uvz.x >= 0.0 && uvz.x <= 1.0 && uvz.y >= 0.0 && uvz.y <= 1.0 && uvz.z <= 1.0) {
      float cur = uvz.z;
      // Small bias — the ortho depth range is ~200 world units, so a bias of
      // 0.001 in [0,1] depth = ~0.2 units (enough for acne, not hiding shadows).
      float bias = 0.001;
      // PCF 5x5 soft shadows (Godot uses PCF shadow filtering by default).
      // Wider tap spacing for softer, less "mosaic" edges.
      float shadow = 0.0;
      float texel = 5.0 / 2048.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          float sd = texture2D(u_shadowMap, uvz.xy + vec2(float(x), float(y)) * texel).r;
          shadow += (sd < cur - bias) ? 0.0 : 1.0;
        }
      }
      shadow /= 25.0;
      // Lighter shadow (matches Godot shadow_opacity 0.75 → ~0.72 kept lit).
      color *= 0.72 + 0.28 * shadow;
    }
  }

  // Godot tonemap_mode = 2 (ACES). Applied to HDR-ish values (up to ~1.4) it
  // keeps colours saturated and soft — unlike applying it to pure LDR (grey).
  // Skybox skips tonemapping so the panorama keeps its original vivid colours.
  // Slight gamma lift after ACES to match the original's bright ground.
  if (!u_skipTonemap) {
    color = clamp(color, 0.0, 1.0);
    color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
    color = pow(color, vec3(1.0 / 1.15));
  }

  gl_FragColor = vec4(color, alpha);
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
