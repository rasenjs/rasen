# ToggleGroup

Several toggles that belong together, in one of two modes: `single` behaves like a radio group, `multiple` keeps independent toggle buttons.

<RotaDemo name="toggle-group" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="radiogroup" | "group">` | Props: `type`, `value`, `defaultValue`, `onValueChange`, `disabled`, `orientation`, `loop` |
| `Item` | `<button role="radio" | none>` | `value` (required), `disabled` |
| ``toggleGroup()`` | `preset` | Root plus one item per entry in `items` |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-checked` | `true` | `false` | Single mode: items are radios |
| `aria-pressed` | `true` | `false` | Multiple mode: items are toggle buttons |
| `data-state` | `on` | `off` | Both modes |
| `data-orientation` | `horizontal` | `vertical` | On the root; also selects the arrow keys |
| `data-disabled` | present | On root and items |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Arrow keys` | Move focus between items (skipping disabled ones) |
| `Home / End` | First / last item |
| `Enter / Space` | Press the focused item |

## Notes

One tab stop per group: only the pressed item (single) or the first enabled item (multiple) is reachable with Tab.
