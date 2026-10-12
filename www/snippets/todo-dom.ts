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
    todos.value.push({ id: nextId++, text: newTodo.value.trim(), done: false })
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
  div(
    { style: { maxWidth: '400px', margin: '0 auto', padding: '20px' } },
    // Header — input.value is a DOM property, so a ref writes straight to it
    div(
      { style: { marginBottom: '20px' } },
      input({
        value: newTodo,
        placeholder: 'What needs to be done?',
        style: { width: '70%', padding: '10px' },
        onInput: (e) => (newTodo.value = (e.target as HTMLInputElement).value),
        onKeyPress: (e: KeyboardEvent) => e.key === 'Enter' && addTodo()
      }),
      button(
        { style: { width: '25%', marginLeft: '5%', padding: '10px' }, onClick: addTodo },
        'Add'
      )
    ),

    // List — each() reconciles by object identity, so rows move instead of
    // being rebuilt; `of` is a getter so the list stays subscribed
    ul(
      { style: { listStyle: 'none', padding: 0 } },
      each({
        of: () => todos.value,
        children: (todo: Todo) =>
          li(
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                padding: '10px',
                borderBottom: '1px solid #eee'
              }
            },
            input({
              type: 'checkbox',
              checked: todo.done,
              onChange: () => toggleTodo(todo.id)
            }),
            span(
              {
                style: () => ({
                  flex: 1,
                  marginLeft: '10px',
                  textDecoration: todo.done ? 'line-through' : 'none',
                  color: todo.done ? '#999' : '#333'
                })
              },
              todo.text
            ),
            button(
              {
                style: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' },
                onClick: () => removeTodo(todo.id)
              },
              '×'
            )
          )
      })
    ),

    // Footer — a computed ref child is a reactive text node
    div(
      { style: { marginTop: '20px', color: '#666' } },
      remaining,
      ' items remaining'
    )
  )

mount(TodoApp(), document.getElementById('app')!)
