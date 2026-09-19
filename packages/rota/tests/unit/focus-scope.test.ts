/**
 * Focus scope.
 *
 * The trap is keyboard behaviour, so these tests dispatch real `keydown`
 * events and read `document.activeElement` — the same things a browser decides.
 * Containers are attached to `document.body`: `focus()` has no effect on a
 * detached element in jsdom, which would make every assertion here vacuous.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFocusScope, focusablesIn } from '../../src/internal/focus-scope'

let container: HTMLElement
let outside: HTMLButtonElement

beforeEach(() => {
  container = document.createElement('div')
  container.tabIndex = -1
  container.innerHTML = `
    <button id="first">first</button>
    <button id="middle">middle</button>
    <button id="last">last</button>
  `
  outside = document.createElement('button')
  outside.id = 'outside'
  document.body.append(outside, container)
})

afterEach(() => {
  container.remove()
  outside.remove()
})

const el = (id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`#${id}`)!

const tab = (target: HTMLElement, shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

describe('@rasenjs/rota - focus scope', () => {
  describe('focusablesIn', () => {
    it('should list focusables in document order', () => {
      expect(focusablesIn(container).map((n) => n.id)).toEqual([
        'first',
        'middle',
        'last'
      ])
    })

    it('should skip disabled, tabindex="-1" and hidden elements', () => {
      container.innerHTML = `
        <button id="a">a</button>
        <button id="disabled" disabled>b</button>
        <button id="negative" tabindex="-1">c</button>
        <button id="hidden" hidden>d</button>
        <div aria-hidden="true"><button id="aria">e</button></div>
        <button id="styled" style="display: none">f</button>
        <div hidden><button id="nested">g</button></div>
        <button id="z">h</button>
      `
      expect(focusablesIn(container).map((n) => n.id)).toEqual(['a', 'z'])
    })
  })

  describe('while inactive', () => {
    it('should not interfere with Tab', () => {
      const scope = createFocusScope({ container: () => container })
      el('last').focus()

      const event = tab(el('last'))

      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(el('last'))
      expect(scope.isActive()).toBe(false)
    })
  })

  describe('while active', () => {
    let scope: ReturnType<typeof createFocusScope>

    beforeEach(() => {
      scope = createFocusScope({ container: () => container })
      scope.activate()
    })

    afterEach(() => {
      scope.deactivate()
    })

    it('should wrap forward from the last focusable', () => {
      el('last').focus()
      const event = tab(el('last'))
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(el('first'))
    })

    it('should wrap backward from the first focusable', () => {
      el('first').focus()
      const event = tab(el('first'), true)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(el('last'))
    })

    it('should leave Tab in the middle alone', () => {
      el('middle').focus()
      const event = tab(el('middle'))
      expect(event.defaultPrevented).toBe(false)
    })

    it('should pull focus back when it is outside the container', () => {
      outside.focus()
      const event = tab(outside)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(el('first'))
    })

    it('should pull focus to the last one on shift+Tab from outside', () => {
      outside.focus()
      const event = tab(outside, true)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(el('last'))
    })

    it('should wrap around the enabled range, not the disabled tail', () => {
      container.innerHTML = `
        <button id="a">a</button>
        <button id="b">b</button>
        <button id="dead" disabled>dead</button>
      `
      el('b').focus()
      tab(el('b'))
      expect(document.activeElement).toBe(el('a'))
    })

    it('should keep focus on the container when nothing is focusable', () => {
      container.innerHTML = '<span>just text</span>'
      container.focus()
      const event = tab(container)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(container)
    })

    it('should report containment', () => {
      expect(scope.contains(el('a') ?? container)).toBe(true)
      expect(scope.contains(el('first'))).toBe(true)
      expect(scope.contains(outside)).toBe(false)
      expect(scope.contains(null)).toBe(false)
    })

    it('should focus a given element', () => {
      scope.focus(el('middle'))
      expect(document.activeElement).toBe(el('middle'))
    })

    it('should focus the first focusable when given nothing', () => {
      scope.focus()
      expect(document.activeElement).toBe(el('first'))
    })

    it('should focus the container when it holds nothing focusable', () => {
      container.innerHTML = '<span>text</span>'
      scope.focus()
      expect(document.activeElement).toBe(container)
    })

    it('should be idempotent', () => {
      scope.activate()
      scope.deactivate()
      expect(scope.isActive()).toBe(false)
    })
  })

  describe('restoring focus', () => {
    it('should put focus back where it was', () => {
      outside.focus()
      const scope = createFocusScope({ container: () => container })
      scope.activate()
      scope.focus(el('first'))
      expect(document.activeElement).toBe(el('first'))

      scope.deactivate()

      expect(document.activeElement).toBe(outside)
    })

    it('should restore when the previous element is no longer in the document', () => {
      const scope = createFocusScope({ container: () => container })
      scope.activate()
      scope.focus(el('first'))
      outside.remove()

      // Nothing to restore to: focus must not be thrown away.
      expect(() => scope.deactivate()).not.toThrow()
      expect(document.activeElement).toBe(el('first'))
    })

    it('should keep focus the consumer moved elsewhere on purpose', () => {
      outside.focus()
      const scope = createFocusScope({ container: () => container })
      scope.activate()
      scope.focus(el('first'))

      const other = document.createElement('button')
      document.body.append(other)
      other.focus()
      scope.deactivate()

      expect(document.activeElement).toBe(other)
      other.remove()
    })
  })
})
