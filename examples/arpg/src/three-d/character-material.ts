/**
 * PBR character shading — the game-side material for the HD actors.
 *
 * The batch's default program lights from vertex normals with one Lambert
 * term, which is exactly the "flat, no materials" look the game does not
 * have. The retail characters ship three channels per material family
 * (measured on the real files):
 *
 * - `_alb` — albedo; its ALPHA is a cutout mask (hair strands), the game
 *   alpha-tests it;
 * - `_nrm` — two-channel tangent normal: **X in alpha, Y in green** (R is
 *   constant 255, B constant 0 — verified by channel statistics over the
 *   decoded retail textures), Z reconstructed in the shader;
 * - `_orm` — R = ambient occlusion, G = roughness (B unused: these sets are
 *   dielectric, metallic reads 0).
 *
 * The BRDF is the same Cook-Torrance/GGX decomposition as
 * `packages/gfx/src/materials/pbr.ts`, with the light and ambient constants
 * chosen to match the batch's own default lighting (`u_ambient + 0.8·diff`
 * becomes `albedo·(ambient + 0.8·NdotL)` plus a specular lobe), and the same
 * ACES tonemap — so a character lit through this material sits in the same
 * exposure as everything drawn through the batch.
 *
 * ## The tangent frame
 *
 * The normal map is a TANGENT-space map, so it needs the model's tangent
 * frame — and the retail GR2 meshes ship one (`src/original/gr2.ts` reads
 * `Tangent`: xyz plus a handedness sign in w). Measured on the amazon:
 *
 * - the shipped tangent direction agrees with the UV-derived tangent on
 *   100 % of the torso's triangles, and
 * - the handedness is **-1 on ~90 % of the vertices** (`w = -1` on 1015 of
 *   1135 vertices of the armour mesh), i.e. the bitangent is
 *   `handedness · cross(N, T)`, not `cross(N, T)`.
 *
 * Building the frame from screen-space derivatives with `B = cross(N, T)`
 * therefore INVERTED the normal map's Y channel on almost every vertex: the
 * bumps lit the wrong way, which reads as "the lighting does not work". The
 * model's own tangent and handedness are used instead; the derivative frame
 * stays only as the fallback for a mesh that ships no tangents at all.
 *
 * ## The light
 *
 * The key light, the fill, the hemispheric ambient and the rim all come
 * from `./lighting.ts`, which also defines the shadow's geometry — so the
 * actors are lit by the same sun their shadows are cast by.
 *
 * It draws through `gfx`'s material pass (`renderer.drawMaterial`), queued
 * from a scene element's `draw`, so it needs no changes to `gfx` itself. A
 * backend that refuses the material (createMaterial returns null — e.g. the
 * WebGPU backend, which wants WGSL) makes `drawCharacter` return false and
 * the caller keeps the batch path; the scene never depends on this shader.
 *
 * The world transform rides in `u_model` exactly as the batch's own transform
 * math expects (`u_model * v` over the column-major Mat4x4f source the batch
 * pre-transforms vertices with), so placement/rotation/scale match the
 * non-PBR path to the last digit.
 */

import { Mat4x4f } from '@rasenjs/math'
import type { GfxNode, Renderer } from '@rasenjs/gfx'
import { textureFor, type PartSpec } from './model'
import {
  AMBIENT_GROUND,
  AMBIENT_SKY,
  CAMERA_DIRECTION,
  FILL_COLOR,
  FILL_DIRECTION,
  LIGHT_COLOR,
  LIGHT_DIRECTION,
  RIM_COLOR,
} from './lighting'

/** The opaque handle `createMaterial` returns (not re-exported by gfx). */
type MaterialHandle = NonNullable<ReturnType<Renderer['createMaterial']>>

/** The transform shape `modelToTransform` produces (and `addShape` takes). */
export interface PlacementTransform {
  tx: number
  ty: number
  tz?: number
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  scaleX?: number
  scaleY?: number
  scaleZ?: number
}

export const CHARACTER_ATTRIBUTES = [
  { name: 'a_position', components: 3 },
  { name: 'a_normal', components: 3 },
  { name: 'a_uv', components: 2 },
  // The model's own tangent: xyz plus the handedness sign in w.
  { name: 'a_tangent', components: 4 },
] as const

