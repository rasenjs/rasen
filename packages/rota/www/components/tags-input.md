# TagsInput

A tag field: Enter commits, Backspace focuses the last tag, paste can add several.

<RotaDemo name="tags-input" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="listbox">` | Owns the tag array and the focused index. Props: `value`, `defaultValue`, `onValueChange`, `max`, `delimiter`, `addOnPaste`, `addOnBlur`, `allowCustomValue`, `disabled`, `onKeyDown` |
| `Item` | `<span role="option">` | `value`, `index`; its children receive that index |
| `ItemText` | `<span>` | The tag label |
| `ItemDelete` | `<button>` | `index` — the tag it removes |
| `Input` | `<input>` | `placeholder` |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `selected` | `unselected` | On items, following `focusedIndex` |
| `aria-selected` | `true` | `false` | On items |
| `aria-disabled` | `true` | On a disabled root |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Enter` | Commit the typed tag |
| `Backspace (empty input)` | Focus the last tag |
| `ArrowLeft / ArrowRight` | Move between tags and back to the input |
| `Delete / Backspace (focused tag)` | Remove it |
| `Escape` | Clear focus and return to the input |

## Notes

Parts are told their index instead of searching the DOM for it.
