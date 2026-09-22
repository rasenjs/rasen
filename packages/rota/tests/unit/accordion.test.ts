import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div } from '@rasenjs/web/elements'
import {
  createAccordionRoot,
  createAccordionItem,
  createAccordionHeader,
  createAccordionTrigger,
  createAccordionContent,
  createAccordion,
  accordion
} from '@rasenjs/rota/components/accordion'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Accordion', () => {
  describe('createAccordionRoot', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      Root({ type: 'single' })(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should have data-orientation attribute default to vertical', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      Root({ type: 'single' })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-orientation')).toBe('vertical')
    })

    it('should support horizontal orientation', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      Root({ type: 'single', orientation: 'horizontal' })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-orientation')).toBe('horizontal')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      Root({ type: 'single', class: 'my-accordion' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-accordion')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      Root({ type: 'single', style: { maxWidth: '500px' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.maxWidth).toBe('500px')
    })

    it('should render children', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()

      Root({
        type: 'single',
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

  describe('createAccordionItem', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Item = createAccordionItem()
      Item({ value: 'item-1' })(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should throw if value is not provided', () => {
      const Item = createAccordionItem()
      expect(() => Item()(document.createElement('div'))).toThrow(
        'AccordionItem: "value" prop is required'
      )
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Item = createAccordionItem()
      Item({ value: 'item-1', class: 'my-item' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-item')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Item = createAccordionItem()
      Item({ value: 'item-1', style: { marginBottom: '10px' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.marginBottom).toBe('10px')
    })

    it('should render children with context', () => {
      const container = document.createElement('div')
      const Item = createAccordionItem()

      Item({
        value: 'item-1',
        children: (getContext, getItemContext) => {
          const child = document.createElement('span')
          child.textContent = 'Item Child'
          return (parent: HTMLElement) => {
            parent.appendChild(child)
            return () => child.remove()
          }
        }
      })(container)

      const el = container.querySelector('span')
      expect(el?.textContent).toBe('Item Child')
    })
  })

  describe('createAccordionHeader', () => {
    it('should render an h3 element with role="heading"', () => {
      const container = document.createElement('div')
      const Header = createAccordionHeader()
      Header()(container)

      const el = container.querySelector('h3')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('heading')
      expect(el?.getAttribute('aria-level')).toBe('3')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Header = createAccordionHeader()
      Header({ class: 'my-header' })(container)

      const el = container.querySelector('h3')
      expect(el?.className).toContain('my-header')
    })

    it('should have id from item context', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()

      let announcedHeaderId: string | undefined

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) =>
          Item(
            {
              value: 'item-1',
              children: (getContext2, getItemContext) => {
                announcedHeaderId = getItemContext()?.headerId
                return Header({}, getContext2, getItemContext)
              }
            },
            getContext
          )
      })(container)

      const header = container.querySelector('h3')
      expect(header?.id).toBeTruthy()
      // The header renders the id the item announced the moment it mounted.
      // That equality is what lets the panel's aria-labelledby point at it.
      expect(header?.id).toBe(announcedHeaderId)
    })

    it('should name ids from the instance prefix and the item position', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      Root({
        type: 'single',
        idPrefix: 'demo',
        children: (getContext) =>
          div({
            children: ['a', 'b'].map((value, index) =>
              Item(
                {
                  value,
                  children: (getContext2, getItemContext) =>
                    Header(
                      {
                        children: () =>
                          Trigger({}, getContext2, getItemContext)
                      },
                      getContext2,
                      getItemContext
                    )
                },
                getContext
              )
            )
          })
      })(container)

      const triggers = container.querySelectorAll('button')
      expect(triggers[0]?.id).toBe('demo-trigger-1')
      expect(triggers[1]?.id).toBe('demo-trigger-2')
      expect(container.querySelector('h3')?.id).toBe('demo-header-1')
    })

    it('should number a disabled item in place instead of skipping it', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      Root({
        type: 'single',
        idPrefix: 'demo',
        children: (getContext) =>
          div({
            // The disabled item is second, so the third item is number 3 -
            // skipping the disabled one would renumber it to 2 and move the
            // id out from under anything referring to it.
            children: ['a', 'b', 'c'].map((value, index) =>
              Item(
                {
                  value,
                  disabled: index === 1,
                  children: (getContext2, getItemContext) =>
                    Header(
                      {
                        children: () => Trigger({}, getContext2, getItemContext)
                      },
                      getContext2,
                      getItemContext
                    )
                },
                getContext
              )
            )
          })
      })(container)

      const triggers = container.querySelectorAll('button')
      expect(triggers[0]?.id).toBe('demo-trigger-1')
      // Disabled, but still number 2.
      expect(triggers[1]?.id).toBe('demo-trigger-2')
      expect(triggers[2]?.id).toBe('demo-trigger-3')
    })

    it('should not share ids between two accordions', () => {
      const first = document.createElement('div')
      const second = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      const render = (container: HTMLElement) =>
        Root({
          type: 'single',
          // No idPrefix: each instance has to invent its own, or the ids of
          // two accordions on one page would collide.
          children: (getContext) =>
            Item(
              {
                value: 'only',
                children: (getContext2, getItemContext) =>
                  Header(
                    {
                      children: () => Trigger({}, getContext2, getItemContext)
                    },
                    getContext2,
                    getItemContext
                  )
              },
              getContext
            )
        })(container)

      render(first)
      render(second)

      const a = first.querySelector('button')?.id
      const b = second.querySelector('button')?.id
      expect(a).toBeTruthy()
      expect(b).toBeTruthy()
      expect(a).not.toBe(b)
    })

    it('should put the id prop on the root element', () => {
      const container = document.createElement('div')
      createAccordionRoot()({ type: 'single', id: 'my-accordion' })(container)

      expect(container.querySelector('#my-accordion')).toBeTruthy()
    })
  })

  describe('createAccordionTrigger', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const Trigger = createAccordionTrigger()
      Trigger()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
      expect(el?.type).toBe('button')
    })

    it('should have role="button" and aria-expanded when in context', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) =>
          Item(
            {
              value: 'item-1',
              children: (getContext2, getItemContext) =>
                Header(
                  {
                    children: (getContext3, getItemContext2) =>
                      Trigger({}, getContext3, getItemContext2)
                  },
                  getContext2
                )
            },
            getContext
          )
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('role')).toBe('button')
      expect(trigger?.hasAttribute('aria-expanded')).toBe(true)
    })

    it('should have aria-expanded="true" when open', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) =>
          Item(
            {
              value: 'item-1',
              children: (getContext2, getItemContext) =>
                Header(
                  {
                    children: (getContext3, getItemContext2) =>
                      Trigger({}, getContext3, getItemContext2)
                  },
                  getContext2
                )
            },
            getContext
          )
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
      expect(trigger?.getAttribute('data-state')).toBe('open')
    })

    it('should have aria-expanded="false" when closed', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      Root({
        type: 'single',
        children: (getContext) =>
          Item(
            {
              value: 'item-1',
              children: (getContext2, getItemContext) =>
                Header(
                  {
                    children: (getContext3, getItemContext2) =>
                      Trigger({}, getContext3, getItemContext2)
                  },
                  getContext2
                )
            },
            getContext
          )
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
      expect(trigger?.getAttribute('data-state')).toBe('closed')
    })

    it('should have aria-controls linking to content', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  const unmountHeader = Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  const unmountContent = Content(
                    {},
                    getContext2,
                    getItemContext
                  )(itemParent)
                  return () => {
                    unmountHeader?.()
                    unmountContent?.()
                  }
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      const controls = trigger?.getAttribute('aria-controls')
      const content = container.querySelector('[role="region"]')
      expect(controls).toBeTruthy()
      expect(content?.id).toBe(controls)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Trigger = createAccordionTrigger()
      Trigger({ class: 'my-trigger' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-trigger')
    })
  })

  describe('createAccordionContent', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Content = createAccordionContent()
      Content()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should have role="region" and aria-labelledby when in context', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  const unmountHeader = Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  const unmountContent = Content(
                    {},
                    getContext2,
                    getItemContext
                  )(itemParent)
                  return () => {
                    unmountHeader?.()
                    unmountContent?.()
                  }
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const content = container.querySelector(
        '[role="region"][aria-labelledby]'
      )
      expect(content?.getAttribute('role')).toBe('region')
      expect(content?.hasAttribute('aria-labelledby')).toBe(true)
    })

    it('should have data-state="open" when open', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const content = container.querySelector(
        '[role="region"][aria-labelledby]'
      )
      expect(content?.getAttribute('data-state')).toBe('open')
      expect(content?.hasAttribute('hidden')).toBe(false)
    })

    it('should have data-state="closed" and hidden attr when closed', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const content = container.querySelector(
        '[role="region"][aria-labelledby]'
      )
      expect(content?.getAttribute('data-state')).toBe('closed')
      expect(content?.hasAttribute('hidden')).toBe(true)
    })

    it('should render when forceMount is true even if closed', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      const childContent = document.createElement('p')
      childContent.textContent = 'Always visible'

      Root({
        type: 'single',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content(
                    {
                      forceMount: true,
                      children: () => (contentParent: HTMLElement) => {
                        contentParent.appendChild(childContent)
                        return () => childContent.remove()
                      }
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const content = container.querySelector(
        '[role="region"][aria-labelledby]'
      )
      expect(content?.getAttribute('data-state')).toBe('closed')
      expect(content?.querySelector('p')?.textContent).toBe('Always visible')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Content = createAccordionContent()
      Content({ class: 'my-content' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-content')
    })
  })

  describe('single mode interaction', () => {
    it('should toggle item open on trigger click', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')

      trigger?.click()

      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    })

    it('should close item when collapsible is true and clicking open item', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        collapsible: true,
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')

      trigger?.click()

      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    })

    it('should not close item when collapsible is false (default)', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      trigger?.click()

      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    })

    it('should switch to another item in single mode', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem1 = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          const unmountItem2 = Item(
            {
              value: 'item-2',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => {
            unmountItem1?.()
            unmountItem2?.()
          }
        }
      })(container)

      const triggers = container.querySelectorAll('button')
      expect(triggers[0]?.getAttribute('aria-expanded')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-expanded')).toBe('false')

      triggers[1]?.click()

      expect(triggers[0]?.getAttribute('aria-expanded')).toBe('false')
      expect(triggers[1]?.getAttribute('aria-expanded')).toBe('true')
    })

    it('should call onValueChange when toggling', () => {
      const container = document.createElement('div')
      let changedValue = ''
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        onValueChange: (value) => {
          changedValue = value as string
        },
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      trigger?.click()

      expect(changedValue).toBe('item-1')
    })

    it('should respect controlled mode (value prop)', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        value: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      trigger?.click()

      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    })
  })

  describe('multiple mode interaction', () => {
    it('should allow multiple items to be open', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'multiple',
        defaultValue: ['item-1'],
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem1 = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          const unmountItem2 = Item(
            {
              value: 'item-2',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => {
            unmountItem1?.()
            unmountItem2?.()
          }
        }
      })(container)

      const triggers = container.querySelectorAll('button')
      triggers[1]?.click()

      expect(triggers[0]?.getAttribute('aria-expanded')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-expanded')).toBe('true')
    })

    it('should toggle individual items in multiple mode', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'multiple',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem1 = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          const unmountItem2 = Item(
            {
              value: 'item-2',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => {
            unmountItem1?.()
            unmountItem2?.()
          }
        }
      })(container)

      const triggers = container.querySelectorAll('button')
      triggers[0]?.click()
      triggers[1]?.click()

      expect(triggers[0]?.getAttribute('aria-expanded')).toBe('true')
      expect(triggers[1]?.getAttribute('aria-expanded')).toBe('true')

      triggers[0]?.click()

      expect(triggers[0]?.getAttribute('aria-expanded')).toBe('false')
      expect(triggers[1]?.getAttribute('aria-expanded')).toBe('true')
    })
  })

  describe('disabled state', () => {
    it('should have aria-disabled and data-disabled when root is disabled', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        disabled: true,
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-disabled')).toBe('true')
      expect(trigger?.hasAttribute('data-disabled')).toBe(true)
    })

    it('should have aria-disabled and data-disabled when item is disabled', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        defaultValue: 'item-1',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              disabled: true,
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      expect(trigger?.getAttribute('aria-disabled')).toBe('true')
      expect(trigger?.hasAttribute('data-disabled')).toBe(true)
    })

    it('should not toggle when disabled', () => {
      const container = document.createElement('div')
      let changedValue = ''
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      Root({
        type: 'single',
        disabled: true,
        onValueChange: (value) => {
          changedValue = value as string
        },
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      const trigger = container.querySelector('button')
      trigger?.click()

      expect(changedValue).toBe('')
    })
  })

  describe('createAccordion (composed)', () => {
    it('should render root with default props', () => {
      const container = document.createElement('div')
      const Accordion = createAccordion()
      Accordion({ type: 'single' })(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root).toBeTruthy()
      expect(root?.getAttribute('data-orientation')).toBe('vertical')
    })

    it('should pass class to root', () => {
      const container = document.createElement('div')
      const Accordion = createAccordion()
      Accordion({ type: 'single', class: 'my-accordion' })(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root?.className).toContain('my-accordion')
    })
  })

  describe('accordion preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      accordion()(container)

      const root = container.querySelector('div[data-orientation]')
      expect(root).toBeTruthy()
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const unmount = Root({ type: 'single', class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove item on unmount', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()

      const unmount = Root({
        type: 'single',
        children: (getContext) => Item({ value: 'item-1' }, getContext)
      })(container)

      expect(container.querySelector('div')).toBeTruthy()

      unmount?.()

      expect(container.querySelectorAll('div').length).toBe(0)
    })

    it('should remove trigger on unmount', () => {
      const container = document.createElement('div')
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()

      const unmount = Root({
        type: 'single',
        children: (getContext) =>
          Item(
            {
              value: 'item-1',
              children: (getContext2, getItemContext) =>
                Header(
                  {
                    children: (getContext3, getItemContext2) =>
                      Trigger({}, getContext3, getItemContext2)
                  },
                  getContext2,
                  getItemContext
                )
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
      const Root = createAccordionRoot()
      const Item = createAccordionItem()
      const Header = createAccordionHeader()
      const Trigger = createAccordionTrigger()
      const Content = createAccordionContent()

      const unmount = Root({
        type: 'single',
        children: (getContext) => (parent: HTMLElement) => {
          const unmountItem = Item(
            {
              value: 'item-1',
              children:
                (getContext2, getItemContext) => (itemParent: HTMLElement) => {
                  Header(
                    {
                      children: (getContext3, getItemContext2) =>
                        Trigger({}, getContext3, getItemContext2)
                    },
                    getContext2,
                    getItemContext
                  )(itemParent)
                  Content({}, getContext2, getItemContext)(itemParent)
                  return () => {}
                }
            },
            getContext
          )(parent)
          return () => unmountItem?.()
        }
      })(container)

      expect(container.querySelectorAll('div').length).toBeGreaterThan(0)

      unmount?.()

      expect(container.querySelectorAll('div').length).toBe(0)
    })
  })
})

/**
 * Two accordions on one page. A part that resolves its item context from
 * module-level state ("the item that was mounted last") cannot tell which
 * accordion it belongs to — so its ids and state come from the wrong one.
 */
describe('@rasenjs/rota - Accordion / two instances', () => {
  type CtxGetter = Parameters<ReturnType<typeof createAccordionTrigger>>[1]

  const buildAccordion = (
    container: HTMLElement,
    itemValue: string,
    onContext?: (getContext: CtxGetter) => void
  ) => {
    const Root = createAccordionRoot()
    const Item = createAccordionItem()
    const Header = createAccordionHeader()
    const Trigger = createAccordionTrigger()
    const Content = createAccordionContent()

    Root({
      type: 'single',
      children: (getContext) => (host: HTMLElement) => {
        onContext?.(getContext)
        const unmount = Item(
          {
            value: itemValue,
            children: (getCtx, getItemCtx) => (itemEl: HTMLElement) => {
              // Note: neither part is handed a context. They must still belong
              // to their own item of their own accordion.
              const parts = [Header({ children: () => Trigger({}) }), Content({})]
              const unmounts = parts.map((part) => part(itemEl, undefined))
              return () => {
                for (const u of unmounts) {
                  if (typeof u === 'function') u()
                }
              }
            }
          },
          getContext
        )(host, undefined)
        return () => typeof unmount === 'function' && unmount()
      }
    })(container)
  }

  it('should give each trigger the id of its own accordion', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(first, second)

    buildAccordion(first, 'one')
    buildAccordion(second, 'two')

    const triggerOf = (c: HTMLElement) =>
      c.querySelector('button')?.getAttribute('aria-controls')

    const firstControls = triggerOf(first)
    const secondControls = triggerOf(second)

    expect(firstControls).toBeTruthy()
    expect(secondControls).toBeTruthy()
    // Different items, so different content ids — and each trigger points at
    // the content inside its own accordion.
    expect(firstControls).not.toBe(secondControls)
    expect(first.querySelector(`#${firstControls}`)).toBeTruthy()
    expect(second.querySelector(`#${secondControls}`)).toBeTruthy()
  })

  it('should report the open state of its own item', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(first, second)

    buildAccordion(first, 'one')
    buildAccordion(second, 'two')

    expect(first.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
    expect(second.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')

    first.querySelector('button')!.click()

    // Opening the first must not make the second claim to be open.
    expect(first.querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
    expect(second.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('should not hand a part created later another item\'s ids', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(first, second)

    buildAccordion(first, 'one')
    buildAccordion(second, 'two')

    const secondControls = second
      .querySelector('button')!
      .getAttribute('aria-controls')

    // A part created *after* both accordions mounted (a lazily rendered panel,
    // a portal, deferred hydration) with no context handed to it. It is not
    // inside any item's mount scope any more.
    const Trigger = createAccordionTrigger()
    const host = document.createElement('div')
    Trigger({})(host, undefined)

    const deferred = host.querySelector('button')!
    // A module-level "current item" would still be the last item mounted, so
    // this part would render the *second* accordion's item ids — and a click
    // would toggle that item. The scope below only covers the synchronous
    // mount, so a deferred part resolves nothing and must be handed its item
    // context explicitly (the same contract as `com`'s host hooks).
    expect(deferred.getAttribute('aria-controls')).not.toBe(secondControls)
    expect(deferred.getAttribute('aria-controls')).toBeNull()
  })
})
