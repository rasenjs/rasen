# @rasenjs/reactive-nanostores

Nanostores adapter for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/reactive-nanostores @rasenjs/core nanostores
```

## Overview

`@rasenjs/reactive-nanostores` adapts [Nanostores](https://github.com/nanostores/nanostores) - a tiny state manager with many atomic tree-shakable stores - for use with Rasen.

## Quick Start

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-nanostores'
import { atom, computed } from 'nanostores'

// Setup runtime (do this once at app startup)
useReactiveRuntime()

// Now you can use Nanostores with Rasen components
const count = atom(0)
const double = computed(count, c => c * 2)

count.listen((value) => {
  console.log(`Count: ${value}`)
})
```

## API

### `createReactiveRuntime()`

Creates a Rasen-compatible reactive runtime using Nanostores.

```typescript
import { createReactiveRuntime } from '@rasenjs/reactive-nanostores'
import { setReactiveRuntime } from '@rasenjs/core'

const runtime = createReactiveRuntime()
setReactiveRuntime(runtime)
```

### `useReactiveRuntime()`

Convenience function that creates and sets the Nanostores reactive runtime.

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-nanostores'

useReactiveRuntime()
```

## Using Nanostores

Once the runtime is set, import Nanostores APIs directly:

```typescript
import { atom, computed, map } from 'nanostores'

// Atoms (writable stores)
const count = atom(0)
count.set(count.get() + 1)

// Computed (derived stores)
const doubled = computed(count, c => c * 2)

// Maps (for objects)
const user = map({
  name: 'Alice',
  age: 30
})

// Listen to changes
count.listen((value) => {
  console.log('Count:', value)
})
```

## With Rasen Components

```typescript
import { atom, computed } from 'nanostores'
import { div, button, mount } from '@rasenjs/dom'

const count = atom(0)

const Counter = () => div({
  children: [
    div({ textContent: computed(count, c => `Count: ${c}`) }),
    button({
      textContent: 'Increment',
      on: {
        click: () => count.set(count.get() + 1)
      }
    })
  ]
})

mount(Counter(), document.body)
```

## Why Nanostores?

- **Tiny**: Only 334 bytes (minified and gzipped)
- **Tree-shakable**: Each store is a separate module
- **Framework-agnostic**: Works with any framework or vanilla JS
- **Simple API**: Easy to learn and use
- **TypeScript**: Full TypeScript support out of the box

## Features

- ✅ Atoms (writable stores)
- ✅ Computed (derived stores)
- ✅ Maps (object stores)
- ✅ Listen to changes
- ⚠️ Effect scopes (basic implementation - nanostores doesn't have native support)

## Limitations

- Nanostores doesn't have a native effect scope concept, so the `effectScope` implementation is basic
- The `watch` callback doesn't receive the old value (nanostores limitation)

## Learn More

- [Nanostores Documentation](https://github.com/nanostores/nanostores)
- [Rasen Core Documentation](../core/README.md)

## License

MIT
