# @rasenjs/dom Roadmap

> 一个现代化的响应式 MVVM DOM 渲染框架

## 设计原则

- **三段式函数架构**：setup (组件函数) → mount (返回的挂载函数) → unmount (清理函数)
- **响应式运行时无关**：响应式能力由外部提供（@rasenjs/reactive-vue, @rasenjs/reactive-signals 等）
- **宿主无关核心**：通用逻辑在 @rasenjs/core，DOM 特定逻辑在 @rasenjs/dom
- **无虚拟 DOM**：直接操作真实 DOM，响应式驱动更新

---

## 当前状态概览

| 类别 | 已实现 | 待实现 | 完成度 |
|------|--------|--------|--------|
| 核心渲染 | 6 | 1 | 86% |
| 响应式集成 | 4 | 0 | 100% |
| 组件系统 | 4 | 1 | 80% |
| 条件渲染 | 2 | 0 | 100% |
| 事件系统 | 5 | 1 | 83% |
| 表单元素 | 5 | 0 | 100% |
| 元素引用 | 1 | 0 | 100% |
| 客户端水合 | 5 | 0 | 100% |

---

## Phase 1: 核心渲染 (Core Rendering)

### ✅ 已实现

- [x] **基础元素创建** - `element()` 组件支持创建任意 HTML 元素
- [x] **预定义元素** - div, span, button, input, a, img, p, h1-h3, ul, ol, li, form, label, textarea, select, option, canvas, svg, section, article, header, footer, nav, main, aside
- [x] **属性绑定** - id, className, style, attrs 响应式绑定
- [x] **子元素挂载** - 支持 children 数组形式挂载多个子组件
- [x] **文本内容** - children 支持字符串作为文本内容
- [x] **原始 HTML 插入** - `html()` 组件支持插入原始 HTML 内容

### ⬜ 待实现

- [ ] **`text()` 组件** (可选) - 独立的响应式文本节点组件
  > 注：大多数场景下 children 字符串已足够，text() 仅用于需要独立控制的场景

### ✅ 在 @rasenjs/core 中已实现

- [x] **Fragment** - `fragment()` 组件支持渲染多个根节点
- [x] **列表渲染** - `each()` 组件支持响应式数组渲染，带 key 追踪

---

## Phase 2: 响应式系统集成 (Reactivity Integration)

> 响应式能力由外部运行时提供，@rasenjs/dom 只负责集成

### ✅ 已实现

- [x] **Ref 自动解包** - PropValue 支持 `T | Ref<T> | ReadonlyRef<T>`
- [x] **watchProp 工具** - 响应式属性监听与更新
- [x] **样式对象响应式** - style 属性支持响应式对象
- [x] **属性响应式更新** - attrs 变化时自动更新 DOM

### 📝 设计说明

- **细粒度更新**：已通过 watchProp 实现，每个属性独立监听
- **批量更新**：由响应式运行时（Vue/Signals）内部处理
- **计算属性缓存**：由响应式运行时提供

---

## Phase 3: 组件系统 (Component System)

### ✅ 已实现

- [x] **函数式组件** - `SyncComponent<Host, Props>` 类型定义
- [x] **异步组件** - `AsyncComponent<Host, Props>` 类型定义
- [x] **组件挂载/卸载** - `mount()` 函数和返回的 unmount 回调
- [x] **domContext 上下文** - 提供 DOM 渲染上下文

### ⬜ 待实现

- [ ] **Props 类型验证** - 运行时 props 类型检查（开发模式）
  ```ts
  const Button = defineComponent({
    props: {
      label: { type: String, required: true },
      disabled: { type: Boolean, default: false }
    },
    setup(props) { ... }
  })
  ```

### 📝 设计说明

- **生命周期钩子**：用户可在三段式函数中自行实现
  - setup 阶段：初始化逻辑
  - mount 阶段开始：onMounted
  - unmount 返回函数：onBeforeUnmount
- **双向绑定**：由 SFC 编译器或 JSX 转换处理，不在 DOM 层集成

---

## Phase 4: 条件渲染 (Conditional Rendering)

