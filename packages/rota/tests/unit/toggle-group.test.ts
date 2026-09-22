import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { text } from '@rasenjs/dom'
import {
  createToggleGroupRoot,
  createToggleGroupItem,
  createToggleGroup,
  toggleGroup
} from '@rasenjs/rota/components/toggle-group'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

// Focus only means anything for elements in the document: the roving helper
// reads `isConnected`, so a detached container has no focusable items.
afterEach(() => {
  document.body.innerHTML = ''
})

/** Build a group from a list of values. */
function build(
  props: Parameters<ReturnType<typeof createToggleGroupRoot>>[0],
  values: string[],
  itemProps: Array<Record<string, unknown>> = []
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const Root = createToggleGroupRoot()
  const Item = createToggleGroupItem()

  Root({
    ...props,
    children: (getContext) => (host: HTMLElement) => {
      const unmounts = values.map((value, index) =>
        Item(
          { value, children: () => text({ content: value }), ...itemProps[index] },
          getContext
        )(host, undefined)
      )
      return () => unmounts.forEach((u) => typeof u === 'function' && u())
    }
  })(container)

  return container
}

const items = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')) as HTMLButtonElement[]

describe('@rasenjs/rota - ToggleGroup', () => {
  it('should be a radiogroup in single mode', () => {
    const c = build({ type: 'single' }, ['a', 'b'])

    const root = c.querySelector('[role="radiogroup"]')
    expect(root).toBeTruthy()
    expect(items(c).map((el) => el.getAttribute('role'))).toEqual([
      'radio',
      'radio'
    ])
  })

  it('should be a group of toggle buttons in multiple mode', () => {
    const c = build({ type: 'multiple' }, ['a', 'b'])

    expect(c.querySelector('[role="group"]')).toBeTruthy()
    expect(items(c).every((el) => el.getAttribute('role') === null)).toBe(true)
    expect(items(c).map((el) => el.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false'
    ])
  })

  it('should keep exactly one option pressed in single mode', () => {
    const c = build({ type: 'single' }, ['a', 'b'])

    items(c)[1]!.click()
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true'
    ])

    // Pressing the pressed option is a no-op, not a toggle-off.
    items(c)[1]!.click()
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true'
    ])

    items(c)[0]!.click()
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'true',
      'false'
    ])
  })

  it('should allow several pressed options in multiple mode', () => {
    const c = build({ type: 'multiple' }, ['a', 'b', 'c'])

    items(c)[0]!.click()
    items(c)[2]!.click()
    expect(items(c).map((el) => el.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true'
    ])

    items(c)[0]!.click()
    expect(items(c).map((el) => el.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true'
    ])
  })

  it('should report changes through onValueChange', () => {
    const seen: string[][] = []
    const c = build(
      { type: 'multiple', onValueChange: (next: string[]) => seen.push(next) },
      ['a', 'b']
    )

    items(c)[0]!.click()
    items(c)[1]!.click()

    expect(seen).toEqual([['a'], ['a', 'b']])
  })

  it('should not change itself while controlled', () => {
    const seen: string[][] = []
    const c = build(
      { type: 'single', value: ['a'], onValueChange: (n: string[]) => seen.push(n) },
      ['a', 'b']
    )

    items(c)[1]!.click()

    expect(seen).toEqual([['b']])
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'true',
      'false'
    ])
  })

  it('should keep one tab stop (roving tabindex)', () => {
    const c = build({ type: 'single', defaultValue: ['b'] }, ['a', 'b', 'c'])

    expect(items(c).map((el) => el.tabIndex)).toEqual([-1, 0, -1])
  })

  it('should select what the arrow keys move to in single mode', () => {
    // Single mode announces radiogroup/radio, so it has to select as it moves.
    // Focusing without selecting would contradict the announced roles.
    const c = build({ type: 'single', defaultValue: ['a'] }, ['a', 'b', 'c'])

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[1])
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false'
    ])
  })

  it('should move focus without selecting in multiple mode', () => {
    // Multiple mode is a group of toggle buttons, not a radio group: the
    // arrows move focus and Enter/Space presses. The difference in behaviour
    // follows the difference in roles.
    const c = build({ type: 'multiple', defaultValue: ['a'] }, ['a', 'b', 'c'])

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[1])
    expect(items(c).map((el) => el.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false'
    ])
  })

  it('should press the focused item with Enter or Space', () => {
    const c = build({ type: 'single', defaultValue: ['a'] }, ['a', 'b'])

    items(c)[1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true'
    ])
  })

  it('should skip disabled items when navigating', () => {
    const c = build({ type: 'single', defaultValue: ['a'] }, ['a', 'b', 'c'], [
      {},
      { disabled: true },
      {}
    ])

    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[2])
  })

  it('should follow the orientation for arrow keys', () => {
    const c = build(
      { type: 'single', orientation: 'vertical', defaultValue: ['a'] },
      ['a', 'b']
    )

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    // Horizontal arrows do nothing in a vertical group.
    expect(document.activeElement).toBe(items(c)[0])

    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    )
    expect(document.activeElement).toBe(items(c)[1])
  })

  it('should mark a disabled root', () => {
    const c = build({ type: 'single', disabled: true }, ['a'])

    const root = c.querySelector('[role="radiogroup"]')
    expect(root?.getAttribute('aria-disabled')).toBe('true')
    expect(root?.getAttribute('data-disabled')).toBe('')
  })

  it('should render items from the preset', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    toggleGroup({
      type: 'multiple',
      defaultValue: ['bold'],
      items: [
        { value: 'bold', label: 'Bold' },
        { value: 'italic', label: 'Italic' }
      ]
    })(c)

    expect(items(c).map((el) => el.textContent)).toEqual(['Bold', 'Italic'])
    expect(items(c)[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('should remove everything on unmount', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const unmount = createToggleGroup()({
      items: [{ value: 'a', label: 'A' }]
    })(c)
    unmount?.()

    expect(c.querySelectorAll('button').length).toBe(0)
  })
})

