/**
 * One clock for the interface's own animations.
 *
 * The layouts animate widgets themselves: an `AnimatedImageWidget` states `fps`,
 * and `createAnimationClock` in `d2/ui/screen.tsx` turns that into a frame index.
 * It needs a monotonically increasing number of seconds, and nothing supplied one —
 * the front end's ribbon buttons and the HUD's globes were frozen on frame 0 because
 * the `elapsed` signal they read was only ever written by a caller that did not exist.
 *
 * A single signal rather than one per screen: two screens are never on at once, the
 * value has no meaning beyond "how much time has passed", and one animation-frame
 * loop is cheaper than one per consumer. `startUiClock` is idempotent, so any screen
 * may call it.
 */

import { ref, type SignalRef } from '@rasenjs/reactive-signals'

/** Seconds since the clock started. Read by `createAnimationClock`. */
export const uiElapsed: SignalRef<number> = ref(0)

let running = false
let last = 0

/** Starts the loop, once. Safe to call from every screen that animates. */
export function startUiClock(): void {
  if (running || typeof requestAnimationFrame === 'undefined') return
  running = true
  const tick = (now: number): void => {
    // The first frame has no previous timestamp, so it contributes nothing rather
    // than a spike of `now` milliseconds.
    if (last !== 0) uiElapsed.value = uiElapsed.value + (now - last) / 1000
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Pauses the value, for a test or for a backgrounded tab. */
export function resetUiClock(): void {
  uiElapsed.value = 0
  last = 0
}
