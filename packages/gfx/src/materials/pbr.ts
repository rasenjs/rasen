/**
 * Physically based shading.
 *
 * `gfx` shipped with exactly one lighting model: a directional Lambert term plus
 * an ambient constant, hardcoded in the batch renderer's fragment shader
 * (`u_ambient + 0.8 * diff`). That is enough for the flat-shaded arena examples
 * and not enough for anything with materials, which is why this module exists.
 *
 * The BRDF is the standard Cook-Torrance decomposition, in the form every
 * renderer uses so the numbers are comparable:
 *
 *   f = diffuse + specular
 *   diffuse  = albedo * (1 - metallic) / PI
 *   specular = D * G * F / (4 * NdotV * NdotL)
 *
 * with GGX/Trowbridge-Reitz for D, Smith-Schlick for G and Schlick for F. Energy
 * is conserved: raising roughness widens and dims the highlight rather than
 * changing its total, and a fully metallic surface loses its diffuse term
 * entirely (its albedo becomes the specular reflectance instead).
 *
 * Written against GLSL ES 3.00, which is what the WebGL2 backend compiles. There
 * is deliberately no sampler array and no dynamic indexing — ANGLE rejects even
 * loop-indexed sampler arrays, which is why the existing default shader unrolls
 * its four texture reads by hand.
 *
 * This is *our* shading model, not the game's. The game's shaders are Tegra X1
 * machine code (see `examples/arpg/src/original/README.md`); they cannot be
 * obtained in source form, so matching its exact output is not a goal here.
 */

/** Uniform names and their GLSL types, so a host can bind without parsing. */
export const PBR_UNIFORMS = [
  // Supplied by the renderer whenever the shader declares them — see
  // `MaterialOptions.uniforms`, so a material never has to be handed the camera.
  { name: 'u_viewProj', type: 'mat4' },
  { name: 'u_model', type: 'mat4' },
  { name: 'u_baseColor', type: 'vec3' },
  { name: 'u_metallic', type: 'float' },
  { name: 'u_roughness', type: 'float' },
  { name: 'u_lightDir', type: 'vec3' },
  { name: 'u_lightColor', type: 'vec3' },
  { name: 'u_ambient', type: 'vec3' },
  { name: 'u_cameraPos', type: 'vec3' },
] as const

/** Vertex attributes the program expects. */
export const PBR_ATTRIBUTES = [
  { name: 'a_position', components: 3 },
  { name: 'a_normal', components: 3 },
] as const

export interface PbrMaterial {
  /** Linear-space albedo for dielectrics, or F0 for metals. */
  baseColor: [number, number, number]
  /** 0 = dielectric, 1 = metal. Values in between are allowed. */
  metallic: number
  /** Perceptual roughness in [0, 1]; squared to an alpha inside the shader. */
  roughness: number
}

export const DEFAULT_PBR_MATERIAL: PbrMaterial = {
  baseColor: [0.8, 0.8, 0.8],
  metallic: 0,
  roughness: 0.5,
}

export interface PbrLighting {
  /** Direction *towards* the light. Normalised in the shader. */
  direction: [number, number, number]
  color: [number, number, number]
  /** Constant ambient/irradiance term standing in for a full IBL probe. */
  ambient: [number, number, number]
}

export const DEFAULT_PBR_LIGHTING: PbrLighting = {
  direction: [0.5, 0.8, 0.6],
  color: [1, 1, 1],
  ambient: [0.08, 0.09, 0.11],
}

export const PBR_VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_viewProj;
uniform mat4 u_model;

out vec3 v_worldPos;
out vec3 v_normal;

