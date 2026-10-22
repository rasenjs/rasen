/**
 * The scene's lighting rig — the ONE place the key light, the fill, the
 * ambient and the shadow's geometry are defined.
 *
 * ## Why the light is defined in CAMERA space
 *
 * The actor camera is fixed: yaw 45°, pitch 30° (`./projection.ts`), so the
 * view direction and the screen basis are constants of the scene. A light
 * expressed in that basis ("from the upper left of the screen", "from the
 * camera's side") stays put no matter where the camera pans, which is what
 * an isometric game needs: the sun does not follow the camera.
 *
 * The 2D layer cannot be the reference. It never enables the batch's
 * lighting path at all — `u_useLighting` is only set when a shape carries
 * normals, and no 2D shape in this game does (`grep -rn normals src/d2`
 * finds none) — so the batch's `u_lightDir` constant is dead code here, and
 * the 2D characters are drawn as flat painted shapes
 * (`../sprites.ts`'s `drawActorFrame` fills rects and ellipses from a
 * palette, with no directional shading at all). The 3D actors therefore need
 * their own key light, and it must be defined against the camera.
 *
 * ## Why the key light is not the batch's
 *
 * `packages/gfx` sets `u_lightDir = (-0.906308, 0.323744, -0.271654)` — a
 * direction that points AWAY from the camera (the camera sits at +X/+Y/+Z),
 * i.e. a back light. Measured on the amazon's own torso mesh, that vector
 * leaves only 27–52 % of the camera-facing vertices with any diffuse term at
 * all: the side the player looks at is lit by ambient alone, which is
 * exactly the "flat" look the HD actors had. The key light here is on the
 * camera's side instead (see {@link LIGHT_DIRECTION}).
 */

/** The camera's right axis in world space (yaw 45°, pitch 30°). */
const CAMERA_RIGHT: readonly [number, number, number] = [0.70710678, 0, -0.70710678]

/** The camera's up axis in world space (the world up, tilted by the pitch). */
const CAMERA_UP: readonly [number, number, number] = [-0.35355339, 0.8660254, -0.35355339]

/** The horizontal direction from the scene towards the camera. */
const CAMERA_TOWARD: readonly [number, number, number] = [0.70710678, 0, 0.70710678]

/** Normalize a 3-vector. */
function normalize(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2])
  return length === 0 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * The key light, from the surface TOWARDS the light.
 *
 * Built in camera space: 45 % to the screen's left, 80 % towards the
 * screen's top, 55 % towards the camera. That is the classic isometric
 * three-quarter key — it lights the faces the player sees (the camera-side
 * component) while leaving the far side in shade, so the silhouette reads
 * as a solid form rather than a flat cut-out.
 *
 * Measured on the amazon torso: 27–52 % of the camera-facing vertices were
 * lit by the batch's back light; this direction lights 68–89 % of them
 * (per mesh: body 68 %, armour 68 %, straps 76 % / 89 %).
 */
export const LIGHT_DIRECTION: readonly [number, number, number] = normalize([
  -0.45 * CAMERA_RIGHT[0] + 0.8 * CAMERA_UP[0] + 0.55 * CAMERA_TOWARD[0],
  -0.45 * CAMERA_RIGHT[1] + 0.8 * CAMERA_UP[1] + 0.55 * CAMERA_TOWARD[1],
  -0.45 * CAMERA_RIGHT[2] + 0.8 * CAMERA_UP[2] + 0.55 * CAMERA_TOWARD[2],
])

/**
 * The key light's radiance.
 *
 * The PBR path divides the albedo by π (the diffuse BRDF), so a radiance of
 * `k·π` contributes `k·albedo·NdotL`. `k = 0.55` puts the lit side of a
 * character at the ALBEDO's own level — which is where the 2D art sits: the
 * 2D sprites are the retail textures drawn through the batch's unlit path,
 * so they land at `albedo` (tonemapped). A character lit any brighter than
 * that reads as a pale cut-out pasted over the scene; any darker reads as a
 * hole in it.
 *
 * The batch's own lit path uses `0.8` on top of its ambient, but the 2D
 * world never takes that path (no shape carries normals, so `u_useLighting`
 * stays 0), so the batch's ambient constant is not the reference here.
 */
