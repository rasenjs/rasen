# NumberField

A numeric input with steppers, clamping and locale-aware formatting options.

<RotaDemo name="number-field" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="group">` | Props: `value`, `defaultValue`, `min`, `max`, `step`, `formatOptions`, `locale`, `disabled`, `onValueChange`. |
| `Input` | `<input>` | Keeps its own text while you type and re-reads the model on blur. |
| `Increment / Decrement` | `<button>` | Step by `step`, clamped to `min` / `max`. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-disabled` | present | On root, input and steppers. |
| `aria-disabled` | `true` | On the steppers. |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Arrow keys` | Native input caret movement |
| `Typing` | Clamped on commit; empty input reads as `null` |

## Notes

The input binds `value` as a property, so typing is not interrupted by a re-render.
