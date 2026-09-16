import { com } from '@rasenjs/core'
import { isDark, toggleTheme } from '../theme'

export const ThemeToggle = com(() => (
  <button class="theme-toggle" onClick={toggleTheme}>
    <span class="theme-icon">{isDark.get() ? '🌙' : '☀️'}</span>
  </button>
))
