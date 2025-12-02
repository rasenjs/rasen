# API Reference

This section documents the core APIs of Rasen.

## Core Package

### setReactiveRuntime

Sets the global reactive runtime. Must be called before mounting any components.

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

setReactiveRuntime(createReactiveRuntime())
```

[Learn more →](/api/set-reactive-runtime)

### getReactiveRuntime

Returns the current reactive runtime. Throws if not set.

```typescript
import { getReactiveRuntime } from '@rasenjs/core'

const runtime = getReactiveRuntime()
```

### Types

```typescript
// The core mount function type
type MountFunction<Host = unknown> = (host: Host) => (() => void) | undefined

// Component types
type SyncComponent<Host, Props> = (props: Props) => MountFunction<Host>
type AsyncComponent<Host, Props> = (
  props: Props
) => Promise<MountFunction<Host>>
type Component<Host, Props> =
  | SyncComponent<Host, Props>
  | AsyncComponent<Host, Props>

// Reactive value types
type PropValue<T> = T | Ref<T> | ReadonlyRef<T>
```

[Learn more →](/api/component-types)

## DOM Package

### mount

Mounts a component to a DOM element.

```typescript
import { mount } from '@rasenjs/dom'

const unmount = mount(component, document.getElementById('app'))
```

### Element Components

All HTML elements are available as components:

```typescript
import {
  div,
  span,
  button,
  input,
  a,
  img,
  p,
  h1,
  h2,
  h3,
  ul,
  ol,
  li,
  form,
  label,
  textarea,
  select,
  option,
  canvas,
  svg,
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside
} from '@rasenjs/dom'
```

### element

Generic element component for any tag:

```typescript
import { element } from '@rasenjs/dom'

element({
  tag: 'custom-element',
  attrs: { 'data-id': '123' }
})
```

## Canvas 2D Package

### Components

```typescript
import { rect, circle, line, text } from '@rasenjs/canvas-2d'
```

### RenderContext

Manages canvas rendering and batched updates:

```typescript
import { RenderContext } from '@rasenjs/canvas-2d'
```

## React Native Package

### registerApp

Registers the app with React Native:

```typescript
import { registerApp } from '@rasenjs/react-native'

registerApp('MyApp', App)
```

### Components

```typescript
import {
  view,
  text,
  image,
  textInput,
  touchableOpacity,
  scrollView
} from '@rasenjs/react-native'
```

## HTML Package

### renderToString

Renders components to HTML string:

```typescript
import { renderToString } from '@rasenjs/html'

const html = renderToString(component)
```

### Components

```typescript
import {
  html,
  head,
  body,
  div,
  span,
  p,
  h1,
  h2,
  h3,
  ul,
  ol,
  li,
  a,
  img
} from '@rasenjs/html'
```

## Reactive Adapters

### Vue Adapter

```typescript
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

setReactiveRuntime(createReactiveRuntime())
```

### Signals Adapter

```typescript
import { createReactiveRuntime, ref, computed } from '@rasenjs/reactive-signals'

setReactiveRuntime(createReactiveRuntime())
```
