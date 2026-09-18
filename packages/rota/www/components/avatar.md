# Avatar

Shows an image and swaps to fallback content while it loads or when it fails.

<RotaDemo name="avatar" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Root` | `<span>` | Owns the loading status. |
| `Image` | `<img>` | Reports `onLoadingStatusChange` and exposes `data-state`. |
| `Fallback` | `<span>` | Visible until the image loads; `delayMs` postpones it. |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `data-state` | `loading` | `loaded` | `error` | On the image. |
| `data-state` | `visible` | `hidden` | On the fallback. |

## Notes

The fallback fades through an opacity binding, so the swap is yours to transition in CSS (no timers polling the DOM).
