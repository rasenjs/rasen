# @rasenjs/dom

DOM rendering components for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/dom @rasenjs/core
```

## Overview

`@rasenjs/dom` provides reactive DOM components that automatically update when reactive state changes.

## Quick Start

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, input, mount } from '@rasenjs/dom'
import { ref, computed } from 'vue'

// Setup reactive runtime
setReactiveRuntime(createReactiveRuntime())

// Create reactive state
const name = ref('World')

// Create component
const App = () => div({
  children: [
    input({
      value: name,
      on: { input: (e) => name.value = e.target.value }
    }),
    div({
      textContent: computed(() => `Hello, ${name.value}!`)
    })
  ]
})

// Mount to DOM
mount(App(), document.getElementById('app'))
```

## Components

All standard HTML elements are available as components:

```typescript
import {
  // Layout
  div, span, section, article, header, footer, main, nav, aside,
  
  // Text
  h1, h2, h3, h4, h5, h6, p, a, strong, em, code, pre,
  
  // Forms
  form, input, button, textarea, select, option, label,
  
  // Lists
  ul, ol, li,
  
  // Media
  img, video, audio, canvas,
  
  // Table
  table, thead, tbody, tr, th, td,
  
  // Other
  br, hr, iframe
} from '@rasenjs/dom'
```

## Component Props

### Common Props

```typescript
interface CommonProps {
  // Content
  textContent?: PropValue<string>
  innerHTML?: PropValue<string>
  
  // Styling
  style?: PropValue<CSSStyleDeclaration | string>
  class?: PropValue<string>
  className?: PropValue<string>
  
  // Attributes
  id?: PropValue<string>
  title?: PropValue<string>
  
  // Children
  children?: MountFunction<HTMLElement> | MountFunction<HTMLElement>[]
  
  // Event handlers
  on?: {
    click?: (e: MouseEvent) => void
    input?: (e: InputEvent) => void
    change?: (e: Event) => void
    // ... all DOM events
  }
}
```

### Input Props

```typescript
const textInput = input({
  type: 'text',
  value: ref(''),
  placeholder: 'Enter text...',
  disabled: computed(() => isLoading.value),
  on: {
    input: (e) => console.log(e.target.value)
  }
})
```

### Link Props

```typescript
const link = a({
  href: 'https://example.com',
  target: '_blank',
  textContent: 'Visit Example'
})
```

## Reactive Props

Props can be reactive values:

```typescript
import { ref, computed } from 'vue'

const isActive = ref(false)
const count = ref(0)

div({
  // Static value
  id: 'container',
  
  // Ref - auto-unwrapped
  textContent: count,
  
  // Computed - reactive
  class: computed(() => isActive.value ? 'active' : 'inactive'),
  
  // Getter function
  title: () => `Current count: ${count.value}`
})
```

## Building Components with `com`

Use the `com` wrapper for automatic effect scope management and memory safety:

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button } from '@rasenjs/dom'

const Counter = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  return (host: HTMLElement) => {
    // All watchers are automatically collected by the component's scope
    const textDiv = div({
      textContent: computed(() => `Count: ${count.value}`)
    })
    
    const incrementBtn = button({
      textContent: 'Increment',
      on: {
        click: () => count.value++
      }
    })
    
    // Mount children
    textDiv(host)
    incrementBtn(host)
    
    // Cleanup is automatic - scope stops all watchers
    return () => {
      // Any additional cleanup
    }
  }
})

mount(Counter(), document.getElementById('app'))
```

#### Why use `com`?

- **Memory Safety**: All watchers are cleaned up on unmount
- **Prevents Leaks**: Critical for long-lived apps and SPAs
- **Works with Nested Components**: Proper cleanup order
- **No Manual Scope Management**: Automatic scope lifecycle

## Example: Todo App

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, input, button, ul, li, mount } from '@rasenjs/dom'

const TodoApp = com(() => {
  const runtime = getReactiveRuntime()
  const todos = runtime.ref([])
  const inputValue = runtime.ref('')
  
  return (host: HTMLElement) => {
    const addTodo = () => {
      if (inputValue.value.trim()) {
        todos.value = [...todos.value, inputValue.value]
        inputValue.value = ''
      }
    }
    
    // UI setup with automatic watcher management
    div({
      children: [
        input({
          placeholder: 'Add a todo...',
          value: inputValue,
          on: { change: addTodo }
        }),
        button({
          textContent: 'Add',
          on: { click: addTodo }
        }),
        ul({
          children: computed(() =>
            todos.value.map(todo =>
              li({ textContent: todo })
            )
          )
        })
      ]
    })(host)
    
    return () => {} // Cleanup automatic
  }
})

mount(TodoApp(), document.getElementById('app'))
```
  // Getter function - reactive
  style: () => ({ opacity: isActive.value ? 1 : 0.5 })
})
```

## Mounting

### `mount(component, container)`

Mount a component to a DOM element:

```typescript
import { mount, div } from '@rasenjs/dom'

const App = () => div({ textContent: 'Hello' })

const unmount = mount(App(), document.getElementById('app'))

// Later, cleanup
unmount?.()
```

### Direct Mounting

Components return mount functions that can be called directly:

```typescript
const container = document.getElementById('app')
const unmount = App()(container)
```

## Children

### Single Child

```typescript
div({
  children: span({ textContent: 'Child' })
})
```

### Multiple Children

```typescript
div({
  children: [
    h1({ textContent: 'Title' }),
    p({ textContent: 'Paragraph 1' }),
    p({ textContent: 'Paragraph 2' })
  ]
})
```

### Dynamic Children

```typescript
const items = ref(['A', 'B', 'C'])

ul({
  children: computed(() => 
    items.value.map(item => 
      li({ textContent: item })
    )
  )
})
```

## Event Handling

```typescript
button({
  textContent: 'Click me',
  on: {
    click: (e) => {
      console.log('Clicked!', e)
    },
    mouseenter: () => console.log('Hovered'),
    mouseleave: () => console.log('Left')
  }
})
```

## Styling

### Inline Styles

```typescript
div({
  style: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px'
  }
})
```

### Reactive Styles

```typescript
const isVisible = ref(true)

div({
  style: computed(() => ({
    display: isVisible.value ? 'block' : 'none',
    opacity: isVisible.value ? 1 : 0
  }))
})
```

### CSS Classes

```typescript
div({
  class: 'container',
  // or
  className: computed(() => `btn ${isActive.value ? 'btn-active' : ''}`)
})
```

## Utilities

### `watchProp`

Watch a prop value and react to changes:

```typescript
import { watchProp } from '@rasenjs/dom'

const MyComponent = (props: { value: PropValue<string> }) => {
  return div({
    textContent: props.value,
    children: [
      p({ textContent: () => `Current: ${unref(props.value)}` })
    ]
  })
}```
```

## License

MIT
