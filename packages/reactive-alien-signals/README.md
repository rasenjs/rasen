# @rasenjs/reactive-alien-signals

[alien-signals](https://github.com/stackblitz/alien-signals) adapter for Rasen.

alien-signals is the push-pull signal core used by Vue Language Tools and
ported into Vue 3.6 — zero dependencies and top-tier reactivity benchmark
results.

## Design

- **The signal IS the ref.** Rasen's `Ref` is an opaque type (no `.value`
  contract), so the raw alien-signals callable is exposed directly: read with
  `count()`, write with `count(next)`.
- Refs and computeds are detected via alien-signals' own `isSignal` /
  `isComputed` guards — no wrapper objects, no brand symbols.
- `watch` tracks only the source (wrapped in a `computed`); the user callback
  is delivered in a microtask so reads/writes inside it never become hidden
  dependencies of the watcher.
- Unchanged values never fire callbacks (`Object.is`), keeping updates
  O(changed) instead of O(subscribers).

## Usage

```ts
import { setReactiveRuntime } from '@rasenjs/core'
import { useReactiveRuntime, ref } from '@rasenjs/reactive-alien-signals'

useReactiveRuntime()

const count = ref(0)
count(1) // write
count() // read
```

## Build & Test

```bash
yarn workspace @rasenjs/reactive-alien-signals build
yarn workspace @rasenjs/reactive-alien-signals test
```
