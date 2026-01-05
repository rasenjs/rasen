/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { TodoList } from '../components/TodoList'

export const TodoView = () => {
  return (
    <div class="view-container">
      <div class="view-header">
        <h2 class="view-title">📝 Todo List</h2>
        <p class="view-desc">Manage your tasks with add, complete, and delete functionality</p>
      </div>
      <TodoList />
    </div>
  )
}
