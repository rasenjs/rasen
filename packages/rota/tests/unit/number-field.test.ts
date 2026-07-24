import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { numberField } from '../../src/components/number-field'

describe('@rasenjs/rota - NumberField', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('createNumberFieldRoot', () => {
    it('should render a div element with role group', () => {
      const el = document.createElement('div')
      const unmount = numberField()(el)

      expect(el.querySelector('div')).toBeTruthy()
      expect(el.querySelector('div')?.getAttribute('role')).toBe('group')

      unmount()
    })

    it('should apply custom class', () => {
      const el = document.createElement('div')
      const unmount = numberField({ class: 'custom-class' })(el)

      expect(el.firstElementChild?.classList.contains('custom-class')).toBe(
        true
      )

      unmount()
    })

    it('should have default min, max, and step values', () => {
      const el = document.createElement('div')
      const unmount = numberField()(el)

      // We can't directly test the internal values, but we can test the behavior
      const inputEl = document.createElement('div')
      const inputUnmount = numberField({
        children: (getContext) => (host) => {
          const ctx = getContext?.()
          expect(ctx?.min).toBe(0)
          expect(ctx?.max).toBe(100)
          expect(ctx?.step).toBe(1)

          const input = document.createElement('input')
          host.appendChild(input)

          return () => input.remove()
        }
      })(inputEl)

      inputUnmount()
      unmount()
    })

    it('should support custom min, max, and step values', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        min: 10,
        max: 50,
        step: 5
      })(el)

      const inputEl = document.createElement('div')
      const inputUnmount = numberField({
        min: 10,
        max: 50,
        step: 5,
        children: (getContext) => (host) => {
          const ctx = getContext?.()
          expect(ctx?.min).toBe(10)
          expect(ctx?.max).toBe(50)
          expect(ctx?.step).toBe(5)

          const input = document.createElement('input')
          host.appendChild(input)

          return () => input.remove()
        }
      })(inputEl)

      inputUnmount()
      unmount()
    })

    it('should support default value', () => {
      const el = document.createElement('div')
      const unmount = numberField({ defaultValue: 25 })(el)

      const inputEl = document.createElement('div')
      const inputUnmount = numberField({
        defaultValue: 25,
        children: (getContext) => (host) => {
          const ctx = getContext?.()
          expect(ctx?.value).toBe(25)

          const input = document.createElement('input')
          host.appendChild(input)

          return () => input.remove()
        }
      })(inputEl)

      inputUnmount()
      unmount()
    })

    it('should support controlled value', () => {
      const el = document.createElement('div')
      const unmount = numberField({ value: 30 })(el)

      const inputEl = document.createElement('div')
      const inputUnmount = numberField({
        value: 30,
        children: (getContext) => (host) => {
          const ctx = getContext?.()
          expect(ctx?.value).toBe(30)

          const input = document.createElement('input')
          host.appendChild(input)

          return () => input.remove()
        }
      })(inputEl)

      inputUnmount()
      unmount()
    })

    it('should call onValueChange when value updates', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({ onValueChange: onChangeMock })(el)

      const inputEl = document.createElement('div')
      const inputUnmount = numberField({
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext?.()
          ctx?.updateValue(42)

          expect(onChangeMock).toHaveBeenCalledWith(42)

          const input = document.createElement('input')
          host.appendChild(input)

          return () => input.remove()
        }
      })(inputEl)

      inputUnmount()
      unmount()
    })
  })

  describe('createNumberFieldInput', () => {
    it('should render an input element', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          expect(host.querySelector('input')).toBeTruthy()
          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should have type="text" and inputmode="decimal"', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          const input = host.querySelector('input')
          expect(input?.type).toBe('text')
          expect(input?.inputMode).toBe('decimal')
          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should apply custom class', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput({
            class: 'input-class'
          })(host)
          const input = host.querySelector('input')
          expect(input?.classList.contains('input-class')).toBe(true)
          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should initialize with value from context', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 15,
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          const input = host.querySelector('input')
          expect(input?.value).toBe('15')
          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should update value when input changes', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 10,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          const input = host.querySelector('input') as HTMLInputElement

          if (input) {
            input.value = '25'
            const event = new Event('input', { bubbles: true })
            input.dispatchEvent(event)

            expect(onChangeMock).toHaveBeenCalledWith(25)
          }

          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should clamp value to min/max range', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        min: 0,
        max: 10,
        defaultValue: 5,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          const input = host.querySelector('input') as HTMLInputElement

          if (input) {
            // Try setting a value higher than max
            input.value = '15'
            const event = new Event('input', { bubbles: true })
            input.dispatchEvent(event)

            expect(onChangeMock).toHaveBeenCalledWith(10) // Should be clamped to max

            // Reset mock and try lower than min
            onChangeMock.mockReset()
            input.value = '-5'
            input.dispatchEvent(event)

            expect(onChangeMock).toHaveBeenCalledWith(0) // Should be clamped to min
          }

          return inputUnmount
        }
      })(el)

      unmount()
    })

    it('should handle empty input (null value)', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 5,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const inputUnmount = numberField.createNumberFieldInput()(host)
          const input = host.querySelector('input') as HTMLInputElement

          if (input) {
            input.value = ''
            const event = new Event('input', { bubbles: true })
            input.dispatchEvent(event)

            expect(onChangeMock).toHaveBeenCalledWith(null)
          }

          return inputUnmount
        }
      })(el)

      unmount()
    })
  })

  describe('createNumberFieldIncrement', () => {
    it('should render a button element', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          expect(host.querySelector('button')).toBeTruthy()
          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should have type="button"', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          const button = host.querySelector('button')
          expect(button?.type).toBe('button')
          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should have "+" as default text content', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          const button = host.querySelector('button')
          expect(button?.textContent).toBe('+')
          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should accept custom text content', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const incrementUnmount = numberField.createNumberFieldIncrement({
            children: 'Up'
          })(host)
          const button = host.querySelector('button')
          expect(button?.textContent).toBe('Up')
          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should apply custom class', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const incrementUnmount = numberField.createNumberFieldIncrement({
            class: 'inc-class'
          })(host)
          const button = host.querySelector('button')
          expect(button?.classList.contains('inc-class')).toBe(true)
          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should increment value by step when clicked', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 10,
        step: 5,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).toHaveBeenCalledWith(15) // 10 + 5
          }

          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should clamp incremented value to max', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 98,
        max: 100,
        step: 5,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).toHaveBeenCalledWith(100) // Should be clamped to max (98 + 5 = 103, but max is 100)
          }

          return incrementUnmount
        }
      })(el)

      unmount()
    })

    it('should not increment when disabled', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 10,
        step: 5,
        disabled: true,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const incrementUnmount =
            numberField.createNumberFieldIncrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).not.toHaveBeenCalled()
          }

          return incrementUnmount
        }
      })(el)

      unmount()
    })
  })

  describe('createNumberFieldDecrement', () => {
    it('should render a button element', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          expect(host.querySelector('button')).toBeTruthy()
          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should have type="button"', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          const button = host.querySelector('button')
          expect(button?.type).toBe('button')
          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should have "-" as default text content', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          const button = host.querySelector('button')
          expect(button?.textContent).toBe('-')
          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should accept custom text content', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const decrementUnmount = numberField.createNumberFieldDecrement({
            children: 'Down'
          })(host)
          const button = host.querySelector('button')
          expect(button?.textContent).toBe('Down')
          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should apply custom class', () => {
      const el = document.createElement('div')
      const unmount = numberField({
        children: (getContext) => (host) => {
          const decrementUnmount = numberField.createNumberFieldDecrement({
            class: 'dec-class'
          })(host)
          const button = host.querySelector('button')
          expect(button?.classList.contains('dec-class')).toBe(true)
          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should decrement value by step when clicked', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 20,
        step: 3,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).toHaveBeenCalledWith(17) // 20 - 3
          }

          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should clamp decremented value to min', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 2,
        min: 0,
        step: 5,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).toHaveBeenCalledWith(0) // Should be clamped to min (2 - 5 = -3, but min is 0)
          }

          return decrementUnmount
        }
      })(el)

      unmount()
    })

    it('should not decrement when disabled', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 20,
        step: 3,
        disabled: true,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const decrementUnmount =
            numberField.createNumberFieldDecrement()(host)
          const button = host.querySelector('button')

          if (button) {
            const clickEvent = new MouseEvent('click', { bubbles: true })
            button.dispatchEvent(clickEvent)

            expect(onChangeMock).not.toHaveBeenCalled()
          }

          return decrementUnmount
        }
      })(el)

      unmount()
    })
  })

  describe('createNumberField (composed)', () => {
    it('should render root with input and buttons', () => {
      const el = document.createElement('div')
      const unmount = numberField({})(el)

      expect(el.querySelector('div[role="group"]')).toBeTruthy()
      expect(el.querySelector('input')).toBeTruthy()
      expect(el.querySelectorAll('button').length).toBe(2) // increment and decrement

      unmount()
    })

    it('should pass class to root', () => {
      const el = document.createElement('div')
      const unmount = numberField({ class: 'numberfield-root' })(el)

      const root = el.querySelector('div[role="group"]')
      expect(root?.classList.contains('numberfield-root')).toBe(true)

      unmount()
    })

    it('should pass inputClass to input', () => {
      const el = document.createElement('div')
      const unmount = numberField({ inputClass: 'numberfield-input' })(el)

      const input = el.querySelector('input')
      expect(input?.classList.contains('numberfield-input')).toBe(true)

      unmount()
    })

    it('should pass incrementClass to increment button', () => {
      const el = document.createElement('div')
      const unmount = numberField({ incrementClass: 'numberfield-increment' })(
        el
      )

      const buttons = el.querySelectorAll('button')
      // Assuming the last button is the increment button based on our implementation
      const incrementButton = buttons[buttons.length - 1] // Last button should be increment
      expect(incrementButton?.classList.contains('numberfield-increment')).toBe(
        true
      )

      unmount()
    })

    it('should pass decrementClass to decrement button', () => {
      const el = document.createElement('div')
      const unmount = numberField({ decrementClass: 'numberfield-decrement' })(
        el
      )

      const buttons = el.querySelectorAll('button')
      // Assuming the first button after input is the decrement button
      const decrementButton = buttons[0] // First button after input should be decrement
      expect(decrementButton?.classList.contains('numberfield-decrement')).toBe(
        true
      )

      unmount()
    })

    it('should handle value changes through input', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 10,
        onValueChange: onChangeMock
      })(el)

      const input = el.querySelector('input') as HTMLInputElement
      if (input) {
        input.value = '25'
        const event = new Event('input', { bubbles: true })
        input.dispatchEvent(event)

        expect(onChangeMock).toHaveBeenCalledWith(25)
      }

      unmount()
    })

    it('should handle increment via button', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 10,
        step: 5,
        onValueChange: onChangeMock
      })(el)

      const buttons = el.querySelectorAll('button')
      // Assuming the last button is increment
      const incrementButton = buttons[buttons.length - 1] as HTMLButtonElement

      if (incrementButton) {
        const clickEvent = new MouseEvent('click', { bubbles: true })
        incrementButton.dispatchEvent(clickEvent)

        expect(onChangeMock).toHaveBeenCalledWith(15) // 10 + 5
      }

      unmount()
    })

    it('should handle decrement via button', () => {
      const onChangeMock = vi.fn()
      const el = document.createElement('div')
      const unmount = numberField({
        defaultValue: 20,
        step: 5,
        onValueChange: onChangeMock
      })(el)

      const buttons = el.querySelectorAll('button')
      // Assuming the first button after input is decrement
      const decrementButton = buttons[0] as HTMLButtonElement

      if (decrementButton) {
        const clickEvent = new MouseEvent('click', { bubbles: true })
        decrementButton.dispatchEvent(clickEvent)

        expect(onChangeMock).toHaveBeenCalledWith(15) // 20 - 5
      }

      unmount()
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const el = document.createElement('div')
      const unmount = numberField({})(el)

      expect(el.querySelector('div[role="group"]')).toBeTruthy()

      unmount()

      expect(el.querySelector('div[role="group"]')).toBeFalsy()
    })

    it('should remove input on unmount', () => {
      const el = document.createElement('div')
      const unmount = numberField({})(el)

      expect(el.querySelector('input')).toBeTruthy()

      unmount()

      expect(el.querySelector('input')).toBeFalsy()
    })

    it('should remove buttons on unmount', () => {
      const el = document.createElement('div')
      const unmount = numberField({})(el)

      expect(el.querySelectorAll('button').length).toBe(2)

      unmount()

      expect(el.querySelectorAll('button').length).toBe(0)
    })
  })
})
