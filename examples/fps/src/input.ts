/**
 * Input — keyboard state for the FPS game.
 *
 * Mouse-look binding lives in the DOM adapter (@rasenjs/dom
 * `bindLookControls`); the camera's pure look state machine lives with the
 * camera (@rasenjs/gfx `createLookControls`). This module only re-exports
 * them for the app.
 */

export { bindLookControls, setupKeyboard } from '@rasenjs/dom'
