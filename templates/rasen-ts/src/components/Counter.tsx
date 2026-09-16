import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'

export const Counter = com(() => {
  // Signals are the state primitive: read with get(), write with set().
  const count = new Signal.State(0)
  const double = new Signal.Computed(() => count.get() * 2)
  const square = new Signal.Computed(() => count.get() * count.get())
  const isEven = new Signal.Computed(() => count.get() % 2 === 0)

  const increment = () => count.set(count.get() + 1)
  const decrement = () => count.set(count.get() - 1)
  const reset = () => count.set(0)
  const addTen = () => count.set(count.get() + 10)

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
            <span class="stat-value">{isEven.get() ? 'Even' : 'Odd'}</span>
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
