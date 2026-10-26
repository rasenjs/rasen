/**
 * Packing many tile pictures into a few atlases.
 *
 * A baked area holds one composed picture per wall cell — 380 of them for the
 * town, 1,721 for a dungeon — and keeping a canvas for each is what pushed the
 * page past the browser's canvas budget, where it starts handing back EMPTY
 * canvases with no error (measured: 7,000 cell-sized canvases, every sample
 * blank, `fillRect` throwing nothing). Packing them into a few pages cuts the
 * object count from hundreds to a handful.
 *
 * A page is also exactly what the 3D layer wants: one texture and a UV rectangle
 * per picture, instead of one texture per picture.
 *
 * The packing itself is pure arithmetic over sizes, so it can be tested without a
 * canvas; `blitIntoPages` is the part that needs one.
 */

/** Where one picture sits inside a page. */
export interface AtlasRect {
  /** Which page the picture is on. */
  page: number
  x: number
  y: number
  width: number
  height: number
}

/** The pages, plus one rectangle per input picture, in input order. */
export interface PackedAtlas {
  pages: Array<{ width: number; height: number }>
  rects: AtlasRect[]
}

/** A picture's size, and the room a one-pixel gutter adds around it. */
interface Size {
  width: number
  height: number
}

/**
 * A one-pixel gutter between pictures.
 *
 * Neighbours in an atlas bleed into each other when the sampler interpolates
 * across the seam, and pixel art is scaled on screen, so it always interpolates.
 * One transparent pixel is enough to stop it.
 */
const GUTTER = 1

/**
 * Shelf-pack pictures into pages.
 *
 * Pictures are laid in rows ("shelves") tall as the tallest picture on that
 * shelf, which is the standard trade for tile art: near-optimal for a set of
 * similar heights and O(n log n) instead of a search. Tallest first, because a
 * shelf's wasted space is its height above the short pictures on it.
 *
 * A page that cannot fit the next picture is closed and a new one started, so the
 * result is bounded by `pageSize` in both directions rather than growing without
 * limit.
 *
 * @param sizes the picture sizes, in input order
 * @param pageSize the largest page edge (a square; GPU limits are per-edge)
 * @returns the pages used and one rectangle per input, in input order
 */
export function packAtlas(sizes: readonly Size[], pageSize = 2048): PackedAtlas {
  const pages: Array<{ width: number; height: number }> = []
  const rects: AtlasRect[] = new Array(sizes.length)
  if (sizes.length === 0) return { pages, rects }

  // Tallest first: a shelf wastes the height above its shortest picture, and
  // putting the tall ones down first keeps that waste to one shelf instead of
  // spreading it across all of them.
  const order = sizes.map((_size, index) => index)
  order.sort((a, b) => sizes[b].height - sizes[a].height || sizes[b].width - sizes[a].width)

  let page = 0
  let shelfY = 0
  let shelfHeight = 0
  let shelfX = 0

  const startPage = (): void => {
    pages.push({ width: 0, height: 0 })
    shelfY = 0
    shelfHeight = 0
    shelfX = 0
  }
  startPage()

  for (const index of order) {
    const { width, height } = sizes[index]
    // A picture that cannot fit any page is clamped: a caller with an oversized
    // tile gets a cropped one rather than an exception mid-bake.
    const w = Math.min(width, pageSize)
    const h = Math.min(height, pageSize)
    if (shelfHeight > 0 && shelfX + w + GUTTER > pageSize) {
      // The shelf is full: start the next one.
      shelfY += shelfHeight + GUTTER
      shelfX = 0
      shelfHeight = 0
    }
    if (shelfY + h + GUTTER > pageSize) {
      // The page is full: start the next one.
      page += 1
      startPage()
    }
    rects[index] = { page, x: shelfX, y: shelfY, width: w, height: h }
    const current = pages[page]
    current.width = Math.max(current.width, shelfX + w)
    current.height = Math.max(current.height, shelfY + h)
    shelfX += w + GUTTER
    shelfHeight = Math.max(shelfHeight, h)
  }

  return { pages, rects }
}

/**
 * Blit pictures into the pages `packAtlas` laid out.
 *
 * Each page is allocated once at the size the packing says it needs, which is
 * what keeps the atlas from being a full square of mostly empty pixels.
 *
 * @param pictures the source canvases, in the order the sizes were taken from
 * @param packed the result of {@link packAtlas} for those pictures
 * @returns one canvas per page
 */
export function blitIntoPages(
  pictures: readonly HTMLCanvasElement[],
  packed: PackedAtlas,
): HTMLCanvasElement[] {
  const pages = packed.pages.map((size) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, size.width)
    canvas.height = Math.max(1, size.height)
    return canvas
  })
  const contexts = pages.map((canvas) => canvas.getContext('2d'))
  packed.rects.forEach((rect, index) => {
    const target = contexts[rect.page]
    const source = pictures[index]
    if (!target || !source) return
    target.drawImage(source, 0, 0, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height)
  })
  return pages
}
