/**
 * Viewport size, as signals.
 *
 * The canvas' logical size follows the window and the camera centres on the
 * hero, so "where is the middle of the screen" is read here by both the scene
 * tree (canvas size) and the simulation (camera target).
 */

import { ref } from '@rasenjs/reactive-signals'

export const viewWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
export const viewHeight = ref(typeof window === 'undefined' ? 720 : window.innerHeight)

function sync(): void {
  viewWidth.value = window.innerWidth
  viewHeight.value = window.innerHeight
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', sync)
}

/**
 * The same viewport, read through the signals instead of copied.
 *
 * The layout engine measures a screen by multiplying the layout's units by
 * `height / 2160`, so a viewport that was copied at load freezes the whole
 * interface at the size the window happened to have — resizing the window moved the
 * scene and left the buttons where they were. Passing this object instead means
 * every `resolveScreen` call reads the current size, and the components that draw it
 * re-mount on {@link viewportKey}, which is what turns the read into a redraw.
 */
export const liveViewport = {
  get width(): number {
    return viewWidth.value
  },
  get height(): number {
    return viewHeight.value
  },
}

/**
 * The current viewport size as a stable one-item list, for `each`.
 *
 * One object per distinct size, so a re-read that changes nothing compares equal by
 * identity and does not remount the interface — while a real resize does.
 */
const viewportSizes = new Map<string, { width: number; height: number }>()

export function viewportKey(): Array<{ width: number; height: number }> {
  const width = viewWidth.value
  const height = viewHeight.value
  const key = `${width}x${height}`
  let entry = viewportSizes.get(key)
  if (entry === undefined) {
    entry = { width, height }
    viewportSizes.set(key, entry)
  }
  return [entry]
}
