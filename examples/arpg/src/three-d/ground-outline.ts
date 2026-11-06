/**
 * Merging an actor's per-part silhouettes into one ground outline.
 *
 * A character is several meshes (head, torso, legs, arms) but casts ONE shadow,
 * so the parts' plan-view hulls are merged into one and the tallest part decides
 * how far the shadow reaches. The merge reuses one scratch pair, so the result
 * is valid only until the next call — a caller that needs to keep it copies the
 * points out.
 */

import { convexHull } from '@rasenjs/math'

/**
 * The outline where a model stands on the ground.
 *
 * `points` is the convex hull of the model's silhouette in MODEL space (x, z
 * pairs). `top` is the model's height above its own floor, in model units: a
 * taller body throws a longer shadow.
 */
export interface GroundOutline {
  points: Float32Array
  top: number
}



/**
 * The outline where a model stands on the ground.
 *
 * `points` is the convex hull of the model's silhouette in MODEL space (x, z
 * pairs). `top` is the model's height above its own floor, in model units: a
 * taller body throws a longer shadow.
 */
export interface MergedOutline extends GroundOutline {
  /** How many points of `points` are valid. */
  count: number
}

/** The scratch the merge uses (the union of every part's outline points). */
let mergePoints = new Float32Array(0)
let mergedPoints = new Float32Array(0)

/**
 * Merge one actor's part outlines into a single footprint and height.
 *
 * A character is several models (head, torso, legs, arms); its shadow is one
 * shape. The height is the TALLEST part's, because that is what decides how far
 * the shadow reaches across the ground.
 *
 * The result is valid until the next call — the actor layer recomputes it per
 * group per frame and the shadow reads it immediately.
 */
export function mergeOutlines(outlines: ReadonlyArray<GroundOutline | undefined>): MergedOutline {
  let top = 0
  let total = 0
  for (const outline of outlines) {
    if (outline === undefined) continue
    if (outline.top > top) top = outline.top
    total += outline.points.length / 2
  }
  if (total === 0) return { points: mergedPoints, count: 0, top }

  if (mergePoints.length < total * 2) {
    mergePoints = new Float32Array(Math.ceil(total * 2 * 1.5))
  }
  let at = 0
  for (const outline of outlines) {
    if (outline === undefined || outline.points.length === 0) continue
    mergePoints.set(outline.points, at)
    at += outline.points.length
  }
  if (mergedPoints.length < at) mergedPoints = new Float32Array(Math.ceil(at * 1.5))
  const count = convexHull(mergePoints, at / 2, mergedPoints)
  return { points: mergedPoints, count, top }
}
