# Tabs

Layered panels where exactly one is visible.

<RotaDemo name="tabs" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div>` | Owns the active value. Props: `defaultValue`, `value`, `onValueChange`, `orientation` |
| `List` | `<div role="tablist">` | Carries the orientation |
| `Trigger` | `<button role="tab">` | `value` (required), `disabled` |
| `Content` | `<div role="tabpanel">` | `value` (required), `forceMount` |
| ``tabs()`` | `preset` | Root + list + triggers and panels from a `tabs` array |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-selected` | `true` | `false` | On the trigger |
| `data-state` | `active` | `inactive` | On triggers |
| `data-state` | `active` | `hidden` | On panels, plus `hidden` |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Enter / Space` | Activate the focused tab |

## Notes

Inactive panels render their children and hide with `hidden`, so switching never leaves an empty panel behind.
