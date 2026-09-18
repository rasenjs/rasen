# Getting started

Rota is a headless component library for Rasen: the parts bring behaviour,
ARIA wiring and focus management, and nothing else. The framework itself is
documented on the Rasen site and in the
[repository](https://github.com/rasenjs/rasen).

## Install

```bash
yarn add @rasenjs/rota @rasenjs/core @rasenjs/dom @rasenjs/reactive-vue
```

`@rasenjs/reactive-vue` is the reactive adapter used in the examples; any
adapter that implements the Rasen reactive runtime works the same way.

## Mount one component

```ts
import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { switchControl } from '@rasenjs/rota'

useReactiveRuntime()

mount(switchControl({ defaultChecked: true }), document.getElementById('app')!)
```

Two things to notice:

1. **Set a reactive runtime first.** Rota components keep their state in refs
   from the active runtime, so the plain Rasen rule applies: pick a runtime
   before mounting.
2. **A component is a `Mountable`.** It mounts into a host element and returns
   an unmount function — nothing else.

<RotaDemo name="switch" />

## Composing parts

Higher-level components are only as good as their parts, so every component
also exports them. Wiring is explicit: ask the root for its context and hand it
to the parts.

```ts
import { createCollapsibleRoot, createCollapsibleTrigger, createCollapsibleContent } from '@rasenjs/rota'

const Root = createCollapsibleRoot()
const Trigger = createCollapsibleTrigger()
const Content = createCollapsibleContent()

const App = Root({
  defaultOpen: true,
  children: (getContext) =>
    div({
      children: [
        Trigger({ children: () => 'Toggle' }, getContext),
        Content({ children: () => () => text({ content: 'Hidden while closed.' }) }, getContext)
      ]
    })
})
```

<RotaDemo name="collapsible" />

## The next steps

- [Styling](/guide/styling) — the `data-*` contract every part exposes
- [State & reactivity](/guide/state) — controlled vs uncontrolled, callbacks, refs
- [Accessibility](/guide/accessibility) — roles, keyboard maps, focus management
