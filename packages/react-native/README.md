# @rasenjs/react-native

React Native Fabric renderer for the Rasen reactive rendering framework.

**Directly calls React Native's Fabric architecture APIs without using React.**

## Installation

```bash
npm install @rasenjs/react-native @rasenjs/core
```

## Overview

`@rasenjs/react-native` provides a way to build React Native apps using Rasen's reactive rendering model, bypassing React entirely and directly interfacing with the Fabric architecture.

## Features

- **Direct Fabric API** - Binds to React Native's new architecture
- **No React Dependency** - Operates without React reconciler
- **Reactive Driven** - Seamlessly integrates with Rasen's reactive system
- **Type Safe** - Full TypeScript support
- **High Performance** - Direct native view manipulation, no virtual DOM

## Prerequisites

- React Native >= 0.72.0 (New Architecture)
- Fabric renderer enabled

## Quick Start

### 1. Setup Reactive Runtime

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'

setReactiveRuntime(createVueRuntime())
```

### 2. Create Components

```typescript
import { view, text, touchableOpacity } from '@rasenjs/react-native'
import { ref, computed } from 'vue'

const count = ref(0)

const Counter = view({
  style: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  children: [
    text({
      style: { fontSize: 48, fontWeight: 'bold' },
      children: count  // Reactive binding
    }),
    touchableOpacity({
      style: {
        backgroundColor: '#007AFF',
        padding: 16,
        borderRadius: 8,
        marginTop: 20
      },
      onPress: () => count.value++,
      children: [
        text({
          style: { color: 'white', fontSize: 18 },
          children: 'Increment'
        })
      ]
    })
  ]
})
```

### 3. Mount Application

```typescript
import { AppRegistry } from 'react-native'
import { mount } from '@rasenjs/react-native'

AppRegistry.registerRunnable('MyApp', ({ rootTag }) => {
  mount(Counter, rootTag)
  return { run: () => {} }
})
```

## Components

### View

Container component with flexbox layout.

```typescript
import { view } from '@rasenjs/react-native'

view({
  style: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
    gap: 10
  },
  children: [/* child components */]
})
```

### Text

Text display component.

```typescript
import { text } from '@rasenjs/react-native'

text({
  style: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center'
  },
  children: 'Hello World'
})

// Reactive text
text({
  children: computed(() => `Count: ${count.value}`)
})
```

### TouchableOpacity

Touchable component with opacity feedback.

```typescript
import { touchableOpacity, text } from '@rasenjs/react-native'

touchableOpacity({
  style: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8
  },
  onPress: () => console.log('Pressed!'),
  activeOpacity: 0.7,
  children: [
    text({ children: 'Press Me' })
  ]
})
```

### TextInput

Text input component.

```typescript
import { textInput } from '@rasenjs/react-native'

const inputValue = ref('')

textInput({
  style: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8
  },
  value: inputValue,
  placeholder: 'Enter text...',
  onChangeText: (text) => inputValue.value = text
})
```

### ScrollView

Scrollable container.

```typescript
import { scrollView, view } from '@rasenjs/react-native'

scrollView({
  style: { flex: 1 },
  contentContainerStyle: { padding: 20 },
  children: [
    // Scrollable content
  ]
})
```

### Image

Image display component.

```typescript
import { image } from '@rasenjs/react-native'

image({
  source: { uri: 'https://example.com/image.png' },
  style: { width: 200, height: 200 },
  resizeMode: 'cover'
})
```

## Reactive Props

All props support reactive values:

```typescript
const isActive = ref(false)
const count = ref(0)

view({
  style: computed(() => ({
    backgroundColor: isActive.value ? '#007AFF' : '#ccc',
    opacity: isActive.value ? 1 : 0.5
  })),
  children: [
    text({
      children: computed(() => `Count: ${count.value}`)
    })
  ]
})
```

## Style Props

React Native style properties are fully supported:

```typescript
{
  // Layout
  flex: 1,
  flexDirection: 'row' | 'column',
  justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between',
  alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch',
  gap: 10,
  
  // Spacing
  padding: 20,
  paddingHorizontal: 10,
  paddingVertical: 15,
  margin: 10,
  
  // Sizing
  width: 100,
  height: 100,
  minWidth: 50,
  maxHeight: 200,
  
  // Visual
  backgroundColor: '#fff',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#ccc',
  opacity: 0.5,
  
  // Position
  position: 'relative' | 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 10
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
├─────────────────────────────────────────────────────────────┤
│  @rasenjs/reactive-vue  │  @rasenjs/core  │  @rasenjs/rn    │
│  (Reactivity System)    │  (Core Runtime) │  (RN Renderer)  │
├─────────────────────────────────────────────────────────────┤
│              React Native Fabric Architecture                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  UIManager  │  ShadowTree  │  Yoga Layout  │  Native UI │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Notes

- This package uses `AppRegistry.registerRunnable()` instead of `registerComponent()`
- UI rendering is managed by Rasen's render context
- The current implementation requires native module support for full Fabric integration
- See [examples/react-native](../../examples/react-native) for a complete example

## License

MIT
