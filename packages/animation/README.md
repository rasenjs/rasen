# @rasenjs/animation

Tween, spring and frame animations for [Rasen](https://github.com/rasenjs/rasen).

Animated values are **refs**: they come from the active reactive runtime, so
writing one re-renders exactly what subscribed to it — no per-frame diffing, no
allocation per frame.

## Installation

```bash
npm install @rasenjs/animation @rasenjs/core @rasenjs/reactive-vue
```

## Usage

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { tween, spring, frame, all, getEasing } from '@rasenjs/animation'
import { canvas, mount } from '@rasenjs/dom'
import { circle, rect } from '@rasenjs/canvas-2d'

useReactiveRuntime()

const x = tween(50)

mount(
  canvas({
    width: 400,
    height: 200,
    children: [
      // An animated ref is read through `.value`; pass a getter so the prop is
      // re-evaluated when the animation advances.
      circle({ x: () => x.value, y: 100, radius: 24, fill: '#6366f1' })
    ]
  }),
  document.getElementById('app')!
)

// `to()` returns a promise that resolves when the value settles
await x.to(320, { duration: 600, easing: 'easeOutCubic' })

// springs are physics-based: no duration, they settle
const y = spring(100, { stiffness: 180, damping: 18 })
y.to(60)

// sprite-sheet style playback: step through a list of frames
const walk = frame({ frames: [0, 1, 2, 1], frameRate: 8, loop: true })
walk.play()

// run several animations together (tuples of [ref, target, options?])
await all([[x, 0, { duration: 300 }], [y, 100, { stiffness: 200 }]])
```

### API

| Export | Description |
| ------ | ----------- |
| `tween(initial, options?)` | duration-based animation; `.to(value, { duration, easing, delay })`, `.set(v)`, `.stop()`, `.isAnimating`, `.value` |
| `spring(initial, options?)` | physics animation; `{ stiffness, damping, mass, velocity }` |
| `frame({ frames, frameRate, loop })` | steps through a list of values on a frame schedule; `.play()`, `.pause()`, `.stop()`, `.speed`, `.setFrames()` |
| `all(items)` | waits for a list of `[ref, target, options?]` animations |
| `getEasing(name)` / `easing` exports | `linear`, `easeIn*`, `easeOut*`, `easeInOut*`, `easeOutBounce`, … |

Both `tween` and `spring` accept a `schedule` (see `FrameSchedule`) so a host
can drive animations from its own frame source instead of
`requestAnimationFrame` — which is how the GL and native targets run them.

## License

MIT
