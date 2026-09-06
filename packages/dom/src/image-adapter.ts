/**
 * DOM image adapter for @rasenjs/assets — the browser-side implementation of
 * the host injection point. Importing this module auto-registers it, so DOM
 * apps get image loading for free; native hosts register their own adapter
 * instead (the assets package itself never touches DOM globals).
 */

import { setImageAdapter, type ImageAdapter, type ImageLike } from '@rasenjs/assets'

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

setImageAdapter(domImageAdapter)

export { domImageAdapter }
