import { each, com } from '@rasenjs/core'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, h1, input, button, ul, li, span, mount } from '@rasenjs/dom'

// 初始化 Signals 响应式运行时
useReactiveRuntime()

interface Todo {
  id: number
  text: string
}

const todos = ref<Todo[]>([])
const inputValue = ref('')

let nextId = 1

function addTodo() {
  const text = inputValue.value.trim()
  if (!text) return
  
  todos.value = [...todos.value, { id: nextId++, text }]
  inputValue.value = ''
}

function removeTodo(id: number) {
  todos.value = todos.value.filter(todo => todo.id !== id)
}

const createApp = com(() => {
  return div(
    h1('📝 Todo List'),
    div(
      { class: 'input-group' },
      input({
        type: 'text',
        placeholder: 'Add a new todo...',
        onInput: (e: Event) => {
          inputValue.value = (e.target as HTMLInputElement).value
        },
        onKeyPress: (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            addTodo()
          }
        }
      }),
      button(
        {
          class: 'add-btn',
          onClick: () => addTodo()
        },
        'Add'
      )
    ),
    ul(
      { class: 'todo-list' },
      each(todos, (todo) =>
        li(
          { class: 'todo-item' },
          span({ class: 'todo-text' }, todo.text),
          button(
            {
              class: 'delete-btn',
              onClick: () => removeTodo(todo.id)
            },
            'Delete'
          )
        )
      )
    )
  )
})

// 挂载到 DOM
const app = createApp()
mount(app, document.getElementById('app')!)
