# Collapsible

A single expandable region.

<RotaDemo name="collapsible" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div>` | Owns the open value. Props: `defaultOpen`, `open`, `onOpenChange`, `disabled`. |
| `Trigger` | `<button>` | Toggles the region and reports `aria-expanded`. |
| `Content` | `<div role="region">` | Hidden while closed; `forceMount` keeps it mounted. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `open` | `closed` | On root, trigger and content. |
| `aria-expanded` | `true` | `false` | On the trigger. |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Enter / Space` | Toggle (native button behaviour) |

## Notes

The context exposes the open state as a ref, so a part can subscribe to it instead of polling.
