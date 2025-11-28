# @rasenjs/jsx-runtime

JSX Runtime for Rasen - 支持灵活的标签配置和多渲染目标。

## 特性

- 🎯 **灵活的标签配置** - 支持单个注册和批量配置
- 🎨 **多渲染目标** - DOM、Canvas、自定义渲染器
- 🔄 **响应式支持** - 自动追踪依赖，支持 ref 和 computed
- 🏷️ **命名空间** - 使用前缀组织不同的标签集合

## 安装

```bash
npm install @rasenjs/jsx-runtime @rasenjs/core @rasenjs/dom
```

## 快速开始

### 1. 配置 TypeScript

在 `tsconfig.json` 中配置 JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/jsx-runtime"
  }
}
```

### 2. 使用 JSX

```tsx
import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime, ref } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

// 初始化响应式运行时
setReactiveRuntime(createSignalsRuntime())

// 创建响应式状态
const count = ref(0)

// 使用 JSX
const App = () => (
  <div>
    <h1>Counter: {count}</h1>
    <button onClick={() => count.value++}>Increment</button>
  </div>
)

// 挂载
mount(App(), document.getElementById('app'))
```

## 标签配置

### 默认配置

默认情况下，所有 DOM 标签已自动配置，可以直接使用：

```tsx
<div>
  <h1>Title</h1>
  <button>Click me</button>
</div>
```

### 批量配置 - `configureTags(config)`

使用前缀组织不同的标签命名空间:

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as dom from '@rasenjs/dom'
import * as canvas2d from '@rasenjs/canvas-2d'

configureTags({
  '': dom,              // 空字符串前缀 = 无前缀标签
  'canvas-2d-': canvas2d   // canvas-2d- + context = canvas-2d-context
})
```

**前缀规则:**
- `''` (空字符串) - 无前缀标签，直接使用组件名
  - 配置: `{ '': { div: divComponent } }`
  - 使用: `<div>`
- 其他前缀 - 前缀 + 组件名
  - 配置: `{ 'canvas-2d-': { context: contextComponent } }`
  - 使用: `<canvas-2d-context>` (canvas-2d- + context)

### 单个注册 - `registerTag(name, component)`

注册或覆盖单个标签:

```tsx
import { registerTag } from '@rasenjs/jsx-runtime'
import { div } from '@rasenjs/dom'

// 创建自定义 div
const CustomDiv = (props) => {
  console.log('Custom div:', props)
  return div(props)
}

// 注册/覆盖
registerTag('div', CustomDiv)
```

### 覆盖规则

后注册/配置的会覆盖先注册/配置的:

```tsx
// 先配置
configureTags({
  '': { div: OriginalDiv }
})

// 后覆盖
registerTag('div', CustomDiv)  // CustomDiv 生效
```

## 使用示例

### 示例 1: 纯 DOM 应用

```tsx
import { ref, computed } from '@rasenjs/reactive-signals'

const todos = ref([])
const todosCount = computed(() => todos.value.length)

function TodoApp() {
  return (
    <div>
      <h1>Todos ({todosCount})</h1>
      <ul>
        {todos.value.map(todo => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  )
}
```

### 示例 2: 混合 DOM 和 Canvas2D

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as dom from '@rasenjs/dom'
import * as canvas2d from '@rasenjs/canvas-2d'
import { ref } from '@rasenjs/reactive-signals'

// 配置标签
configureTags({
  '': dom,
  'canvas-2d-': canvas2d  // context, rect, circle 等
})

function App() {
  const x = ref(100)
  
  return (
    <div>
      <h1>Canvas Demo</h1>
      <canvas width={800} height={600}>
        <canvas-2d-context>
          <canvas-2d-rect 
            x={x} 
            y={50} 
            width={100} 
            height={100} 
            fill="red" 
          />
          <canvas-2d-circle 
            cx={200} 
            cy={200} 
            r={50} 
            fill="blue" 
          />
        </canvas-2d-context>
      </canvas>
      <button onClick={() => x.value += 10}>
        Move Right
      </button>
    </div>
  )
}
```

### 示例 3: 自定义渲染器

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'

// 自定义组件
const MyButton = ({ children, onClick }) => {
  console.log('MyButton rendering')
  return (host) => {
    const btn = document.createElement('button')
    btn.className = 'my-button'
    btn.textContent = children
    btn.onclick = onClick
    host.appendChild(btn)
    return () => btn.remove()
  }
}

// 注册
configureTags({
  'My': { Button: MyButton }
})

// 使用
function App() {
  return <MyButton onClick={() => alert('Hi!')}>Click Me</MyButton>
}
```

## API 参考

### `configureTags(config: TagConfig)`

批量配置标签映射。

```typescript
interface TagConfig {
  [prefix: string]: Record<string, TagComponent>
}

// 示例
configuretags({
  '': domComponents,           // <div>, <span>, ...
  'canvas-2d-': canvas2dComponents,  // <canvas-2d-context>, <canvas-2d-rect>, ...
  'my-': myComponents          // <my-button>, <my-card>, ...
})
```

### `registerTag(tagName: string, component: TagComponent)`

注册单个标签组件。

```typescript
registerTag('div', divComponent)
registerTag('canvas-2d-rect', rectComponent)
```

### `clearTags()`

清空所有已注册的标签。

```typescript
clearTags()
```

### `getRegisteredTags()`

获取所有已注册的标签名列表。

```typescript
const tags = getRegisteredTags()
console.log(tags)  // ['div', 'span', 'canvas-2d-rect', ...]
```

## TypeScript 支持

### JSX 类型声明

在 `*.d.ts` 文件中添加自定义标签的类型:

```typescript
declare namespace JSX {
  interface IntrinsicElements {
    // DOM 标签
    div: any
    span: any
    button: any
    
    // canvas-2d 标签
    'canvas-2d-context': any
    'canvas-2d-rect': {
      x: number
      y: number
      width: number
      height: number
      fill?: string
    }
    
    // 自定义标签
    MyButton: {
      children: string
      onClick: () => void
    }
  }
}
```

## 最佳实践

1. **在入口配置** - 在应用启动时统一配置所有标签
2. **使用有意义的前缀** - 如 `canvas-2d-`, `webgl-`, `my-` 等
3. **避免前缀冲突** - 不同库使用不同的前缀
4. **按需覆盖** - 使用 `registerTag` 而不是重新 `configureTags`

## 许可证

MIT
