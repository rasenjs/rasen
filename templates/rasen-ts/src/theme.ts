/**
 * Theme state shared by the header toggle and the root component.
 *
 * Module scope keeps the value identical for every reader, which is what a
 * global theme needs. Note that under SSR this state is per server process — a
 * real multi-user app would carry it per request instead, so that concurrent
 * renders cannot observe each other's theme.
 */
import { Signal } from 'signal-polyfill'

export const isDark = new Signal.State(true)

/** Flip the theme and mirror it onto the document element. */
export function toggleTheme(): void {
  const next = !isDark.get()
  isDark.set(next)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('light', !next)
  }
}
