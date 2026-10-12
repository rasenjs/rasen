import { com } from '@rasenjs/core'
// The adapter's helpers are the typed state primitives: `.value` reads/writes,
// and the signals behind them are what the renderer subscribes to.
import { ref, computed } from '@rasenjs/reactive-signals'

export const Counter = com(() => {
  const count = ref(0)
  const double = computed(() => count.value * 2)
  const square = computed(() => count.value * count.value)
  const isEven = computed(() => count.value % 2 === 0)

  const increment = () => (count.value += 1)
  const decrement = () => (count.value -= 1)
  const reset = () => (count.value = 0)
  const addTen = () => (count.value += 10)

  return (
    <div class="counter-demo">
      <div class="counter-display">
        <div class="counter-value">
          {/* A bare ref interpolates directly: the compiler emits a
              renderText() binding that unwraps it via the active runtime.
              Expressions derived from a ref still read explicitly. */}
          <span class="count-number">{count}</span>
          <span class="count-label">Current Value</span>
        </div>
        <div class="counter-stats">
          <div class="stat">
            <span class="stat-value">{double}</span>
            <span class="stat-label">Double</span>
          </div>
          <div class="stat">
            <span class="stat-value">{square}</span>
            <span class="stat-label">Square</span>
          </div>
          <div class="stat">
            <span class="stat-value">{isEven.value ? 'Even' : 'Odd'}</span>
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
