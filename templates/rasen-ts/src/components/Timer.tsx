/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { ref, computed } from '@rasenjs/reactive-signals'
import { f } from '@rasenjs/core'

export const Timer = () => {
  const seconds = ref(0)
  const isRunning = ref(false)
  const intervalRef = ref<number | null>(null)

  const formattedTime = computed(() => {
    const mins = Math.floor(seconds.value / 60)
    const secs = seconds.value % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  })

  const progress = computed(() => {
    // Progress bar cycles every 60 seconds
    return (seconds.value % 60) / 60 * 100
  })

  const start = () => {
    if (isRunning.value) return
    isRunning.value = true
    intervalRef.value = window.setInterval(() => {
      seconds.value++
    }, 1000)
  }

  const pause = () => {
    if (!isRunning.value) return
    isRunning.value = false
    if (intervalRef.value) {
      clearInterval(intervalRef.value)
      intervalRef.value = null
    }
  }

  const reset = () => {
    pause()
    seconds.value = 0
  }

  const addMinute = () => {
    seconds.value += 60
  }

  return (
    <div class="timer-demo">
      {/* Timer Display */}
      <div class="timer-circle">
        <div class="timer-ring" style={{ background: `conic-gradient(from 0deg, #ed1c24, #a34fe4 ${progress.value}%, transparent ${progress.value}%)` }}>
        </div>
        <div class="timer-display">
          <span class="timer-time">{formattedTime}</span>
          <span class="timer-status">
            {computed(() => isRunning.value ? 'Running' : 'Paused')}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div class="timer-controls">
        <button 
          onClick={() => isRunning.value ? pause() : start()} 
          class="btn btn-primary btn-large"
        >
          {computed(() => isRunning.value ? '⏸ Pause' : '▶ Start')}
        </button>
        <button onClick={reset} class="btn btn-secondary">
          ↺ Reset
        </button>
        <button onClick={addMinute} class="btn btn-secondary">
          +1 Min
        </button>
      </div>

      {/* Lap Times / Stats */}
      <div class="timer-stats">
        <div class="timer-stat">
          <span class="timer-stat-value">{computed(() => Math.floor(seconds.value / 60))}</span>
          <span class="timer-stat-label">Minutes</span>
        </div>
        <div class="timer-stat">
          <span class="timer-stat-value">{computed(() => seconds.value % 60)}</span>
          <span class="timer-stat-label">Seconds</span>
        </div>
        <div class="timer-stat">
          <span class="timer-stat-value">{seconds}</span>
          <span class="timer-stat-label">Total Sec</span>
        </div>
      </div>

      <p class="demo-hint">
        {f`Elapsed: ${formattedTime} (${seconds} seconds total)`}
      </p>
      <p class="demo-hint">
        This example demonstrates <strong>side effects</strong> with intervals 
        and SVG animations driven by reactive state.
      </p>
    </div>
  )
}