export const LIGHT_COLOR: readonly [number, number, number] = [
  0.55 * Math.PI,
  0.55 * Math.PI,
  0.55 * Math.PI,
]

/**
 * The fill light, from the surface towards the light.
 *
 * A weak bounce from the screen's right and slightly from below: it lifts
 * the side the key leaves in shade so the shadow side keeps some form
 * instead of collapsing into the ambient.
 */
export const FILL_DIRECTION: readonly [number, number, number] = normalize([
  0.7 * CAMERA_RIGHT[0] + 0.2 * CAMERA_UP[0] + 0.35 * CAMERA_TOWARD[0],
  0.7 * CAMERA_RIGHT[1] + 0.2 * CAMERA_UP[1] + 0.35 * CAMERA_TOWARD[1],
  0.7 * CAMERA_RIGHT[2] + 0.2 * CAMERA_UP[2] + 0.35 * CAMERA_TOWARD[2],
])

/** The fill's radiance — a quarter of the key's, so it never flattens it. */
export const FILL_COLOR: readonly [number, number, number] = [
  0.12 * Math.PI,
  0.12 * Math.PI,
  0.12 * Math.PI,
]

/**
 * The ambient from the sky (the hemisphere's +Y pole).
 *
 * The hemispheric ambient replaced a single flat ambient value. A uniform
 * ambient gives every surface the same fill, which is another way of saying
 * "no light direction" — the characters looked painted on. Splitting the
 * ambient into a sky and a ground term makes the fill depend on the
 * surface's orientation, so a shoulder and the underside of a chin are no
 * longer the same colour.
 *
 * The pair averages 0.5: with the key's 0.55, a lit surface reaches the
 * albedo's own level (the 2D art's exposure) and a shaded one keeps about
 * half of it.
 */
export const AMBIENT_SKY: readonly [number, number, number] = [0.66, 0.7, 0.79]

/** The ambient from the ground (the hemisphere's -Y pole): dimmer, warmer. */
export const AMBIENT_GROUND: readonly [number, number, number] = [0.34, 0.31, 0.26]

/**
 * The rim light's colour.
 *
 * A cool sky-coloured edge that separates the actor from the background it
 * stands on. It only shows on the key-lit side, so it reads as a lit edge
 * rather than an outline.
 */
export const RIM_COLOR: readonly [number, number, number] = [0.16, 0.2, 0.28]

/**
 * Direction from the surface towards the camera.
 *
 * The camera is orthographic with a fixed yaw 45° / pitch 30°
 * (`./projection.ts`), so the view vector is a constant of the whole scene.
 */
export const CAMERA_DIRECTION: readonly [number, number, number] = [0.6123724, 0.5, 0.6123724]

/** The key light's elevation above the ground, in radians. */
export const LIGHT_ELEVATION: number = Math.asin(LIGHT_DIRECTION[1])

/**
 * The ground direction a shadow falls along: away from the light.
 *
 * Horizontal (XZ) only, unit length. The shadow of a body reaches further
 * along this axis the lower the sun is.
 */
export const SHADOW_DIRECTION: readonly [number, number] = (() => {
  const x = -LIGHT_DIRECTION[0]
  const z = -LIGHT_DIRECTION[2]
  const length = Math.hypot(x, z)
  return length === 0 ? [0, 0] : [x / length, z / length]
})()

/**
 * How far the shadow of a body `height` tall reaches along
 * {@link SHADOW_DIRECTION}, in the same units as `height`.
 *
 * A vertical edge of height h casts a shadow of length h / tan(elevation)
 * on flat ground — the same relation the retail shadows have, which is why
 * the sun's elevation decides how long the actors' shadows are.
 */
export function shadowReach(height: number): number {
  const tangent = Math.tan(LIGHT_ELEVATION)
  return tangent > 1e-4 ? height / tangent : 0
}