> DOM 特定的条件渲染组件

### ⬜ 待实现

- [ ] **`show()` 组件** - 基于 CSS display 的条件显示（保留 DOM）
  ```ts
  show({ 
    when: isVisible, 
    children: div({ ... }) 
  })
  // 元素始终存在，通过 display: none 隐藏
  ```

- [ ] **`if()` 组件** - 条件挂载/卸载（移除 DOM）
  ```ts
  if({
    when: isLoggedIn,
    then: () => UserPanel(),
    else: () => LoginForm()
  })
  // 条件变化时销毁/创建元素
  ```

### 📝 设计说明

- `each()` 在 @rasenjs/core 中实现（宿主无关）
- `show()` 和 `if()` 需要操作 DOM style/元素，在 @rasenjs/dom 实现
- 无需 Diff 算法：我们直接操作真实 DOM，响应式系统精确追踪变化

---

## Phase 5: 事件系统 (Event System)

### ✅ 已实现

- [x] **基础事件绑定** - `on: { click, input, keypress }` 
- [x] **事件简写** - `onClick`, `onInput`, `onKeyPress`, `onChange` 属性
- [x] **事件修饰符** - stop, prevent, capture, once, self
  ```ts
  button({
    onClick: prevent.stop(handleClick)
  })
  // 或使用链式调用
  form({
    onSubmit: prevent(handleSubmit)
  })
  ```
- [x] **按键修饰符** - enter, tab, esc, space, delete, up, down, left, right
  ```ts
  input({
    onKeydown: enter(submitForm),
    // 可以和事件修饰符组合
    onKeydown: enter.prevent(submitForm)
  })
  ```
- [x] **事件委托** - 通过 `delegated()` 修饰符实现
  ```ts
  ul({
    // 在 ul 上监听，但只响应来自 li 的事件
    onClick: delegated('li')(handleItemClick),
    // 可以和其他修饰符组合
    onClick: delegated('.btn').stop(handleClick),
    children: items.map(item => li({ ... }))
  })
  
  // 在处理器中通过 event.delegateTarget 访问匹配的元素
  function handleItemClick(event) {
    const li = event.delegateTarget
    console.log(li.textContent)
  }
  ```

### ⬜ 待实现

- [ ] **完整事件类型** - 所有 DOM 事件的 TypeScript 类型安全支持

---

## Phase 6: 表单元素增强 (Form Elements)

### ✅ 已实现

- [x] **input 基础** - type, value, placeholder, disabled
- [x] **textarea** - value, placeholder, rows, cols
- [x] **select/option** - 基础实现
- [x] **checkbox 增强** - checked 属性响应式绑定
  ```ts
  input({
    type: 'checkbox',
    checked: isAgree,
    onChange: (e) => isAgree.value = e.target.checked
  })
  ```
- [x] **radio 增强** - name 分组，checked 绑定
  ```ts
  input({
    type: 'radio',
    attrs: { name: 'gender', value: 'male' },
    checked: computed(() => gender.value === 'male')
  })
  ```

---

## Phase 7: 元素引用 (Element Refs)

### ✅ 已实现

- [x] **ref 属性** - 获取 DOM 元素引用
  ```ts
  const inputRef = ref<HTMLInputElement>()
  
  input({ 
    ref: inputRef,
    placeholder: 'Focus me'
  })
  
  // mount 阶段后可用
  // inputRef.value?.focus()
  ```

### 📝 设计说明

ref 实现可能在 @rasenjs/core 中定义接口，@rasenjs/dom 中实现具体逻辑

---

## Phase 8: 客户端水合 (Client-Side Hydration)

> 支持服务端渲染的 HTML 在客户端"激活"，复用已有 DOM 而非重新创建

### ✅ 已实现

- [x] **`hydrate()` 函数** - 水合入口，复用现有 DOM
  ```ts
  import { hydrate } from '@rasenjs/dom'
  
  // 服务端已渲染好 HTML
  // <div id="app"><button>Count: 0</button></div>
  
  // 客户端水合，复用现有 DOM，绑定事件和响应式
  hydrate(App(), document.getElementById('app'))
  ```

