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
import { div, button, h2, p } from '@rasenjs/dom'
import { createElementRef } from '../../internal/element-ref'
import { readProp } from '../../internal/props'

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
  previousFocusElement: HTMLElement | null
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
    let previousFocusElement: HTMLElement | null = null

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
      },
      get previousFocusElement() {
        return previousFocusElement
      },
      set previousFocusElement(el: HTMLElement | null) {
        previousFocusElement = el
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

    const focusAction = (content: HTMLElement): void => {
      if (!ctx) return

      if (
        typeof document !== 'undefined' &&
        document.activeElement instanceof HTMLElement
      ) {
        ctx.previousFocusElement = document.activeElement
      }

      requestAnimationFrame(() => {
        if (props?.onOpenAutoFocus) {
          const event = new Event('focus', { cancelable: true })
          props.onOpenAutoFocus(event)
          if (event.defaultPrevented) return
        }

        const action = ctx.actionElement
        const cancel = ctx.cancelElement
        if (action) {
          action.focus()
        } else if (cancel) {
          cancel.focus()
        } else {
          content.focus()
        }
      })
    }

    // The dialog moves focus when it opens. The content element arrives
    // through the ref, so the effect is driven by that ref becoming set —
    // and re-runs whenever `open` flips.
    if (ctx) {
      const runFocus = () => {
        const content = contentRef.value
        if (content && ctx.open) focusAction(content)
      }
      const stops = [
        rt.subscribe(() => contentRef.value, runFocus),
        rt.subscribe(() => ctx.open, runFocus)
      ]
      // The subscriptions above only fire on change; a dialog that mounts
      // already open must focus too.
      runFocus()
      // Cleanup is owned by the enclosing com scope.
      void stops
    }

    return div({
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
      onKeyDown: (e: Event) => {
        const event = e as KeyboardEvent
        // Escape does not close an AlertDialog unless the consumer opts in.
        if (event.key !== 'Escape') return
        if (props?.onEscapeKeyDown) {
          props.onEscapeKeyDown(event)
        } else {
          event.preventDefault()
        }
      },
      children: props?.children
        ? [props.children(getContext ?? (() => undefined))]
        : undefined
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
