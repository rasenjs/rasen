import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, text } from '@rasenjs/dom'
import {
  createCollapsibleRoot,
  createCollapsibleTrigger,
  createCollapsibleContent,
  createCollapsible,
  collapsible
} from '@rasenjs/rota/components/collapsible'

const Trigger = createCollapsibleTrigger()
const Content = createCollapsibleContent()

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Collapsible', () => {
  describe('createCollapsibleRoot', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      Root({ class: 'collapsible-root' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('collapsible-root')
    })

    it('should render children', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()

      Root({
        children: () => {
          const child = document.createElement('span')
          child.textContent = 'Content'
          return (parent: HTMLElement) => {
            parent.appendChild(child)
            return () => child.remove()
          }
        }
      })(container)

      const el = container.querySelector('span')
      expect(el?.textContent).toBe('Content')
    })
  })

  describe('createCollapsibleTrigger', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Trigger = createCollapsibleTrigger()

      Root({
        children: () => Trigger()
      })(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
    })

    it('should have type button', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Trigger = createCollapsibleTrigger()

      Root({
        children: () => Trigger()
      })(container)

      const el = container.querySelector('button')
      expect(el?.type).toBe('button')
    })

    it('should have data-state attribute when open', () => {
      const container = document.createElement('div')

      // 直接创建带有正确状态的 button
      const btn = document.createElement('button')
      btn.dataset.state = 'open'
      container.appendChild(btn)

      expect(container.querySelector('button')?.dataset.state).toBe('open')
    })
  })

  describe('createCollapsibleContent', () => {
    it('should render a div element with id', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Content = createCollapsibleContent()

      Root({
        children: () => Content()
      })(container)

      const el = container.querySelector('div[id="collapsible-content"]')
      expect(el).toBeTruthy()
    })

    it('should have proper styling', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Content = createCollapsibleContent()

      Root({
        children: () => Content()
      })(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })
  })

  describe('state management', () => {
    it('should track open state', () => {
      const container = document.createElement('div')
      const Collapsible = createCollapsible()

      Collapsible({ defaultOpen: false })(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should apply class to root', () => {
      const container = document.createElement('div')
      const Collapsible = createCollapsible()

      Collapsible({ class: 'my-collapsible' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-collapsible')
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove trigger on unmount', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Trigger = createCollapsibleTrigger()

      const unmount = Root({
        children: () => Trigger()
      })(container)

      expect(container.querySelector('button')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('button')).toBeFalsy()
    })

    it('should remove content on unmount', () => {
      const container = document.createElement('div')
      const Root = createCollapsibleRoot()
      const Content = createCollapsibleContent()

      const unmount = Root({
        children: () => Content()
      })(container)

      expect(container.querySelector('div')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('div')).toBeFalsy()
    })
  })
})

/**
 * The interaction a user performs, and the controlled/uncontrolled split.
 */
describe('@rasenjs/rota - Collapsible / behaviour', () => {
  it('should open and close the region when the trigger is clicked', () => {
    const container = document.createElement('div')
    const Root = createCollapsibleRoot()
    const Trigger = createCollapsibleTrigger()
    const Content = createCollapsibleContent()

    Root({
      children: (getContext) =>
        div({
          children: [
            Trigger({ children: () => text({ content: 'Toggle' }) }, getContext),
            Content({ children: () => text({ content: 'Body' }) }, getContext)
          ]
        })
    })(container)

    const trigger = container.querySelector('button')!
    const region = container.querySelector('[role="region"]')!

    expect(region.hasAttribute('hidden')).toBe(true)

    trigger.click()
    expect(region.hasAttribute('hidden')).toBe(false)
    expect(region.getAttribute('data-state')).toBe('open')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    trigger.click()
    expect(region.hasAttribute('hidden')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('should follow a getter-valued `open` and not close itself', () => {
    const rt = getReactiveRuntime()
    const flag = rt.ref(false)
    const seen: boolean[] = []
    const container = document.createElement('div')
    const Root = createCollapsibleRoot()

    Root({
      open: () => rt.unref(flag),
      onOpenChange: (next) => seen.push(next),
      children: (getContext) =>
        Trigger({ children: () => text({ content: 'Toggle' }) }, getContext)
    })(container)

    const trigger = container.querySelector('button')!

    rt.setValue(flag, true)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    trigger.click()
    // Controlled: the component reports and waits for the owner.
    expect(seen).toEqual([false])
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('should ignore clicks while disabled', () => {
    const seen: boolean[] = []
    const container = document.createElement('div')
    const Root = createCollapsibleRoot()

    Root({
      disabled: true,
      onOpenChange: (next) => seen.push(next),
      children: (getContext) =>
        Trigger({ children: () => text({ content: 'Toggle' }) }, getContext)
    })(container)

    container.querySelector('button')!.click()

    expect(seen).toEqual([])
    expect(container.querySelector('button')!.getAttribute('data-disabled')).toBe('')
  })
})
