/**
 * Image loading — host-injected adapters (cross-platform).
 *
 * This package is platform-neutral: it must not call DOM APIs at runtime
 * (no `window` / `document` / `Image` / `fetch`). All platform access goes
 * through adapters injected by the host via `setImageAdapter` (or per-call
 * options). Browsers inject the DOM implementation (`createDomImageAdapter`);
 * native / test hosts inject their own or leave the adapter unset — loader
 * functions then throw honestly instead of touching platform globals.
 *
 * The adapter shapes use minimal structural typing (host objects need no
 * adaptation); no DOM lib types leak into this package's API surface.
 */

/** Minimal image surface the renderers consume (DOM Image satisfies it). */
export interface ImageLike {
  /** Decoded pixel width. */
  readonly width: number
  /** Decoded pixel height. */
  readonly height: number
}

/**
 * Host-injected image adapter. Implementations load a URL into an image-like
 * object usable as a texture source by the renderer packages.
 */
export interface ImageAdapter {
  loadImage: (url: string, crossOrigin?: string) => Promise<ImageLike>
  loadImageBitmap: (url: string, crossOrigin?: string) => Promise<ImageLike>
}

/** An image-like source usable as a texture by renderers. */
export type ImageSource = ImageLike

let adapter: ImageAdapter | null = null

/**
 * Set the platform image adapter. Hosts must call this before using the
 * loaders (the dom package does it at import time; native hosts inject their
 * own implementation).
 */
export function setImageAdapter(a: ImageAdapter | null): void {
  adapter = a
}

/** Ensure an adapter is present, or throw with an actionable message. */
function requireAdapter(): ImageAdapter {
  if (!adapter) {
    throw new Error(
      '[rasen/assets] No image adapter set. Call setImageAdapter({ ... }) in the host before loading images.'
    )
  }
  return adapter
}

/**
 * Load an image from a URL via the injected adapter.
 *
 * Supports `crossOrigin` for CORS requests (e.g. loading from a CDN).
 * Resolves once the image is decoded and ready to paint.
 */
export async function loadImage(url: string, crossOrigin?: string): Promise<ImageLike> {
  return requireAdapter().loadImage(url, crossOrigin)
}

/**
 * Load an image from a URL as a bitmap via the injected adapter
 * (hardware-accelerated where the host supports it).
 */
export async function loadImageBitmap(url: string, crossOrigin?: string): Promise<ImageLike> {
  return requireAdapter().loadImageBitmap(url, crossOrigin)
}

/**
 * Load multiple images in parallel and return them as a Map keyed by filename.
 *
 * Useful for multi-page Spine atlases where each page is a separate image.
 */
export async function loadImages(
  urls: Map<string, string>,
  crossOrigin?: string
): Promise<Map<string, ImageLike>> {
  const entries = [...urls.entries()]
  const loaded = await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        const img = await loadImage(url, crossOrigin)
        return [name, img] as [string, ImageLike]
      } catch {
        return null
      }
    })
  )
  const result = new Map<string, ImageLike>()
  for (const entry of loaded) {
    if (entry) result.set(entry[0], entry[1])
  }
  return result
}
