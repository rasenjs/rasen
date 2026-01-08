# DOM Rendering

This guide covers DOM rendering with `@rasenjs/dom`.

## Overview

The DOM adapter provides components that render to `HTMLElement` hosts:

```typescript
import { div, button, span, mount } from '@rasenjs/dom'
```

## Basic Usage

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, span, mount } from '@rasenjs/dom'
import { ref } from 'vue'

useReactiveRuntime()

const count = ref(0)

const Counter = () => div({
  children: [
    span({ textContent: () => `Count: ${count.value}` }),
    button({ textContent: '+', on: { click: () => count.value++ } })
  ]
})

mount(Counter(), document.getElementById('app'))
```

## Element Components

All standard HTML elements are available:

```typescript
import {
  div, span, p, a, img, br, hr,
  h1, h2, h3, h4, h5, h6,
  button, input, textarea, select, option, label, form,
  ul, ol, li, dl, dt, dd,
  table, thead, tbody, tr, th, td,
  header, footer, main, nav, section, article, aside,
  canvas, svg
} from '@rasenjs/dom'
```

## Props

### Basic Props

```typescript
div({
  id: 'my-div',
  className: 'container',
  textContent: 'Hello World'
})
```

### Reactive Props

All props can be reactive:

```typescript
const isActive = ref(false)

div({
  className: () => isActive.value ? 'active' : 'inactive',
  textContent: computed(() => isActive.value ? 'ON' : 'OFF')
})
```

### Styles

```typescript
// Static style
div({ style: { color: 'red', fontSize: '16px' } })

// Reactive style
div({
  style: () => ({
    backgroundColor: isHovered.value ? 'blue' : 'gray',
    transform: `scale(${scale.value})`
  })
})
```

### Attributes

```typescript
div({
  attrs: {
    'data-id': '123',
    'aria-label': 'Description',
    disabled: isDisabled.value
  }
})
```

### Event Handlers

```typescript
button({
  on: {
    click: (e) => console.log('Clicked!', e),
    mouseenter: () => isHovered.value = true,
    mouseleave: () => isHovered.value = false
  }
})
```

### Children

```typescript
div({
  children: [
    h1({ textContent: 'Title' }),
    p({ textContent: 'Paragraph 1' }),
    p({ textContent: 'Paragraph 2' })
  ]
})
```

## Form Inputs

### Text Input

```typescript
const text = ref('')

input({
  value: text,
  attrs: { type: 'text', placeholder: 'Enter text...' },
  on: {
    input: (e) => text.value = (e.target as HTMLInputElement).value
  }
})
```

### Checkbox

```typescript
const checked = ref(false)

input({
  attrs: { type: 'checkbox', checked: checked.value },
  on: {
    change: (e) => checked.value = (e.target as HTMLInputElement).checked
  }
})
```

### Select

```typescript
const selected = ref('option1')

select({
  value: selected,
  on: {
    change: (e) => selected.value = (e.target as HTMLSelectElement).value
  },
  children: [
    option({ attrs: { value: 'option1' }, textContent: 'Option 1' }),
    option({ attrs: { value: 'option2' }, textContent: 'Option 2' })
  ]
})
```

## Generic Element

For non-standard elements or web components:

```typescript
import { element } from '@rasenjs/dom'

element({
  tag: 'custom-element',
  attrs: { 'custom-attr': 'value' },
  children: [...]
})
```

## Mount/Unmount

```typescript
// Mount returns unmount function
const unmount = mount(component, container)

// Later, to unmount:
unmount?.()
```

## Best Practices

### 1. Use Getters for Computed Strings

```typescript
// ✅ Good
span({ textContent: () => `Count: ${count.value}` })

// ❌ Avoid (creates new computed every render)
span({ textContent: computed(() => `Count: ${count.value}`) })
```

### 2. Extract Event Handlers

```typescript
// ✅ Good
const handleClick = () => count.value++

button({ on: { click: handleClick } })
```

### 3. Batch Style Updates

```typescript
// ✅ Good - single reactive object
div({
  style: () => ({
    width: `${width.value}px`,
    height: `${height.value}px`,
    opacity: opacity.value
  })
})
```
