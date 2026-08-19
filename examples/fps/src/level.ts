/**
 * Level — recreates the Kenney FPS original scene layout.
 *
 * All positions/rotations/scaling match the Godot .tscn file exactly.
 * Uses mesh geometry (from loaded GLB models) instead of box primitives.
 */

/** Wall type for physics collision (axis-aligned box). */
export interface Wall {
  x: number; y: number; z: number
  w: number; h: number; d: number
}

// Level layout types

export interface LevelObject {
  model: string
  x: number; y: number; z: number
  rx?: number; ry?: number; rz?: number
  sx?: number; sy?: number; sz?: number
}

export interface LevelEnemy {
  x: number; y: number; z: number
}

/** Ground + platform + wall layout. */
export function getLevelObjects(): LevelObject[] {
  return [
    // Ground
    { model: 'platform-large-grass', x: 0, y: -0.5, z: 0 },
    { model: 'platform-large-grass', x: -2, y: 0.5, z: -6, ry: 0.258819 },
    { model: 'platform-large-grass', x: -6, y: 1, z: 2.5, ry: -0.258819 },
    { model: 'platform-large-grass', x: 12, y: 2.5, z: -5, ry: -0.5 },
    { model: 'platform-large-grass', x: 5, y: 0.5, z: 5.5, ry: 0.258819 },

    // Platforms (floating)
    { model: 'platform', x: -2.5, y: 0, z: 6.5 },
    { model: 'platform', x: -6.5, y: 2.5, z: -2.5 },
    { model: 'platform', x: 2.5, y: 3, z: -3.5 },
    { model: 'platform', x: 7, y: 1, z: -2, ry: 0.707107 },

    // Walls
    { model: 'wall-low', x: -1.92, y: 1.05, z: -6.9, ry: 0.258819 },
    { model: 'wall-low', x: 6.08, y: 1.05, z: 6.6, ry: -1.0 },
    { model: 'wall-high', x: -5.5, y: 1.5, z: 4 },
    { model: 'wall-high', x: 11.5, y: 3, z: -5.5, ry: 0.707107 },
  ]
}

/**
 * Generate collision boxes for all level objects.
 * Uses model bounding boxes + rotation-aware AABB.
 */
export function getLevelWalls(): Wall[] {
  const MODEL_SIZES: Record<string, [number, number, number]> = {
    'platform-large-grass': [5.2, 0.5, 5.2],
    'platform':            [2.2, 0.5, 2.2],
    'wall-low':            [2.2, 0.8, 0.7],
    'wall-high':           [1.5, 1.7, 0.7],
  }
  return getLevelObjects().map(obj => {
    const size = MODEL_SIZES[obj.model] ?? [1, 1, 1]
    // Approximate AABB for rotated objects: use diagonal of XZ plane
    const s = Math.sqrt(size[0] * size[0] + size[2] * size[2])
    return { x: obj.x, y: obj.y + size[1] / 2, z: obj.z, w: s, h: size[1], d: s }
  })
}

/** Enemy spawn positions. */
export function getEnemySpawns(): LevelEnemy[] {
  return [
    { x: -3.5, y: 2.5, z: -6 },
    { x: -9.5, y: 2.5, z: 1.5 },
    { x: 5.5, y: 3.5, z: 9 },
    { x: 15.5, y: 4, z: -7.5 },
  ]
}
