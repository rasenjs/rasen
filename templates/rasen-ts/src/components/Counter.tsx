/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'
import { ref, computed } from '@rasenjs/reactive-signals'

export const Counter = com(() => {
  const count = ref(0)
  const double = computed(() => count.value * 2)
  const isEven = computed(() => count.value % 2 === 0)

  const increment = () => count.value++
  const decrement = () => count.value--
  const reset = () => (count.value = 0)
  const addTen = () => (count.value += 10)

  return (
    <div class="counter-demo">
      <div class="counter-display">
        <div class="counter-value">
          <span class="count-number">{count}</span>
          <span class="count-label">Current Value</span>
        </div>
        <div class="counter-stats">
          <div class="stat">
            <span class="stat-value">{double}</span>
            <span class="stat-label">Double</span>
          </div>
          <div class="stat">
            <span class="stat-value">{computed(() => count.value * count.value)}</span>
            <span class="stat-label">Square</span>
          </div>
          <div class="stat">
            <span class="stat-value">{computed(() => isEven.value ? 'Even' : 'Odd')}</span>
            <span class="stat-label">Parity</span>
          </div>
        </div>
      </div>

      <div class="counter-controls">
        <button onClick={decrement} class="btn btn-icon">
          −
        </button>
        <button onClick={reset} class="btn btn-secondary">Reset</button>
        <button onClick={addTen} class="btn btn-secondary">+10</button>
        <button onClick={increment} class="btn btn-icon btn-primary">
          +
        </button>
      </div>

      <p class="demo-hint">
        Current count is {count}. That's {double} when doubled!
      </p>
      <p class="demo-hint">
        This example demonstrates <strong>computed values</strong> that automatically 
        update when the count changes.
      </p>
    </div>
  )
})