- [x] **元素复用逻辑** - element 组件支持 hydrate 模式
  ```ts
  // 内部实现：hydrate 模式下不创建新元素
  // 而是查找并复用已存在的元素
  const element = hydrating 
    ? ctx.claim()                        // 复用现有节点
    : document.createElement(props.tag)  // 创建新元素
  ```

- [x] **事件绑定** - 给已有元素添加事件监听
- [x] **响应式连接** - 将响应式数据与现有 DOM 值同步
- [x] **Mismatch 处理** - SSR/CSR 不一致时的警告

### 📝 实现细节

#### 1. Hydration 上下文 (`hydration-context.ts`)

```ts
interface HydrationContext {
  isHydrating: boolean
  currentNode: Node | null
  parentStack: Node[]
  claim(): Node | null      // 获取当前节点并移动到下一个
  enterChildren(parent): void // 进入子节点
  exitChildren(): void       // 退出子节点
}
  nextSibling(): Node | null
  firstChild(): Node | null
}

let hydrationContext: HydrationContext | null = null

export function getHydrationContext() {
  return hydrationContext
}

export function setHydrationContext(ctx: HydrationContext | null) {
  hydrationContext = ctx
}
```

#### 2. 修改 element 组件

```ts
// element.ts (修改后)
export const element = (props) => {
  return (host) => {
    const ctx = getHydrationContext()
    let el: HTMLElement
    
    if (ctx?.isHydrating) {
      // === Hydration 模式 ===
      // 1. 获取当前位置的已有元素
      const existing = ctx.currentNode as HTMLElement
      
      // 2. 验证标签匹配
      if (existing?.tagName?.toLowerCase() !== props.tag) {
        console.warn(`Hydration mismatch: expected <${props.tag}>, got <${existing?.tagName}>`)
        // 回退到正常创建
        el = document.createElement(props.tag)
        host.appendChild(el)
      } else {
        // 3. 复用已有元素（不需要 appendChild）
        el = existing
        ctx.nextSibling() // 移动指针到下一个兄弟节点
      }
    } else {
      // === 正常模式 ===
      el = document.createElement(props.tag)
      host.appendChild(el)
    }
    
    // 后续逻辑相同：绑定属性、事件、子元素...
    bindProps(el, props)
    bindEvents(el, props.on)
    // ...
  }
}
```

#### 3. hydrate 入口函数

```ts
// index.ts
export function hydrate(
  component: MountFunction<HTMLElement>,
  container: HTMLElement
) {
  // 1. 创建 hydration 上下文
  const ctx: HydrationContext = {
    isHydrating: true,
    currentNode: container.firstChild,
    nextSibling() {
      this.currentNode = this.currentNode?.nextSibling ?? null
      return this.currentNode
    },
    firstChild() {
      this.currentNode = (this.currentNode as Element)?.firstChild ?? null
      return this.currentNode
    }
  }
  
  // 2. 设置全局上下文
  setHydrationContext(ctx)
  
  try {
    // 3. 执行组件（会复用 DOM 而非创建）
    const unmount = component(container)
    
    // 4. 验证是否有未消费的节点
    if (ctx.currentNode) {
      console.warn('Hydration: extra nodes in container')
    }
    
    return unmount
  } finally {
    // 5. 清理上下文
    setHydrationContext(null)
  }
}
```

#### 4. 子元素处理

```ts
// 处理 children 时，需要进入子元素的 hydration
if (ctx?.isHydrating) {
  ctx.firstChild() // 进入子元素
}

for (const childMount of children) {
  childUnmounts.push(childMount(el))
}

if (ctx?.isHydrating) {
  // 回到父级的下一个兄弟
  ctx.currentNode = el.nextSibling
}
```

### 📝 关键点

1. **DOM 遍历顺序** - 必须与 SSR 渲染顺序一致（深度优先）
2. **条件渲染** - `when()` 需要特殊处理，条件为 false 时跳过对应 DOM
3. **列表渲染** - `each()` 需要按顺序匹配现有元素
4. **文本节点** - 处理纯文本内容的水合
5. **注释节点** - 可用于标记条件渲染的位置

