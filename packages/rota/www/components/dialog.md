# Dialog

A modal panel the user can dismiss.

<RotaDemo name="dialog" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div>` | Owns the open value. Props: `defaultOpen`, `open`, `onOpenChange`. |
| `Trigger` | `<button>` | Opens the dialog; reports `aria-haspopup="dialog"` and `aria-expanded`. |
| `Overlay` | `<div>` | Hidden while closed. A press on it dismisses. |
| `Content` | `<div role="dialog" aria-modal="true">` | The panel. Traps the keyboard and manages focus. |
| `Title` | `<h2>` | Supplies `aria-labelledby`. |
| `Description` | `<p>` | Supplies `aria-describedby`. |
| `Close` | `<button aria-label="Close">` | Dismisses. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `open` \| `closed` | On root, trigger, overlay and content. |
| `aria-expanded` | `true` \| `false` | On the trigger. |
| `hidden` | present while closed | On overlay and content. |

## Dismissing

| Gesture | Default | How to veto |
| --- | --- | --- |
| `Escape` | dismisses | `event.preventDefault()` in `onEscapeKeyDown` |
| Press outside | dismisses | `event.preventDefault()` in `onPointerDownOutside` |
| Focus leaving | does not dismiss | `dismissOnFocusOutside: true` to opt in |
| `Close` button | dismisses | — |

`dismissOnEscape: false` / `dismissOnPointerDownOutside: false` turn a gesture
off entirely, which is the difference from
[AlertDialog](/components/alert-dialog): an alert refuses both by default
because it is a decision that has to be answered.

## Focus

| Moment | Behaviour | Hook |
| --- | --- | --- |
| Opening | focus moves to the first focusable part, or to the panel | `onOpenAutoFocus` (preventDefault to take over) |
| While open | `Tab` and `Shift+Tab` wrap inside the panel; focus that escaped is pulled back | — |
| Closing | focus returns where it came from | `onCloseAutoFocus` (preventDefault to place it yourself) |

Both the trap and the dismissal listeners are torn down when the panel leaves
the tree, so a dialog removed while open does not keep capturing keys.

## Notes

`role="dialog"` with `aria-modal="true"` tells assistive technology the rest of
the page is inert. The panel itself carries `tabindex="-1"` so it can hold focus
when it contains nothing focusable.

Dialogs render and behave the same under the string renderer: the trap and the
dismissal listeners only exist once an element does, so a server render emits
markup and nothing else.
