/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { Timer } from '../components/Timer'

export const TimerView = () => {
  return (
    <div class="view-container">
      <div class="view-header">
        <h2 class="view-title">⏱️ Timer</h2>
        <p class="view-desc">Track time with start, pause, and reset controls</p>
      </div>
      <Timer />
    </div>
  )
}
