import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createProgressRoot,
  createProgressIndicator,
  createProgress,
  progress
} from '@rasenjs/rota/components/progress'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Progress', () => {
  describe('createProgressRoot', () => {
    it('should render a div element with role progressbar', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('progressbar')
    })

    it('should have default aria-valuemin of 0', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuemin')).toBe('0')
    })

    it('should have default aria-valuemax of 100', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuemax')).toBe('100')
    })

    it('should support custom max value', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ max: 50 })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuemax')).toBe('50')
      expect(el?.getAttribute('data-max')).toBe('50')
    })

    it('should set aria-valuenow when value is provided', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: 60 })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuenow')).toBe('60')
      expect(el?.getAttribute('data-value')).toBe('60')
    })

    it('should not set aria-valuenow when value is null', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: null })(container)

      const el = container.querySelector('div')
      expect(el?.hasAttribute('aria-valuenow')).toBe(false)
      expect(el?.hasAttribute('data-value')).toBe(false)
    })

    it('should set aria-valuetext with default label', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: 66 })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuetext')).toBe('66%')
    })

    it('should support custom getValueLabel', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({
        value: 30,
        max: 100,
        getValueLabel: (value, max) => `${value} of ${max} completed`
      })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-valuetext')).toBe('30 of 100 completed')
    })

    it('should have loading state when 0 < value < max', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: 50 })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('loading')
    })

    it('should have complete state when value >= max', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: 100 })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('complete')
    })

    it('should have indeterminate state when value is null', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ value: null })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('indeterminate')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ class: 'my-progress' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-progress')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      Root({ style: { backgroundColor: 'gray' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.backgroundColor).toBe('gray')
    })

    it('should provide context to children via getContext', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      const Indicator = createProgressIndicator()

      Root({
        value: 75,
        max: 100,
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const root = container.querySelector('div[role="progressbar"]')
      const indicator = root?.querySelector('div')

      expect(indicator?.getAttribute('data-state')).toBe('loading')
      expect(indicator?.getAttribute('data-value')).toBe('75')
      expect(indicator?.getAttribute('data-max')).toBe('100')
      expect(indicator?.style.transform).toBe('translateX(-25%)')
    })

    it('should render children inside root', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      const Indicator = createProgressIndicator()

      Root({
        value: 50,
        children: (getContext) => Indicator({}, getContext)
      })(container)

      const root = container.querySelector('div[role="progressbar"]')
      const indicator = root?.querySelector('div')
      expect(indicator).toBeTruthy()
    })
  })

  describe('createProgressIndicator', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should apply transform based on percentage', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({}, () => ({
        value: 50,
        max: 100,
        percentage: 50,
        state: 'loading'
      }))(container)

      const el = container.querySelector('div')
      expect(el?.style.transform).toBe('translateX(-50%)')
    })

    it('should set data-state from context', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({}, () => ({
        value: 100,
        max: 100,
        percentage: 100,
        state: 'complete'
      }))(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('complete')
    })

    it('should set data-value from context', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({}, () => ({
        value: 75,
        max: 100,
        percentage: 75,
        state: 'loading'
      }))(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-value')).toBe('75')
    })

    it('should not set data-value when value is null', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({}, () => ({
        value: null,
        max: 100,
        percentage: null,
        state: 'indeterminate'
      }))(container)

      const el = container.querySelector('div')
      expect(el?.hasAttribute('data-value')).toBe(false)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({ class: 'my-indicator' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-indicator')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Indicator = createProgressIndicator()
      Indicator({ style: { backgroundColor: 'green' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.backgroundColor).toBe('green')
    })
  })

  describe('createProgress (composed)', () => {
    it('should render root with indicator', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      Progress({ value: 50 })(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root).toBeTruthy()

      const indicator = root?.querySelector('div')
      expect(indicator).toBeTruthy()
      expect(indicator?.style.transform).toBe('translateX(-50%)')
    })

    it('should pass class to root', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      Progress({ value: 50, class: 'my-progress' })(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root?.className).toContain('my-progress')
    })

    it('should pass indicatorClass to indicator', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      Progress({ value: 50, indicatorClass: 'my-indicator' })(container)

      const root = container.querySelector('div[role="progressbar"]')
      const indicator = root?.querySelector('div')
      expect(indicator?.className).toContain('my-indicator')
    })

    it('should handle complete state', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      Progress({ value: 100 })(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root?.getAttribute('data-state')).toBe('complete')

      const indicator = root?.querySelector('div')
      expect(indicator?.getAttribute('data-state')).toBe('complete')
      expect(indicator?.style.transform).toBe('translateX(-0%)')
    })

    it('should handle indeterminate state', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      Progress({ value: null })(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root?.getAttribute('data-state')).toBe('indeterminate')
      expect(root?.hasAttribute('aria-valuenow')).toBe(false)
    })
  })

  describe('progress preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      progress()(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root).toBeTruthy()
      expect(root?.getAttribute('data-state')).toBe('indeterminate')
    })

    it('should render with value', () => {
      const container = document.createElement('div')
      progress({ value: 42 })(container)

      const root = container.querySelector('div[role="progressbar"]')
      expect(root?.getAttribute('aria-valuenow')).toBe('42')
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove indicator on unmount', () => {
      const container = document.createElement('div')
      const Progress = createProgress()
      const unmount = Progress({ value: 50 })(container)

      expect(container.querySelector('div[role="progressbar"]')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('div[role="progressbar"]')).toBeFalsy()
    })

    it('should remove children on unmount', () => {
      const container = document.createElement('div')
      const Root = createProgressRoot()
      const Indicator = createProgressIndicator()

      const unmount = Root({
        class: 'cleanup-root',
        value: 50,
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
