/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'
import { ref, computed } from '@rasenjs/reactive-signals'
import { each } from '@rasenjs/core'

interface Todo {
  id: number
  text: string
  completed: boolean
}

export const TodoList = com(() => {
  const todos = ref<Todo[]>([
    { id: 1, text: 'Learn Rasen basics', completed: true },
    { id: 2, text: 'Build a reactive app', completed: false },
    { id: 3, text: 'Deploy to production', completed: false },
  ])
  const inputValue = ref('')
  const filter = ref<'all' | 'active' | 'completed'>('all')
  
  let nextId = 4

  const filteredTodos = computed(() => {
    const list = todos.value
    switch (filter.value) {
      case 'active':
        return list.filter(t => !t.completed)
      case 'completed':
        return list.filter(t => t.completed)
      default:
        return list
    }
  })

  const stats = computed(() => {
    const total = todos.value.length
    const completed = todos.value.filter(t => t.completed).length
    const active = total - completed
    return { total, completed, active }
  })

  const addTodo = () => {
    const text = inputValue.value.trim()
    if (!text) return
    todos.value = [...todos.value, { id: nextId++, text, completed: false }]
    inputValue.value = ''
  }

  const toggleTodo = (id: number) => {
    todos.value = todos.value.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    )
  }

  const removeTodo = (id: number) => {
    todos.value = todos.value.filter(t => t.id !== id)
  }

  const clearCompleted = () => {
    todos.value = todos.value.filter(t => !t.completed)
  }

  return (
    <div class="todo-demo">
      {/* Input */}
      <div class="todo-input-group">
        <input
          type="text"
          class="todo-input"
          placeholder="What needs to be done?"
          value={inputValue}
          onInput={(e: Event) => {
            inputValue.value = (e.target as HTMLInputElement).value
          }}
          onKeyPress={(e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') addTodo()
          }}
        />
        <button onClick={addTodo} class="btn btn-primary">Add</button>
      </div>

      {/* Stats */}
      <div class="todo-stats">
        <span class="stat-item">
          {computed(() => `${stats.value.total} total`)}
        </span>
        <span class="stat-item">
          {computed(() => `${stats.value.active} active`)}
        </span>
        <span class="stat-item">
          {computed(() => `${stats.value.completed} done`)}
        </span>
      </div>

      {/* Filters */}
      <div class="todo-filters">
        <button 
          class={computed(() => `filter-btn ${filter.value === 'all' ? 'active' : ''}`)}
          onClick={() => filter.value = 'all'}
        >
          All
        </button>
        <button 
          class={computed(() => `filter-btn ${filter.value === 'active' ? 'active' : ''}`)}
          onClick={() => filter.value = 'active'}
        >
          Active
        </button>
        <button 
          class={computed(() => `filter-btn ${filter.value === 'completed' ? 'active' : ''}`)}
          onClick={() => filter.value = 'completed'}
        >
          Completed
        </button>
      </div>

      {/* List */}
      <ul class="todo-list">
        {each(filteredTodos, (todo) => (
          <li class={computed(() => `todo-item ${todo.completed ? 'completed' : ''}`)}>
            <label class="todo-checkbox">
              <input 
                type="checkbox" 
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
              />
              <span class="checkmark"></span>
            </label>
            <span class="todo-text">{todo.text}</span>
            <button 
              class="todo-delete" 
              onClick={() => removeTodo(todo.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div class="todo-actions">
        <button 
          onClick={clearCompleted} 
          class={computed(() => `btn btn-text ${stats.value.completed > 0 ? '' : 'disabled'}`)}
        >
          Clear completed
        </button>
      </div>

      <p class="demo-hint">
        This example shows <strong>reactive lists</strong> with filtering, 
        computed statistics, and dynamic class bindings.
      </p>
    </div>
  )
})
