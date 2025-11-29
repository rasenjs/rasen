# Components

Components in Rasen are pure functions. This guide covers patterns for building reusable, composable components.

## Basic Structure

A component is a function that returns a `MountFunction`:

```typescript
const MyComponent = () => {
  // Setup phase: reactive state
  const state = ref('initial')
  
  // Return mount function (usually via a primitive)
  return div({
    textContent: () => state.value
  })
}
```

## With Props

Components can accept props:

```typescript
interface ButtonProps {
  label: string | (() => string)
  onClick: () => void
  disabled?: boolean
}

const Button = (props: ButtonProps) => {
  return button({
    textContent: props.label,
    on: { click: props.onClick },
    attrs: { disabled: props.disabled }
  })
}

// Usage
Button({
  label: 'Click Me',
  onClick: () => console.log('Clicked!')
})
```

## Reactive Props

Props can be reactive:

```typescript
import type { PropValue } from '@rasenjs/core'

interface UserCardProps {
  name: PropValue<string>
  avatar: PropValue<string>
  status?: PropValue<'online' | 'offline'>
}

const UserCard = (props: UserCardProps) => {
  return div({
    className: 'user-card',
    children: [
      img({ src: props.avatar, alt: props.name }),
      span({ textContent: props.name }),
      span({ 
        className: () => `status-${unref(props.status) || 'offline'}` 
      })
    ]
  })
}

// Usage with refs
const userName = ref('Alice')
const userAvatar = ref('/avatar.png')

UserCard({
  name: userName,        // Reactive
  avatar: userAvatar,    // Reactive
  status: 'online'       // Static
})
```

## Composition

Components compose naturally through the `children` prop:

```typescript
const Card = (props: { 
  title: string
  children: MountFunction<HTMLElement>[]
}) => {
  return div({
    className: 'card',
    children: [
      div({ className: 'card-title', textContent: props.title }),
      div({ className: 'card-body', children: props.children })
    ]
  })
}

// Usage
Card({
  title: 'My Card',
  children: [
    p({ textContent: 'Card content here' }),
    Button({ label: 'Action', onClick: () => {} })
  ]
})
```

## Slots Pattern

For more flexible composition, use multiple child slots:

```typescript
interface LayoutProps {
  header?: MountFunction<HTMLElement>
  sidebar?: MountFunction<HTMLElement>
  content: MountFunction<HTMLElement>
  footer?: MountFunction<HTMLElement>
}

const Layout = (props: LayoutProps) => {
  return div({
    className: 'layout',
    children: [
      props.header && div({ className: 'header', children: [props.header] }),
      div({
        className: 'main',
        children: [
          props.sidebar && aside({ className: 'sidebar', children: [props.sidebar] }),
          main({ className: 'content', children: [props.content] })
        ]
      }),
      props.footer && div({ className: 'footer', children: [props.footer] })
    ].filter(Boolean)
  })
}
```

## State Encapsulation

Each component instance has its own state:

```typescript
const Counter = (props: { initial?: number }) => {
  // Each Counter instance gets its own count
  const count = ref(props.initial ?? 0)
  
  return div({
    children: [
      span({ textContent: () => `${count.value}` }),
      button({ textContent: '+', on: { click: () => count.value++ } })
    ]
  })
}

// Two independent counters
div({
  children: [
    Counter({ initial: 0 }),
    Counter({ initial: 100 })
  ]
})
```

## Shared State

For shared state across components, define it outside:

```typescript
// Shared state
const globalCount = ref(0)

const CounterA = () => div({
  children: [
    span({ textContent: () => `A: ${globalCount.value}` }),
    button({ textContent: '+', on: { click: () => globalCount.value++ } })
  ]
})

const CounterB = () => div({
  children: [
    span({ textContent: () => `B: ${globalCount.value}` }),
    button({ textContent: '+', on: { click: () => globalCount.value++ } })
  ]
})
```

## Composable Functions

Extract reusable logic into composable functions:

```typescript
// Composable
const useToggle = (initial = false) => {
  const value = ref(initial)
  const toggle = () => value.value = !value.value
  const setTrue = () => value.value = true
  const setFalse = () => value.value = false
  return { value, toggle, setTrue, setFalse }
}

// Usage in components
const Dropdown = (props: { label: string; children: MountFunction[] }) => {
  const { value: isOpen, toggle } = useToggle()
  
  return div({
    className: 'dropdown',
    children: [
      button({ textContent: props.label, on: { click: toggle } }),
      div({
        className: 'dropdown-menu',
        style: () => ({ display: isOpen.value ? 'block' : 'none' }),
        children: props.children
      })
    ]
  })
}
```

## Lists with `each`

For rendering lists, use the `each` component:

```typescript
import { each } from '@rasenjs/core'

const TodoList = () => {
  const todos = ref([
    { id: 1, text: 'Learn Rasen', done: false },
    { id: 2, text: 'Build something', done: false }
  ])
  
  return div({
    children: [
      each(
        todos,
        (todo, index) => div({
          className: () => todo.done ? 'done' : '',
          children: [
            span({ textContent: todo.text }),
            button({
              textContent: '✓',
              on: { click: () => todo.done = true }
            })
          ]
        })
      )
    ]
  })
}
```

## Async Components

Components can be async:

```typescript
const AsyncUserProfile = async (props: { userId: string }) => {
  // Async setup
  const user = await fetchUser(props.userId)
  
  return div({
    className: 'user-profile',
    children: [
      h1({ textContent: user.name }),
      p({ textContent: user.bio }),
      img({ src: user.avatar })
    ]
  })
}
```

## Conditional Rendering

Several patterns for conditional rendering:

```typescript
// Pattern 1: Ternary in children
div({
  children: [
    isLoading.value 
      ? span({ textContent: 'Loading...' })
      : Content()
  ]
})

// Pattern 2: Style-based
div({
  style: () => ({ display: isVisible.value ? 'block' : 'none' }),
  children: [Content()]
})

// Pattern 3: Filter
div({
  children: [
    showHeader.value && Header(),
    Content(),
    showFooter.value && Footer()
  ].filter(Boolean)
})
```

## Best Practices

### 1. Keep Components Focused

```typescript
// ✅ Good: Single responsibility
const Avatar = (props: { src: string; alt: string }) => 
  img({ src: props.src, alt: props.alt, className: 'avatar' })

const UserName = (props: { name: string }) =>
  span({ textContent: props.name, className: 'user-name' })

const UserBadge = (props: { user: User }) =>
  div({
    className: 'user-badge',
    children: [
      Avatar({ src: props.user.avatar, alt: props.user.name }),
      UserName({ name: props.user.name })
    ]
  })
```

### 2. Use TypeScript for Props

```typescript
// ✅ Good: Well-typed props
interface ModalProps {
  isOpen: PropValue<boolean>
  onClose: () => void
  title: string
  children: MountFunction<HTMLElement>[]
}

const Modal = (props: ModalProps) => { ... }
```

### 3. Extract Complex Logic

```typescript
// ✅ Good: Logic in composable
const useForm = <T>(initial: T) => {
  const values = reactive({ ...initial })
  const errors = ref<Record<string, string>>({})
  const isValid = computed(() => Object.keys(errors.value).length === 0)
  
  const validate = () => { ... }
  const reset = () => { ... }
  
  return { values, errors, isValid, validate, reset }
}
```

## Next Steps

- [JSX Support](/guide/advanced/jsx) — Using JSX syntax
- [Custom Render Targets](/guide/advanced/custom-targets) — Building new targets
