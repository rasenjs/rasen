/**
 * A plain object handed to `style` has to be applied *and kept current*.
 *
 * This is the shape `@rasenjs/dom`'s own renderers produce when they build a style
 * object at runtime: `renderWidget` in the arpg example spreads one object literal and
 * passes it to a `<div style={...}>`, and the JSX compiler hands `bindStyle` a plain
 * object rather than a getter.
 *
 * The bug these tests pin: `bindStyle`'s non-reactive branch iterates the object once
 * through `watchObjectProps`, so a *later* object bound to the same element is never
 * read. Everything that writes a style dynamically and then changes it — a widget that
 * becomes interactive, a sprite whose frame changes the crop, a panel that opens — keeps
 * the first render's values for the life of the element.
 *
 * Found in the arpg example, where it made the front end's Play button permanently
 * `pointer-events: none`: the widget reported `interactive: true` on 91 consecutive
 * renders, its `pointerdown` handler was bound and worked when dispatched, and the
 * element was unclickable because the first style object to reach it said `none`.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from '@rasenjs/reactive-vue'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { bindStyle } from '../template'

let host: HTMLElement

beforeEach(() => {
  useReactiveRuntime()
  host = document.createElement('div')
  document.body.appendChild(host)
})

/** An element the way a renderer hands one over: created, then bound. */
function element(): HTMLElement {
  const el = document.createElement('div')
  host.appendChild(el)
  return el
}

describe('a plain object bound to style', () => {
  it('applies every key, dash-cased keys included', () => {
    const el = element()
    bindStyle(el, { 'pointer-events': 'none', left: '10px', backgroundColor: 'red' })
    expect(el.style.getPropertyValue('pointer-events')).toBe('none')
    expect(el.style.left).toBe('10px')
    expect(el.style.backgroundColor).toBe('red')
  })

  it('applies a later change to the same key', () => {
    // The object identity is what changes: a renderer building its style at runtime
    // makes a fresh literal every time it runs, so "bind the same object again" is not
    // the case that matters — a *different* object with a different value is.
    const el = element()
    bindStyle(el, { 'pointer-events': 'none' })
    expect(el.style.getPropertyValue('pointer-events')).toBe('none')

    bindStyle(el, { 'pointer-events': 'auto' })
    expect(el.style.getPropertyValue('pointer-events')).toBe('auto')
  })

  it('drops a key the later object does not carry', () => {
    const el = element()
    bindStyle(el, { left: '10px', top: '20px' })
    bindStyle(el, { left: '30px' })
    expect(el.style.left).toBe('30px')
    // A style object is the element's whole style, so a key it no longer mentions is
    // no longer set — otherwise a stale crop or offset survives a rebuild.
    expect(el.style.top).toBe('')
  })

  it('re-reads a getter inside the object', () => {
    // The mixed case a renderer produces when part of its style is reactive: the reader
    // has to honour the function for the keys that are one.
    const hidden = ref(false)
    const el = element()
    bindStyle(el, { left: '1px', top: () => (hidden.value ? '2px' : '3px') })
    expect(el.style.top).toBe('3px')
    hidden.value = true
    expect(el.style.top).toBe('2px')
  })
})
