/**
 * WGSL twins of the engine's GLSL shaders.
 *
 * Why these are hand-written rather than transpiled: there is no reliable
 * GLSL-ES -> WGSL translator, and the two languages disagree on things the
 * engine actually depends on (explicit `@group`/`@binding` instead of global
 * uniform names, `@location` instead of attribute names, uniform-address-space
 * alignment rules, no separate sampler objects in GLSL). Treat this file as the
 * WGSL source of truth and keep it in lockstep with `shader.ts`.
 *
 * Parity notes against `DEFAULT_VERTEX_SHADER_ES3` / `DEFAULT_FRAGMENT_SHADER_ES3`:
 *
 *  - The GLSL `layout(std140) uniform Frame { mat4 u_view; mat4 u_projection }`
 *    becomes `Frame` below. std140 and WGSL's uniform address space agree on
 *    mat4x4<f32>: align 16, size 64, so the two-mat4 block is byte-compatible
 *    at 128 bytes. `Frame` is padded to that size on the JS side.
 *
 *  - GLSL ES forbids dynamically indexing a sampler array (the GLSL shader
 *    unrolls a 4-way if-chain as a workaround). WGSL allows it, so the fragment
 *    shader indexes `u_tex[v_texIdx]` directly. Same result, less code.
 *
 *  - `flat out int v_texIdx` becomes `@interpolate(flat)`. Without the
 *    attribute WGSL would interpolate the integer and the sampler index would
 *    vary across the triangle.
 *
 *  - The remaining GLSL uniforms are grouped into `Params`. WGSL vec3 aligns to
 *    16, so the JS-side buffer must honour that: see PARAMS_LAYOUT below. The
 *    offsets are asserted in `webgpu-shaders.test.ts` because a silent mismatch
 *    renders wrong rather than failing.
 */

/**
 * Byte layout of the engine's single uniform block.
 *
 * ONE block, visible to both stages. The first version declared `Frame` in the
 * vertex shader and `Params` in the fragment shader, both at `@group(0)
 * @binding(0)` — a collision: WebGPU matches bindings per pipeline, so two
 * different types cannot share one slot. A single block also matches how the
 * engine already thinks about it (its WebGL2 path has one `Frame` UBO plus a
 * handful of loose uniforms).
 *
 * Alignment follows the WGSL uniform address space: vec3 aligns to 16, mat4x4 to
 * 16, and the block is padded to a multiple of 16.
 */
export const FRAME_LAYOUT = {
  byteLength: 240,
  view: 0, // mat4x4 (align 16, size 64)
  projection: 64, // mat4x4
  lightDir: 128, // vec3 -> occupies 128..139, next member at 144
  ambient: 144, // vec3
  useTexture: 156, // f32 (3 floats after ambient)
  useLighting: 160,
  useShadow: 164,
  skipTonemap: 168,
  shadowMatrix: 176, // mat4x4 -> 176..239; 240 is 16-aligned
} as const

/** Bindings for the engine's pipeline. One group.
 *
 * The four texture slots are SEPARATE bindings, not `array<texture_2d<f32>, 4>`.
 * The device interface maps one bind-group entry to one binding, which is what
 * lets the WebGL backend bind each sampler to its own unit; an array binding
 * would need per-element indexing machinery there (`uniform1iv`) for no gain.
 * The fragment shader therefore selects with a constant-index chain, exactly as
 * the GLSL ES version has to (GLSL ES forbids dynamic sampler indexing).
 */
export const ENGINE_BINDINGS = {
  uniforms: 0,
  tex0: 1,
  tex1: 2,
  tex2: 3,
  tex3: 4,
  sampler: 5,
  shadowMap: 6,
} as const

export const ENGINE_TEXTURE_BINDINGS = [
  ENGINE_BINDINGS.tex0,
  ENGINE_BINDINGS.tex1,
  ENGINE_BINDINGS.tex2,
  ENGINE_BINDINGS.tex3,
] as const

export const ENGINE_SAMPLER_NAMES = ['u_tex0', 'u_tex1', 'u_tex2', 'u_tex3'] as const

