/**
 * Dialog - a modal the user can dismiss.
 *
 * The sibling of AlertDialog, and the difference is exactly the point: an alert
 * is a decision that has to be answered, so it refuses Escape and outside
 * presses; a dialog is a panel the user opened and can just as well close, so
 * both gestures dismiss it. The two share the same primitives — a focus scope
 * and a dismissable layer — and differ only in what they tell them.
 *
 * Both gestures go through the callbacks first, so a consumer can veto with
 * `preventDefault()` (confirm-before-discard, an unsaved-changes guard), and
 * `onInteractOutside` reports a press outside without dismissing when the
 * dialog is configured not to.
 *
 * Composed on element factories from the isomorphic entry: the open state is a
 * runtime ref and the parts bind to it.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, h2, p } from '@rasenjs/web/elements'
import { createElementRef } from '../../internal/element-ref'
import { readProp } from '../../internal/props'
import { createFocusScope } from '../../internal/focus-scope'
import { createDismissableLayer } from '../../internal/dismissable-layer'
import { lockScroll, unlockScroll } from '../../internal/scroll-lock'
import { withCleanup } from '../../internal/with-cleanup'

export interface DialogContext {
  /** Reactive open state (property getter; wrap to read reactively). */
  open: boolean
  setOpen: (open: boolean) => void
  /** Title/description ids, used for aria-labelledby / aria-describedby. */
  titleId: string | null
  setTitleId: (id: string | null) => void
  descriptionId: string | null
  setDescriptionId: (id: string | null) => void
  /** The panel element, for a consumer that needs to reach it. */
  contentElement: HTMLElement | null
  setContentElement: (el: HTMLElement | null) => void
}

