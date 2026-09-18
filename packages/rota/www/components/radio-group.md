# RadioGroup

Exactly one option selected, with the behaviour the radio role implies: the group is one tab stop and selection follows focus.

<RotaDemo name="radio-group" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="radiogroup">` | Props: `value`, `defaultValue`, `onValueChange`, `disabled`, `required`, `name`, `orientation`, `loop` |
| `Item` | `<button role="radio">` | `value` (required), `disabled`, `required` |
| `Indicator` | `<div>` | Rendered only while its item is checked, unless `forceMount` |
| ``radioGroup()`` | `preset` | Root plus items and indicators from `items` |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-checked` | `true` | `false` | On the item |
| `data-state` | `checked` | `unchecked` | On item and indicator |
| `data-orientation` | `vertical` | `horizontal` | On the root; also selects the arrow keys |
| `data-disabled` | present | On root and items |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Arrow keys` | Move to the next item **and select it** |
| `Home / End` | First / last item |
| `Enter / Space` | Select the focused item |

## Notes

With `name` set, every item renders a visually hidden `<input type="radio">` so the group posts to a form like a native radio group — the visible control stays a button with the right role.
