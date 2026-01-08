# JSX Support

Rasen supports JSX/TSX syntax through the `@rasenjs/jsx-runtime` package.

## Setup

### 1. Install the package

```bash
npm install @rasenjs/jsx-runtime
```

### 2. Configure TypeScript

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/dom"
  }
}
```

## Usage

```tsx
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount } from '@rasenjs/dom'
import { ref } from 'vue'

useReactiveRuntime()

const App = () => {
  const count = ref(0)
  
  return (
    <div class="app">
      <h1>Hello Rasen</h1>
      <p>Count: {count}</p>
      <button onClick={() => count.value++}>+</button>
    </div>
  )
}

mount(<App />, document.getElementById('app'))
```

## Reactive Values

Refs are automatically tracked:

```tsx
const name = ref('World')

// Both work:
<p>{name}</p>
<p>{name.value}</p>
```

## Event Handlers

```tsx
<button onClick={() => console.log('clicked')}>Click</button>
<input onInput={(e) => text.value = e.target.value} />
```

## Conditionals

```tsx
{isLoading.value ? <Spinner /> : <Content />}
{showHeader && <Header />}
```

## Lists

```tsx
{items.value.map(item => (
  <li key={item.id}>{item.name}</li>
))}
```

## Fragments

```tsx
<>
  <Header />
  <Content />
</>
```

## Custom Tags

```typescript
import { registerTag } from '@rasenjs/jsx-runtime'

registerTag('custom-button', CustomButton)
```

```tsx
<custom-button onClick={handleClick}>Click me</custom-button>
```