export const CHARACTER_UNIFORMS = [
  { name: 'u_lightDir', type: 'vec3' },
  { name: 'u_lightColor', type: 'vec3' },
  { name: 'u_fillDir', type: 'vec3' },
  { name: 'u_fillColor', type: 'vec3' },
  { name: 'u_ambientSky', type: 'vec3' },
  { name: 'u_ambientGround', type: 'vec3' },
  { name: 'u_rimColor', type: 'vec3' },
  { name: 'u_cameraDir', type: 'vec3' },
] as const

export const CHARACTER_SAMPLERS = ['u_albedo', 'u_normalMap', 'u_orm'] as const

/** Floats per vertex in the interleaved buffer (position, normal, uv, tangent). */
const VERTEX_FLOATS = 12

export const CHARACTER_VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec4 a_tangent;

uniform mat4 u_viewProj;
uniform mat4 u_model;

out vec3 v_worldPos;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_tangent;
out float v_tangentHandedness;

void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_worldPos = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  v_tangent = mat3(u_model) * a_tangent.xyz;
  v_tangentHandedness = a_tangent.w;
  gl_Position = u_viewProj * world;
}
`

export const CHARACTER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_tangent;
in float v_tangentHandedness;

uniform sampler2D u_albedo;
uniform sampler2D u_normalMap;
uniform sampler2D u_orm;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_fillDir;
uniform vec3 u_fillColor;
uniform vec3 u_ambientSky;
uniform vec3 u_ambientGround;
uniform vec3 u_rimColor;
uniform vec3 u_cameraDir;

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
  vec4 albedo = texture(u_albedo, v_uv);
  // The _alb alpha is the game's cutout mask (hair strands): alpha-TEST, the
  // way the game draws it. Blending the mask instead washes the strand edges.
  if (albedo.a < 0.5) discard;

  vec4 orm = texture(u_orm, v_uv);
  float ao = orm.r;
  float roughness = clamp(orm.g, 0.04, 1.0);
  float metallic = clamp(orm.b, 0.0, 1.0);

  vec3 geoN = normalize(v_normal);

  // The derivative frame is always computed: derivatives in non-uniform
  // control flow are undefined, and the branch below is only uniform by
  // accident (a mesh either ships tangents or it does not).
  vec3 dp1 = dFdx(v_worldPos);
  vec3 dp2 = dFdy(v_worldPos);
  vec2 du1 = dFdx(v_uv);
  vec2 du2 = dFdy(v_uv);
  vec3 gradient = dp1 * du2.y - dp2 * du1.y;

  // The tangent frame. The model's OWN tangent wins: the retail meshes ship
  // one together with the handedness sign that says which way the bitangent
  // runs, and that sign is -1 on ~90% of the amazon's vertices. A frame
  // built as cross(N, T) alone (the derivative frame's assumption) inverts
  // the normal map's Y channel on those vertices, so the bumps light the
  // wrong way.
  vec3 T;
  vec3 B;
  if (dot(v_tangent, v_tangent) > 1e-8) {
    T = normalize(v_tangent - geoN * dot(geoN, v_tangent));
    B = cross(geoN, T) * (v_tangentHandedness < 0.0 ? -1.0 : 1.0);
  } else {
    // Fallback for a mesh that ships no tangents: the screen-space
    // derivative frame (exact for the rasterized triangle).
    T = length(gradient) > 1e-8 ? normalize(gradient) : geoN;
    B = normalize(cross(geoN, T));
  }
  vec4 nSample = texture(u_normalMap, v_uv);
  // The retail _nrm maps keep X in ALPHA and Y in GREEN (R is a constant
  // 255, B a constant 0 — measured over the decoded amazon textures).
  vec2 nxy = vec2(nSample.a, nSample.g) * 2.0 - 1.0;
  float nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
  vec3 N = normalize(T * nxy.x + B * nxy.y + geoN * nz);

  // Orthographic view: the view vector is the constant camera direction.
  vec3 V = normalize(u_cameraDir);
  // Two-sided shading: a cape or a hair card must not go black from behind.
  if (dot(N, V) < 0.0) N = -N;

  vec3 L = normalize(u_lightDir);
  vec3 Lf = normalize(u_fillDir);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotF = max(dot(N, Lf), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  float alpha = max(roughness * roughness, 1e-3);
  vec3 F0 = mix(vec3(0.04), albedo.rgb, metallic);
  float k = alpha * 0.5;

  float D = distributionGGX(NdotH, alpha);
  float G = geometrySmith(NdotV, NdotL, k);
  vec3 F = fresnelSchlick(VdotH, F0);
  vec3 specular = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);

  vec3 diffuse = albedo.rgb * (1.0 - metallic) / PI;
  vec3 color = (diffuse + specular) * (u_lightColor * NdotL + u_fillColor * NdotF);

  // Hemispheric ambient, occluded by the ORM's AO. A single flat ambient
  // gave every surface the same fill, which is the other half of "flat".
  vec3 ambient = mix(u_ambientGround, u_ambientSky, N.y * 0.5 + 0.5);
  color += albedo.rgb * (1.0 - metallic) * ambient * ao;
  color += F0 * ambient * (1.0 - roughness) * ao * 0.35;

  // Rim: a cool sky-coloured edge that lifts the actor off the ground it
  // stands on. Only on the key-lit side, so it reads as light, not outline.
  float rim = pow(1.0 - NdotV, 3.0) * smoothstep(0.0, 0.35, NdotL);
  color += u_rimColor * rim * ao;

  // The batch shader's tonemap (ACES + a small gamma lift): a character must
  // sit in the same exposure as everything drawn through the batch.
  color = clamp(color, 0.0, 1.0);
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  color = pow(color, vec3(1.0 / 1.15));

  fragColor = vec4(color, 1.0);
}
`

