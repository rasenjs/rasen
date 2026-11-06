/**
 * DOM image adapter for core's image adapter slot — the browser-side
 * implementation hosts register. Registered by the canvas component
 * (`components/canvas.ts`) when an app renders a `<canvas>`: that module is
 * the only DOM entry that pulls the canvas/gfx renderers (and with them
 * assets) in, so apps that never touch canvas bundle neither assets nor this
 * adapter. Native hosts register their own adapter instead (the assets
 * package itself never touches DOM globals).
 */

import type { ImageAdapter, ImageLike } from '@rasenjs/core'

const domImageAdapter: ImageAdapter = {
  loadImage(url: string, crossOrigin?: string): Promise<ImageLike> {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
      img.src = url
    })
  },

  async loadImageBitmap(url: string, crossOrigin?: string): Promise<ImageLike> {
    if (typeof createImageBitmap === 'undefined') return this.loadImage(url, crossOrigin)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to fetch image: ${url} (${resp.status})`)
    return createImageBitmap(await resp.blob())
  },
}

export { domImageAdapter }
