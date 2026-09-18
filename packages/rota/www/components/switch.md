# Switch

A two-state toggle with an optional thumb that follows the root.

<RotaDemo name="switch" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<button role="switch">` | Props: `checked`, `defaultChecked`, `disabled`, `required`, `name`, `value`, `onCheckedChange` |
| `Thumb` | `<span>` | Mirrors the root state through the context |
| ``switchControl()`` | `<button>` | Preset: a root with its thumb already wired |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-checked` | `true` | `false` | On the root |
| `data-state` | `checked` | `unchecked` | On root and thumb |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Space / Enter` | Toggle |

## Notes

The context is getter-backed, so the thumb reacts without either part reaching for the other element.