const materials = new WeakMap<Renderer, MaterialHandle | null>()

/**
 * This scene's character material, compiled once per renderer.
 *
 * `null` means the backend refused it (no WebGL2 / no material support) — the
 * caller then keeps the batch path, so the shader is an upgrade, never a
 * dependency.
 */
export function characterMaterial(renderer: Renderer): MaterialHandle | null {
  const cached = materials.get(renderer)
  if (cached !== undefined) return cached
  const handle = renderer.createMaterial({
    vertex: CHARACTER_VERTEX_SHADER,
    fragment: CHARACTER_FRAGMENT_SHADER,
    attributes: CHARACTER_ATTRIBUTES.map((attribute) => ({ ...attribute })),
    uniforms: CHARACTER_UNIFORMS.map((uniform) => ({ ...uniform })),
    samplers: [...CHARACTER_SAMPLERS],
    blend: 'normal',
    // Real depth, func LEQUAL (the batch's own): a character is 3D geometry
    // and must sort against itself and its neighbours whatever angle the
    // camera sees it from. The earlier painter-order-only variant scrambled
    // the parts at most orbit angles — submission order is triangle order, not
    // depth order. LEQUAL keeps the one behaviour painter order was kept for:
    // the same triangle range drawn twice with alternate materials
    // (`head_meshShape` carries both the body and the head atlas) lets the
    // later draw cover the earlier at equal depth.
    depthTest: true,
    depthWrite: true,
    cull: 'none',
  })
  materials.set(renderer, handle)
  return handle
}

/**
 * Interleave one part as [position, normal, uv, tangent] rows — the
 * material's vertex layout. Exported for the layout test: a stride mistake
 * here silently smears every vertex.
 */
export function interleaveForPbr(part: PartSpec): Float32Array {
  const out = new Float32Array((part.vertices.length / 3) * VERTEX_FLOATS)
  interleaveInto(part, out, true)
  return out
}

/**
 * The interleaved vertex buffers, kept between frames.
 *
 * The material pass uploads the interleaved array to the GPU on every draw, so
 * a frame allocated one of these per animated part — the profile put
 * `drawCharacter` at 4% and the collector at another 4%. The buffer is the same
 * SIZE every frame (only the pose inside it changes), so it is allocated once
 * and rewritten.
 *
 * Keyed by the part's own vertex array: that array identifies the geometry,
 * and it changes identity whenever the part is re-skinned into a fresh buffer.
 */
const interleavedBuffers = new WeakMap<Float32Array, Float32Array>()

