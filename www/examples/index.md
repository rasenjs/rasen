# Examples

Explore complete examples of Rasen in action.

## Counter

A simple counter demonstrating reactive state:

::: code-group

```typescript [DOM]
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { div, button, span, mount } from '@rasenjs/dom'
import { ref } from 'vue'

setReactiveRuntime(createVueRuntime())

const count = ref(0)

const Counter = () =>
  div({
    style: { textAlign: 'center', padding: '20px' },
    children: [
      div({
        style: { fontSize: '48px', margin: '20px' },
        textContent: () => `${count.value}`
      }),
      div({
        children: [
          button({
            textContent: '-',
            style: { padding: '10px 20px', marginRight: '10px' },
            on: { click: () => count.value-- }
          }),
          button({
            textContent: '+',
            style: { padding: '10px 20px' },
            on: { click: () => count.value++ }
          })
        ]
      })
    ]
  })

mount(Counter(), document.getElementById('app'))
```

```typescript [React Native]
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import {
  view,
  text,
  touchableOpacity,
  registerApp
} from '@rasenjs/react-native'
import { ref } from 'vue'

setReactiveRuntime(createVueRuntime())

const App = () => {
  const count = ref(0)

  return view({
    style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    children: [
      text({
        style: { fontSize: 48, marginBottom: 20 },
        children: () => `${count.value}`
      }),
      view({
        style: { flexDirection: 'row', gap: 10 },
        children: [
          touchableOpacity({
            onPress: () => count.value--,
            style: { padding: 15, backgroundColor: '#f44336', borderRadius: 8 },
            children: text({
              style: { color: 'white', fontSize: 24 },
              children: '-'
            })
          }),
          touchableOpacity({
            onPress: () => count.value++,
            style: { padding: 15, backgroundColor: '#4CAF50', borderRadius: 8 },
            children: text({
              style: { color: 'white', fontSize: 24 },
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

:::

## Todo List

A complete todo application:

```typescript
import { setReactiveRuntime, each } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { div, input, button, ul, li, span, mount } from '@rasenjs/dom'
import { ref, computed } from 'vue'

setReactiveRuntime(createVueRuntime())

interface Todo {
  id: number
  text: string
  done: boolean
}

const todos = ref<Todo[]>([])
const newTodo = ref('')
let nextId = 1

const remaining = computed(() => todos.value.filter((t) => !t.done).length)

const addTodo = () => {
  if (newTodo.value.trim()) {
    todos.value.push({
      id: nextId++,
      text: newTodo.value.trim(),
      done: false
    })
    newTodo.value = ''
  }
}

const toggleTodo = (id: number) => {
  const todo = todos.value.find((t) => t.id === id)
  if (todo) todo.done = !todo.done
}

const removeTodo = (id: number) => {
  todos.value = todos.value.filter((t) => t.id !== id)
}

const TodoApp = () =>
  div({
    style: { maxWidth: '400px', margin: '0 auto', padding: '20px' },
    children: [
      // Header
      div({
        style: { marginBottom: '20px' },
        children: [
          input({
            value: newTodo,
            attrs: { placeholder: 'What needs to be done?' },
            style: { width: '70%', padding: '10px' },
            on: {
              input: (e) =>
                (newTodo.value = (e.target as HTMLInputElement).value),
              keypress: (e) => e.key === 'Enter' && addTodo()
            }
          }),
          button({
            textContent: 'Add',
            style: { width: '25%', marginLeft: '5%', padding: '10px' },
            on: { click: addTodo }
          })
        ]
      }),

      // Todo list
      ul({
        style: { listStyle: 'none', padding: 0 },
        children: [
          each(todos, (todo) =>
            li({
              style: {
                display: 'flex',
                alignItems: 'center',
                padding: '10px',
                borderBottom: '1px solid #eee'
              },
              children: [
                input({
                  attrs: { type: 'checkbox', checked: todo.done },
                  on: { change: () => toggleTodo(todo.id) }
                }),
                span({
                  textContent: todo.text,
                  style: () => ({
                    flex: 1,
                    marginLeft: '10px',
                    textDecoration: todo.done ? 'line-through' : 'none',
                    color: todo.done ? '#999' : '#333'
                  })
                }),
                button({
                  textContent: '×',
                  style: {
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer'
                  },
                  on: { click: () => removeTodo(todo.id) }
                })
              ]
            })
          )
        ]
      }),

      // Footer
      div({
        style: { marginTop: '20px', color: '#666' },
        textContent: () => `${remaining.value} items remaining`
      })
    ]
  })

mount(TodoApp(), document.getElementById('app'))
```

## Canvas Animation

Animated graphics using Canvas 2D:

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'
import { ref, computed } from 'vue'

setReactiveRuntime(createVueRuntime())

const time = ref(0)
const x = computed(() => 200 + Math.sin(time.value * 0.02) * 150)
const y = computed(() => 150 + Math.cos(time.value * 0.03) * 100)
const radius = computed(() => 30 + Math.sin(time.value * 0.05) * 10)
const hue = computed(() => Math.floor(time.value * 0.5) % 360)

// Animation loop
setInterval(() => time.value++, 16)

const Animation = () =>
  canvas({
    width: 400,
    height: 300,
    style: { border: '1px solid #ccc' },
    children: [
      // Background
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),

      // Animated circle
      circle({
        x,
        y,
        radius,
        fill: () => `hsl(${hue.value}, 70%, 60%)`
      }),

      // Trail circles
      ...Array.from({ length: 10 }, (_, i) => {
        const offset = i * 5
        return circle({
          x: () => 200 + Math.sin((time.value - offset) * 0.02) * 150,
          y: () => 150 + Math.cos((time.value - offset) * 0.03) * 100,
          radius: () => 5 + (10 - i),
          fill: () =>
            `hsla(${(hue.value - i * 10) % 360}, 70%, 60%, ${0.1 + (10 - i) * 0.05})`
        })
      }),

      // FPS counter
      text({
        text: () => `Frame: ${time.value}`,
        x: 10,
        y: 20,
        fill: 'white',
        font: '14px monospace'
      })
    ]
  })

mount(Animation(), document.getElementById('app'))
```

## Running Examples

Clone the repository and run:

```bash
git clone https://github.com/rasenjs/rasen.git
cd rasen
yarn install
yarn examples:dev
```

Visit `http://localhost:5173` to see the examples in action.
