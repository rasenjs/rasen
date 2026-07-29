# @rasenjs/rn-dom

**English** | [中文](./README.zh-CN.md)

**React Native DOM abstraction layer for [Rasen](https://github.com/rasenjs/rasen).**

`@rasenjs/rn-dom` provides a lightweight DOM-like document abstraction over React Native's Fabric native rendering pipeline. It powers `@rasenjs/react-native` and enables framework-agnostic reactive rendering (Vue, Signals, etc.) on RN — no React required.

---

## Features

- **DOM-like API** — `createElement`, `createTextNode`, `appendChild`, `insertBefore`, `removeChild`, `createComment`
- **Document-level abstraction** — single `RNDocument` with built-in node management and native view config registration
- **Fabric integration** — direct binding to React Native's `nativeFabricUIManager` for synchronous UI operations
- **Node lifecycle** — create, mount, update props, child mutations, unmount — all map to Fabric operations
- **DocumentFragment** — batch children insertion atomically
- **StyleSheet** — lightweight inline style resolution utility
- **Component auto-registration** — lazy Fabric view config loading via `ensure()` for all built-in RN components
- **Custom components** — register any native RN component with `registerComponent()`

---

## Installation

```bash
npm install @rasenjs/rn-dom
# or
yarn add @rasenjs/rn-dom
```

Requires `react-native >= 0.76.0 < 0.87.0` as a peer dependency.

---

## Usage

### RNDocument — the entry point

```ts
import { RNDocument } from '@rasenjs/rn-dom'

const doc = new RNDocument()
```

`RNDocument` is the root of the node tree. It manages node allocation, Fabric view config registration, and native view tag assignment. Create one per app.

---

### Creating elements

```ts
import { RNDocument } from '@rasenjs/rn-dom'

const doc = new RNDocument()

// Built-in RN components
const view     = doc.createElement('View')
const text     = doc.createElement('Text')
const image    = doc.createElement('Image')
const input    = doc.createElement('TextInput')
const scroll   = doc.createElement('ScrollView')
const btn      = doc.createElement('ActivityIndicator')

// Text nodes (not native views, just string containers)
const textNode = doc.createTextNode('Hello')

// Comment nodes (used as markers for reactive rendering)
const comment  = doc.createComment('mount-point')
```

### Building a tree

```ts
const view = doc.createElement('View')
view.setStyle({ flex: 1, padding: 20 })

const title = doc.createElement('Text')
title.textContent = 'Hello World'
title.setStyle({ fontSize: 24, fontWeight: 'bold', color: '#333' })

const subtitle = doc.createElement('Text')
subtitle.textContent = 'Welcome to Rasen'
subtitle.setStyle({ fontSize: 16, color: '#666' })

view.appendChild(title)
view.appendChild(subtitle)
```

### Setting props and style

```ts
const btn = doc.createElement('TouchableOpacity')
btn.setAttribute('onPress', () => console.log('tapped'))
btn.setAttribute('style', { backgroundColor: '#007AFF', borderRadius: 8 })
btn.textContent = 'Tap Me'

const img = doc.createElement('Image')
img.setAttribute('source', { uri: 'https://example.com/image.png' })
img.setAttribute('resizeMode', 'cover')
```

Props are set via `setAttribute(name, value)`. Each attribute maps to an RN prop.

For incremental style changes without replacing existing styles, use the `style` object:

```ts
view.style.setProperty('backgroundColor', '#333')
view.style.removeProperty('marginLeft')
```

---

### Child mutations

```ts
const parent = doc.createElement('View')
const child1 = doc.createElement('Text')
const child2 = doc.createElement('Text')
const child3 = doc.createElement('Text')

parent.appendChild(child1)
parent.insertBefore(child2, child1)   // insert before child1
parent.replaceChild(child3, child1)   // replace child1 with child3
parent.removeChild(child3)            // remove child3
```

Each mutation triggers a corresponding Fabric operation (`setChildren`, `insertChildren`, `removeChildren`) on the native shadow tree — no manual batching needed.

---

### DocumentFragment

```ts
const fragment = doc.createDocumentFragment()
fragment.appendChild(view)
fragment.appendChild(text)
parent.appendChild(fragment) // all children appended atomically
```

Use fragments to batch multiple children into a single Fabric operation.

---

### Mounting to a native root view

```ts
import { RNDocument, mountToContainer } from '@rasenjs/rn-dom'

const doc = new RNDocument()
const rootView = doc.createElement('View')
// ... build tree ...

// Mount to a Fabric native view tag
mountToContainer(rootView, nativeTag)
```

`mountToContainer` attaches the root element tree to a native surface identified by a view tag. After mounting, all mutations are synchronously reflected on the Fabric shadow tree.

---

### Built-in element types & props

Events follow the standard DOM API — use `addEventListener` and `removeEventListener`:

```ts
const btn = doc.createElement('TouchableOpacity')
btn.addEventListener('click', () => {
  console.log('Clicked!')
})

const view = doc.createElement('View')
view.addEventListener('touchend', (e) => {
  console.log('Touch ended', e)
})
```

Supported DOM event types: `click`, `touchend`, `touchstart`, `touchmove`, `touchcancel`.

Note: Setting event handler strings via `setAttribute` (e.g. `setAttribute('onPress', fn)`) is **not** the intended API — always use `addEventListener` for event handling.

---

### StyleSheet utility

```ts
import { StyleSheet } from '@rasenjs/rn-dom'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
})

// Use with rn-dom nodes
const view = doc.createElement('View')
view.setAttribute('style', styles.container)
```

`StyleSheet.create()` returns the same object — no flattening at creation time. Flattening happens at setStyle / mount time via native Fabric.

---

### Built-in element types & props

`@rasenjs/rn-dom/elements` provides TypeScript types and runtime utilities for all RN built-in components:

```ts
import type { RNElementPropMap, ElementProps } from '@rasenjs/rn-dom/elements'

// Strongly typed props for each RN component
type ViewProps = ElementProps<'View'>
type TextProps = ElementProps<'Text'>
```

The type map covers all standard RN components:

| Tag | Prop Type |
|-----|-----------|
| `View`, `SafeAreaView` | `ViewProps` |
| `Text` | `TextProps` |
| `Image` | `ImageProps` |
| `TextInput`, `AndroidTextInput` | `TextInputProps` |
| `ScrollView`, `AndroidHorizontalScrollView` | `ScrollViewProps` |
| `ActivityIndicator` | `ActivityIndicatorProps` |
| `Switch`, `AndroidSwitch` | `SwitchProps` |
| `Modal` | `ModalProps` |
| `Pressable` | `PressableProps` |
| `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback` | Respective touchable props |
| `StatusBar` | `StatusBarProps` |
| `RefreshControl` | `RefreshControlProps` |
| `ProgressBarAndroid` | `ProgressBarAndroidProps` |
| `DrawerLayoutAndroid` | `DrawerLayoutAndroidProps` |
| `KeyboardAvoidingView` | `KeyboardAvoidingViewProps` |

---

## Full example: Counter app

```ts
import { RNDocument, mountToContainer } from '@rasenjs/rn-dom'

const doc = new RNDocument()

const root = doc.createElement('View')
root.setStyle({ flex: 1, justifyContent: 'center', alignItems: 'center' })

const text = doc.createElement('Text')
text.setStyle({ fontSize: 48, fontWeight: 'bold' })
text.textContent = '0'

const incBtn = doc.createElement('TouchableOpacity')
incBtn.setAttribute('style', { marginTop: 20, padding: 12, backgroundColor: '#007AFF', borderRadius: 8 })
incBtn.setAttribute('onPress', () => {
  text.textContent = String(Number(text.textContent) + 1)
})
incBtn.textContent = 'Increment'

root.appendChild(text)
root.appendChild(incBtn)

// Mount to existing native root (replace "1" with actual native view tag)
mountToContainer(root, 1)
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│               @rasenjs/react-native          │
│  (element factory + component aliases)       │
├─────────────────────────────────────────────┤
│               @rasenjs/rn-dom                │
│  (RNDocument, RNNode, Fabric interop)        │
├─────────────────────────────────────────────┤
│          react-native (nativeFabricUIManager)│
│  (Fabric C++ core, Yoga layout, Shadow Tree) │
└─────────────────────────────────────────────┘
```

---

## API Reference

### Classes

| Class | Description |
|-------|-------------|
| `RNDocument` | Document root. Creates and manages nodes. |
| `RNNode` | Base element node. Props, style, children. |
| `RNBody` | Special root node that batches flushes. |
| `RNTextNode` | Text content node (not a native view). |
| `RNCommentNode` | Marker node for reactive rendering boundaries. |
| `RNDocumentFragment` | Lightweight container for batching. |
| `CSSStyleSheet` / `StyleSheet` | Style resolution and create utility. |

### Key exports

| Export | Description |
|--------|-------------|
| `RNDocument` | Create and manage the node tree |
| `registerComponent()` | Register custom native components |
| `mountToContainer()` | Mount root node to native surface |
| `dispatchCommand()` | Send imperative commands to native |
| `sendAccessibilityEvent()` | Fire accessibility events |
| `findNodeHandle()` | Resolve native tag from node |
| `StyleSheet` | Style creation utility |
| `resetTagCounter()` | Reset tag counter (testing) |

---

## License

MIT

---

## License

MIT
