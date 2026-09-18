# Checkbox

A tri-state checkbox: unchecked → checked → indeterminate → unchecked.

<RotaDemo name="checkbox" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<button role="checkbox">` | Props: `checked`, `defaultChecked`, `disabled`, `required`, `name`, `value`, `onCheckedChange`. |
| `Indicator` | `<span>` | Rendered only while checked or indeterminate, unless `forceMount`. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-checked` | `true` | `false` | `mixed` | The tri-state contract. |
| `data-state` | `checked` | `unchecked` | `indeterminate` | On root and indicator. |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Space / Enter` | Toggle |

## Notes

The indicator takes its render decision at mount; the root keeps reacting.
