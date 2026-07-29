# @rasenjs/rn-dom

**React Native DOM abstraction layer for [Rasen](https://github.com/rasenjs/rasen).**

`@rasenjs/rn-dom` provides a lightweight DOM-like document abstraction over React Native's Fabric native rendering pipeline. It powers `@rasenjs/react-native` and enables framework-agnostic reactive rendering (Vue, Signals, etc.) on RN — no React required.

---

## Features

- **DOM-like API** — `createElement`, `createTextNode`, `appendChild`, `insertBefore`, `removeChild`, `createComment`
- **Document-level abstraction** — single `RNDocument` with built-in node management and native view config registration
- **Fabric integration** — direct binding to React Native's `nativeFabricUIManager` for synchronous UI operations
- **CSS StyleSheet** — lightweight inline style resolution with `StyleSheet` utility
- **Component auto-registration** — lazy Fabric view config loading via `ensure()` for all built-in RN components

---

## Installation

```bash
npm install @rasenjs/rn-dom
# or
yarn add @rasenjs/rn-dom
```

Requires `react-native >= 0.76.0 < 0.87.0` and `react ^19.0.0` as peer dependencies.

---

## Usage

### Document & element creation

```ts
import { RNDocument } from '@rasenjs/rn-dom'

const doc = new RNDocument()
const view = doc.createElement('View')
const text = doc.createElement('Text')

text.textContent = 'Hello from Rasen'
view.appendChild(text)
```

### Mounting to a native root view

```ts
import { RNDocument, mountToContainer } from '@rasenjs/rn-dom'

const doc = new RNDocument()
// ... build your element tree ...
const rootView = doc.createElement('View')

// Mount to a Fabric native view tag
mountToContainer(rootView, nativeTag)
```

### Built-in element types & props

`@rasenjs/rn-dom/elements` provides runtime utilities and full TypeScript types for all RN built-in components:

```ts
import { ensure, RN_BUILT_IN_TAGS, isRNBuiltIn } from '@rasenjs/rn-dom/elements'
import type { RNElementPropMap, ElementProps } from '@rasenjs/rn-dom/elements'

// Lazy-load view configs for RN components at first use
ensure('View')
ensure('Text')

// Query built-in tags
console.log(RN_BUILT_IN_TAGS) // ['View', 'Text', 'Image', ...]
console.log(isRNBuiltIn('View')) // true
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

### DocumentFragment

```ts
const fragment = doc.createDocumentFragment()
fragment.appendChild(view1)
fragment.appendChild(view2)
parent.appendChild(fragment) // all children appended atomically
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

## Why not use React directly?

`@rasenjs/rn-dom` is the foundation for Rasen's bring-your-own-reactive-runtime approach. Instead of React's reconciler, it provides a minimal imperative API that any reactive library (Vue, TC39 Signals, Svelte, Solid) can target — enabling framework-agnostic RN development.

---

## License

MIT
