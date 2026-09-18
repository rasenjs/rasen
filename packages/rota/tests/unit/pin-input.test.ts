import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createPinInputRoot,
  createPinInputInput,
  createPinInput,
  pinInput,
  type PinInputContext,
  type PinInputType
} from '@rasenjs/rota/components/pin-input'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * Build a complete context. Parts read `cellRef` for focus moves, so a
 * hand-written partial object is not a valid stand-in for the real context.
 */
function makeContext(
  overrides: Partial<{
    value: string
    length: number
    type: PinInputType
    disabled: boolean
  }> = {}
): () => PinInputContext {
  const rt = getReactiveRuntime()
  const cells = Array.from({ length: overrides.length ?? 4 }, () => ({
    value: null as HTMLInputElement | null
  }))
  const context: PinInputContext = {
    value: overrides.value ?? '',
    length: overrides.length ?? 4,
    type: overrides.type ?? 'numeric',
    disabled: overrides.disabled ?? false,
    focusedIndex: 0,
    cellRef: (index) => cells[index] ?? { value: null },
    setValue: () => {},
    setFocusedIndex: () => {}
  }
  void rt
  return () => context
}

describe('@rasenjs/rota - PinInput', () => {
  describe('createPinInputRoot', () => {
    it('should render a div with role="group"', () => {
      const container = document.createElement('div')
      createPinInputRoot()()(container)

      const el = container.querySelector('[role="group"]')
      expect(el).toBeTruthy()
    })

    it('should apply custom class and style', () => {
      const container = document.createElement('div')
      createPinInputRoot()({
        class: 'my-pin',
        style: { display: 'flex' }
      })(container)

      const el = container.querySelector('[role="group"]') as HTMLElement
      expect(el.className).toContain('my-pin')
      expect(el.style.display).toBe('flex')
    })

    it('should expose length, type and focusedIndex through the context', () => {
      const container = document.createElement('div')
      createPinInputRoot()({
        defaultValue: '12',
        length: 6,
        type: 'alphanumeric',
        children: (getContext) => (host) => {
          const ctx = getContext()
          // Positional: one character per cell, unfilled = space.
          expect(ctx?.value).toBe('12' + ' '.repeat(4))
          expect(ctx?.length).toBe(6)
          expect(ctx?.type).toBe('alphanumeric')
          expect(ctx?.focusedIndex).toBe(0)

          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)

      expect(container.querySelector('span')).toBeTruthy()
    })

    it('should clamp setFocusedIndex to the valid range', () => {
      const container = document.createElement('div')
      createPinInputRoot()({
        length: 4,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.setFocusedIndex(99)
          expect(ctx?.focusedIndex).toBe(3)
          ctx?.setFocusedIndex(-5)
          expect(ctx?.focusedIndex).toBe(0)

          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should report completion only when the value fills the length', () => {
      const container = document.createElement('div')
      const completions: string[] = []

      createPinInputRoot()({
        length: 4,
        onComplete: (value) => completions.push(value),
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.setValue('12')
          expect(completions).toEqual([])

          ctx?.setValue('1234')
          expect(completions).toEqual(['1234'])

          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should emit the value without trailing placeholders', () => {
    const container = document.createElement('div')
    const seen: string[] = []

    createPinInputRoot()({
      length: 4,
      onValueChange: (value) => seen.push(value),
      children: (getContext) => (host) => {
        getContext()?.setValue('12')
        const span = document.createElement('span')
        host.appendChild(span)
        return () => span.remove()
      }
    })(container)

    expect(seen).toEqual(['12'])
  })

  it('should call onValueChange with the raw value', () => {
      const container = document.createElement('div')
      const changes: string[] = []

      createPinInputRoot()({
        length: 4,
        onValueChange: (value) => changes.push(value),
        children: (getContext) => (host) => {
          getContext()?.setValue('1234')
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)

      expect(changes).toEqual(['1234'])
    })

    it('should respect a controlled value', () => {
      const container = document.createElement('div')
      createPinInputRoot()({
        value: '98',
        length: 4,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.setValue('1111')
          // Controlled: the value comes from props, not internal state —
          // padded to the configured length, since positions are the model.
          expect(ctx?.value).toBe('98  ')

          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should mark the root disabled', () => {
      const container = document.createElement('div')
      createPinInputRoot()({ disabled: true })(container)

      const el = container.querySelector('[role="group"]')
      expect(el?.getAttribute('data-disabled')).toBe('')
    })

    it('should remove the root on unmount', () => {
      const container = document.createElement('div')
      const unmount = createPinInputRoot()()(container)
      expect(container.querySelector('[role="group"]')).toBeTruthy()

      unmount?.()
      expect(container.querySelector('[role="group"]')).toBeFalsy()
    })
  })

  describe('createPinInputInput', () => {
    it('should render an input with a single-character limit', () => {
      const container = document.createElement('div')
      createPinInputInput()({ index: 0 })(container)

      const el = container.querySelector('input') as HTMLInputElement
      expect(el).toBeTruthy()
      expect(el.getAttribute('maxlength')).toBe('1')
    })

    it('should use a numeric inputMode and bullet placeholder for numeric pins', () => {
      const container = document.createElement('div')
      createPinInputInput()({ index: 0 }, makeContext({ type: 'numeric' }))(
        container
      )

      const el = container.querySelector('input') as HTMLInputElement
      expect(el.getAttribute('inputmode')).toBe('numeric')
      expect(el.getAttribute('placeholder')).toBe('•')
    })

    it('should reflect the context value for its index', () => {
      const container = document.createElement('div')
      createPinInputInput()(
        { index: 1 },
        makeContext({ value: 'ab', type: 'text' })
      )(container)

      expect((container.querySelector('input') as HTMLInputElement).value).toBe(
        'b'
      )
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      createPinInputInput()({ index: 0, class: 'cell' })(container)

      expect(
        (container.querySelector('input') as HTMLInputElement).className
      ).toContain('cell')
    })
  })

  describe('createPinInput (composed)', () => {
    it('should render one input per position', () => {
      const container = document.createElement('div')
      createPinInput()({ length: 5 })(container)

      expect(container.querySelectorAll('input').length).toBe(5)
    })

    it('should default to four positions', () => {
      const container = document.createElement('div')
      createPinInput()()(container)

      expect(container.querySelectorAll('input').length).toBe(4)
    })

    it('should render the value into the cells', () => {
      const container = document.createElement('div')
      createPinInput()({ value: '1234' })(container)

      const values = Array.from(container.querySelectorAll('input')).map(
        (el) => el.value
      )
      expect(values).toEqual(['1', '2', '3', '4'])
    })

    it('should pass inputClass to every cell', () => {
      const container = document.createElement('div')
      createPinInput()({ length: 3, inputClass: 'pin-cell' })(container)

      const cells = Array.from(container.querySelectorAll('input'))
      expect(cells.every((el) => el.className.includes('pin-cell'))).toBe(true)
    })

    it('should remove every cell on unmount', () => {
      const container = document.createElement('div')
      const unmount = createPinInput()({ length: 3 })(container)
      expect(container.querySelectorAll('input').length).toBe(3)

      unmount?.()
      expect(container.querySelectorAll('input').length).toBe(0)
    })
  })

  describe('pinInput preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      pinInput()(container)

      expect(container.querySelectorAll('input').length).toBe(4)
    })
  })
})

/**
 * Typing, pasting and the completion callback — the paths a user takes.
 */
describe('@rasenjs/rota - PinInput / input paths', () => {
  const mountPin = (props: Parameters<ReturnType<typeof createPinInput>>[0] = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    createPinInput()(props)(container)
    return container
  }

  const cells = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('input')) as HTMLInputElement[]

  const type = (cell: HTMLInputElement, char: string) => {
    cell.value = char
    cell.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('should fill a cell, then move on and complete', () => {
    const completions: string[] = []
    const container = mountPin({
      length: 3,
      onComplete: (value) => completions.push(value)
    })
    const inputs = cells(container)

    type(inputs[0]!, '1')
    type(inputs[1]!, '2')
    // Not complete yet: the last position is unfilled.
    expect(completions).toEqual([])

    type(inputs[2]!, '3')
    expect(completions).toEqual(['123'])
    expect(inputs.map((el) => el.value)).toEqual(['1', '2', '3'])
  })

  it('should reject a character that does not match the type', () => {
    const container = mountPin({ length: 2, type: 'numeric' })
    const input = cells(container)[0]!

    type(input, 'a')

    expect(input.value).toBe('')
    expect(cells(container).map((el) => el.value)).toEqual(['', ''])
  })

  it('should distribute a paste from the focused cell', () => {
    const container = mountPin({ length: 4 })
    const inputs = cells(container)

    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { getData: (type: string) => string }
    }
    event.clipboardData = { getData: () => '98-76' }
    inputs[2]!.dispatchEvent(event)

    // Only the valid characters land, starting at the cell that pasted.
    expect(inputs.map((el) => el.value)).toEqual(['', '', '9', '8'])
  })

  it('should clear the cell on Backspace', () => {
    const container = mountPin({ length: 3, defaultValue: '123' })
    const inputs = cells(container)

    inputs[1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    )

    // Clearing a position leaves the others where they were.
    expect(cells(container).map((el) => el.value)).toEqual(['1', '', '3'])
  })

  it('should move with the arrow keys', () => {
    const container = mountPin({ length: 3 })
    const inputs = cells(container)

    inputs[1]!.focus()
    inputs[1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
    expect(document.activeElement).toBe(inputs[0])

    inputs[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(document.activeElement).toBe(inputs[1])
  })

  it('should not accept typing while disabled', () => {
    const container = mountPin({ length: 2, disabled: true })
    const inputs = cells(container)

    expect(inputs.every((el) => el.disabled)).toBe(true)
    expect(container.querySelector('[role="group"]')!.getAttribute('data-disabled')).toBe('')
  })
})

/**
 * Focus movement is the component's contract: after typing, the caret is
 * expected in the next cell. Nothing asserted it, so it was free to regress.
 */
describe('@rasenjs/rota - PinInput / focus movement', () => {
  const mount = (props = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    createPinInput()(props)(container)
    return Array.from(container.querySelectorAll('input')) as HTMLInputElement[]
  }

  const type = (cell: HTMLInputElement, char: string) => {
    cell.focus()
    cell.value = char
    cell.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('should move to the next cell after typing', () => {
    const cells = mount({ length: 3 })

    type(cells[0]!, '1')
    expect(document.activeElement).toBe(cells[1])

    type(cells[1]!, '2')
    expect(document.activeElement).toBe(cells[2])
  })

  it('should stay in the last cell', () => {
    const cells = mount({ length: 2 })

    type(cells[0]!, '1')
    type(cells[1]!, '2')

    expect(document.activeElement).toBe(cells[1])
  })

  it('should step back and clear when Backspace is pressed in an empty cell', () => {
    const cells = mount({ length: 3, defaultValue: '12' })
    cells[2]!.focus()

    cells[2]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    )

    expect(document.activeElement).toBe(cells[1])
    expect(cells.map((el) => el.value)).toEqual(['1', '', ''])
  })

  it('should move the caret on paste too', () => {
    const cells = mount({ length: 4 })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { getData: (type: string) => string }
    }
    event.clipboardData = { getData: () => '123' }

    cells[0]!.dispatchEvent(event)

    expect(document.activeElement).toBe(cells[2])
  })
})