/** Interleave one part into `out` (which must hold count*12 floats). */
function interleaveInto(part: PartSpec, out: Float32Array, fresh: boolean): void {
  const count = part.vertices.length / 3
  const srcVertices = part.vertices
  const srcNormals = part.normals
  const srcUv = part.uv
  const tangents = part.tangents
  const hasTangents = tangents !== undefined && tangents.length >= count * 4
  for (let i = 0; i < count; i += 1) {
    const at = i * VERTEX_FLOATS
    const v3 = i * 3
    out[at] = srcVertices[v3]
    out[at + 1] = srcVertices[v3 + 1]
    out[at + 2] = srcVertices[v3 + 2]
    out[at + 3] = srcNormals[v3]
    out[at + 4] = srcNormals[v3 + 1]
    out[at + 5] = srcNormals[v3 + 2]
    // The UV is a property of the MESH, not of the pose: it only ever needs
    // writing on the frame the buffer is first filled, and the buffer persists
    // between frames.
    if (fresh) {
      out[at + 6] = srcUv[i * 2]
      out[at + 7] = srcUv[i * 2 + 1]
    }
    if (hasTangents) {
      const v4 = i * 4
      out[at + 8] = tangents[v4]
      out[at + 9] = tangents[v4 + 1]
      out[at + 10] = tangents[v4 + 2]
      out[at + 11] = tangents[v4 + 3]
    } else if (fresh) {
      // No tangent in this mesh: a zero tangent tells the shader to fall
      // back to the derivative frame.
      out[at + 8] = 0
      out[at + 9] = 0
      out[at + 10] = 0
      out[at + 11] = 0
    }
  }
}

/**
 * The interleaved vertex buffer for one part, reused between frames.
 *
 * The returned buffer is rewritten in place every frame.
 */
function interleavedFor(part: PartSpec): Float32Array {
  const key = part.vertices
  let buffer = interleavedBuffers.get(key)
  const fresh = buffer === undefined
  if (buffer === undefined) {
    buffer = new Float32Array((part.vertices.length / 3) * VERTEX_FLOATS)
    interleavedBuffers.set(key, buffer)
  }
  interleaveInto(part, buffer, fresh)
  return buffer
}

/** Object-form transform → matrix, the exact composition `addShape` applies. */
function placementMatrix(transform: PlacementTransform): Mat4x4f {
  return Mat4x4f.identity()
    .multiply(Mat4x4f.translate(transform.tx, transform.ty, transform.tz ?? 0))
    .multiply(Mat4x4f.rotateX(transform.rotationX ?? 0))
    .multiply(Mat4x4f.rotateY(transform.rotationY ?? 0))
    .multiply(Mat4x4f.rotateZ(transform.rotationZ ?? 0))
    .multiply(Mat4x4f.scale(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1))
}

/**
 * Draw one model part through the character material. Returns false when the
 * backend has no material support, so the caller can fall back to the batch.
 */
export function drawCharacter(
  node: GfxNode,
  part: PartSpec,
  transform: PlacementTransform,
  order: number,
): boolean {
  const material = characterMaterial(node.renderer)
  if (material === null) return false
  node.renderer.drawMaterial({
    material,
    vertices: interleavedFor(part),
    transform: placementMatrix(transform),
    uniforms: {
      u_lightDir: [...LIGHT_DIRECTION],
      u_lightColor: [...LIGHT_COLOR],
      u_fillDir: [...FILL_DIRECTION],
      u_fillColor: [...FILL_COLOR],
      u_ambientSky: [...AMBIENT_SKY],
      u_ambientGround: [...AMBIENT_GROUND],
      u_rimColor: [...RIM_COLOR],
      u_cameraDir: [...CAMERA_DIRECTION],
    },
    textures: [
      textureFor(node, part.textureSource),
      textureFor(node, part.normalSource ?? flatNormalTexture()),
      textureFor(node, part.ormSource ?? flatOrmTexture()),
    ],
    order,
  })
  return true
}

function texelCanvas(r: number, g: number, b: number, a: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
  ctx.fillRect(0, 0, 1, 1)
  return canvas
}

let cachedFlatNormal: HTMLCanvasElement | null = null
let cachedFlatOrm: HTMLCanvasElement | null = null

/**
 * Flat normal texel: X = A = 128 → 0, Y = G = 128 → 0, Z → 1. Lazy: importing
 * this module (node-side tests) must not require a DOM.
 */
export function flatNormalTexture(): HTMLCanvasElement {
  cachedFlatNormal ??= texelCanvas(255, 128, 0, 128)
  return cachedFlatNormal
}

/** Neutral ORM texel: AO = 1, roughness = 0.5, metallic = 0. Lazy likewise. */
export function flatOrmTexture(): HTMLCanvasElement {
  cachedFlatOrm ??= texelCanvas(255, 128, 0, 255)
  return cachedFlatOrm
}
