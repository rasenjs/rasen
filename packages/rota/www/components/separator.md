# Separator

A horizontal or vertical divider.

<RotaDemo name="separator" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| ``separator()`` | `<hr>` | `orientation`, `decorative`, `class`, `style` |
| ``hseparator()` / `vseparator()`` | `<hr>` | Orientation presets |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-orientation` | `horizontal` | `vertical` | The orientation |
| `role` / `aria-orientation` | omitted when `decorative` | Decorative separators stay out of the accessibility tree |

## Notes

The 1px sizing is the visible output of the component, so it ships as an overridable default.
