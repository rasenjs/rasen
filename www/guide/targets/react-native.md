# React Native (Without React!)

Build mobile apps using Rasen's reactive paradigm, bypassing React entirely.

::: warning Experimental
React Native support is experimental and under active development.
:::

## Overview

Rasen's React Native package directly interfaces with the Fabric architecture:

```typescript
import { view, text, touchableOpacity, registerApp } from '@rasenjs/react-native'
```

## Setup

### 1. Create a React Native Project

```bash
npx react-native init MyApp
cd MyApp
```

### 2. Install Dependencies

```bash
npm install @rasenjs/core @rasenjs/react-native @rasenjs/reactive-vue vue
```

### 3. Configure Entry Point

```javascript
// index.js
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { registerApp, view, text } from '@rasenjs/react-native'
import { ref } from 'vue'

setReactiveRuntime(createReactiveRuntime())

const App = () => {
  const greeting = ref('Hello Rasen!')

  return view({
    style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    children: [
      text({ style: { fontSize: 24 }, children: greeting })
    ]
  })
}

registerApp('MyApp', App)
```

## Components

### view

The fundamental container:

```typescript
view({
  style?: ViewStyle,
  children?: RNMountFunction[]
})
```

### text

Text display:

```typescript
text({
  style?: TextStyle,
  children: string | (() => string)
})
```

### textInput

Text input:

```typescript
const inputText = ref('')

textInput({
  value: inputText.value,
  placeholder: 'Enter text...',
  onChangeText: (text) => inputText.value = text,
  style: { borderWidth: 1, padding: 10 }
})
```

### touchableOpacity

Pressable with opacity feedback:

```typescript
touchableOpacity({
  onPress: () => console.log('Pressed!'),
  style: { padding: 15, backgroundColor: '#007AFF', borderRadius: 8 },
  children: text({ style: { color: 'white' }, children: 'Press Me' })
})
```

### scrollView

Scrollable container:

```typescript
scrollView({
  style: { flex: 1 },
  children: [
    // Long list of items
  ]
})
```

### image

Image display:

```typescript
image({
  source: { uri: 'https://example.com/image.png' },
  style: { width: 100, height: 100 }
})
```

## Example: Counter App

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { view, text, touchableOpacity, registerApp } from '@rasenjs/react-native'
import { ref } from 'vue'

setReactiveRuntime(createReactiveRuntime())

const App = () => {
  const count = ref(0)

  return view({
    style: { 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: '#f5f5f5'
    },
    children: [
      text({
        style: { fontSize: 72, fontWeight: 'bold', color: '#333' },
        children: () => `${count.value}`
      }),
      view({
        style: { flexDirection: 'row', marginTop: 30, gap: 20 },
        children: [
          touchableOpacity({
            onPress: () => count.value--,
            style: {
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: '#f44336',
              justifyContent: 'center',
              alignItems: 'center'
            },
            children: text({ 
              style: { color: 'white', fontSize: 32 }, 
              children: '-' 
            })
          }),
          touchableOpacity({
            onPress: () => count.value++,
            style: {
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: '#4CAF50',
              justifyContent: 'center',
              alignItems: 'center'
            },
            children: text({ 
              style: { color: 'white', fontSize: 32 }, 
              children: '+' 
            })
          })
        ]
      })
    ]
  })
}

registerApp('CounterApp', App)
```

## How It Works

1. **No React** — Components are pure Rasen functions
2. **Direct Fabric** — Interfaces with React Native's native layer
3. **Reactive Updates** — Vue/Signals trigger native view updates

## Differences from React Native

| Aspect | React Native | Rasen RN |
|--------|--------------|----------|
| Component model | React components | Pure functions |
| State | useState/Redux | Vue ref/Signals |
| Reconciliation | React reconciler | Direct Fabric |
| Bundle size | React + RN | Rasen core only |

## Limitations

- Limited component coverage (expanding)
- No React Native ecosystem compatibility
- Experimental status
