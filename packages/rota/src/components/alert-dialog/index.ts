/**
 * AlertDialog - modal dialog that requires an explicit user decision.
 *
 * Alert dialogs are not dismissible by overlay click or Escape by default;
 * the consumer opts in through the handler props. Composed on
 * @rasenjs/dom element factories: the open state is a runtime ref and the
 * parts bind to it, replacing the previous 50ms polling loops.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, h2, p } from '@rasenjs/web/elements'
import { createElementRef } from '../../internal/element-ref'
import { readProp } from '../../internal/props'
import { createFocusScope } from '../../internal/focus-scope'
import { createDismissableLayer } from '../../internal/dismissable-layer'
import { withCleanup } from '../../internal/with-cleanup'

export interface AlertDialogContext {
  /** Reactive open state (property getter; wrap to read reactively). */
  open: boolean
  setOpen: (open: boolean) => void
  /** Title/description ids, used for aria-labelledby / aria-describedby. */
  titleId: string | null
  setTitleId: (id: string | null) => void
  descriptionId: string | null
  setDescriptionId: (id: string | null) => void
  /** Action/cancel elements, used for initial focus. */
  actionElement: HTMLElement | null
  setActionElement: (el: HTMLElement | null) => void
  cancelElement: HTMLElement | null
  setCancelElement: (el: HTMLElement | null) => void
}

