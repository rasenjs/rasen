import { describe, it, expect, beforeEach } from 'vitest'
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
          expect(ctx?.value).toBe('12')
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
          // Controlled: the value comes from props, not internal state.
          expect(ctx?.value).toBe('98')

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
