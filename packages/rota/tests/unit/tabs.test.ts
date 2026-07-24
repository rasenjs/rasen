import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createTabsRoot,
  createTabsList,
  createTabsTrigger,
  createTabsContent,
  createTabs,
  tabs
} from '@rasenjs/rota/components/tabs'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Tabs', () => {
  describe('createTabsRoot', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should have data-orientation attribute', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-orientation')).toBe('horizontal')
    })

    it('should support vertical orientation', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      Root({ orientation: 'vertical' })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-orientation')).toBe('vertical')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      Root({ class: 'my-tabs' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-tabs')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      Root({ style: { maxWidth: '500px' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.maxWidth).toBe('500px')
    })

    it('should render children', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()

      Root({
        children: () => {
          const child = document.createElement('span')
          child.textContent = 'Child'
          return (parent: HTMLElement) => {
            parent.appendChild(child)
            return () => child.remove()
          }
        }
      })(container)

      const el = container.querySelector('span')
      expect(el?.textContent).toBe('Child')
    })
  })

  describe('createTabsList', () => {
    it('should render a div with role="tablist"', () => {
      const container = document.createElement('div')
      const List = createTabsList()
      List()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('role')).toBe('tablist')
    })

    it('should have aria-orientation from context', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()

      Root({
        orientation: 'vertical',
        children: (getContext) => List({}, getContext)
      })(container)

      const el = container.querySelector('[role="tablist"]')
      expect(el?.getAttribute('aria-orientation')).toBe('vertical')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const List = createTabsList()
      List({ class: 'my-list' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-list')
    })
  })

  describe('createTabsTrigger', () => {
    it('should render a button with role="tab"', () => {
      const container = document.createElement('div')
      const Trigger = createTabsTrigger()
      Trigger({ value: 'tab1' })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('role')).toBe('tab')
    })

    it('should throw if value is not provided', () => {
      const Trigger = createTabsTrigger()
      expect(() => Trigger()(document.createElement('div'))).toThrow(
        'TabsTrigger: "value" prop is required'
      )
    })

    it('should have aria-selected="false" when inactive', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        defaultValue: 'tab2',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => Trigger({ value: 'tab1' }, getContext2)
            },
            getContext
          )
      })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-selected')).toBe('false')
      expect(el?.getAttribute('data-state')).toBe('inactive')
    })

    it('should have aria-selected="true" when active', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        defaultValue: 'tab1',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => Trigger({ value: 'tab1' }, getContext2)
            },
            getContext
          )
      })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-selected')).toBe('true')
      expect(el?.getAttribute('data-state')).toBe('active')
    })

    it('should have data-orientation from context', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        orientation: 'vertical',
        defaultValue: 'tab1',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => Trigger({ value: 'tab1' }, getContext2)
            },
            getContext
          )
      })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-orientation')).toBe('vertical')
    })

    it('should have aria-disabled and data-disabled when disabled', () => {
      const container = document.createElement('div')
      const Trigger = createTabsTrigger()
      Trigger({ value: 'tab1', disabled: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-disabled')).toBe('true')
      expect(el?.hasAttribute('data-disabled')).toBe(true)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Trigger = createTabsTrigger()
      Trigger({ value: 'tab1', class: 'my-trigger' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-trigger')
    })

    it('should have type="button"', () => {
      const container = document.createElement('div')
      const Trigger = createTabsTrigger()
      Trigger({ value: 'tab1' })(container)

      const el = container.querySelector('button')
      expect(el?.type).toBe('button')
    })
  })

  describe('createTabsContent', () => {
    it('should render a div with role="tabpanel"', () => {
      const container = document.createElement('div')
      const Content = createTabsContent()
      Content({ value: 'tab1' })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('role')).toBe('tabpanel')
    })

    it('should throw if value is not provided', () => {
      const Content = createTabsContent()
      expect(() => Content()(document.createElement('div'))).toThrow(
        'TabsContent: "value" prop is required'
      )
    })

    it('should have data-state="active" when active', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const Content = createTabsContent()

      Root({
        defaultValue: 'tab1',
        children: (getContext) => Content({ value: 'tab1' }, getContext)
      })(container)

      const el = container.querySelector('[role="tabpanel"]')
      expect(el?.getAttribute('data-state')).toBe('active')
      expect(el?.hasAttribute('hidden')).toBe(false)
    })

    it('should have data-state="hidden" and hidden attr when inactive', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const Content = createTabsContent()

      Root({
        defaultValue: 'tab2',
        children: (getContext) => Content({ value: 'tab1' }, getContext)
      })(container)

      const el = container.querySelector('[role="tabpanel"]')
      expect(el?.getAttribute('data-state')).toBe('hidden')
      expect(el?.hasAttribute('hidden')).toBe(true)
    })

    it('should render when forceMount is true even if inactive', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const Content = createTabsContent()

      const childContent = document.createElement('p')
      childContent.textContent = 'Always visible'

      Root({
        defaultValue: 'tab2',
        children: (getContext) =>
          Content(
            {
              value: 'tab1',
              forceMount: true,
              children: () => (parent: HTMLElement) => {
                parent.appendChild(childContent)
                return () => childContent.remove()
              }
            },
            getContext
          )
      })(container)

      const el = container.querySelector('[role="tabpanel"]')
      expect(el?.getAttribute('data-state')).toBe('hidden')
      expect(el?.querySelector('p')?.textContent).toBe('Always visible')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Content = createTabsContent()
      Content({ value: 'tab1', class: 'my-content' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-content')
    })
  })

  describe('tab switching', () => {
    it('should update trigger states when clicking another trigger', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        defaultValue: 'tab1',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => (parent: HTMLElement) => {
                const unmount1 = Trigger({ value: 'tab1' }, getContext2)(parent)
                const unmount2 = Trigger({ value: 'tab2' }, getContext2)(parent)
                return () => {
                  unmount1?.()
                  unmount2?.()
                }
              }
            },
            getContext
          )
      })(container)

      const triggers = container.querySelectorAll('button')
      expect(triggers[0]?.getAttribute('aria-selected')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-selected')).toBe('false')

      triggers[1]?.click()

      expect(triggers[0]?.getAttribute('aria-selected')).toBe('false')
      expect(triggers[1]?.getAttribute('aria-selected')).toBe('true')
    })

    it('should not switch when trigger is disabled', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        defaultValue: 'tab1',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => (parent: HTMLElement) => {
                const unmount1 = Trigger({ value: 'tab1' }, getContext2)(parent)
                const unmount2 = Trigger(
                  { value: 'tab2', disabled: true },
                  getContext2
                )(parent)
                return () => {
                  unmount1?.()
                  unmount2?.()
                }
              }
            },
            getContext
          )
      })(container)

      const triggers = container.querySelectorAll('button')
      triggers[1]?.click()

      expect(triggers[0]?.getAttribute('aria-selected')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-selected')).toBe('false')
    })

    it('should call onValueChange when switching tabs', () => {
      const container = document.createElement('div')
      let changedValue = ''
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        defaultValue: 'tab1',
        onValueChange: (value) => {
          changedValue = value
        },
        children: (getContext) =>
          List(
            {
              children: (getContext2) => (parent: HTMLElement) => {
                const unmount1 = Trigger({ value: 'tab1' }, getContext2)(parent)
                const unmount2 = Trigger({ value: 'tab2' }, getContext2)(parent)
                return () => {
                  unmount1?.()
                  unmount2?.()
                }
              }
            },
            getContext
          )
      })(container)

      const triggers = container.querySelectorAll('button')
      triggers[1]?.click()

      expect(changedValue).toBe('tab2')
    })

    it('should respect controlled mode (value prop)', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      Root({
        value: 'tab1',
        children: (getContext) =>
          List(
            {
              children: (getContext2) => (parent: HTMLElement) => {
                const unmount1 = Trigger({ value: 'tab1' }, getContext2)(parent)
                const unmount2 = Trigger({ value: 'tab2' }, getContext2)(parent)
                return () => {
                  unmount1?.()
                  unmount2?.()
                }
              }
            },
            getContext
          )
      })(container)

      const triggers = container.querySelectorAll('button')
      triggers[1]?.click()

      // In controlled mode, visual state should not change
      expect(triggers[0]?.getAttribute('aria-selected')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-selected')).toBe('false')
    })
  })

  describe('createTabs (composed)', () => {
    it('should render root with list', () => {
      const container = document.createElement('div')
      const Tabs = createTabs()
      Tabs({ defaultValue: 'tab1' })(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root).toBeTruthy()

      const list = container.querySelector('[role="tablist"]')
      expect(list).toBeTruthy()
    })

    it('should pass class to root', () => {
      const container = document.createElement('div')
      const Tabs = createTabs()
      Tabs({ class: 'my-tabs' })(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root?.className).toContain('my-tabs')
    })

    it('should pass listClass to list', () => {
      const container = document.createElement('div')
      const Tabs = createTabs()
      Tabs({ listClass: 'my-list' })(container)

      const list = container.querySelector('[role="tablist"]')
      expect(list?.className).toContain('my-list')
    })
  })

  describe('tabs preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      tabs()(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root).toBeTruthy()
      expect(root?.getAttribute('data-orientation')).toBe('horizontal')
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove list on unmount', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()

      const unmount = Root({
        children: (getContext) => List({}, getContext)
      })(container)

      expect(container.querySelector('[role="tablist"]')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('[role="tablist"]')).toBeFalsy()
    })

    it('should remove trigger on unmount', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()

      const unmount = Root({
        children: (getContext) =>
          List(
            {
              children: (getContext2) => Trigger({ value: 'tab1' }, getContext2)
            },
            getContext
          )
      })(container)

      expect(container.querySelector('button')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('button')).toBeFalsy()
    })

    it('should remove content on unmount', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const Content = createTabsContent()

      const unmount = Root({
        children: (getContext) => Content({ value: 'tab1' }, getContext)
      })(container)

      expect(container.querySelector('[role="tabpanel"]')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('[role="tabpanel"]')).toBeFalsy()
    })

    it('should cleanup multiple triggers and contents', () => {
      const container = document.createElement('div')
      const Root = createTabsRoot()
      const List = createTabsList()
      const Trigger = createTabsTrigger()
      const Content = createTabsContent()

      const unmount = Root({
        defaultValue: 'tab1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountList = List(
            {
              children: (getContext2) => (listParent: HTMLElement) => {
                const u1 = Trigger({ value: 'tab1' }, getContext2)(listParent)
                const u2 = Trigger({ value: 'tab2' }, getContext2)(listParent)
                return () => {
                  u1?.()
                  u2?.()
                }
              }
            },
            getContext
          )(parent)
          const u3 = Content({ value: 'tab1' }, getContext)(parent)
          const u4 = Content({ value: 'tab2' }, getContext)(parent)
          return () => {
            unmountList?.()
            u3?.()
            u4?.()
          }
        }
      })(container)

      expect(container.querySelectorAll('button').length).toBe(2)
      expect(container.querySelectorAll('[role="tabpanel"]').length).toBe(2)

      unmount?.()

      expect(container.querySelectorAll('button').length).toBe(0)
      expect(container.querySelectorAll('[role="tabpanel"]').length).toBe(0)
    })
  })
})
