/**
 * The wall cells, drawn as depth-tested quads inside the 3D scene.
 *
 * This is the piece that replaces the 2D overlay pass. A wall used to be an
 * `<image>` on a second canvas, and whether it hid a character was decided by
 * comparing rectangles every frame (`wallCoversActor`) — because two canvases
 * have one ordering between them and no way to interleave per pixel. Here the
 * wall is geometry in the same buffer as the character, at the depth its tile
 * face gives it, so the depth test answers the question exactly.
 *
 * Each quad is built from the screen rectangle the 2D layer would have used
 * (`screenRectToWorld`), so the picture does not move by a pixel; only its depth
 * changes. The atlas rectangle becomes the quad's UVs, and `alphaCutoff` keeps
 * the transparent part of the art from writing depth — without it the hole around
 * the wall art would occlude everything behind it.
 */

import { element, unref, type GfxNode, type TextureHandle } from '@rasenjs/gfx'
import type { PropValue } from '@rasenjs/core'
import type { CameraConfig } from '@rasenjs/gfx'
import { toScreen } from '../iso'
import type { WallCell } from '../world'
import { screenRectToWorld, type ScreenRect } from './sprite-quad'
import { wallOffsetOf } from './wall-depth'

/** Alpha below this is the art's hole rather than its body. */
const CUTOFF = 0.5

/** The camera the layer's canvas draws with, so the quads land where the walls were. */
export interface WallQuadsProps {
  cells: PropValue<readonly WallCell[]>
  camera: () => CameraConfig
  width: PropValue<number>
  height: PropValue<number>
}

/** One page's texture, created once per canvas and reused every frame. */
const pageTextures = new WeakMap<HTMLCanvasElement, TextureHandle>()

/** Scratch: four corners' positions, uvs and the index list, reused per quad. */
const positions = new Float32Array(4 * 3)
const uvs = new Float32Array(4 * 2)
const indices = new Uint16Array([0, 1, 2, 0, 2, 3])

/**
 * Where a wall's screen rectangle is, before it is pushed into 3D.
 *
 * The 2D layer drew a cell's picture at `toScreen(x, y) - (halfW, halfH) +
 * (frameX, frameY)`; that is the rectangle this must reproduce.
 */
function wallRect(cell: WallCell): ScreenRect {
  const point = toScreen(cell.x, cell.y)
  const crop = cell.art.crop
  return {
    x: point.x - 80 + cell.art.frameX,
    y: point.y - 40 + cell.art.frameY,
    width: crop?.width ?? cell.art.canvas.width,
    height: crop?.height ?? cell.art.canvas.height,
  }
}

/**
 * The view-space depth of a wall, in tile units.
 *
 * Taken along the camera's forward axis at the point where the wall meets the
 * ground: the face its DT1 orientation names (see `wall-depth.ts`). Using the
 * tile CENTRE instead would put a near-side wall and a character in that tile at
 * the same depth, which is the z-fighting the 2D layer could only paper over.
 */
function wallViewDepth(cell: WallCell, camera: CameraConfig): number {
  const offset = wallOffsetOf(cell.art.orientation ?? 0)
  const target = camera.target
  if (target === undefined) return 1
  const eye = { x: camera.x ?? 0, y: camera.y ?? 0, z: camera.z ?? 0 }
  const fx = target.x - eye.x
  const fy = target.y - eye.y
  const fz = target.z - eye.z
  const length = Math.hypot(fx, fy, fz) || 1
  const ax = cell.x + offset.x - eye.x
  const ay = -eye.y
  const az = cell.y + offset.z - eye.z
  return (ax * fx + ay * fy + az * fz) / length
}

/** The wall cells as quads. Mount inside the 3D canvas, never on its own. */
export function WallQuads(props: WallQuadsProps) {
  return element({
    getBounds: () => null,
    draw: (node: GfxNode) => {
      const cells = unref(props.cells)
      if (cells.length === 0) return
      const camera = props.camera()
      const width = unref(props.width)
      const height = unref(props.height)
      const target = camera.target
      if (target === undefined || width <= 0 || height <= 0) return

      const drawQuad = node.addShapeWith
      if (drawQuad === undefined) return

      for (const cell of cells) {
        const rect = wallRect(cell)
        if (rect.width <= 0 || rect.height <= 0) continue
        const depth = wallViewDepth(cell, camera)
        if (!(depth > 0)) continue
        const quad = screenRectToWorld(rect, depth, camera, width, height)

        // Two triangles over the four corners, in the order the corners come.
        for (let i = 0; i < 4; i += 1) {
          positions[i * 3] = quad.corners[i * 4]
          positions[i * 3 + 1] = quad.corners[i * 4 + 1]
          positions[i * 3 + 2] = quad.corners[i * 4 + 2]
        }
        // UVs come from where the picture sits in the atlas page.
        const page = cell.art.canvas
        const crop = cell.art.crop
        const u0 = crop === undefined ? 0 : crop.x / page.width
        const v0 = crop === undefined ? 0 : crop.y / page.height
        const u1 = crop === undefined ? 1 : (crop.x + crop.width) / page.width
        const v1 = crop === undefined ? 1 : (crop.y + crop.height) / page.height
        uvs[0] = u0; uvs[1] = v0
        uvs[2] = u1; uvs[3] = v0
        uvs[4] = u1; uvs[5] = v1
        uvs[6] = u0; uvs[7] = v1

        let texture = pageTextures.get(page)
        if (texture === undefined) {
          // Nearest-neighbour: pixel art must not be smoothed, and the atlas
          // gutter only stops bleeding if the sampler never interpolates across it.
          texture = node.createTexture(page, { minFilter: 0x2600, magFilter: 0x2600 })
          pageTextures.set(page, texture)
        }

        drawQuad.call(node, positions, { r: 1, g: 1, b: 1, a: 1 }, IDENTITY, {
          uv: uvs,
          texture,
          indices,
          alphaCutoff: CUTOFF,
          // The art is drawn with its own colours: the scene's tonemap would
          // wash out pixels the 2D layer showed exactly.
          skipTonemap: true,
        })
      }
    },
    // Repaint when the pan, the size or the cells change.
    deps: () => [unref(props.width), unref(props.height), props.camera(), unref(props.cells)],
  })
}

/** The quads are already in world space, so their transform is the identity. */
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
