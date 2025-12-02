import { setReactiveRuntime, getReactiveRuntime, each } from '@rasenjs/core'
import { createReactiveRuntime, ref } from '@rasenjs/reactive-signals'
import { div, h1, input, button, ul, li, span, mount } from '@rasenjs/dom'

// 初始化 Signals 响应式运行时
console.log('Setting reactive runtime...')
setReactiveRuntime(createReactiveRuntime())
console.log('Runtime set:', getReactiveRuntime())

interface Todo {
  id: number
  text: string
}

const todos = ref<Todo[]>([])
const inputValue = ref('')

let nextId = 1

function addTodo() {
  console.log('addTodo called, inputValue:', inputValue.value)
  const text = inputValue.value.trim()
  if (!text) {
    console.log('text is empty')
    return
  }
  
  console.log('adding todo:', text)
  todos.value = [...todos.value, { id: nextId++, text }]
  inputValue.value = ''
  console.log('todos after add:', todos.value)
}

function removeTodo(id: number) {
  todos.value = todos.value.filter(todo => todo.id !== id)
}

function createApp() {
  console.log('Creating app...')
  console.log('inputValue ref:', inputValue)
  
  return div(
    h1('📝 Todo List'),
    div(
    { class: 'input-group' },
    input({
      type: 'text',
      placeholder: 'Add a new todo...',
      value: inputValue,
      onInput: (e: Event) => {
        console.log('input event:', e)
        inputValue.value = (e.target as HTMLInputElement).value
        console.log('inputValue updated to:', inputValue.value)
      },
      onKeyPress: (e: Event) => {
        console.log('keypress event:', e)
        if ((e as KeyboardEvent).key === 'Enter') {
          console.log('Enter pressed')
          addTodo()
        }
      }
    }),
    button(
      {
        class: 'add-btn',
        onClick: () => {
          console.log('button clicked')
          addTodo()
        }
      },
      'Add'
    )
  ),
  ul(
    { class: 'todo-list' },
    each(todos, (todo) =>
      li(
        { class: 'todo-item', key: todo.id },
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
}

// 确保在 DOM 加载后再初始化
const app = createApp()
mount(app, document.getElementById('app')!)
