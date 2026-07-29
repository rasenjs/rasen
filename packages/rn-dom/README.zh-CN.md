# @rasenjs/rn-dom

[English](./README.md) | **中文**

**React Native DOM 抽象层，为 [Rasen](https://github.com/rasenjs/rasen) 提供底层 Fabric 渲染能力。**

`@rasenjs/rn-dom` 在 React Native 的 Fabric 原生渲染管道之上提供了一个轻量的类 DOM 文档抽象。它是 `@rasenjs/react-native` 的底层引擎，让响应式框架（Vue、Signals 等）可以直接驱动 RN 原生渲染——无需 React。

---

## 特性

- **类 DOM API** — `createElement`、`createTextNode`、`appendChild`、`insertBefore`、`removeChild`、`createComment`
- **文档级抽象** — 单一的 `RNDocument` 管理节点分配、原生视图配置注册和 Fabric 交互
- **Fabric 集成** — 直接绑定到 React Native 的 `nativeFabricUIManager`，提供同步 UI 操作
- **节点生命周期** — 创建、挂载、属性更新、子节点变更、卸载——全部映射为 Fabric 操作
- **DocumentFragment** — 原子化批量插入子节点
- **StyleSheet** — 轻量级内联样式解析工具
- **组件自动注册** — 通过 `ensure()` 延迟加载所有内置 RN 组件的 Fabric view config
- **自定义组件** — 使用 `registerComponent()` 注册任意原生 RN 组件

---

## 安装

```bash
npm install @rasenjs/rn-dom
# 或
yarn add @rasenjs/rn-dom
```

需要 peer 依赖 `react-native >= 0.76.0 < 0.87.0` 和 `react ^19.0.0`。

---

## 使用

### RNDocument — 入口

```ts
import { RNDocument } from '@rasenjs/rn-dom'

const doc = new RNDocument()
```

`RNDocument` 是整个节点树的根。它管理节点分配、Fabric view config 注册和原生视图标签分配。每个应用创建一个实例。

---

### 创建元素

```ts
import { RNDocument } from '@rasenjs/rn-dom'

const doc = new RNDocument()

// RN 内置组件
const view     = doc.createElement('View')
const text     = doc.createElement('Text')
const image    = doc.createElement('Image')
const input    = doc.createElement('TextInput')
const scroll   = doc.createElement('ScrollView')
const btn      = doc.createElement('ActivityIndicator')

// 文本节点（非原生视图，纯文本容器）
const textNode = doc.createTextNode('Hello')

// 注释节点（用作响应式渲染的标记点）
const comment  = doc.createComment('mount-point')
```

### 构建节点树

```ts
const view = doc.createElement('View')
view.setAttribute('style', { flex: 1, padding: 20 })

const title = doc.createElement('Text')
title.textContent = 'Hello World'
title.setAttribute('style', { fontSize: 24, fontWeight: 'bold', color: '#333' })

const subtitle = doc.createElement('Text')
subtitle.textContent = 'Welcome to Rasen'
subtitle.setAttribute('style', { fontSize: 16, color: '#666' })

view.appendChild(title)
view.appendChild(subtitle)
```

### 设置属性和样式

Props 通过 `setAttribute(name, value)` 设置，每个属性对应一个 RN prop：

```ts
const btn = doc.createElement('TouchableOpacity')
btn.setAttribute('style', { backgroundColor: '#007AFF', borderRadius: 8 })
btn.textContent = 'Tap Me'

const img = doc.createElement('Image')
img.setAttribute('source', { uri: 'https://example.com/image.png' })
img.setAttribute('resizeMode', 'cover')
```

如需增量修改样式而不替换已有样式，可使用 `style` 对象：

```ts
view.style.setProperty('backgroundColor', '#333')
view.style.removeProperty('marginLeft')
```

---

### 子节点操作

```ts
const parent = doc.createElement('View')
const child1 = doc.createElement('Text')
const child2 = doc.createElement('Text')
const child3 = doc.createElement('Text')

parent.appendChild(child1)
parent.insertBefore(child2, child1)   // 在 child1 前插入
parent.replaceChild(child3, child1)   // 用 child3 替换 child1
parent.removeChild(child3)            // 移除 child3
```

每次操作都会触发对应的 Fabric 操作（`setChildren`、`insertChildren`、`removeChildren`），无需手动批量处理。

---

### DocumentFragment

```ts
const fragment = doc.createDocumentFragment()
fragment.appendChild(view)
fragment.appendChild(text)
parent.appendChild(fragment) // 原子化一次性添加所有子节点
```

使用 fragment 将多个子节点合并为一次 Fabric 操作。

---

### 挂载到原生根视图

```ts
import { RNDocument, mountToContainer } from '@rasenjs/rn-dom'

const doc = new RNDocument()
const rootView = doc.createElement('View')
// ... 构建节点树 ...

// 挂载到 Fabric 原生视图标签
mountToContainer(rootView, nativeTag)
```

`mountToContainer` 将根元素树挂载到由视图标签标识的原生表面。挂载后的所有节点变更都会同步反映在 Fabric shadow tree 上。

---

### 事件处理

遵循标准 DOM API——使用 `addEventListener` 和 `removeEventListener`：

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

支持的事件类型：`click`、`touchend`、`touchstart`、`touchmove`、`touchcancel`。

注意：请始终使用 `addEventListener` 处理事件，**不要**通过 `setAttribute` 设置事件处理函数。

---

### StyleSheet 工具

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

// 应用到 rn-dom 节点
const view = doc.createElement('View')
view.setAttribute('style', styles.container)
```

`StyleSheet.create()` 原样返回对象——不会在创建时展开。展开操作在 `setAttribute` / 挂载时由 Fabric 处理。

---

### 内置元素类型 & 属性

`@rasenjs/rn-dom/elements` 提供所有 RN 内置组件的 TypeScript 类型和运行时工具：

```ts
import type { RNElementPropMap, ElementProps } from '@rasenjs/rn-dom/elements'

// 每个 RN 组件都有强类型属性
type ViewProps = ElementProps<'View'>
type TextProps = ElementProps<'Text'>
```

类型映射覆盖所有标准 RN 组件：

| 标签 | 属性类型 |
|------|----------|
| `View`、`SafeAreaView` | `ViewProps` |
| `Text` | `TextProps` |
| `Image` | `ImageProps` |
| `TextInput`、`AndroidTextInput` | `TextInputProps` |
| `ScrollView`、`AndroidHorizontalScrollView` | `ScrollViewProps` |
| `ActivityIndicator` | `ActivityIndicatorProps` |
| `Switch`、`AndroidSwitch` | `SwitchProps` |
| `Modal` | `ModalProps` |
| `Pressable` | `PressableProps` |
| `TouchableOpacity`、`TouchableHighlight`、`TouchableWithoutFeedback` | 各自对应的 TouchableProps |
| `StatusBar` | `StatusBarProps` |
| `RefreshControl` | `RefreshControlProps` |
| `ProgressBarAndroid` | `ProgressBarAndroidProps` |
| `DrawerLayoutAndroid` | `DrawerLayoutAndroidProps` |
| `KeyboardAvoidingView` | `KeyboardAvoidingViewProps` |

---

## 完整示例：计数器 App

```ts
import { RNDocument, mountToContainer } from '@rasenjs/rn-dom'

const doc = new RNDocument()

const root = doc.createElement('View')
root.setAttribute('style', { flex: 1, justifyContent: 'center', alignItems: 'center' })

const text = doc.createElement('Text')
text.setAttribute('style', { fontSize: 48, fontWeight: 'bold' })
text.textContent = '0'

const incBtn = doc.createElement('TouchableOpacity')
incBtn.setAttribute('style', { marginTop: 20, padding: 12, backgroundColor: '#007AFF', borderRadius: 8 })
incBtn.addEventListener('click', () => {
  text.textContent = String(Number(text.textContent) + 1)
})
incBtn.textContent = 'Increment'

root.appendChild(text)
root.appendChild(incBtn)

// 挂载到已有的原生根视图（将 "1" 替换为实际的 nativeTag）
mountToContainer(root, 1)
```

---

## 架构

```
┌─────────────────────────────────────────────┐
│               @rasenjs/react-native          │
│  (元素工厂 + 组件别名)                        │
├─────────────────────────────────────────────┤
│               @rasenjs/rn-dom                │
│  (RNDocument, RNNode, Fabric 交互层)         │
├─────────────────────────────────────────────┤
│          react-native (nativeFabricUIManager)│
│  (Fabric C++ 内核, Yoga 布局, Shadow Tree)   │
└─────────────────────────────────────────────┘
```

---

## API 参考

### 类

| 类 | 说明 |
|-----|------|
| `RNDocument` | 文档根。创建和管理节点。 |
| `RNNode` | 基础元素节点。属性、样式、子节点。 |
| `RNBody` | 特殊根节点，带批量刷新。 |
| `RNTextNode` | 文本内容节点（非原生视图）。 |
| `RNCommentNode` | 标记节点，用于响应式渲染边界。 |
| `RNDocumentFragment` | 轻量容器，用于批量操作。 |
| `CSSStyleSheet` / `StyleSheet` | 样式解析和创建工具。 |

### 主要导出

| 导出 | 说明 |
|-------|------|
| `RNDocument` | 创建和管理节点树 |
| `registerComponent()` | 注册自定义原生组件 |
| `mountToContainer()` | 将根节点挂载到原生表面 |
| `dispatchCommand()` | 向原生发送命令式指令 |
| `sendAccessibilityEvent()` | 触发无障碍事件 |
| `findNodeHandle()` | 从节点解析原生标签 |
| `StyleSheet` | 样式创建工具 |
| `resetTagCounter()` | 重置标签计数器（测试用） |

---

## 许可证

MIT
