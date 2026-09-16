import { Signal } from 'signal-polyfill'
import { com, each } from '@rasenjs/core'

interface Todo {
  id: number
  text: string
  completed: boolean
}

type Filter = 'all' | 'active' | 'completed'

export const TodoList = com(() => {
  let nextId = 4

  const todos = new Signal.State<Todo[]>([
    { id: 1, text: 'Learn Rasen basics', completed: true },
    { id: 2, text: 'Build a reactive app', completed: false },
    { id: 3, text: 'Deploy to production', completed: false }
  ])
  const inputValue = new Signal.State('')
  const filter = new Signal.State<Filter>('all')

  const filteredTodos = new Signal.Computed(() => {
    const list = todos.get()
    switch (filter.get()) {
      case 'active':
        return list.filter((t) => !t.completed)
      case 'completed':
        return list.filter((t) => t.completed)
      default:
        return list
    }
  })

  const stats = new Signal.Computed(() => {
    const list = todos.get()
    const completed = list.filter((t) => t.completed).length
    return { total: list.length, active: list.length - completed, completed }
  })

  const addTodo = () => {
    const value = inputValue.get().trim()
    if (!value) return
    todos.set([...todos.get(), { id: nextId++, text: value, completed: false }])
    inputValue.set('')
  }

  const toggleTodo = (id: number) => {
    todos.set(
      todos.get().map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }

  const removeTodo = (id: number) => {
    todos.set(todos.get().filter((t) => t.id !== id))
  }

  const clearCompleted = () => {
    todos.set(todos.get().filter((t) => !t.completed))
  }

  return (
    <div class="todo-demo">
      {/* Input */}
      <div class="todo-input-group">
        <input
          type="text"
          class="todo-input"
          placeholder="What needs to be done?"
          value={() => inputValue.get()}
          onInput={(e: Event) => {
            inputValue.set((e.target as HTMLInputElement).value)
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') addTodo()
          }}
        />
        <button onClick={addTodo} class="btn btn-primary">Add</button>
      </div>

      {/* Stats */}
      <div class="todo-stats">
        <span class="stat-item">{`${stats.get().total} total`}</span>
        <span class="stat-item">{`${stats.get().active} active`}</span>
        <span class="stat-item">{`${stats.get().completed} done`}</span>
      </div>

      {/* Filters */}
      <div class="todo-filters">
        <button
          class={() => `filter-btn ${filter.get() === 'all' ? 'active' : ''}`}
          onClick={() => filter.set('all')}
        >
          All
        </button>
        <button
          class={() => `filter-btn ${filter.get() === 'active' ? 'active' : ''}`}
          onClick={() => filter.set('active')}
        >
          Active
        </button>
        <button
          class={() => `filter-btn ${filter.get() === 'completed' ? 'active' : ''}`}
          onClick={() => filter.set('completed')}
        >
          Completed
        </button>
      </div>

      {/* List */}
      <ul class="todo-list">
        {each(
          () => filteredTodos.get(),
          (todo) => (
            <li class={() => `todo-item ${todo.completed ? 'completed' : ''}`}>
              <label class="todo-checkbox">
                <input
                  type="checkbox"
                  checked={() => todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span class="checkmark"></span>
              </label>
              <span class="todo-text">{todo.text}</span>
              <button class="todo-delete" onClick={() => removeTodo(todo.id)}>
                ×
              </button>
            </li>
          )
        )}
      </ul>

      {/* Actions */}
      <div class="todo-actions">
        <button
          onClick={clearCompleted}
          class={() => `btn btn-text ${stats.get().completed > 0 ? '' : 'disabled'}`}
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
