import { each } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, input, button, ul, li, span, mount } from '@rasenjs/dom'
import { ref, computed } from '@vue/reactivity'

useReactiveRuntime()

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

mount(TodoApp(), document.getElementById('app')!)