export interface AlertDialogRootProps {
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  onOpenChange?: (open: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AlertDialogTriggerProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogContentProps {
  class?: string
  style?: Record<string, string | number> | string
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
  children?: (
    getContext: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AlertDialogTitleProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogDescriptionProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogActionProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogCancelProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogOverlayProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

let titleIdCounter = 0
let descriptionIdCounter = 0

function generateTitleId(): string {
  return `alert-dialog-title-${++titleIdCounter}`
}

function generateDescriptionId(): string {
  return `alert-dialog-description-${++descriptionIdCounter}`
}

/**
 * Create the AlertDialog Root component.
 */
export function createAlertDialogRoot(): (
  props?: AlertDialogRootProps
) => Mountable<HTMLElement> {
  const component = (props?: AlertDialogRootProps) => {
    const rt = getReactiveRuntime()

    const isControlled = props?.open !== undefined
    const internal = rt.ref(readProp(props?.defaultOpen, false))
    const currentOpen = (): boolean =>
      isControlled ? readProp(props?.open, false) : rt.unref(internal)

    let currentTitleId: string | null = null
    let currentDescriptionId: string | null = null
    let currentActionElement: HTMLElement | null = null
    let currentCancelElement: HTMLElement | null = null

    const setOpen = (open: boolean): void => {
      if (open === currentOpen()) return
      if (!isControlled) {
        rt.setValue(internal, open)
      }
      props?.onOpenChange?.(open)
    }

    const context: AlertDialogContext = {
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
      get actionElement() {
        return currentActionElement
      },
      setActionElement: (el) => {
        currentActionElement = el
      },
      get cancelElement() {
        return currentCancelElement
      },
      setCancelElement: (el) => {
        currentCancelElement = el
      }
    }
    const getContext = (): AlertDialogContext => context

    return div({
      'data-state': () => (currentOpen() ? 'open' : 'closed'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Trigger component.
 */
export function createAlertDialogTrigger(): (
  props?: AlertDialogTriggerProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogTriggerProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(true)
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Overlay component.
 */
export function createAlertDialogOverlay(): (
  props?: AlertDialogOverlayProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogOverlayProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()

    return div({
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      hidden: () => !ctx?.open,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      // AlertDialog never closes on overlay click.
      onClick: (e: Event) => e.stopPropagation()
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Content component.
 */
export function createAlertDialogContent(): (
  props?: AlertDialogContentProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogContentProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const ctx = getContext?.()
    const contentRef = createElementRef<HTMLDivElement>(rt)

    // The two DOM-side primitives a modal needs: keep the keyboard inside, and
    // report the gestures that ask to close. Both stay inert until activated,
    // and activation is tied to (element present && open) — a string render
    // never reaches either.
    const scope = createFocusScope({ container: () => contentRef.value })
    const layer = createDismissableLayer({
      container: () => contentRef.value,
      // An AlertDialog refuses both gestures: the consumer opts in through the
      // callbacks, and then only the callback runs.
      dismissOnEscape: false,
      dismissOnPointerDownOutside: false,
      onEscapeKeyDown: (event) => {
        // Same contract as before, now reachable while focus is on the body:
        // the consumer's handler decides, otherwise Escape is swallowed.
        if (props?.onEscapeKeyDown) props.onEscapeKeyDown(event)
        else event.preventDefault()
      },
      onPointerDownOutside: (event) => props?.onPointerDownOutside?.(event)
    })

    if (ctx) {
      let entered = false

      const enter = () => {
        // Remember where focus came from before anything moves it.
        scope.activate()
        layer.activate()

        const event = new Event('focus', { cancelable: true })
        props?.onOpenAutoFocus?.(event)
        if (event.defaultPrevented) return
        // Deferred by a microtask, and it has to be: an element factory writes
        // its `ref` while binding — before the element is inserted — and
        // `focus()` on a detached element does nothing. A microtask runs once
        // the enclosing mount has returned, so the panel is in the tree by
        // then. (A frame would also work and is what this used to do, but it
        // costs a paint and depends on one happening at all.)
        queueMicrotask(() => {
          // The AlertDialog convention: the decision button, then cancel, then
          // the panel itself (tabindex="-1" is there so it can hold focus).
          scope.focus(ctx.actionElement ?? ctx.cancelElement ?? null)
        })
      }

      const leave = () => {
        layer.deactivate()
        const event = new Event('focus', { cancelable: true })
        props?.onCloseAutoFocus?.(event)
        // A prevented onCloseAutoFocus means "I will place focus myself".
        scope.deactivate(!event.defaultPrevented)
      }

      // One subscription over both inputs: the panel mounting, and the open
      // state. `entered` keeps the pair of transitions from firing twice (the
      // initial call happens before the ref is written).
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
      rt.subscribe(() => (contentRef.value ? ctx.open : false), sync)
      sync()
    }

    const panel = div({
      role: 'alertdialog',
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

    // Leaving the tree has to stop both, because neither the open state nor
    // anything else changes when an overlay is simply removed: the scope would
    // keep trapping Tab and the layer would keep listening on the document for
    // the life of the page. Focus is not moved here — the element is going away
    // and nobody asked for it back.
    return withCleanup(panel, () => {
      layer.deactivate()
      scope.deactivate(false)
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Title component.
 */
export function createAlertDialogTitle(): (
  props?: AlertDialogTitleProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogTitleProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()
    const titleId = generateTitleId()
    ctx?.setTitleId(titleId)

    return h2({
      id: titleId,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Description component.
 */
export function createAlertDialogDescription(): (
  props?: AlertDialogDescriptionProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogDescriptionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()
    const descriptionId = generateDescriptionId()
    ctx?.setDescriptionId(descriptionId)

    return p({
      id: descriptionId,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Action component (confirms and closes).
 */
export function createAlertDialogAction(): (
  props?: AlertDialogActionProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogActionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()
    const rt = getReactiveRuntime()
    const actionRef = createElementRef<HTMLButtonElement>(rt)

    // The element is handed to the context as soon as the ref receives it;
    // that is what initial focus is resolved against.
    rt.subscribe(() => actionRef.value, (el) => {
      if (el) ctx?.setActionElement(el)
    })

    return button({
      type: 'button',
      'data-action': '',
      ref: actionRef,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(false)
    })
  }
  return com(component)
}

/**
 * Create the AlertDialog Cancel component (dismisses and closes).
 */
export function createAlertDialogCancel(): (
  props?: AlertDialogCancelProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AlertDialogCancelProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    const ctx = getContext?.()
    const rt = getReactiveRuntime()
    const cancelRef = createElementRef<HTMLButtonElement>(rt)

    rt.subscribe(() => cancelRef.value, (el) => {
      if (el) ctx?.setCancelElement(el)
    })

    return button({
      type: 'button',
      'data-cancel': '',
      ref: cancelRef,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(false)
    })
  }
  return com(component)
}

/**
 * AlertDialog preset exposing the parts wired to one context.
 */
export function createAlertDialog(): {
  Root: (props?: AlertDialogRootProps) => Mountable<HTMLElement>
  Trigger: (
    props?: AlertDialogTriggerProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Overlay: (
    props?: AlertDialogOverlayProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Content: (
    props?: AlertDialogContentProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Title: (
    props?: AlertDialogTitleProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Description: (
    props?: AlertDialogDescriptionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Action: (
    props?: AlertDialogActionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Cancel: (
    props?: AlertDialogCancelProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
} {
  return {
    Root: createAlertDialogRoot(),
    Trigger: createAlertDialogTrigger(),
    Overlay: createAlertDialogOverlay(),
    Content: createAlertDialogContent(),
    Title: createAlertDialogTitle(),
    Description: createAlertDialogDescription(),
    Action: createAlertDialogAction(),
    Cancel: createAlertDialogCancel()
  }
}

export const alertDialog = createAlertDialog()
