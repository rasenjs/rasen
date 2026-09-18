/**
 * Collapsible - expandable content region.
 *
 * Controlled and uncontrolled modes. Composed on @rasenjs/dom element
 * factories; the context exposes the open state as a ref so parts can
 * bind to it reactively.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button } from '@rasenjs/dom'
import { readProp } from '../../internal/props'

export type CollapsibleState = 'open' | 'closed'

export interface CollapsibleRootProps {
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  disabled?: PropValue<boolean>
  class?: string
  style?: Record<string, string | number> | string
  onOpenChange?: (open: boolean) => void
  children?: (getContext: () => CollapsibleContext | undefined) => Mountable<HTMLElement>
}

export interface CollapsibleTriggerProps {
  asChild?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
  onClick?: () => void
}

export interface CollapsibleContentProps {
  asChild?: boolean
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface CollapsibleContext {
  /** The effective open state (controlled or not). */
  isOpen: () => boolean
  disabled: boolean
  toggle: () => void
}

/**
 * Create the Collapsible Root component.
 */
export function createCollapsibleRoot(): (
  props?: CollapsibleRootProps
) => Mountable<HTMLElement> {
  const component = (props?: CollapsibleRootProps) => {
    const rt = getReactiveRuntime()
    const isControlled = props?.open !== undefined
    const open = rt.ref(readProp(props?.defaultOpen, false))

    const isOpen = (): boolean =>
      isControlled ? readProp(props?.open, false) : rt.unref(open)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const toggle = () => {
      if (isDisabled()) return
      const next = !isOpen()
      if (!isControlled) {
        rt.setValue(open, next)
      }
      props?.onOpenChange?.(next)
    }

    const getContext = (): CollapsibleContext => ({
      isOpen,
      disabled: isDisabled(),
      toggle
    })

    return div({
      'data-state': () => (isOpen() ? 'open' : 'closed'),
      'data-disabled': () => (isDisabled() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      // rota children contract: invoke with the context getter to get a
      // Mountable; a Mountable IS a (host) => cleanup function, which is
      // exactly what the element factory takes as a function child.
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Collapsible Trigger component.
 */
export function createCollapsibleTrigger(): (
  props?: CollapsibleTriggerProps,
  getContext?: () => CollapsibleContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: CollapsibleTriggerProps,
    getContext?: () => CollapsibleContext | undefined
  ) => {
    const isOpen = (): boolean => getContext?.()?.isOpen() ?? false

    return button({
      type: 'button',
      'aria-expanded': () => String(isOpen()),
      'data-state': () => (isOpen() ? 'open' : 'closed'),
      'data-disabled': () => (getContext?.()?.disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => {
        props?.onClick?.()
        getContext?.()?.toggle()
      }
    })
  }
  return com(component)
}

/**
 * Create the Collapsible Content component.
 */
export function createCollapsibleContent(): (
  props?: CollapsibleContentProps,
  getContext?: () => CollapsibleContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: CollapsibleContentProps,
    getContext?: () => CollapsibleContext | undefined
  ) => {
    const forceMount = props?.forceMount ?? false
    const isOpen = (): boolean => getContext?.()?.isOpen() ?? false

    return div({
      id: 'collapsible-content',
      role: 'region',
      'data-state': () => (isOpen() ? 'open' : 'closed'),
      hidden: () => (forceMount || isOpen() ? false : true),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Collapsible preset: root + trigger + content wired to one context.
 */
export function createCollapsible(): (
  props?: CollapsibleRootProps & {
    triggerClass?: string
    triggerStyle?: Record<string, string | number> | string
    contentClass?: string
    contentStyle?: Record<string, string | number> | string
    trigger?: () => Mountable<HTMLElement>
    content?: () => Mountable<HTMLElement>
  }
) => Mountable<HTMLElement> {
  const Root = createCollapsibleRoot()
  const Trigger = createCollapsibleTrigger()
  const Content = createCollapsibleContent()

  return (props) =>
    Root({
      defaultOpen: props?.defaultOpen,
      open: props?.open,
      disabled: props?.disabled,
      class: props?.class,
      style: props?.style,
      onOpenChange: props?.onOpenChange,
      children: (getContext) =>
        div({
          children: [
            Trigger(
              {
                class: props?.triggerClass,
                style: props?.triggerStyle,
                children: props?.trigger
              },
              getContext
            ),
            Content(
              {
                class: props?.contentClass,
                style: props?.contentStyle,
                children: props?.content
              },
              getContext
            )
          ]
        })
    })
}

export const collapsible = createCollapsible()
