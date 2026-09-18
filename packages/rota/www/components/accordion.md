# Accordion

A vertically stacked set of expandable panels. `single` keeps at most one panel open, `multiple` allows any number; `collapsible` lets the open panel close again.

<RotaDemo name="accordion" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div>` | Owns the open value. Props: `type` (`single` | `multiple`), `collapsible`, `defaultValue`, `value`, `onValueChange`, `disabled`, `orientation`. |
| `Item` | `<div>` | `value` (required), `disabled`. Provides the item context to its children. |
| `Header` | `<h3 role="heading">` | Carries the header id that the content points back to with `aria-labelledby`. |
| `Trigger` | `<button>` | Wires `aria-expanded`, `aria-controls` and the trigger id. |
| `Content` | `<div role="region">` | Hidden while the item is closed; `forceMount` keeps it mounted. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-orientation` | `vertical` | `horizontal` | On root, trigger and content; `horizontal` swaps the arrow keys. |
| `data-state` | `open` | `closed` | On item, trigger and content. |
| `data-disabled` | present | On disabled items and triggers. |
| `aria-expanded` | `true` | `false` | On the trigger. |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Enter / Space` | Toggle the focused trigger |
| `ArrowUp / ArrowDown` | Move between triggers (ArrowLeft/Right when horizontal) |
| `Home / End` | First / last trigger |

## Notes

Items announce their disabled flag to the root without any element registration, and focus moves through ref cells — the parts never query the DOM.
