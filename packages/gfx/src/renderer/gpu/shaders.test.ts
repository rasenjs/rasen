/**
 * Contract tests for the WGSL twins and their uniform-block layouts.
 *
 * The layouts are the part of a shader port that fails SILENTLY: WGSL's uniform
 * address space has alignment rules (vec3 aligns to 16, mat4x4 to 16, the whole
 * block to 16) that differ from a naive packed array. A mismatch between the
 * constants below and the WGSL struct renders wrong — no error, no warning.
 *
 * So these tests assert the two things that can drift:
 *  1. the byte offsets/lengths match the struct member order and alignment, and
 *  2. every uniform the GLSL version uses has a WGSL counterpart (a missing
 *     binding is a black screen, not a compile error).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DEFAULT_FRAGMENT_WGSL,
  DEFAULT_VERTEX_WGSL,
  FRAME_LAYOUT,
  QUAD_FRAGMENT_GLSL,
  QUAD_FRAGMENT_WGSL,
  QUAD_PARAMS,
  QUAD_VERTEX_GLSL,
  QUAD_VERTEX_WGSL,
} from './shaders'

describe('uniform block layout (engine pipeline)', () => {
  it('packs view/projection and the fragment params into ONE block', () => {
    // One block, not two: the first version declared `Frame` in the vertex
    // shader and `Params` in the fragment shader, both at @group(0)@binding(0),
    // which WebGPU rejects because a binding slot has one type per pipeline.
    expect(FRAME_LAYOUT.view).toBe(0)
    expect(FRAME_LAYOUT.projection).toBe(64)
    // vec3 aligns to 16, so lightDir runs 128..139 and ambient starts at 144.
    expect(FRAME_LAYOUT.lightDir).toBe(128)
    expect(FRAME_LAYOUT.ambient).toBe(144)
    // Three floats follow ambient, then the scalars are 4-byte aligned.
    expect(FRAME_LAYOUT.useTexture).toBe(156)
    expect(FRAME_LAYOUT.useLighting).toBe(160)
    expect(FRAME_LAYOUT.useShadow).toBe(164)
    expect(FRAME_LAYOUT.skipTonemap).toBe(168)
    // mat4 needs 16-alignment, hence 176 rather than 172.
    expect(FRAME_LAYOUT.shadowMatrix).toBe(176)
    expect(FRAME_LAYOUT.shadowMatrix + 64).toBe(FRAME_LAYOUT.byteLength)
    expect(FRAME_LAYOUT.byteLength % 16).toBe(0)
  })

  it('declares the struct members in the same order as the layout', () => {
    const block = DEFAULT_FRAGMENT_WGSL.match(/struct Uniforms \{([\s\S]*?)\};/)![1]
    const members = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
    expect(members).toEqual([
      'view',
      'projection',
      'lightDir',
      'ambient',
      'useTexture',
      'useLighting',
      'useShadow',
      'skipTonemap',
      'shadowMatrix',
    ])
  })

  it('binds the block once, visible to BOTH stages', () => {
    // Both entry points must see the same binding, or one of them reads nothing.
    expect(DEFAULT_VERTEX_WGSL).toMatch(/@group\(0\) @binding\(0\) var<uniform> u: Uniforms/)
    expect(DEFAULT_FRAGMENT_WGSL).toMatch(/@group\(0\) @binding\(0\) var<uniform> u: Uniforms/)
  })
})

describe('WGSL / GLSL parity', () => {
  const shaderSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'gl', 'shader.ts'),
    'utf8'
  )

  it('every uniform used by the ES3 fragment shader has a WGSL counterpart', () => {
    const es3 = shaderSrc.match(/export const DEFAULT_FRAGMENT_SHADER_ES3 = `([\s\S]*?)`/)![1]
    const glslUniforms = [...es3.matchAll(/^uniform \w+ (\w+)/gm)].map((m) => m[1])

    // GLSL uses u_view/u_projection inside the Frame block; WGSL keeps those
    // names in the Frame struct. Map each remaining uniform onto the WGSL struct
    // member or binding that carries it.
    const expected: Record<string, string> = {
      'u_tex': 'u_tex',
      'u_useTexture': 'useTexture',
      'u_useLighting': 'useLighting',
      'u_lightDir': 'lightDir',
      'u_ambient': 'ambient',
      'u_shadowMap': 'u_shadowMap',
      'u_shadowMatrix': 'shadowMatrix',
      'u_useShadow': 'useShadow',
      'u_skipTonemap': 'skipTonemap',
    }
    for (const u of glslUniforms) {
      const counterpart = expected[u]
      expect(counterpart, `GLSL uniform ${u} has no WGSL mapping entry`).toBeTruthy()
      expect(
        DEFAULT_FRAGMENT_WGSL.includes(counterpart),
        `WGSL is missing ${counterpart} for GLSL ${u}`
      ).toBe(true)
    }
  })

  it('keeps the flat integer varying flat in WGSL', () => {
    // Without @interpolate(flat) the sampler index is interpolated across the
    // triangle and the wrong texture is sampled on part of it.
    expect(DEFAULT_VERTEX_WGSL).toMatch(/@interpolate\(flat\)/)
    expect(DEFAULT_VERTEX_WGSL).toMatch(/texIdx: i32/)
  })

  it('uses the same attribute locations in WGSL as the engine binds', () => {
    // Scope to the INPUT struct: `VsOut` reuses @location(0..) for its varyings,
    // so a whole-file match returns ten entries and compares the wrong things.
    const vsIn = DEFAULT_VERTEX_WGSL.match(/struct VsIn \{([\s\S]*?)\};/)![1]
    const locations = [...vsIn.matchAll(/@location\((\d+)\) (\w+):/g)].map((m) => [
      Number(m[1]),
      m[2],
    ])
    // The engine's WebGPU attribute order (see createPipeline: location =
    // ordinal position in the layout). These must line up or the vertex stream
    // is read as the wrong attribute.
    expect(locations).toEqual([
      [0, 'position'],
      [1, 'color'],
      [2, 'texCoord'],
      [3, 'normal'],
      [4, 'texIndex'],
    ])
  })
})

describe('quad pair (equivalence-test shaders)', () => {
  it('matches GLSL and WGSL attribute locations and order', () => {
    // Only the vertex ENTRY POINT's parameters. The VsOut varyings also carry
    // @location(0) and @location(1), so a whole-file match yields [0, 1, 0].
    const params = QUAD_VERTEX_WGSL.match(/fn vs_main\(([\s\S]*?)\)\s*->/)![1]
    const wgsl = [...params.matchAll(/@location\((\d+)\)\s*(\w+):/g)].map((m) => Number(m[1]))
    expect(wgsl).toEqual([0, 1, 2])
    // GLSL declares in vec2 a_position / in vec2 a_uv / in vec4 a_color, and the
    // WebGL backend resolves by NAME so order is free there — but the WebGPU
    // backend derives locations from layout order, so the WGSL must list them in
    // the same order the harness lays them out.
    expect(QUAD_VERTEX_GLSL).toMatch(/in vec2 a_position;/)
    expect(QUAD_VERTEX_GLSL.indexOf('a_position')).toBeLessThan(QUAD_VERTEX_GLSL.indexOf('a_uv'))
    expect(QUAD_VERTEX_GLSL.indexOf('a_uv')).toBeLessThan(QUAD_VERTEX_GLSL.indexOf('a_color'))
  })

  it('uses a single texture binding and a sampler in both', () => {
    // Binding 0 is the uniform block (see QUAD_PARAMS), so the texture is 1 and
    // the sampler 2 — the harness declares the same numbers.
    expect(QUAD_FRAGMENT_WGSL).toMatch(/@group\(0\) @binding\(1\) var tex: texture_2d<f32>/)
    expect(QUAD_FRAGMENT_WGSL).toMatch(/@group\(0\) @binding\(2\) var samp: sampler/)
    expect(QUAD_FRAGMENT_GLSL).toMatch(/uniform sampler2D u_tex;/)
  })

  it('declares the quad uniform block in the order the layout constants assume', () => {
    const block = QUAD_VERTEX_WGSL.match(/struct Params \{([\s\S]*?)\};/)![1]
    const members = [...block.matchAll(/\b(\w+):/g)].map((m) => m[1])
    // WebGPU binds the block wholesale against this struct; WebGL writes the same
    // bytes through individual uniforms named by QUAD layout `fields`. A member
    // order or offset mismatch renders subtly wrong with no error at all, so the
    // struct and QUAD_PARAMS are asserted against each other.
    expect(members).toEqual(['transform', 'tint'])
    expect(QUAD_PARAMS.transform).toBe(0) // mat4x4: align 16, size 64
    expect(QUAD_PARAMS.tint).toBe(64) // vec4 at the next 16-aligned slot
    expect(QUAD_PARAMS.byteLength).toBe(80) // 64 + 16, and 80 % 16 === 0
  })
})