export interface DialogRootProps {
  id?: string
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  onOpenChange?: (open: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface DialogTriggerProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface DialogContentProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  /** Called before the dialog focuses anything; preventDefault to take over. */
  onOpenAutoFocus?: (event: Event) => void
  /** Called before focus is restored; preventDefault to place it yourself. */
  onCloseAutoFocus?: (event: Event) => void
  /** Called on Escape; preventDefault to keep the dialog open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  /** Called on a press outside; preventDefault to keep the dialog open. */
  onPointerDownOutside?: (event: Event) => void
  /** Called when focus leaves; preventDefault to keep the dialog open. */
  onFocusOutside?: (event: FocusEvent) => void
  /** Dismiss on Escape (default true). */
  dismissOnEscape?: boolean
  /** Dismiss on a press outside (default true). */
  dismissOnPointerDownOutside?: boolean
  /** Dismiss when focus leaves (default false). */
  dismissOnFocusOutside?: boolean
  children?: (
    getContext: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface DialogTitleProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface DialogDescriptionProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface DialogCloseProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface DialogOverlayProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

let titleIdCounter = 0
let descriptionIdCounter = 0

function generateTitleId(): string {
  return `dialog-title-${++titleIdCounter}`
}

function generateDescriptionId(): string {
  return `dialog-description-${++descriptionIdCounter}`
}

/**
 * Create the Dialog Root component.
 */
export function createDialogRoot(): (
  props?: DialogRootProps
) => Mountable<HTMLElement> {
  const component = (props?: DialogRootProps) => {
    const rt = getReactiveRuntime()

    const isControlled = props?.open !== undefined
    const internal = rt.ref(readProp(props?.defaultOpen, false))
    const currentOpen = (): boolean =>
      isControlled ? readProp(props?.open, false) : rt.unref(internal)

    let currentTitleId: string | null = null
    let currentDescriptionId: string | null = null
    let currentContentElement: HTMLElement | null = null

    const setOpen = (open: boolean): void => {
      if (open === currentOpen()) return
      if (!isControlled) {
        rt.setValue(internal, open)
      }
      props?.onOpenChange?.(open)
    }

    const context: DialogContext = {
      get open() {
        return currentOpen()
      },
      setOpen,
      get titleId() {
        return currentTitleId
      },
      setTitleId: (id) => {
        currentTitleId = id
      },
      get descriptionId() {
        return currentDescriptionId
      },
      setDescriptionId: (id) => {
        currentDescriptionId = id
      },
      get contentElement() {
        return currentContentElement
      },
      setContentElement: (el) => {
        currentContentElement = el
      }
    }
    const getContext = (): DialogContext => context

    return div({
      id: props?.id,
      'data-state': () => (currentOpen() ? 'open' : 'closed'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Dialog Trigger component.
 */
export function createDialogTrigger(): (
  props?: DialogTriggerProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogTriggerProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      id: props?.id,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      // A dialog opened from a button should announce the relationship.
      'aria-haspopup': 'dialog',
      'aria-expanded': () => (ctx?.open ? 'true' : 'false'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(true)
    })
  }
  return com(component)
}

/**
 * Create the Dialog Overlay component.
 *
 * Unlike an AlertDialog's, this one dismisses when pressed — that is the
 * gesture most users reach for to close a panel. The press is reported through
 * the layer (which listens on the document), so the overlay itself only has to
 * stay out of the way and not swallow the event.
 */
export function createDialogOverlay(): (
  props?: DialogOverlayProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogOverlayProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const ctx = getContext?.()

    return div({
      id: props?.id,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      'data-overlay': '',
      hidden: () => !ctx?.open,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Dialog Content component.
 */
export function createDialogContent(): (
  props?: DialogContentProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogContentProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const ctx = getContext?.()
    const contentRef = createElementRef<HTMLDivElement>(rt)

    const scope = createFocusScope({ container: () => contentRef.value })
    const layer = createDismissableLayer({
      container: () => contentRef.value,
      // A dialog is dismissible; that is the whole difference from an
      // AlertDialog, and each gesture is still offered to the consumer first.
      dismissOnEscape: props?.dismissOnEscape ?? true,
      dismissOnPointerDownOutside: props?.dismissOnPointerDownOutside ?? true,
      dismissOnFocusOutside: props?.dismissOnFocusOutside ?? false,
      onEscapeKeyDown: (event) => props?.onEscapeKeyDown?.(event),
      onPointerDownOutside: (event) => props?.onPointerDownOutside?.(event),
      onFocusOutside: (event) => props?.onFocusOutside?.(event),
      onDismiss: () => ctx?.setOpen(false)
    })

    // Tracks whether *this* layer holds a lock, so the pairing can never go
    // out of balance: the open/close subscription and the unmount cleanup can
    // both run, in either order.
    let scrollLocked = false
    const lock = (): void => {
      if (scrollLocked) return
      scrollLocked = true
      lockScroll()
    }
    const unlock = (): void => {
      if (!scrollLocked) return
      scrollLocked = false
      unlockScroll()
    }

    if (ctx) {
      let entered = false

      const enter = () => {
        lock()
        scope.activate()
        layer.activate()

        const event = new Event('focus', { cancelable: true })
        props?.onOpenAutoFocus?.(event)
        if (event.defaultPrevented) return
        // No decision button to prefer here, so: the first focusable thing in
        // the panel, or the panel itself (tabindex="-1" is there so it can hold
        // focus). Deferred by a microtask because a factory writes its `ref`
        // before the element is inserted, and `focus()` on a detached element
        // does nothing.
        const focusInitial = () => scope.focus(null)
        queueMicrotask(focusInitial)
      }

      const leave = () => {
        unlock()
        layer.deactivate()
        const event = new Event('focus', { cancelable: true })
        props?.onCloseAutoFocus?.(event)
        scope.deactivate(!event.defaultPrevented)
      }

      const sync = () => {
        const on = !!contentRef.value && !!ctx.open
        if (on && !entered) {
          entered = true
          enter()
        } else if (!on && entered) {
          entered = false
          leave()
        }
      }
      // Read *both* sources unconditionally, including on the evaluation that
      // collects dependencies. A subscription only tracks what its getter
      // reads when it is created, so a short-circuiting getter -
      // `contentRef.value ? ctx.open : false` - never tracks `ctx.open`: the
      // ref is still null at this point (the panel is built just below), so
      // the getter returns early, and the subscription then never hears about
      // the dialog opening. `enter()` would never run, taking initial focus,
      // the focus trap and Escape with it.
      rt.subscribe(() => {
        const panelMounted = !!contentRef.value
        const isOpen = !!ctx.open
        return panelMounted && isOpen
      }, sync)
      sync()
    }

    const panel = div({
      role: 'dialog',
      id: props?.id,
      'aria-modal': 'true',
      tabIndex: -1,
      ref: contentRef,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      hidden: () => !ctx?.open,
      'aria-labelledby': () => ctx?.titleId ?? undefined,
      'aria-describedby': () => ctx?.descriptionId ?? undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [props.children(getContext ?? (() => undefined))]
        : undefined
    })

    return withCleanup(panel, () => {
      unlock()
      layer.deactivate()
      scope.deactivate(false)
    })
  }
  return com(component)
}

/**
 * Create the Dialog Title component.
 */
export function createDialogTitle(): (
  props?: DialogTitleProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogTitleProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const ctx = getContext?.()
    // The consumer's id wins, and the context has to learn about it: it is what
    // `aria-labelledby` points at, so a panel naming itself one id while the
    // label points at another leaves the dialog unlabelled.
    const titleId = props?.id ?? generateTitleId()
    ctx?.setTitleId(titleId)

    return h2({
      id: props?.id ?? titleId,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Dialog Description component.
 */
export function createDialogDescription(): (
  props?: DialogDescriptionProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogDescriptionProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const ctx = getContext?.()
    const descriptionId = props?.id ?? generateDescriptionId()
    ctx?.setDescriptionId(descriptionId)

    return p({
      id: props?.id ?? descriptionId,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Dialog Close component.
 *
 * A dismissible dialog needs one of these — the keyboard and the overlay are
 * not the only ways out, and a panel without a visible control to close it is
 * the usual complaint about hand-rolled modals.
 */
export function createDialogClose(): (
  props?: DialogCloseProps,
  getContext?: () => DialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: DialogCloseProps,
    getContext?: () => DialogContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      id: props?.id,
      'data-close': '',
      'aria-label': 'Close',
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(false)
    })
  }
  return com(component)
}

/**
 * Dialog preset exposing the parts wired to one context.
 */
export function createDialog(): {
  Root: (props?: DialogRootProps) => Mountable<HTMLElement>
  Trigger: (
    props?: DialogTriggerProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
  Overlay: (
    props?: DialogOverlayProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
  Content: (
    props?: DialogContentProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
  Title: (
    props?: DialogTitleProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
  Description: (
    props?: DialogDescriptionProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
  Close: (
    props?: DialogCloseProps,
    getContext?: () => DialogContext | undefined
  ) => Mountable<HTMLElement>
} {
  return {
    Root: createDialogRoot(),
    Trigger: createDialogTrigger(),
    Overlay: createDialogOverlay(),
    Content: createDialogContent(),
    Title: createDialogTitle(),
    Description: createDialogDescription(),
    Close: createDialogClose()
  }
}

export const dialog = createDialog()
