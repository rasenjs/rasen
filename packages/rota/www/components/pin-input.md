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

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Typing` | Fills the cell and moves right |
| `Backspace / Delete` | Clears, or steps left when empty |
| `ArrowLeft / ArrowRight` | Move between cells |
| `Paste` | Distributes the pasted characters from the current cell |

## Notes

Cells are found through the context's ref cells rather than DOM queries, and `onComplete` fires only when the value fills `length`.