/** Fields of {@link FRAME_LAYOUT} as the WebGL backend must write them. */
export const FRAME_FIELDS = [
  { name: 'u_view', offset: FRAME_LAYOUT.view, type: 'mat4' as const },
  { name: 'u_projection', offset: FRAME_LAYOUT.projection, type: 'mat4' as const },
  { name: 'u_lightDir', offset: FRAME_LAYOUT.lightDir, type: 'vec3' as const },
  { name: 'u_ambient', offset: FRAME_LAYOUT.ambient, type: 'vec3' as const },
  { name: 'u_useTexture', offset: FRAME_LAYOUT.useTexture, type: 'float' as const },
  { name: 'u_useLighting', offset: FRAME_LAYOUT.useLighting, type: 'float' as const },
  { name: 'u_useShadow', offset: FRAME_LAYOUT.useShadow, type: 'float' as const },
  { name: 'u_skipTonemap', offset: FRAME_LAYOUT.skipTonemap, type: 'float' as const },
  { name: 'u_shadowMatrix', offset: FRAME_LAYOUT.shadowMatrix, type: 'mat4' as const },
]

/** Byte layout of the quad pair's uniform block (equivalence test only). */
export const QUAD_PARAMS = { byteLength: 80, transform: 0, tint: 64 } as const

export const ENGINE_UNIFORMS_WGSL = /* wgsl */ `
struct Uniforms {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  lightDir: vec3<f32>,
  ambient: vec3<f32>,
  useTexture: f32,
  useLighting: f32,
  useShadow: f32,
  skipTonemap: f32,
  shadowMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var u_tex0: texture_2d<f32>;
@group(0) @binding(2) var u_tex1: texture_2d<f32>;
@group(0) @binding(3) var u_tex2: texture_2d<f32>;
@group(0) @binding(4) var u_tex3: texture_2d<f32>;
@group(0) @binding(5) var u_sampler: sampler;
@group(0) @binding(6) var u_shadowMap: texture_2d<f32>;
`

export const DEFAULT_VERTEX_WGSL = /* wgsl */ `
${ENGINE_UNIFORMS_WGSL}

struct VsIn {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) texCoord: vec2<f32>,
  @location(3) normal: vec3<f32>,
  @location(4) texIndex: f32,
};

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) texCoord: vec2<f32>,
  @location(2) normal: vec3<f32>,
  @location(3) worldPos: vec3<f32>,
  // Interpolate-flat: an interpolated integer would pick a different sampler
  // per fragment.
  @location(4) @interpolate(flat) texIdx: i32,
};

@vertex
fn vs_main(input: VsIn) -> VsOut {
  var out: VsOut;
  let viewPos = u.view * vec4<f32>(input.position, 1.0);
  out.position = u.projection * viewPos;
  out.color = input.color;
  out.texCoord = input.texCoord;
  out.normal = input.normal;
  // position is in WORLD space: the batch pre-transforms on the CPU.
  out.worldPos = input.position;
  out.texIdx = i32(input.texIndex);
  return out;
}
`

