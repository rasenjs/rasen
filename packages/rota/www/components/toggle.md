# Toggle

A two-state button. It stays a button and reports its state — it does not become a checkbox.

<RotaDemo name="toggle" />

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| ``toggle()` / `createToggle()`` | `<button>` | `pressed`, `defaultPressed`, `disabled`, `onPressedChange`, `children` |
| ``toggleText(label, props)`` | `<button>` | Convenience for text content |

## Attributes

| Attribute | Values | Where |
| --- | --- | --- |
| `aria-pressed` | `true` | `false` | On the button — the state assistive technology reads |
| `data-state` | `on` | `off` | For styling |
| `data-disabled` | present | When disabled |

## Keyboard

| Key | Behaviour |
| --- | --- |
| `Enter / Space` | Toggle (native button behaviour) |

## Notes

Reach for ToggleGroup when several of these belong together — a lone toggle in a group is a common accessibility mistake.
