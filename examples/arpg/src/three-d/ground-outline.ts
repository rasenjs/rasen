/**
 * The ground outline of an actor — the shape its shadow is cut from.
 *
 * A shadow has to take the actor's shape, and only the model's own geometry
 * knows it: the outline is the convex hull of the model's vertices projected
 * onto the ground plane, i.e. its plan-view silhouette.
 *
 * ## Why the whole body, not the contact patch
 *
 * The first version used only the vertices within a thin band above the floor —
 * the feet. A standing character then cast a narrow strip (two boots) and a
 * moving one often fell back to a disc, which is exactly what "a stick, then a
 * circle" looked like.
 *
 * Retail does not use a blob at all: its build carries a dedicated shadow shader
 * family (`ps_models_shadows_p`, `ps_models_shadows_point_p` and their dither
 * variants, plus `ps_hair_shadows`), so a character is re-rendered through a
 * shadow pass and the shadow is the model's real silhouette. The silhouette
 * swept along the light is what `./shadow-shape` builds; this module supplies
 * the silhouette.
 *
 * The registry that used to live here — publishes keyed by the actor's ground
 * position — is gone. The shadow element draws BEFORE the model element, so on
 * every frame an actor moved (a walker moves every frame) the lookup missed and
 * the shadow fell back to a disc. The actor layer owns both and hands the merged
 * outline straight to the shadow.
 */

import { ConvexHull } from './convex-hull'

/**
 * The outline where a model stands on the ground.
 *
 * `points` is the convex hull of the model's silhouette in MODEL space (x, z
 * pairs). `top` is the model's height above its own floor, in model units: a
 * taller body throws a longer shadow.
 */
export interface GroundOutline {
  /** The hull's points (x, z pairs), counter-clockwise. */
  points: Float32Array
  /** The model's top, in model units above its own floor. */
  top: number
}

/** One actor's merged outline, ready for the shadow mesh. */
export interface MergedOutline {
  /** The hull's points (x, z pairs). */
  points: Float32Array
  /** How many points of {@link points} are valid. */
  count: number
  /** The tallest part's top, in model units. */
  top: number
}

/** The scratch the merge uses (the union of every part's outline points). */
let mergePoints = new Float32Array(0)
let mergeHull = new ConvexHull(0)
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
    mergeHull = new ConvexHull(Math.ceil(total * 1.5))
  }
  let at = 0
  for (const outline of outlines) {
    if (outline === undefined || outline.points.length === 0) continue
    mergePoints.set(outline.points, at)
    at += outline.points.length
  }
  if (mergedPoints.length < at) mergedPoints = new Float32Array(Math.ceil(at * 1.5))
  const count = mergeHull.build(mergePoints, at / 2, mergedPoints)
  return { points: mergedPoints, count, top }
}
