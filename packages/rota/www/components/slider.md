# Slider

Pick one value, or several for a range. Full keyboard support on the thumb, and dragging with pointer events.

<RotaDemo name="slider" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="group">` | Props: `value`, `defaultValue`, `min`, `max`, `step`, `orientation`, `disabled`, `onValueChange`, `onValueCommit` |
| `Track` | `<div>` | The element the value is measured against |
| `Range` | `<div>` | The filled part; positioned from the values |
| `Thumb` | `<span role="slider">` | `index` picks which value it drives; keyboard and dragging live here |
| ``slider()`` | `preset` | Root + track + range + one thumb per value |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-valuemin` / `aria-valuemax` / `aria-valuenow` | numbers | On the thumb |
| `aria-orientation` | `horizontal` | `vertical` | On the thumb |
| `data-orientation` | `horizontal` | `vertical` | On root, track, range and thumb |
| `data-disabled` | present | On root and thumbs |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Arrow keys` | One step (up/right increases; the orientation chooses the pair) |
| `Page Up / Page Down` | Ten steps |
| `Home / End` | Minimum / maximum |

## Notes

Two things are inline styles on purpose: the range offsets and the thumb offset — that is the mechanism, like AspectRatio's padding. Dragging reads the track rectangle (a measurement) and uses pointer capture, so nothing reaches into the DOM.
