import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createCheckboxRoot,
  createCheckboxIndicator,
  createCheckbox,
  checkbox
} from '@rasenjs/rota/components/checkbox'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Checkbox', () => {
  describe('createCheckboxRoot', () => {
    it('should render a button element with role checkbox', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('checkbox')
    })

    it('should have type="button"', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('type')).toBe('button')
    })

    it('should have aria-checked="false" by default', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('false')
    })

    it('should have data-state="unchecked" by default', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('unchecked')
    })

    it('should have aria-checked="true" when checked', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ checked: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('true')
    })

    it('should have data-state="checked" when checked', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ checked: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('checked')
    })

    it('should have aria-checked="mixed" when indeterminate', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ checked: 'indeterminate' })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('mixed')
    })

    it('should have data-state="indeterminate" when indeterminate', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ checked: 'indeterminate' })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('indeterminate')
    })

    it('should have aria-disabled="true" when disabled', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-disabled')).toBe('true')
    })

    it('should have data-disabled when disabled', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-disabled')).toBe('')
    })

    it('should have aria-required="true" when required', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ required: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-required')).toBe('true')
    })

    it('should support defaultChecked', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ defaultChecked: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('checked')
      expect(el?.getAttribute('aria-checked')).toBe('true')
    })

    it('should support defaultChecked indeterminate', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ defaultChecked: 'indeterminate' })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('indeterminate')
      expect(el?.getAttribute('aria-checked')).toBe('mixed')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ class: 'my-checkbox' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-checkbox')
    })

    it('should apply custom style', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      Root({ style: { backgroundColor: 'red' } })(container)

      const el = container.querySelector('button')
      expect(el?.style.backgroundColor).toBe('red')
    })

    it('should provide context to children', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        checked: true,
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const root = container.querySelector('button[role="checkbox"]')
      const indicator = root?.querySelector('span')
      expect(indicator).toBeTruthy()
      expect(indicator?.getAttribute('data-state')).toBe('checked')
    })

    it('should toggle state on click', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')
      btn?.click()

      expect(btn?.getAttribute('data-state')).toBe('checked')
      expect(btn?.getAttribute('aria-checked')).toBe('true')
    })

    it('should not toggle when disabled', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        disabled: true,
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')
      btn?.click()

      expect(btn?.getAttribute('data-state')).toBe('unchecked')
    })

    it('should call onCheckedChange when toggled', () => {
      const container = document.createElement('div')
      let changedValue: boolean | 'indeterminate' | undefined
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        onCheckedChange: (val) => {
          changedValue = val
        },
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')
      btn?.click()

      expect(changedValue).toBe(true)
    })

    it('should cycle through unchecked -> checked -> indeterminate -> unchecked', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')

      // unchecked -> checked
      btn?.click()
      expect(btn?.getAttribute('data-state')).toBe('checked')

      // checked -> indeterminate
      btn?.click()
      expect(btn?.getAttribute('data-state')).toBe('indeterminate')

      // indeterminate -> unchecked
      btn?.click()
      expect(btn?.getAttribute('data-state')).toBe('unchecked')
    })

    it('should handle Space key to toggle', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
      btn?.dispatchEvent(event)

      expect(btn?.getAttribute('data-state')).toBe('checked')
    })

    it('should handle Enter key to toggle', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const btn = container.querySelector('button')
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      })
      btn?.dispatchEvent(event)

      expect(btn?.getAttribute('data-state')).toBe('checked')
    })

    it('should render children inside root', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      Root({
        checked: true,
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const root = container.querySelector('button[role="checkbox"]')
      const indicator = root?.querySelector('span')
      expect(indicator).toBeTruthy()
    })
  })

  describe('createCheckboxIndicator', () => {
    it('should render a span element when checked', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({}, () => ({
        isChecked: true,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
    })

    it('should not render when not checked and not forceMount', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({}, () => ({
        isChecked: false,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el).toBeFalsy()
    })

    it('should render when checked', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({}, () => ({
        isChecked: true,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('data-state')).toBe('checked')
    })

    it('should render when indeterminate', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({}, () => ({
        isChecked: false,
        isIndeterminate: true
      }))(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('data-state')).toBe('indeterminate')
    })

    it('should render when forceMount is true even if not checked', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({ forceMount: true }, () => ({
        isChecked: false,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('data-state')).toBe('unchecked')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({ class: 'my-indicator' }, () => ({
        isChecked: true,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el?.className).toContain('my-indicator')
    })

    it('should apply custom style', () => {
      const container = document.createElement('div')
      const Indicator = createCheckboxIndicator()
      Indicator({ style: { color: 'blue' } }, () => ({
        isChecked: true,
        isIndeterminate: false
      }))(container)

      const el = container.querySelector('span')
      expect(el?.style.color).toBe('blue')
    })
  })

  describe('createCheckbox (composed)', () => {
    it('should render root with indicator', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      Checkbox({ checked: true })(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root).toBeTruthy()

      const indicator = root?.querySelector('span')
      expect(indicator).toBeTruthy()
    })

    it('should pass class to root', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      Checkbox({ checked: true, class: 'my-checkbox' })(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root?.className).toContain('my-checkbox')
    })

    it('should pass indicatorClass to indicator', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      Checkbox({ checked: true, indicatorClass: 'my-indicator' })(container)

      const root = container.querySelector('button[role="checkbox"]')
      const indicator = root?.querySelector('span')
      expect(indicator?.className).toContain('my-indicator')
    })

    it('should handle defaultChecked', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      Checkbox({ defaultChecked: true })(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root?.getAttribute('data-state')).toBe('checked')
    })

    it('should handle indeterminate state', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      Checkbox({ checked: 'indeterminate' })(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root?.getAttribute('data-state')).toBe('indeterminate')
      expect(root?.getAttribute('aria-checked')).toBe('mixed')
    })
  })

  describe('checkbox preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      checkbox()(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root).toBeTruthy()
      expect(root?.getAttribute('data-state')).toBe('unchecked')
    })

    it('should render with checked state', () => {
      const container = document.createElement('div')
      checkbox({ checked: true })(container)

      const root = container.querySelector('button[role="checkbox"]')
      expect(root?.getAttribute('data-state')).toBe('checked')
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove indicator on unmount', () => {
      const container = document.createElement('div')
      const Checkbox = createCheckbox()
      const unmount = Checkbox({ checked: true })(container)

      expect(container.querySelector('button[role="checkbox"]')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('button[role="checkbox"]')).toBeFalsy()
    })

    it('should remove children on unmount', () => {
      const container = document.createElement('div')
      const Root = createCheckboxRoot()
      const Indicator = createCheckboxIndicator()

      const unmount = Root({
        class: 'cleanup-root',
        checked: true,
        children: (getContext) =>
          Indicator({ class: 'cleanup-indicator' }, getContext)
      })(container)

      expect(container.querySelector('.cleanup-root')).toBeTruthy()
      expect(container.querySelector('.cleanup-indicator')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-root')).toBeFalsy()
      expect(container.querySelector('.cleanup-indicator')).toBeFalsy()
    })
  })
})