/**
 * Single mode is a radio group: there is no "toggle off". Re-pressing the
 * pressed option must not report a change — the option itself is the only way
 * to observe that, so assert it there.
 */
describe('@rasenjs/rota - ToggleGroup / single mode cannot be emptied', () => {
  it('should not report a change when the pressed option is pressed again', () => {
    const seen: string[][] = []
    const c = build(
      {
        type: 'single',
        defaultValue: ['a'],
        onValueChange: (next: string[]) => seen.push(next)
      },
      ['a', 'b']
    )

    items(c)[0]!.click()
    items(c)[0]!.click()

    expect(seen).toEqual([])
    expect(items(c)[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('should never leave the group without a pressed option', () => {
    const c = build({ type: 'single', defaultValue: ['a'] }, ['a', 'b'])

    // Enter on the pressed item, then Space on it.
    for (const key of ['Enter', ' ']) {
      items(c)[0]!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true })
      )
    }

    expect(
      items(c).filter((el) => el.getAttribute('aria-checked') === 'true').length
    ).toBe(1)
  })

  it('should stop at the ends when loop is off', () => {
    const c = build(
      { type: 'single', defaultValue: ['a'], loop: false },
      ['a', 'b', 'c']
    )
    document.body.appendChild(c)

    // ArrowLeft at the first item stays put instead of wrapping to the last.
    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
    expect(document.activeElement).toBe(items(c)[0])

    // ArrowRight keeps moving while there is somewhere to go.
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(document.activeElement).toBe(items(c)[1])
  })

  it('should wrap around when loop is on (default)', () => {
    const c = build({ type: 'single', defaultValue: ['a'] }, ['a', 'b', 'c'])
    document.body.appendChild(c)

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[2])
  })

  it('should carry an orientation the arrows follow', () => {
    const c = build(
      { type: 'single', orientation: 'vertical', defaultValue: ['a'] },
      ['a', 'b']
    )

    expect(c.querySelector('[role="radiogroup"]')!.getAttribute('data-orientation')).toBe(
      'vertical'
    )
  })
})
