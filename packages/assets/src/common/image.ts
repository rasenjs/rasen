/**
 * Image loading utilities — cross-environment (browser / Node.js).
 *
 * In the browser, `loadImage` returns an `HTMLImageElement` and
 * `loadImageBitmap` returns an `ImageBitmap`. In Node.js these are not
 * available, so the functions throw — callers should use `fs.readFile` +
 * canvas-based decoding instead.
 */

/** Whether we're running in a browser context. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/** An image-like source usable as a texture by renderers. */
export type ImageSource = HTMLImageElement | ImageBitmap

/**
 * Load an image from a URL and return an `HTMLImageElement`.
 *
 * Supports `crossOrigin` for CORS requests (e.g. loading from a CDN).
 * Resolves once the image is decoded and ready to paint.
 */
export async function loadImage(
  url: string,
  crossOrigin?: string
): Promise<HTMLImageElement> {
  if (!isBrowser()) {
    throw new Error('loadImage is only available in browser environments')
  }
  const img = new Image()
  if (crossOrigin) img.crossOrigin = crossOrigin
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Load an image from a URL and return an `ImageBitmap` (hardware-accelerated).
 *
 * Falls back to `loadImage` if `createImageBitmap` is not available.
 */
export async function loadImageBitmap(
  url: string,
  crossOrigin?: string
): Promise<ImageBitmap> {
  if (!isBrowser() || typeof createImageBitmap === 'undefined') {
    const img = await loadImage(url, crossOrigin)
    // Cast is safe: in browsers that support ImageBitmap, HTMLImageElement
    // is assignable. In environments that don't, this path is never reached.
    return img as unknown as ImageBitmap
  }
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to fetch image: ${url} (${resp.status})`)
  return createImageBitmap(await resp.blob())
}

/**
 * Load multiple images in parallel and return them as a Map keyed by filename.
 *
 * Useful for multi-page Spine atlases where each page is a separate image.
 */
export async function loadImages(
  urls: Map<string, string>,
  crossOrigin?: string
): Promise<Map<string, ImageSource>> {
  const entries = [...urls.entries()]
  const loaded = await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        const img = await loadImage(url, crossOrigin)
        return [name, img] as [string, ImageSource]
      } catch {
        return null
      }
    })
  )
  const result = new Map<string, ImageSource>()
  for (const entry of loaded) {
    if (entry) result.set(entry[0], entry[1])
  }
  return result
}