# @rasenjs/html

Rasen HTML 渲染器，用于服务端渲染 (SSR) 和静态站点生成 (SSG)。

## 安装

```bash
npm install @rasenjs/html
# 或
yarn add @rasenjs/html
# 或
pnpm add @rasenjs/html
```

## 使用

```typescript
import { renderToString, div, span, p } from '@rasenjs/html'

// 创建组件
const component = div(
  { class: 'container' },
  p({ class: 'title' }, 'Hello, World!'),
  span('This is SSR content')
)

// 渲染为 HTML 字符串
const html = renderToString(component)
console.log(html)
// 输出: <div class="container"><p class="title">Hello, World!</p><span>This is SSR content</span></div>
```

## API

### renderToString(component)

将组件渲染为 HTML 字符串。

```typescript
import { renderToString, div } from '@rasenjs/html'

const html = renderToString(div({ class: 'app' }, 'Content'))
```

### 元素组件

所有标准 HTML 元素都可用：

- `div`, `span`, `p`
- `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- `a`, `img`, `button`, `input`
- `ul`, `ol`, `li`
- `form`, `label`, `textarea`, `select`, `option`
- `table`, `thead`, `tbody`, `tr`, `th`, `td`
- `section`, `article`, `header`, `footer`, `nav`, `main`, `aside`
- 以及更多...

### element(props)

创建自定义元素：

```typescript
import { element } from '@rasenjs/html'

const customElement = element({
  tag: 'custom-element',
  attrs: { 'data-id': '123' },
  children: [...]
})
```

## 特性

- 🚀 轻量级，无运行时依赖
- 🔧 与 Rasen DOM 包 API 兼容
- 📦 支持 ESM 和 CommonJS
- 🎯 TypeScript 支持
- 🔒 自动 HTML 转义，防止 XSS

## 许可证

MIT
