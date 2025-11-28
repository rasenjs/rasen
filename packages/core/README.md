# Rasen

Rasen（らせん，螺旋）- 响应式渲染框架

## 特点

- **响应式无关**: 可适配任何响应式库（Vue/Solid/Preact Signals等）
- **宿主无关**: 可适配任何渲染目标（Canvas 2D/WebGL/SVG/DOM）
- **纯函数组件**: 无虚拟 DOM，无组件实例
- **自主控制**: 渲染逻辑由组件通过 watch 自己控制

## 快速开始

### 1. 设置响应式运行时

Rasen 不直接依赖任何响应式库，需要先设置响应式运行时：

```typescript
import { setReactiveRuntime, createVueRuntime } from '~/app/utils/rasen'

// 使用 Vue Composition API
setReactiveRuntime(createVueRuntime())
```

### 2. 创建组件

```typescript
import { ref, computed } from 'vue' // 或你选择的响应式库
import { canvas2DContext, rect, text, fragment } from '~/app/utils/rasen'

const Cell = (props: { x: number; y: number; value: string }) => {
  const hovered = ref(false)
  
  return fragment({
    children: [
      rect({
        x: props.x,
        y: props.y,
        width: 50,
        height: 50,
        fill: computed(() => hovered.value ? '#eee' : '#fff')
      }),
      text({
        text: props.value,
        x: computed(() => props.x + 25),
        y: computed(() => props.y + 25),
        textAlign: 'center',
        textBaseline: 'middle'
      })
    ]
  })
}
```

## 生命周期

1. **setup**: 组件函数调用，初始化响应式状态
2. **mount**: 挂载函数调用，设置 watch 和事件监听
3. **update**: watch 回调自动触发，执行重绘逻辑
4. **unmount**: 清理函数调用，移除监听器

## 核心概念

### Component

组件是一个接收 props 并返回 mount 函数的工厂函数：

```typescript
// 同步组件
type SyncComponent<Host, Props> = (props: Props) => (host: Host) => (() => void) | undefined

// 异步组件（支持异步 setup）
type AsyncComponent<Host, Props> = (props: Props) => Promise<(host: Host) => (() => void) | undefined>

// 组件可以是同步或异步
type Component<Host, Props> = SyncComponent<Host, Props> | AsyncComponent<Host, Props>
```

**异步组件示例**：

```typescript
// setup 阶段可以异步加载资源
const AsyncImage = async (props: { url: string }) => {
  // 异步加载图片
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = props.url
  })
  
  // 返回 mount 函数
  return (ctx: CanvasRenderingContext2D) => {
    const draw = () => {
      ctx.drawImage(img, 0, 0)
    }
    
    draw()
    watch(() => props.url, draw)
    
    return () => {
      // cleanup
    }
  }
}
```

### fragment

组合多个子组件：

```typescript
fragment({
  children: [
    rect({ ... }),
    text({ ... }),
    each({ ... })
  ]
})
```

### each

列表渲染组件，维护稳定的组件实例引用，支持：
- 任何可迭代对象（Iterable）：数组、Set、Map、生成器等
- 异步可迭代对象（AsyncIterable）：异步生成器
- 异步组件

```typescript
// 数组
each({
  items: () => array,
  getKey: (item) => item.id,
  component: ItemComponent,
  getProps: (item) => ({ item })
})

// Set
each({
  items: () => new Set([1, 2, 3]),
  getKey: (item) => item,
  component: ItemComponent,
  getProps: (item) => ({ value: item })
})

// 同步生成器
each({
  items: function* () {
    for (let i = 0; i < 10; i++) {
      yield { id: i, value: i * 2 }
    }
  },
  getKey: (item) => item.id,
  component: ItemComponent,
  getProps: (item) => ({ item })
})

// 异步生成器
each({
  items: async function* () {
    for (let i = 0; i < 10; i++) {
      await delay(100)
      yield { id: i, value: i * 2 }
    }
  },
  getKey: (item) => item.id,
  component: ItemComponent,
  getProps: (item) => ({ item })
})

// 使用异步组件
each({
  items: () => imageUrls,
  getKey: (url) => url,
  component: AsyncImage,  // 异步组件
  getProps: (url) => ({ url })
})
```

