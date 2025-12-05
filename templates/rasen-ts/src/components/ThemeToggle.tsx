/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'
import { computed } from '@rasenjs/reactive-signals'
import { isDark } from '../App'

export const ThemeToggle = com(() => {
  const toggle = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('light', !isDark.value)
  }

  return (
    <button class="theme-toggle" onClick={toggle}>
      <span class="theme-icon">
        {computed(() => isDark.value ? '🌙' : '☀️')}
      </span>
    </button>
  )
})
