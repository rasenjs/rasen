# Progress

A determinate or indeterminate progress indicator.

<RotaDemo name="progress" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<div role="progressbar">` | Props: `value` (`number | null`), `max`, `getValueLabel`. |
| `Indicator` | `<div>` | Translated by the percentage; the indeterminate state is up to your CSS. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `loading` | `complete` | `indeterminate` | On root and indicator |
| `data-value` / `data-max` | numbers | On root and indicator |

## Notes

Passing `value: null` switches to `indeterminate` and drops `aria-valuenow`.
