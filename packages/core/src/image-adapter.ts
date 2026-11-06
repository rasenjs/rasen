/**
 * Platform image adapter slot.
 *
 * Core owns the slot (same family as the reactive runtime slot): hosts
 * register their decoder once with `setImageAdapter`, data-layer packages
 * read it with `getImageAdapter`. Keeping the slot here means a host
 * registers through a dependency it already has, and packages like
 * `@rasenjs/assets` stay pure consumers — they never own platform glue.
 */

/**
 * Minimal image surface the renderers consume (a DOM `Image` satisfies it).
 * Structural typing only: host objects need no adaptation, and no DOM lib
 * types leak into this API surface.
 */
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

let imageAdapter: ImageAdapter | null = null

/** Set the platform image adapter (hosts call this once, or per-surface). */
export function setImageAdapter(adapter: ImageAdapter | null): void {
  imageAdapter = adapter
}

/** The registered adapter, or null when the host has not registered one. */
export function getImageAdapter(): ImageAdapter | null {
  return imageAdapter
}