---

## 🔮 未来考虑 (Future Considerations)

> 以下特性暂不在近期计划中，仅作记录

| 特性 | 说明 | 状态 |
|------|------|------|
| Teleport / Portal | 渲染到 DOM 其他位置 | 🔮 待讨论 |
| Transition 动画 | 进入/离开过渡动画 | 🔮 待讨论 |
| 虚拟列表 | 大列表虚拟滚动 | 🔮 待讨论 |
| DevTools | 组件树、状态检查 | 🔮 待讨论 |
| 错误边界 | 组件错误捕获 | 🔮 待讨论 |
| 依赖注入 | Provide/Inject | 🔮 待讨论 |

---

## 实现优先级

### 🔴 P0 - 核心功能

1. ~~**`if()` 条件渲染** - 条件挂载/卸载~~ ✅ 已实现为 `when()`
2. ~~**`show()` 条件显示** - 基于 display 的显示隐藏~~ ✅ 已实现
3. ~~**元素引用 ref** - 获取 DOM 元素引用~~ ✅ 已实现
4. ~~**checkbox/radio 增强** - 表单元素完善~~ ✅ 已实现

### 🟡 P1 - 重要功能

5. ~~**事件修饰符** - stop, prevent, capture 等~~ ✅ 已实现
6. ~~**按键修饰符** - enter, esc 等快捷键~~ ✅ 已实现
7. ~~**事件委托** - 性能优化~~ ✅ 已实现 `delegated()` 修饰符
8. **完整事件类型** - TypeScript 类型安全

### 🟢 P2 - 增强功能

9. **Props 类型验证** - 运行时检查
10. **text() 组件** - 独立文本节点（可选）

---

## API 设计参考

```ts
// 目标 API 示例
import { div, input, button, show, when, delegated, enter, prevent } from '@rasenjs/dom'
import { each, fragment } from '@rasenjs/core'
import { ref, computed } from '@rasenjs/reactive-vue' // 或其他响应式库

function TodoApp() {
  // === Setup 阶段 ===
  const todos = ref<Todo[]>([])
  const newTodo = ref('')
  const inputRef = ref<HTMLInputElement>()

  const addTodo = () => {
    if (newTodo.value.trim()) {
      todos.value.push({ id: Date.now(), text: newTodo.value, done: false })
      newTodo.value = ''
    }
  }

  // 返回 mount 函数
  return (host) => {
    // === Mount 阶段 ===
    // 这里可以执行 onMounted 逻辑
    setTimeout(() => inputRef.value?.focus(), 0)

    const unmount = fragment({
      children: [
        input({ 
          ref: inputRef,
          value: newTodo,
          placeholder: 'What needs to be done?',
          onKeydown: enter(addTodo),  // 使用修饰符
          onInput: (e) => newTodo.value = e.target.value
        }),
        button({ onClick: addTodo }, 'Add'),
        
        each(todos, (todo) => 
          TodoItem({ todo, onRemove: () => removeTodo(todo.id) })
        ),
        
        show({
          when: computed(() => todos.value.length === 0),
          children: div({ class: 'empty' }, 'No todos yet!')
        })
      ]
    })(host)

    // === 返回 Unmount 函数 ===
    return () => {
      // 这里可以执行 onBeforeUnmount 逻辑
      unmount?.()
    }
  }
}
```

---

## 版本计划

| 版本 | 目标 | 状态 |
|------|------|------|
| v0.1.0 | 核心渲染 + 响应式集成 | ✅ 已完成 |
| v0.2.0 | 条件渲染 (when/show) + 元素引用 | ✅ 已完成 |
| v0.3.0 | 事件系统增强 (修饰符/按键/委托) | ✅ 已完成 |
| v0.4.0 | 表单元素完善 (checkbox/radio) | ✅ 已完成 |
| v0.5.0 | 完整事件类型 + Props 验证 | 📍 当前 |
| v1.0.0 | 生产就绪 + 完整文档 | 计划中 |
