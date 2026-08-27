# @rasenjs/lynx

Rasen renderer for [Lynx](https://lynxjs.org) — main-thread rendering over the
Lynx Element PAPIs.

## How it works

The renderer targets Lynx's **Main Thread Rendering** model: Rasen components
run inside the main-thread (MTS/PrimJS) runtime and drive the native element
tree directly through the documented Element PAPIs (`__CreateView`,
`__AppendElement`, `__InsertElementBefore`, `__SetInlineStyles`, ...).

- **No DOM shim** — unlike `@rasenjs/react-native` (which builds on the
  `rn-dom` document abstraction), primitives call the PAPI layer directly.
- **Zero-cost structural markers** — core's `when` / `each` markers are
  pure-JS nodes backed by a sibling linked list; they never reach the native
  tree. Native child order always equals logical order.
- **Batch protocol** — `HostHooks.batch` stages mounts in JS and replays them
  into the real parent in one positioning pass.
- **Coalesced commits** — mutations schedule a microtask
  `__FlushElementTree()`; call `flushLynx()` for synchronous commits.

## Usage

```ts
import { mountLynx, view, text } from '@rasenjs/lynx'

const App = () => view({ children: text({ children: 'Hello Lynx' }) })

const unmount = mountLynx(App())
```

Reactive props work with any pluggable reactive runtime:

```ts
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from 'vue'

useReactiveRuntime()

const count = ref(0)

const App = () =>
  view({
    style: { flex: '1', justifyContent: 'center' },
    children: [
      text({ style: { fontSize: '24px' }, children: [count] }),
      view({
        bindTap: () => count.value++,
        children: [text({ children: 'Tap me' })],
      }),
    ],
  })

mountLynx(App())
```

## API

| Export | Description |
| --- | --- |
| `mountLynx(mountable, page?)` | Mount a tree onto a (new or adopted) page |
| `element(tag, props)` | Generic element factory for any tag |
| `view` / `text` / `image` / `scrollView` / `page` | Built-in element components |
| `lynxHostHooks` | `HostHooks<LynxNode>` implementation |
| `flushLynx()` | Synchronous `__FlushElementTree()` commit |
| `setLynxPapi(impl)` | Test seam: inject a custom PAPI backend |

### Props

- `style` — object; camelCase keys are converted to kebab-case. Values are
  passed through as strings — include units explicitly (`'100px'`).
- `class` / `className`, `id` — accept static values, refs or getters.
- `dataset` — static `data-*` attributes.
- Events — `bindTap`, `catchLongPress`, `onTouchStart` (shorthand for
  `bindTap`). Handlers are main-thread closures bound via
  `__AddEventListener`. Event names are lowercased (`bindTap` → `tap`).
- Any other key is forwarded to `__SetAttribute`.
- `children` — strings/numbers become raw text nodes; refs/getters become
  reactive text; mountables mount as components.

## Testing

Tests run against an in-memory PAPI mock (`src/__tests__/mock-papi.ts`) — no
device or simulator required:

```bash
yarn workspace @rasenjs/lynx test
```

## Requirements

A Lynx main-thread runtime exposing the Element PAPI globals, including
`__AddEventListener` (the function-callback event form used by buildless
cards).
