/**
 * Shared scene spec — the fairness contract of this benchmark.
 *
 * EVERY target page (official-webgl / pixi / rasen-webgl / official-canvas /
 * rasen-canvas) loads exactly the same skeleton asset and animates it with the
 * same deterministic time stepping. The ONLY variable between targets is the
 * rendering library / runtime.
 *
 * Pairing rule (canvas vs canvas, gl vs gl):
 *   WebGL group : spine-ts official (SceneRenderer)  |  pixi-spine  |  Rasen webgl
 *   Canvas group: spine-ts official (canvas runtime) |  Rasen canvas-2d
 */

/** Logical canvas size, identical for every target. */
export const CANVAS_W = 1024
export const CANVAS_H = 1024

/** Skeleton asset (NIKKE c310, Spine 4.1.20 binary — a large, mesh-heavy rig). */
export const ASSET_SKEL = '/c310_00.skel'
export const ASSET_ATLAS = '/c310_00.atlas'
export const ASSET_PNG = '/c310_00.png'

/** Fixed logical time step per animation tick (deterministic across targets). */
export const FIXED_DELTA = 1 / 60

/** Animation to play. First animation of c310 is used when overridden. */
export const ANIM_NAME: string | null = null

/** Instance-count sweep for the sustained-throughput curve. */
export const INSTANCE_COUNTS = [1, 10, 25, 50]

/** Grid position for instance i of n: 0-centered column/row offsets. */
export function gridPos(i: number, n: number): { x: number; y: number } {
  if (n <= 1) return { x: 0, y: 0 }
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return {
    x: (i % cols) - (cols - 1) / 2,
    y: Math.floor(i / cols) - (rows - 1) / 2
  }
}

/**
 * Camera fit: same convention as examples/nikke-viewer — the skeleton bounds
 * are fit into the canvas with factor 0.92. Targets that need a plain camera
 * use fitCamera(); PixiJS positions containers in screen space.
 */
export const FIT_FACTOR = 0.92

export interface CameraFit {
  zoom: number
  cx: number
  cy: number
}

/** Camera computed from skeleton data bounds (world units). */
export function fitCamera(
  bounds: { x: number; y: number; width: number; height: number },
  n: number
): CameraFit {
  // Zoom out as instances tile the grid: grid spans ~cols x in world units.
  const spread = n <= 1 ? 1 : Math.ceil(Math.sqrt(n)) * 1.6
  const w = Math.max(bounds.width, 1) * spread
  const h = Math.max(bounds.height, 1) * spread
  const zoom = Math.min(CANVAS_W / w, CANVAS_H / h) * FIT_FACTOR
  return {
    zoom,
    cx: (bounds.x ?? 0) + (bounds.width ?? 0) / 2,
    cy: (bounds.y ?? 0) + (bounds.height ?? 0) / 2
  }
}
