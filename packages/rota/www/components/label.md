# Label

A real `<label>` for a control: clicking it focuses (or toggles) the control it names, through the control's id.

<RotaDemo name="label" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| ``label()` / `createLabel()`` | `<label>` | `htmlFor` (the control's id), `class`, `style`, `children` |

## Notes

Nothing is inferred: give the control an id and pass it as `htmlFor`, which is what `for`/`aria-labelledby` wiring usually gets wrong.
