# AspectRatio

Keeps its child locked to a width/height ratio.

<RotaDemo name="aspect-ratio" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| ``aspectRatio()`` | `<div>` | `ratio` (default `1`), `class`, `style` |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-ratio` | the ratio | On the outer box |

## Notes

The ratio is implemented with the padding-bottom technique, so those inline styles are functional rather than cosmetic and stay overridable through `style`.
