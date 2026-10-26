/**
 * The 2D world's art — walls and props — drawn as depth-tested quads inside the
 * 3D scene.
 *
 * This is the piece that replaces the 2D overlay passes. A wall used to be an
 * `<image>` on a second canvas, and whether it hid a character was decided by
 * comparing rectangles every frame (`wallCoversActor`); a prop in front of a
 * character was found the same way (`propStandsInFront`). Both guesses exist
 * only because two canvases have one ordering between them and no way to
 * interleave per pixel. Here the art is geometry in the same buffer as the
 * character, so the depth test answers the question exactly.
 *
 * A quad is built from the screen rectangle the 2D layer would have used
 * (`screenRectToWorld`), so the picture does not move by a pixel; only its depth
 * changes. The atlas rectangle becomes the quad's UVs, and `alphaCutoff` keeps
 * the transparent part of the art from writing depth — without it the hole around
 * the art would occlude everything behind it.
 */

import { element, unref, type GfxNode, type TextureHandle } from '@rasenjs/gfx'
import type { PropValue } from '@rasenjs/core'
import type { CameraConfig } from '@rasenjs/gfx'
import { toScreen } from '../iso'
import type { PropSlot } from '../game'
import type { WallCell } from '../world'
import { screenRectToWorld, type ScreenRect } from './sprite-quad'
import { wallOffsetOf } from './wall-depth'

/** Alpha below this is the art's hole rather than its body. */
const CUTOFF = 0.5

/** A rectangle of a texture page, in texels. */
export interface SpriteCrop {
  x: number
  y: number
  width: number
  height: number
}

/**
 * One piece of world art, described without a camera.
 *
 * `rect` is the screen rectangle the 2D layer drew it in, and `foot` is the tile
 * it stands on — everything else (which face of a wall, which frame of a sheet)
 * is already resolved. The layer turns `foot` into a depth, so it draws walls and
 * props alike without knowing which is which.
 */
export interface SpriteArt {
  rect: ScreenRect
  /** The tile point the art touches the ground at; the art sorts at its depth. */
  foot: { x: number; z: number }
  page: HTMLCanvasElement
  crop?: SpriteCrop
}

/** The sheet layout `propArt` needs: which frame is where. */
export interface SheetGeometry {
  frameWidth: number
  frameHeight: number
  columns: number
}

/** The camera the layer's canvas draws with, so the quads land where the walls were. */
export interface WorldQuadsProps {
  art: PropValue<readonly SpriteArt[]>
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
 * The wall cells as art.
 *
 * The 2D layer drew a cell's picture at `toScreen(x, y) - (halfW, halfH) +
 * (frameX, frameY)`; that is the rectangle this must reproduce. The depth point
 * is the face its DT1 orientation names (see `wall-depth.ts`): using the tile
 * CENTRE instead would put a near-side wall and a character in that tile at the
 * same depth, which is the z-fighting the 2D layer could only paper over.
 */
export function wallArt(cells: readonly WallCell[]): SpriteArt[] {
  const art: SpriteArt[] = []
  for (const cell of cells) {
    const crop = cell.art.crop
    const width = crop?.width ?? cell.art.canvas.width
    const height = crop?.height ?? cell.art.canvas.height
    if (width <= 0 || height <= 0) continue
    const point = toScreen(cell.x, cell.y)
    const face = wallOffsetOf(cell.art.orientation ?? 0)
    art.push({
      rect: {
        x: point.x - 80 + cell.art.frameX,
        y: point.y - 40 + cell.art.frameY,
        width,
        height,
      },
      foot: { x: cell.x + face.x, z: cell.y + face.z },
      page: cell.art.canvas,
      crop,
    })
  }
  return art
}

/**
 * The props as art, placed exactly where `PropSprite` put them.
 *
 * `slot.x`/`slot.y` are TILE coordinates — the same pair the depth sort and the
 * 3D layer use — so the screen rect comes from `toScreen`, and the bottom edge
 * sits on the tile's diamond (bottom-centre anchor).
 */
export function propArt(slots: readonly PropSlot[], geometry: SheetGeometry): SpriteArt[] {
  const { frameWidth, frameHeight, columns } = geometry
  const art: SpriteArt[] = []
  for (const slot of slots) {
    if (!slot.active) continue
    const page = slot.image
    // The slot type allows any CanvasImageSource; a texture needs real pixels.
    if (!(page instanceof HTMLCanvasElement)) continue
    const width = frameWidth * slot.scale
    const height = frameHeight * slot.scale
    if (width <= 0 || height <= 0 || columns <= 0) continue
    const point = toScreen(slot.x, slot.y)
    art.push({
      rect: { x: point.x - width / 2, y: point.y - height, width, height },
      foot: { x: slot.x, z: slot.y },
      page,
      crop: {
        x: (slot.frame % columns) * frameWidth,
        y: Math.floor(slot.frame / columns) * frameHeight,
        width: frameWidth,
        height: frameHeight,
      },
    })
  }
  return art
}

/**
 * View-space depth of the ground point at tile (x, z), in tile units.
 *
 * Measured along the camera's forward axis from the eye, which is the same
 * measure the models' fragments get from the view matrix — that is what lets one
 * depth buffer order art and geometry against each other. The art's height does
 * not enter: a sprite sorts by the tile it stands on, as the 2D painter did.
 */
export function viewDepthAt(x: number, z: number, camera: CameraConfig): number {
  const target = camera.target
  if (target === undefined) return 1
  const eye = { x: camera.x ?? 0, y: camera.y ?? 0, z: camera.z ?? 0 }
  const fx = target.x - eye.x
  const fy = target.y - eye.y
  const fz = target.z - eye.z
  const length = Math.hypot(fx, fy, fz) || 1
  const ax = x - eye.x
  const ay = -eye.y
  const az = z - eye.z
  return (ax * fx + ay * fy + az * fz) / length
}

/** The world's art as quads. Mount inside the 3D canvas, never on its own. */
export function WorldQuads(props: WorldQuadsProps) {
  return element({
    getBounds: () => null,
    draw: (node: GfxNode) => {
      const art = unref(props.art)
      if (art.length === 0) return
      const camera = props.camera()
      const width = unref(props.width)
      const height = unref(props.height)
      if (camera.target === undefined || width <= 0 || height <= 0) return

      const drawQuad = node.addShapeWith
      if (drawQuad === undefined) return

      for (const sprite of art) {
        const depth = viewDepthAt(sprite.foot.x, sprite.foot.z, camera)
        if (!(depth > 0)) continue
        const quad = screenRectToWorld(sprite.rect, depth, camera, width, height)

        // Two triangles over the four corners, in the order the corners come.
        for (let i = 0; i < 4; i += 1) {
          positions[i * 3] = quad.corners[i * 4]
          positions[i * 3 + 1] = quad.corners[i * 4 + 1]
          positions[i * 3 + 2] = quad.corners[i * 4 + 2]
        }
        // UVs come from where the picture sits in its page.
        const page = sprite.page
        const crop = sprite.crop
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
          // Nearest-neighbour: pixel art must not be smoothed, and an atlas
          // gutter only stops bleeding if the sampler never interpolates.
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
    // Repaint when the pan, the size or the art changes.
    deps: () => [unref(props.width), unref(props.height), props.camera(), unref(props.art)],
  })
}

/** The quads are already in world space, so their transform is the identity. */
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
