<script setup>
import counterDom from '../snippets/counter-dom.ts?raw'
import counterRn from '../snippets/counter-rn.tsx?raw'
import todoDom from '../snippets/todo-dom.ts?raw'
import canvasAnimation from '../snippets/canvas-animation.ts?raw'
import canvasBasic from '../snippets/canvas-basic.ts?raw'
import ssrHtml from '../snippets/ssr-html.ts?raw'
import jsxCounter from '../snippets/jsx-counter.tsx?raw'
import basicDom from '../snippets/basic-dom.ts?raw'
</script>

# Code Playground

These files are the real sources under `www/snippets/` — the site renders them
verbatim, so nothing here drifts from what the repository builds.

::: tip Running them
Clone the repository, `yarn install && yarn build`, then start an example (for
instance `yarn examples:web:dev`). Every snippet assumes a bundler entry that
gives you `document.getElementById('app')`.
:::

## Counter — one component, two hosts

::: code-group

```typescript [DOM]
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, p, mount } from '@rasenjs/dom'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

const Counter = () =>
  div(
    { style: { textAlign: 'center', padding: '20px' } },
    p({ style: { fontSize: '48px', margin: '20px' } }, count),
    div(
      {},
      button({ onClick: () => count.value-- }, '-'),
      button({ onClick: () => count.value++ }, '+')
    )
  )

mount(Counter(), document.getElementById('app')!)
```

```tsx [React Native]
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { View, Text, TouchableOpacity, registerApp } from '@rasenjs/react-native'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

registerApp('MyApp', () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ fontSize: 48, marginBottom: 20 }}>{count}</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity onPress={() => count.value--}>
        <Text>−</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => count.value++}>
        <Text>+</Text>
      </TouchableOpacity>
    </View>
  </View>
))
```

:::

<CodeBlock :code="basicDom" title="Minimal DOM component (www/snippets/basic-dom.ts)" />

<CodeBlock :code="jsxCounter" title="The same counter in JSX (www/snippets/jsx-counter.tsx)" />

## Todo list

`each` for reconciliation, DOM properties for form state, a computed ref as a
reactive text node.

<CodeBlock :code="todoDom" title="Todo app (www/snippets/todo-dom.ts)" />

## Canvas

<CodeBlock :code="canvasBasic" title="Canvas + tween (www/snippets/canvas-basic.ts)" />

<CodeBlock :code="canvasAnimation" title="Signals driving shapes (www/snippets/canvas-animation.ts)" />

## Server-side rendering

<CodeBlock :code="ssrHtml" title="renderToString (www/snippets/ssr-html.ts)" />

## Next steps

- [Examples overview](/examples/) — the full list of runnable demos
- [Getting Started](/guide/getting-started) — project setup
- [Components](/guide/components) — the model behind these snippets
