/**
 * Input — keyboard state + pointer-lock mouse look.
 *
 * Mouse-look binding lives in the DOM adapter (@rasenjs/dom
 * `bindLookControls`); the camera's pure look state machine lives with the
 * camera (@rasenjs/gfx `createLookControls`). This module only re-exports
 * them for the app.
 */

import type { SignalRef } from '@rasenjs/reactive-signals'

/**
 * The look state this app threads through its scene: the two look refs, the
 * pointer-lock flag, and the request/release hooks `bindLookControls` provides.
 */
export interface MouseControls {
  yaw: SignalRef<number>
  pitch: SignalRef<number>
  locked: SignalRef<boolean>
  request(): void
  release(): void
}

export { bindLookControls, setupKeyboard } from '@rasenjs/dom'
