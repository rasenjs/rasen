/**
 * The geometry of the contact shadow, as a pure function of the actor's
 * footprint and the sun.
 *
 * Kept apart from the element (`./actor-shadow.ts`) so the shape can be
 * tested without a GL context: the numbers here are what decide whether the
 * shadow reads as a cast shadow (an actor's own outline, offset along the
 * sun, soft at the edges) or as a painted disc.
 */

import { ConvexHull } from './convex-hull'

/**
 * How far the outline is inset towards its centre, as a fraction.
 *
 * The band between the outline and the inset is the penumbra. A scale about
 * the centre keeps the inset polygon convex (a per-vertex offset could fold
 * it), and makes the band thin at the contact and wide at the far end.
 */
export const PENUMBRA_INSET = 0.85

/** The result of {@link buildShadowMesh}. */
export interface ShadowMesh {
  /** The number of vertices written. */
  vertexCount: number
  /** The number of indices written. */
  indexCount: number
  /** The outline's point count (the hull's corners). */
  outlineCount: number
  /** The outline's centre. */
  centreX: number
  centreZ: number
}

/**
 * Build the shadow's mesh from the actor's ground footprint.
 *
 * The footprint is the actor's outline where it meets the floor (model
 * space, already transformed into world space). It is swept by
 * `(offsetX, offsetZ)` — the sun's ground direction times the shadow's
 * reach — and the swept outline's hull is the shadow's shape.
 *
 * The mesh is the core (a fan from the outline's centre over the INSET
 * outline) plus the penumbra (the band between the inset outline and the
 * outline itself). The texture's V coordinate is 1 on the inset outline and
 * 0 on the outline, so the band's alpha ramps from the core's density down
 * to nothing at the edge; the U coordinate is the position along the
 * shadow, so the density falls off towards its far end.
 *
 * @param footprint the footprint's points (x, z pairs), in world space
 * @param footprintCount the footprint's point count
 * @param offsetX the sweep's X offset (world units)
 * @param offsetZ the sweep's Z offset (world units)
 * @param originX the actor's ground position (the shadow's near end)
 * @param originZ the actor's ground position (the shadow's near end)
 * @param hull the convex hull builder (the caller owns it)
 * @param swept scratch for the footprint and its swept copy
 * @param outline scratch for the hull's points
 * @param vertices the mesh's vertices (xyz), written from index 0
 * @param uvs the mesh's texture coordinates (uv), written from index 0
 * @param indices the mesh's triangle indices, written from index 0
 */
export function buildShadowMesh(
  footprint: Float32Array,
  footprintCount: number,
  offsetX: number,
  offsetZ: number,
  originX: number,
  originZ: number,
  hull: ConvexHull,
  swept: Float32Array,
  outline: Float32Array,
  vertices: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array,
): ShadowMesh {
  // The sweep: the shadow of a vertical body on flat ground. The hull of
  // the footprint and its offset copy is the swept outline.
  for (let i = 0; i < footprintCount; i += 1) {
    swept[i * 2] = footprint[i * 2]
    swept[i * 2 + 1] = footprint[i * 2 + 1]
    const at = (footprintCount + i) * 2
    swept[at] = footprint[i * 2] + offsetX
    swept[at + 1] = footprint[i * 2 + 1] + offsetZ
  }
  const outlineCount = hull.build(swept, footprintCount * 2, outline)
  if (outlineCount < 3) return { vertexCount: 0, indexCount: 0, outlineCount, centreX: 0, centreZ: 0 }

  let centreX = 0
  let centreZ = 0
  for (let i = 0; i < outlineCount; i += 1) {
    centreX += outline[i * 2]
    centreZ += outline[i * 2 + 1]
  }
  centreX /= outlineCount
  centreZ /= outlineCount

  // The axial parameter of every outline point: 0 at the actor's feet, 1 at
  // the far end of the cast shadow.
  const reach = Math.hypot(offsetX, offsetZ)
  const axisX = reach > 1e-6 ? offsetX / reach : 0
  const axisZ = reach > 1e-6 ? offsetZ / reach : 0

  // The mesh: the centre, then the inset outline (the core's rim), then the
  // outline itself (the penumbra's outer edge). The two rings are written as
  // blocks so the fan and the band can index them directly.
  vertices[0] = centreX
  vertices[1] = 0
  vertices[2] = centreZ
  uvs[0] = axialParameter(centreX, centreZ, originX, originZ, axisX, axisZ, reach)
  uvs[1] = 1

  for (let i = 0; i < outlineCount; i += 1) {
    const x = outline[i * 2]
    const z = outline[i * 2 + 1]
    const insetX = centreX + (x - centreX) * PENUMBRA_INSET
    const insetZ = centreZ + (z - centreZ) * PENUMBRA_INSET
    const u = axialParameter(x, z, originX, originZ, axisX, axisZ, reach)
    // The inset vertex (the core's rim): the ramp's full-density end.
    const at = 1 + i
    vertices[at * 3] = insetX
    vertices[at * 3 + 1] = 0
    vertices[at * 3 + 2] = insetZ
    uvs[at * 2] = u
    uvs[at * 2 + 1] = 1
  }
  for (let i = 0; i < outlineCount; i += 1) {
    const x = outline[i * 2]
    const z = outline[i * 2 + 1]
    const u = axialParameter(x, z, originX, originZ, axisX, axisZ, reach)
    // The outline vertex (the penumbra's outer edge): fully transparent.
    const at = 1 + outlineCount + i
    vertices[at * 3] = x
    vertices[at * 3 + 1] = 0
    vertices[at * 3 + 2] = z
    uvs[at * 2] = u
    uvs[at * 2 + 1] = 0
  }
  const vertex = 1 + outlineCount * 2

  // The core is a fan from the centre over the inset outline; the penumbra
  // is the band between the inset outline and the outline.
  let index = 0
  for (let i = 0; i < outlineCount; i += 1) {
    const next = (i + 1) % outlineCount
    const inner = 1 + i
    const innerNext = 1 + next
    const outer = 1 + outlineCount + i
    const outerNext = 1 + outlineCount + next
    indices[index++] = 0
    indices[index++] = inner
    indices[index++] = innerNext
    indices[index++] = outer
    indices[index++] = outerNext
    indices[index++] = innerNext
    indices[index++] = outer
    indices[index++] = innerNext
    indices[index++] = inner
  }

  return { vertexCount: vertex, indexCount: index, outlineCount, centreX, centreZ }
}

/**
 * Where a point sits along the shadow's axis: 0 at the actor's feet, 1 at
 * the far end of the cast shadow.
 */
export function axialParameter(
  x: number,
  z: number,
  originX: number,
  originZ: number,
  axisX: number,
  axisZ: number,
  reach: number,
): number {
  if (reach <= 1e-6) return 0
  const t = ((x - originX) * axisX + (z - originZ) * axisZ) / reach
  return t < 0 ? 0 : t > 1 ? 1 : t
}
