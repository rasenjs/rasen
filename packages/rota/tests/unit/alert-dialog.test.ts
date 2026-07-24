import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createAlertDialogRoot,
  createAlertDialogTrigger,
  createAlertDialogOverlay,
  createAlertDialogContent,
  createAlertDialogTitle,
  createAlertDialogDescription,
  createAlertDialogAction,
  createAlertDialogCancel,
  createAlertDialog,
  alertDialog
} from '@rasenjs/rota/components/alert-dialog'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - AlertDialog', () => {
  describe('createAlertDialogRoot', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      Root({ class: 'my-dialog' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-dialog')
    })

    it('should apply custom style', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      Root({ style: { backgroundColor: 'red' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.backgroundColor).toBe('red')
    })

    it('should default to closed state', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      let capturedContext: any
      Root({
        children: (getContext) => (host: HTMLElement) => {
          capturedContext = getContext()
          return () => {}
        }
      })(container)

      expect(capturedContext?.open).toBe(false)
    })

    it('should support defaultOpen=true', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      let capturedContext: any
      Root({
        defaultOpen: true,
        children: (getContext) => (host: HTMLElement) => {
          capturedContext = getContext()
          return () => {}
        }
      })(container)

      expect(capturedContext?.open).toBe(true)
    })

    it('should support controlled open prop', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      let capturedContext: any
      Root({
        open: true,
        children: (getContext) => (host: HTMLElement) => {
          capturedContext = getContext()
          return () => {}
        }
      })(container)

      expect(capturedContext?.open).toBe(true)
    })

    it('should call onOpenChange when setOpen is called', () => {
      const container = document.createElement('div')
      let changedValue: boolean | undefined
      const Root = createAlertDialogRoot()
      let capturedContext: any
      Root({
        onOpenChange: (val) => {
          changedValue = val
        },
        children: (getContext) => (host: HTMLElement) => {
          capturedContext = getContext()
          return () => {}
        }
      })(container)

      capturedContext?.setOpen(true)
      expect(changedValue).toBe(true)
    })

    it('should provide context with titleId and descriptionId', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      let capturedContext: any
      Root({
        children: (getContext) => (host: HTMLElement) => {
          capturedContext = getContext()
          return () => {}
        }
      })(container)

      expect(capturedContext?.titleId).toBeNull()
      expect(capturedContext?.descriptionId).toBeNull()
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Root = createAlertDialogRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })
  })

  describe('createAlertDialogTrigger', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      Trigger()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
    })

    it('should have type="button"', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      Trigger()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('type')).toBe('button')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      Trigger({ class: 'my-trigger' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-trigger')
    })

    it('should call setOpen(true) on click when context is provided', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      let openValue: boolean | undefined
      const ctx = {
        open: false,
        setOpen: (val: boolean) => {
          openValue = val
        },
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Trigger({}, () => ctx)(container)

      const el = container.querySelector('button')
      el?.click()
      expect(openValue).toBe(true)
    })

    it('should set data-state based on context open state', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Trigger({}, () => ctx)(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('data-state')).toBe('open')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Trigger = createAlertDialogTrigger()
      const unmount = Trigger({ class: 'cleanup-trigger' })(container)

      expect(container.querySelector('.cleanup-trigger')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-trigger')).toBeFalsy()
    })
  })

  describe('createAlertDialogOverlay', () => {
    it('should render a div element', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      Overlay()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
    })

    it('should have data-state="closed" by default', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      Overlay()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('closed')
    })

    it('should reflect open state from context', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Overlay({}, () => ctx)(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('open')
    })

    it('should prevent click propagation (AlertDialog cannot close on overlay click)', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      let propagated = false
      container.addEventListener('click', () => {
        propagated = true
      })

      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Overlay({}, () => ctx)(container)

      const el = container.querySelector('div')
      el?.click()
      expect(propagated).toBe(false)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      Overlay({ class: 'my-overlay' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-overlay')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Overlay = createAlertDialogOverlay()
      const unmount = Overlay({ class: 'cleanup-overlay' })(container)

      expect(container.querySelector('.cleanup-overlay')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-overlay')).toBeFalsy()
    })
  })

  describe('createAlertDialogContent', () => {
    it('should render a div with role="alertdialog"', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      Content()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('role')).toBe('alertdialog')
    })

    it('should have aria-modal="true"', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      Content()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-modal')).toBe('true')
    })

    it('should have data-state="closed" when not open', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      Content()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('closed')
    })

    it('should have data-state="open" when context is open', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content({}, () => ctx)(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-state')).toBe('open')
    })

    it('should be hidden when not open', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      Content()(container)

      const el = container.querySelector('div')
      expect(el?.hasAttribute('hidden')).toBe(true)
    })

    it('should not be hidden when open', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content({}, () => ctx)(container)

      const el = container.querySelector('div')
      expect(el?.hasAttribute('hidden')).toBe(false)
    })

    it('should prevent ESC key from closing by default', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content({}, () => ctx)(container)

      const el = container.querySelector('div')
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
      el?.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })

    it('should call onEscapeKeyDown when ESC is pressed', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      let escapeCalled = false
      const ctx = {
        open: true,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content(
        {
          onEscapeKeyDown: () => {
            escapeCalled = true
          }
        },
        () => ctx
      )(container)

      const el = container.querySelector('div')
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      })
      el?.dispatchEvent(event)
      expect(escapeCalled).toBe(true)
    })

    it('should set aria-labelledby when titleId is in context', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: 'my-title-id',
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content({}, () => ctx)(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-labelledby')).toBe('my-title-id')
    })

    it('should set aria-describedby when descriptionId is in context', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: 'my-desc-id',
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Content({}, () => ctx)(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-describedby')).toBe('my-desc-id')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      Content({ class: 'my-content' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-content')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Content = createAlertDialogContent()
      const unmount = Content({ class: 'cleanup-content' })(container)

      expect(container.querySelector('.cleanup-content')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-content')).toBeFalsy()
    })
  })

  describe('createAlertDialogTitle', () => {
    it('should render an h2 element', () => {
      const container = document.createElement('div')
      const Title = createAlertDialogTitle()
      Title()(container)

      const el = container.querySelector('h2')
      expect(el).toBeTruthy()
    })

    it('should have a unique id', () => {
      const container = document.createElement('div')
      const Title = createAlertDialogTitle()
      Title()(container)

      const el = container.querySelector('h2')
      expect(el?.id).toBeTruthy()
      expect(el?.id).toMatch(/alert-dialog-title-/)
    })

    it('should register titleId in context', () => {
      const container = document.createElement('div')
      const Title = createAlertDialogTitle()
      let registeredId: string | null = null
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: null,
        setTitleId: (id: string | null) => {
          registeredId = id
        },
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Title({}, () => ctx)(container)

      expect(registeredId).toBeTruthy()
      expect(registeredId).toMatch(/alert-dialog-title-/)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Title = createAlertDialogTitle()
      Title({ class: 'my-title' })(container)

      const el = container.querySelector('h2')
      expect(el?.className).toContain('my-title')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Title = createAlertDialogTitle()
      const unmount = Title({ class: 'cleanup-title' })(container)

      expect(container.querySelector('.cleanup-title')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-title')).toBeFalsy()
    })
  })

  describe('createAlertDialogDescription', () => {
    it('should render a p element', () => {
      const container = document.createElement('div')
      const Description = createAlertDialogDescription()
      Description()(container)

      const el = container.querySelector('p')
      expect(el).toBeTruthy()
    })

    it('should have a unique id', () => {
      const container = document.createElement('div')
      const Description = createAlertDialogDescription()
      Description()(container)

      const el = container.querySelector('p')
      expect(el?.id).toBeTruthy()
      expect(el?.id).toMatch(/alert-dialog-description-/)
    })

    it('should register descriptionId in context', () => {
      const container = document.createElement('div')
      const Description = createAlertDialogDescription()
      let registeredId: string | null = null
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: (id: string | null) => {
          registeredId = id
        },
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Description({}, () => ctx)(container)

      expect(registeredId).toBeTruthy()
      expect(registeredId).toMatch(/alert-dialog-description-/)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Description = createAlertDialogDescription()
      Description({ class: 'my-description' })(container)

      const el = container.querySelector('p')
      expect(el?.className).toContain('my-description')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Description = createAlertDialogDescription()
      const unmount = Description({ class: 'cleanup-desc' })(container)

      expect(container.querySelector('.cleanup-desc')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-desc')).toBeFalsy()
    })
  })

  describe('createAlertDialogAction', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      Action()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
    })

    it('should have type="button"', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      Action()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('type')).toBe('button')
    })

    it('should register action element in context', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      let registeredEl: HTMLElement | null = null
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: (el: HTMLElement | null) => {
          registeredEl = el
        },
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Action({}, () => ctx)(container)

      expect(registeredEl).toBeTruthy()
      expect(registeredEl?.tagName).toBe('BUTTON')
    })

    it('should call setOpen(false) on click', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      let openValue: boolean | undefined
      const ctx = {
        open: true,
        setOpen: (val: boolean) => {
          openValue = val
        },
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Action({}, () => ctx)(container)

      const el = container.querySelector('button')
      el?.click()
      expect(openValue).toBe(false)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      Action({ class: 'my-action' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-action')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Action = createAlertDialogAction()
      const unmount = Action({ class: 'cleanup-action' })(container)

      expect(container.querySelector('.cleanup-action')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-action')).toBeFalsy()
    })
  })

  describe('createAlertDialogCancel', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      Cancel()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
    })

    it('should have type="button"', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      Cancel()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('type')).toBe('button')
    })

    it('should register cancel element in context', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      let registeredEl: HTMLElement | null = null
      const ctx = {
        open: false,
        setOpen: () => {},
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: (el: HTMLElement | null) => {
          registeredEl = el
        },
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Cancel({}, () => ctx)(container)

      expect(registeredEl).toBeTruthy()
      expect(registeredEl?.tagName).toBe('BUTTON')
    })

    it('should call setOpen(false) on click', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      let openValue: boolean | undefined
      const ctx = {
        open: true,
        setOpen: (val: boolean) => {
          openValue = val
        },
        titleId: null,
        setTitleId: () => {},
        descriptionId: null,
        setDescriptionId: () => {},
        actionElement: null,
        setActionElement: () => {},
        cancelElement: null,
        setCancelElement: () => {},
        previousFocusElement: null,
        setPreviousFocusElement: () => {}
      }
      Cancel({}, () => ctx)(container)

      const el = container.querySelector('button')
      el?.click()
      expect(openValue).toBe(false)
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      Cancel({ class: 'my-cancel' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-cancel')
    })

    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const Cancel = createAlertDialogCancel()
      const unmount = Cancel({ class: 'cleanup-cancel' })(container)

      expect(container.querySelector('.cleanup-cancel')).toBeTruthy()
      unmount?.()
      expect(container.querySelector('.cleanup-cancel')).toBeFalsy()
    })
  })

  describe('createAlertDialog (composed)', () => {
    it('should return all sub-components', () => {
      const dialog = createAlertDialog()
      expect(dialog.Root).toBeTruthy()
      expect(dialog.Trigger).toBeTruthy()
      expect(dialog.Overlay).toBeTruthy()
      expect(dialog.Content).toBeTruthy()
      expect(dialog.Title).toBeTruthy()
      expect(dialog.Description).toBeTruthy()
      expect(dialog.Action).toBeTruthy()
      expect(dialog.Cancel).toBeTruthy()
    })

    it('should render Root with children', () => {
      const container = document.createElement('div')
      const { Root, Content } = createAlertDialog()

      Root({
        children: (getContext) => Content({}, getContext)
      })(container)

      const content = container.querySelector('[role="alertdialog"]')
      expect(content).toBeTruthy()
    })
  })

  describe('alertDialog preset', () => {
    it('should have all sub-components', () => {
      expect(alertDialog.Root).toBeTruthy()
      expect(alertDialog.Trigger).toBeTruthy()
      expect(alertDialog.Overlay).toBeTruthy()
      expect(alertDialog.Content).toBeTruthy()
      expect(alertDialog.Title).toBeTruthy()
      expect(alertDialog.Description).toBeTruthy()
      expect(alertDialog.Action).toBeTruthy()
      expect(alertDialog.Cancel).toBeTruthy()
    })
  })
})