export const DEFAULT_FRAGMENT_WGSL = /* wgsl */ `
${ENGINE_UNIFORMS_WGSL}

struct FsIn {
  @location(0) color: vec4<f32>,
  @location(1) texCoord: vec2<f32>,
  @location(2) normal: vec3<f32>,
  @location(3) worldPos: vec3<f32>,
  @location(4) @interpolate(flat) texIdx: i32,
};

@fragment
fn fs_main(input: FsIn) -> @location(0) vec4<f32> {
  var base: vec4<f32>;
  // textureSampleLevel throughout, NOT textureSample: WGSL only allows
  // textureSample from uniform control flow, and texIdx (though flat-interpolated)
  // selects between these branches, which the uniformity analysis rejects. GLSL
  // ES has no such rule, so the GLSL version keeps texture(). Level 0 is the
  // only mip this pipeline binds.
  if (u.useTexture < 0.5) {
    base = vec4<f32>(1.0, 1.0, 1.0, 1.0);
  } else if (input.texIdx == 0) {
    base = textureSampleLevel(u_tex0, u_sampler, input.texCoord, 0.0);
  } else if (input.texIdx == 1) {
    base = textureSampleLevel(u_tex1, u_sampler, input.texCoord, 0.0);
  } else if (input.texIdx == 2) {
    base = textureSampleLevel(u_tex2, u_sampler, input.texCoord, 0.0);
  } else {
    base = textureSampleLevel(u_tex3, u_sampler, input.texCoord, 0.0);
  }

  var color = base.rgb * input.color.rgb;
  let alpha = base.a * input.color.a;

  if (u.useLighting > 0.5) {
    let n = normalize(input.normal);
    let l = normalize(u.lightDir);
    let diff = max(dot(n, l), 0.0);
    color = color * (u.ambient + 0.8 * diff);
  }

  if (u.useShadow > 0.5) {
    let sp = u.shadowMatrix * vec4<f32>(input.worldPos, 1.0);
    let ndc = sp.xyz / sp.w;
    let uvz = ndc * 0.5 + 0.5;
    if (uvz.x >= 0.0 && uvz.x <= 1.0 && uvz.y >= 0.0 && uvz.y <= 1.0 && uvz.z <= 1.0) {
      let cur = uvz.z;
      let bias = 0.001;
      var shadow = 0.0;
      let texel = 5.0 / 2048.0;
      // PCF 5x5, matching the GLSL loop.
      //
      // textureSampleLevel, NOT textureSample: WGSL only allows textureSample
      // from uniform control flow, and this whole branch depends on per-fragment
      // values (uvz comes from the interpolated world position). GLSL has no such
      // rule, which is why the GLSL version reads as a direct translation. Level
      // 0 is the same mip the implicit-lod version would pick for this pass.
      for (var y = -2; y <= 2; y = y + 1) {
        for (var x = -2; x <= 2; x = x + 1) {
          let offset = vec2<f32>(f32(x), f32(y)) * texel;
          let sd = textureSampleLevel(u_shadowMap, u_sampler, uvz.xy + offset, 0.0).r;
          shadow = shadow + select(0.0, 1.0, sd >= cur - bias);
        }
      }
      shadow = shadow / 25.0;
      color = color * (0.72 + 0.28 * shadow);
    }
  }

  if (u.skipTonemap > 0.5) {
    color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  } else {
    color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
    // ACES approximation, then the 1/1.15 gamma lift — identical to GLSL.
    color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
    color = pow(color, vec3<f32>(1.0 / 1.15));
  }

  return vec4<f32>(color, alpha);
}
`

/**
 * Minimal WGSL pair for the device-tier equivalence test.
 *
 * Exercises the three things a backend has to get right and that fail SILENTLY:
 * a vertex layout, a uniform block, and a texture binding.
 *
 * The uniform block is the interesting one. WebGPU binds the buffer wholesale
 * against the struct below; WebGL has no uniform buffers at all, so the same
 * binding becomes individual uniforms on that side (see
 * BindGroupLayoutEntry.fields). For that to line up, the WGSL struct member order
 * and the descriptor's `fields` offsets must agree exactly — nothing validates
 * that at runtime, hence the assertion in webgpu-shaders.test.ts.
 */
export const QUAD_VERTEX_WGSL = /* wgsl */ `
struct Params {
  transform: mat4x4<f32>,
  tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: Params;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) position: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
) -> VsOut {
  var out: VsOut;
  out.position = params.transform * vec4<f32>(position, 0.0, 1.0);
  out.uv = uv;
  out.color = color * params.tint;
  return out;
}
`

export const QUAD_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, uv) * color;
}
`

/** GLSL twin: the uniform block is declared as plain uniforms (see the class doc). */
export const QUAD_VERTEX_GLSL = /* glsl */ `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in vec4 a_color;
uniform mat4 u_transform;
uniform vec4 u_tint;
out vec2 v_uv;
out vec4 v_color;
void main() {
  gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color * u_tint;
}
`

export const QUAD_FRAGMENT_GLSL = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
in vec4 v_color;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, v_uv) * v_color; }
`