## Canvas 2D 适配器

### 基础示例

```typescript
import { ref, computed } from 'vue'
import { div, canvas, canvas2DContext, rect, text, each } from '~/app/utils/rasen'

const cells = ref([
  { id: 1, x: 0, y: 0, value: 5 },
  { id: 2, x: 50, y: 0, value: 3 },
  { id: 3, x: 100, y: 0, value: 7 }
])

const Cell = (props: { x: number; y: number; value: number }) => {
  return fragment({
    children: [
      rect({
        x: props.x,
        y: props.y,
        width: 50,
        height: 50,
        stroke: '#000',
        lineWidth: 1
      }),
      text({
        text: props.value.toString(),
        x: computed(() => props.x + 25),
        y: computed(() => props.y + 25),
        textAlign: 'center',
        textBaseline: 'middle'
      })
    ]
  })
}

const Board = () => {
  return div({
    children: [
      // 方式 1: 使用 canvas 组件（推荐）
      canvas({
        width: 450,
        height: 450,
        contextType: '2d',
        children: [
          canvas2DContext({
            children: [
              each({
                items: () => cells.value,
                getKey: (cell) => cell.id,
                component: Cell,
                getProps: (cell) => cell
              })
            ]
          })
        ]
      })
    ]
  })
}

// 使用
const container = document.getElementById('app')
const unmount = Board()(container)
```

### Canvas 组件 API

**canvas** - 创建 canvas 元素并桥接到渲染上下文

```typescript
canvas({
  width: 400,              // canvas 宽度
  height: 300,             // canvas 高度
  contextType: '2d',       // '2d' | 'webgl' | 'webgl2' | 'webgpu'
  className: 'my-canvas',  // CSS 类名（可选）
  style: { border: '1px solid #ccc' },  // 内联样式（可选）
  children: [/* 渲染上下文的子组件 */]
})
```

**canvas2DContext** - Canvas 2D 渲染上下文增强

提供自动批量绘制、脏检查等优化功能：

```typescript
canvas2DContext({
  dpr: 2,  // 可选，默认使用 window.devicePixelRatio
  children: [/* Canvas 2D 组件 */]
})
```

### Canvas 2D 原始组件

- **rect**: 绘制矩形 `{ x, y, width, height, fill?, stroke?, lineWidth? }`
- **text**: 绘制文本 `{ text, x, y, fill?, font?, textAlign?, textBaseline? }`
- **line**: 绘制直线 `{ x1, y1, x2, y2, stroke?, lineWidth? }`
- **circle**: 绘制圆形 `{ x, y, radius, fill?, stroke?, lineWidth? }`

所有属性支持响应式值：

```typescript
const x = ref(0)
const color = computed(() => hovered.value ? 'red' : 'blue')

rect({
  x,  // ReactiveRef<number>
  y: 10,  // number
  width: 50,
  height: 50,
  fill: color  // ComputedRef<string>
})
```

### WebGL 示例

```typescript
import { canvas } from '~/app/utils/rasen'

const WebGLComponent = () => {
  return canvas({
    width: 400,
    height: 400,
    contextType: 'webgl',
    children: [
      // WebGL 组件
      webglScene({ ... })
    ]
  })
}
```

## DOM 适配器

### 基础示例

```typescript
import { ref } from 'vue'
import { domContext, div, button, p } from '~/app/utils/rasen'

const count = ref(0)

const Counter = () => {
  return div({
    style: { padding: '20px' },
    children: [
      p({
        textContent: computed(() => `Count: ${count.value}`)
      }),
      button({
        textContent: 'Increment',
        on: {
          click: () => count.value++
        }
      })
    ]
  })
}

// 使用
const container = document.getElementById('app')
const unmount = domContext({
  container,
  children: [Counter()]
})(container)
```

