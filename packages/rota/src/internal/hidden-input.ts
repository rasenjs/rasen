/**
 * Styles for the native input a form control hides inside itself.
 *
 * The control the user sees is a `<button>` (a checkbox, a switch, a radio),
 * and buttons do not participate in form submission. Each of those components
 * therefore renders a real `<input>` alongside its button when the consumer
 * gives it a `name`, so the form submits a value and the browser can run its
 * own validation. This is what keeps it out of the way: visually hidden, and
 * removed from the accessibility tree and the tab order (the button is the
 * control).
 *
 * Shared rather than copied per component: three copies of the same "hide a
 * native input" recipe would be three things to keep in step.
 */
export const HIDDEN_INPUT_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: '0'
} as const
