import { describe, expect, it } from 'vitest'
import { WebGLRenderer } from '../index'
import { createMockWebGLContext } from '../../../test-utils'

/**
 * The material pass has to satisfy two properties at once, and the second is the
 * one that matters most:
 *
 *   1. when a material *is* used, its program draws — so the feature works;
 *   2. when one is **not** used, nothing about the existing path changes — so
 *      adding the feature cannot cost the spine/instanced/batch paths anything.
 *
 * The second is asserted structurally (no material state exists until a material
 * is created) as well as behaviourally (the frame draws exactly what it did
 * before).
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const MATERIAL = {
  vertex: `#version 300 es
in vec3 a_position;
uniform mat4 u_viewProj;
void main() { gl_Position = u_viewProj * vec4(a_position, 1.0); }`,
  fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`,
  attributes: [{ name: 'a_position', components: 3 as const }],
}

function triangle(): Float32Array {
  return new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
}

describe('material pass', () => {
  it('creates no material state until one is asked for', () => {
    const gl = createMockWebGLContext()
    const renderer = new WebGLRenderer(gl, IDENTITY as unknown as number[])

    // The feature is entirely absent, which is the property that makes it free.
    expect(renderer.materialsActive).toBe(false)
    // Nothing queued means the pass never runs: draw() has a single null check.
    renderer.draw()
    expect(renderer.materialsActive).toBe(false)
  })

  it('reports failure instead of throwing when a material does not compile', () => {
    // ShaderProgram checks compile status, so making the context report a failed
    // compile is the direct way to reach the failure path.
    const gl = createMockWebGLContext() as unknown as Record<string, unknown>
    gl.getShaderParameter = () => false

    const renderer = new WebGLRenderer(gl as never, IDENTITY as unknown as number[])
    // null, not a throw: a broken effect must not take the whole scene down.
    expect(renderer.createMaterial(MATERIAL)).toBeNull()
    // And the feature stays dormant, because no program was ever registered.
    renderer.draw()
    expect(renderer.materialsActive).toBe(false)
  })

  it('draws a queued material with its own program, and clears the queue', () => {
    const gl = createMockWebGLContext()
    const renderer = new WebGLRenderer(gl, IDENTITY as unknown as number[])
    const spy = gl.useProgram as unknown as { mock: { calls: unknown[] } }

    const material = renderer.createMaterial(MATERIAL)
    expect(material).not.toBeNull()

    const before = spy.mock.calls.length
    renderer.drawMaterial({ material: material!, vertices: triangle() })
    expect(renderer.materialsActive).toBe(true)

    renderer.draw()

    // The pass drew something...
    expect(spy.mock.calls.length).toBeGreaterThan(before)
    // ...and the queue was drained, so a frame cannot draw stale geometry twice.
    const afterFirst = spy.mock.calls.length
    renderer.draw()
    expect(spy.mock.calls.length).toBe(afterFirst)
  })

  it('uploads the material geometry and issues one draw', () => {
    const gl = createMockWebGLContext()
    const renderer = new WebGLRenderer(gl, IDENTITY as unknown as number[])
    const draws = (gl.drawArrays as unknown as { mock: { calls: unknown[][] } }).mock.calls

    const material = renderer.createMaterial(MATERIAL)!
    const before = draws.length
    renderer.drawMaterial({ material, vertices: triangle() })
    renderer.draw()

    expect(draws.length).toBe(before + 1)
    // Three interleaved vec3 vertices, drawn as one triangle.
    expect(draws[before][2]).toBe(3)
  })

  it('drops queued draws when a material is destroyed', () => {
    const gl = createMockWebGLContext()
    const renderer = new WebGLRenderer(gl, IDENTITY as unknown as number[])
    const draws = (gl.drawArrays as unknown as { mock: { calls: unknown[][] } }).mock.calls

    const material = renderer.createMaterial(MATERIAL)!
    renderer.drawMaterial({ material, vertices: triangle() })
    renderer.destroyMaterial(material)

    const before = draws.length
    renderer.draw()
    // Nothing was drawn: the material's queued work went with it.
    expect(draws.length).toBe(before)
  })

  it('does not change the batch path just by existing', () => {
    // The property that matters for the spine/instanced/batch paths: creating a
    // material must not alter what a plain shape costs. Same shape, same frame,
    // two renderers — one that has compiled a material and one that has not.
    const shape = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const color = { r: 1, g: 1, b: 1, a: 1 }
    const transform = IDENTITY as unknown as number[]

    const plainGl = createMockWebGLContext()
    const plain = new WebGLRenderer(plainGl, IDENTITY as unknown as number[])
    plain.addShape(shape, color, transform)
    plain.draw()
    const plainDraws = (plainGl.drawArrays as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length

    const materialisedGl = createMockWebGLContext()
    const materialised = new WebGLRenderer(materialisedGl, IDENTITY as unknown as number[])
    // Feature in use: a program exists — but nothing is queued for the pass.
    expect(materialised.createMaterial(MATERIAL)).not.toBeNull()
    materialised.addShape(shape, color, transform)
    materialised.draw()
    const materialisedDraws = (
      materialisedGl.drawArrays as unknown as { mock: { calls: unknown[] } }
    ).mock.calls.length

    expect(materialisedDraws).toBe(plainDraws)
  })
})