void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_worldPos = world.xyz;
  // Inverse-transpose is the correct normal matrix in general; for the
  // rotation+uniform-scale transforms a material pass uses, the upper 3x3 is
  // close enough and costs three fewer uniforms.
  v_normal = mat3(u_model) * a_normal;
  // u_viewProj, not a hand-supplied MVP: the renderer owns the camera for every
  // material pass, so a material is positioned correctly by construction.
  gl_Position = u_viewProj * world;
}
`

export const PBR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec3 v_normal;

uniform vec3 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambient;
uniform vec3 u_cameraPos;

out vec4 fragColor;

const float PI = 3.14159265359;

// GGX / Trowbridge-Reitz normal distribution.
float distributionGGX(float NdotH, float alpha) {
  float a2 = alpha * alpha;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

// Smith geometry term, Schlick-GGX approximation.
float geometrySchlickGGX(float NdotX, float k) {
  return NdotX / max(NdotX * (1.0 - k) + k, 1e-7);
}

float geometrySmith(float NdotV, float NdotL, float k) {
  return geometrySchlickGGX(NdotV, k) * geometrySchlickGGX(NdotL, k);
}

vec3 fresnelSchlick(float VdotH, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_worldPos);
  // Two-sided shading: thin geometry (a plane, a leaf, a cape) must not go
  // black when its back face is visible.
  if (dot(N, V) < 0.0) N = -N;

  vec3 L = normalize(u_lightDir);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  // Perceptual roughness to the alpha the BRDF wants.
  float alpha = max(u_roughness * u_roughness, 1e-3);
  vec3 F0 = mix(vec3(0.04), u_baseColor, clamp(u_metallic, 0.0, 1.0));
  float k = alpha * 0.5;

  float D = distributionGGX(NdotH, alpha);
  float G = geometrySmith(NdotV, NdotL, k);
  vec3 F = fresnelSchlick(VdotH, F0);
  vec3 specular = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);

  vec3 diffuse = u_baseColor * (1.0 - clamp(u_metallic, 0.0, 1.0)) / PI;

  vec3 radiance = u_lightColor * NdotL;
  vec3 color = (diffuse + specular) * radiance;

  // Ambient stand-in for an IBL probe: a diffuse irradiance term plus a
  // roughness-tinted specular term. Replacing these two lines with real
  // prefiltered environment lookups is the natural next step and needs no
  // change to the BRDF above.
  vec3 ambientDiffuse = u_baseColor * (1.0 - clamp(u_metallic, 0.0, 1.0)) * u_ambient;
  vec3 ambientSpecular = F0 * u_ambient * (1.0 - u_roughness);
  color += ambientDiffuse + ambientSpecular;

  fragColor = vec4(color, 1.0);
}
`

/**
 * The same BRDF in WGSL, for the WebGPU backend.
 *
 * Uniform layout is one 16-byte slot per declared uniform in
 * `PBR_UNIFORMS` order, then `u_viewProj` and `u_model` appended as two mat4s —
 * see `MaterialOptions.uniforms`. Nothing here is GLSL-specific: the maths is
 * identical, only the syntax differs.
 */
export const PBR_WGSL = `
struct Material {
  baseColor   : vec4<f32>,
  metallic    : vec4<f32>,
  roughness   : vec4<f32>,
  lightDir    : vec4<f32>,
  lightColor  : vec4<f32>,
  ambient     : vec4<f32>,
  cameraPos   : vec4<f32>,
  viewProj    : mat4x4<f32>,
  model       : mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u : Material;

struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) normal : vec3<f32>,
};

@vertex
fn vertexMain(@location(0) a_position : vec3<f32>,
              @location(1) a_normal : vec3<f32>) -> VertexOut {
  var result : VertexOut;
  let world = u.model * vec4<f32>(a_position, 1.0);
  result.worldPos = world.xyz;
  result.normal = (u.model * vec4<f32>(a_normal, 0.0)).xyz;
  result.position = u.viewProj * world;
  return result;
}

const PI : f32 = 3.14159265359;

fn distributionGGX(NdotH : f32, alpha : f32) -> f32 {
  let a2 = alpha * alpha;
  let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

fn geometrySchlickGGX(NdotX : f32, k : f32) -> f32 {
  return NdotX / max(NdotX * (1.0 - k) + k, 1e-7);
}

fn fresnelSchlick(VdotH : f32, F0 : vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);
}

@fragment
fn fragmentMain(v : VertexOut) -> @location(0) vec4<f32> {
  var N = normalize(v.normal);
  let V = normalize(u.cameraPos.xyz - v.worldPos);
  if (dot(N, V) < 0.0) { N = -N; }

  let L = normalize(u.lightDir.xyz);
  let H = normalize(V + L);

  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 1e-4);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  let metallic = clamp(u.metallic.x, 0.0, 1.0);
  let alpha = max(u.roughness.x * u.roughness.x, 1e-3);
  let F0 = mix(vec3<f32>(0.04), u.baseColor.xyz, metallic);
  let k = alpha * 0.5;

  let D = distributionGGX(NdotH, alpha);
  let G = geometrySchlickGGX(NdotV, k) * geometrySchlickGGX(NdotL, k);
  let F = fresnelSchlick(VdotH, F0);
  let specular = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);

  let diffuse = u.baseColor.xyz * (1.0 - metallic) / PI;
  let radiance = u.lightColor.xyz * NdotL;
  var color = (diffuse + specular) * radiance;

  color += u.baseColor.xyz * (1.0 - metallic) * u.ambient.xyz;
  color += F0 * u.ambient.xyz * (1.0 - u.roughness.x);

  return vec4<f32>(color, 1.0);
}
`
