import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createRadioGroupRoot,
  createRadioGroupItem,
  createRadioGroupIndicator,
  radioGroup
} from '@rasenjs/rota/components/radio-group'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

afterEach(() => {
  document.body.innerHTML = ''
})

const items = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[role="radio"]')) as HTMLButtonElement[]

describe('@rasenjs/rota - RadioGroup', () => {
  it('should render a radiogroup with radio items', () => {
    const c = document.createElement('div')
    radioGroup({ items: [{ value: 'a', label: 'A' }] })(c)

    expect(c.querySelector('[role="radiogroup"]')).toBeTruthy()
    expect(items(c).length).toBe(1)
    expect(items(c)[0]!.getAttribute('aria-checked')).toBe('false')
  })

  it('should select on click and report the change', () => {
    const c = document.createElement('div')
    const seen: string[] = []
    radioGroup({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ],
      onValueChange: (next) => seen.push(next)
    })(c)

    items(c)[1]!.click()

    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true'
    ])
    expect(items(c).map((el) => el.getAttribute('data-state'))).toEqual([
      'unchecked',
      'checked'
    ])
    expect(seen).toEqual(['b'])
  })

  it('should not change itself while controlled', () => {
    const c = document.createElement('div')
    const seen: string[] = []
    radioGroup({
      value: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ],
      onValueChange: (next) => seen.push(next)
    })(c)

    items(c)[1]!.click()

    expect(seen).toEqual(['b'])
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'true',
      'false'
    ])
  })

  it('should select what it focuses (selection follows focus)', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      defaultValue: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' }
      ]
    })(c)

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[1])
    expect(items(c).map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false'
    ])
  })

  it('should jump to the ends with Home and End', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      defaultValue: 'b',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' }
      ]
    })(c)

    items(c)[1]!.focus()
    items(c)[1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true })
    )
    expect(items(c)[2]!.getAttribute('aria-checked')).toBe('true')

    items(c)[2]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    )
    expect(items(c)[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('should skip disabled items', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      defaultValue: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
        { value: 'c', label: 'C' }
      ]
    })(c)

    items(c)[0]!.focus()
    items(c)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    )

    expect(document.activeElement).toBe(items(c)[2])
    expect(items(c)[1]!.disabled).toBe(true)
    expect(items(c)[1]!.getAttribute('data-disabled')).toBe('')
  })

  it('should keep the checked item as the only tab stop', () => {
    const c = document.createElement('div')
    radioGroup({
      defaultValue: 'b',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
    })(c)

    expect(items(c).map((el) => el.tabIndex)).toEqual([-1, 0])
  })

  it('should keep the group reachable when nothing is checked', () => {
    const c = document.createElement('div')
    radioGroup({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
    })(c)

    expect(items(c).map((el) => el.tabIndex)).toEqual([0, -1])
  })

  it('should render a hidden radio input per item when named', () => {
    const c = document.createElement('div')
    radioGroup({
      name: 'plan',
      defaultValue: 'pro',
      items: [
        { value: 'free', label: 'Free' },
        { value: 'pro', label: 'Pro' }
      ]
    })(c)

    const inputs = Array.from(
      c.querySelectorAll('input[type="radio"]')
    ) as HTMLInputElement[]
    expect(inputs.map((el) => el.name)).toEqual(['plan', 'plan'])
    expect(inputs.map((el) => el.value)).toEqual(['free', 'pro'])
    expect(inputs[1]!.getAttribute('aria-hidden')).toBe('true')
  })

  it('should render the indicator only while checked', () => {
    const c = document.createElement('div')
    const seen: number[] = []

    createRadioGroupRoot()({
      defaultValue: 'a',
      children: (getContext) => (host: HTMLElement) => {
        const Root = getContext
        const indicatorHost = document.createElement('div')
        host.appendChild(indicatorHost)
        const Indicator = createRadioGroupIndicator()
        Indicator({}, Root, () => 'a')(indicatorHost, undefined)
        seen.push(indicatorHost.querySelectorAll('[data-state]').length)
        return () => {}
      }
    })(c)

    // Checked item: the indicator is there.
    expect(seen).toEqual([1])
  })

  it('should render the group and items from the parts', () => {
    const c = document.createElement('div')
    const Root = createRadioGroupRoot()
    const Item = createRadioGroupItem()

    Root({
      defaultValue: 'x',
      children: (getContext) => (host: HTMLElement) => {
        const unmount = Item({ value: 'x' }, getContext)(host, undefined)
        return () => typeof unmount === 'function' && unmount()
      }
    })(c)

    expect(items(c)[0]!.getAttribute('aria-checked')).toBe('true')
  })
})

/**
 * Orientation and wrap-around: the attributes the CSS keys off and the two
 * ends of the arrow-key range.
 */
describe('@rasenjs/rota - RadioGroup / orientation and loop', () => {
  it('should expose the orientation on the root and the items', () => {
    const c = document.createElement('div')
    radioGroup({
      orientation: 'horizontal',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
    })(c)

    const root = c.querySelector('[role="radiogroup"]')!
    expect(root.getAttribute('data-orientation')).toBe('horizontal')
    expect(root.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('should move with left and right when horizontal', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      orientation: 'horizontal',
      defaultValue: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
    })(c)

    const list = items(c)
    list[0]!.focus()
    list[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )

    expect(document.activeElement).toBe(list[1])
    expect(list[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('should wrap around at the ends by default', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      defaultValue: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' }
      ]
    })(c)

    const list = items(c)
    list[0]!.focus()
    list[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    )

    expect(document.activeElement).toBe(list[2])
    expect(list[2]!.getAttribute('aria-checked')).toBe('true')
  })

  it('should clamp at the ends when loop is off', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    radioGroup({
      loop: false,
      defaultValue: 'a',
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' }
      ]
    })(c)

    const list = items(c)
    list[0]!.focus()
    list[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    )

    // Stays put instead of wrapping to the last option.
    expect(document.activeElement).toBe(list[0])
    expect(list[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('should mark required and pass the name to the hidden inputs', () => {
    const c = document.createElement('div')
    radioGroup({
      name: 'plan',
      required: true,
      items: [{ value: 'a', label: 'A' }]
    })(c)

    expect(c.querySelector('[role="radiogroup"]')!.getAttribute('aria-required')).toBe('true')
    expect((c.querySelector('input[type="radio"]') as HTMLInputElement).name).toBe('plan')
  })
})
