/// <reference types="@rasenjs/jsx/jsx" />

import { Counter } from '../components/Counter'

export const CounterView = () => {
  return (
    <div class="view-container">
      <div class="view-header">
        <h2 class="view-title">🔢 Counter</h2>
        <p class="view-desc">A simple counter with increment, decrement, and reset operations</p>
      </div>
      <Counter />
    </div>
  )
}
