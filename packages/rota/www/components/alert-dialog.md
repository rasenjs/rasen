# AlertDialog

A modal that requires an explicit decision: it does not close on Escape or on an overlay click unless you handle those yourself.

<RotaDemo name="alert-dialog" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div>` | Owns the open value. Props: `defaultOpen`, `open`, `onOpenChange`. |
| `Trigger` | `<button>` | Opens the dialog. |
| `Overlay` | `<div>` | Hidden while closed; swallows clicks. |
| `Content` | `<div role="alertdialog" aria-modal="true">` | Wires `aria-labelledby` / `aria-describedby` from the parts below and moves focus into the dialog when it opens. Handlers: `onOpenAutoFocus`, `onCloseAutoFocus`, `onEscapeKeyDown`, `onPointerDownOutside`. |
| `Title` | `<h2>` | Feeds `aria-labelledby`. |
| `Description` | `<p>` | Feeds `aria-describedby`. |
| `Action` | `<button>` | Closing action; receives focus first. |
| `Cancel` | `<button>` | Dismissing action. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `open` | `closed` | On root, trigger, overlay and content. |
| `hidden` | present | On overlay and content while closed. |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Escape` | Ignored unless `onEscapeKeyDown` is provided — an alert dialog is not dismissible by accident |
| `Tab` | Stays inside the dialog while it is open |

## Notes

Focus lands on the action button, then the cancel button, then the content element, and the previously focused element is remembered.