### 列表渲染示例

```typescript
import { ref } from 'vue'
import { div, ul, li, button, each } from '~/app/utils/rasen'

const todos = ref([
  { id: 1, text: 'Learn Rasen' },
  { id: 2, text: 'Build app' }
])

const TodoItem = (props: { todo: { id: number; text: string } }) => {
  return li({
    textContent: props.todo.text,
    style: { padding: '8px' }
  })
}

const TodoList = () => {
  return div({
    children: [
      ul({
        children: [
          each({
            items: () => todos.value,
            getKey: (todo) => todo.id,
            component: TodoItem,
            getProps: (todo) => ({ todo })
          })
        ]
      }),
      button({
        textContent: 'Add Todo',
        on: {
          click: () => {
            todos.value.push({
              id: Date.now(),
              text: `Todo ${todos.value.length + 1}`
            })
          }
        }
      })
    ]
  })
}
```

### DOM 组件

**布局**: div, span, section, article, header, footer, nav, main, aside

**文本**: p, h1, h2, h3

**表单**: form, input, button, label, textarea, select, option

**列表**: ul, ol, li

**媒体**: img, canvas, svg

**链接**: a

所有组件支持：
- `id`: 元素 ID
- `className`: CSS 类名
- `style`: 内联样式对象
- `attrs`: HTML 属性对象
- `on`: 事件监听器对象 `{ click: handler, ... }`
- `children`: 子组件数组

### 通用 element 组件

创建任意 HTML 元素：

```typescript
import { element } from '~/app/utils/rasen'

const CustomTag = () => {
  return element({
    tag: 'my-custom-element',
    attrs: { 'data-value': '123' },
    className: 'custom-class',
    on: { customEvent: (e) => console.log(e) }
  })
}
```

## 在 DOM 中使用 Canvas

```typescript
import { div, p, button, canvas, canvas2DContext } from '~/app/utils/rasen'
import { rect, text, circle } from '~/app/utils/rasen'

const Dashboard = () => {
  return div({
    children: [
      p({ textContent: 'Canvas 可视化' }),
      
      // 在 DOM 中使用 Canvas 组件
      canvas({
        width: 400,
        height: 300,
        contextType: '2d',
        style: { border: '1px solid #ccc' },
        children: [
          canvas2DContext({
            children: [
              rect({ x: 10, y: 10, width: 100, height: 100, fill: '#4CAF50' }),
              circle({ x: 200, y: 150, radius: 50, fill: '#2196F3' }),
              text({ text: 'Dashboard', x: 200, y: 20, textAlign: 'center' })
            ]
          })
        ]
      }),
      
      button({ textContent: '操作按钮' })
    ]
  })
}
```

## 适配其他响应式库

实现 `ReactiveRuntime` 接口即可适配任何响应式库：

```typescript
import { setReactiveRuntime } from '~/app/utils/rasen'
import type { ReactiveRuntime } from '~/app/utils/rasen'

// 例如适配 Solid.js
const createSolidRuntime = (): ReactiveRuntime => ({
  watch: (source, callback, options) => {
    // 使用 Solid 的 createEffect
    return createEffect(() => callback(source(), undefined))
  },
  effectScope: () => ({
    run: (fn) => fn(),
    stop: () => {}
  }),
  ref: (value) => createSignal(value)[0],
  computed: (getter) => createMemo(getter),
  unref: (value) => {
    // Solid 的信号通过函数调用访问
    return typeof value === 'function' ? value() : value
  }
})

setReactiveRuntime(createSolidRuntime())
```

**ReactiveRuntime 接口说明**：

- `watch`: 监听响应式值变化
- `effectScope`: 创建效果作用域
- `ref`: 创建响应式引用
- `computed`: 创建计算属性
- `unref`: 解包响应式值（由各响应式库自己判断如何解包，避免误判普通对象）
