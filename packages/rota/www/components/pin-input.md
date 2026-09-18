# PinInput

One-time-code / PIN entry with per-cell focus management and paste distribution.

<RotaDemo name="pin-input" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="group">` | Props: `value`, `defaultValue`, `length` (default `4`), `type` (`numeric` | `alphanumeric` | `text`), `otp`, `disabled`, `onValueChange`, `onComplete`. |
| `Input` | `<input maxlength="1">` | One cell; `index` selects the position. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-disabled` | present | On root and cells |

## Value shape

The value is **positional**: it is always `length` characters long, and a
position the user has not filled yet is a space. That is what makes a paste
into the third cell land in the third cell, and what lets Backspace clear one
cell without shifting the others. `onValueChange` reports the value without
the trailing placeholders, so a consumer sees `'12'`; passing it back as
`value` pads it to the same positions.

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Typing` | Fills the cell and moves right |
| `Backspace / Delete` | Clears, or steps left when empty |
| `ArrowLeft / ArrowRight` | Move between cells |
| `Paste` | Distributes the pasted characters from the current cell |

## Notes

Cells are found through the context's ref cells rather than DOM queries, and `onComplete` fires only when the value fills `length`.
