/**
 * Collapsible - expandable content region.
 *
 * Controlled and uncontrolled modes. Composed on @rasenjs/dom element
 * factories; the context exposes the open state as a ref so parts can
 * bind to it reactively.
 */
import type { Mountable, Ref } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import { div, button } from '@rasenjs/dom'

export type CollapsibleState = 'open' | 'closed'

export interface CollapsibleRootProps {
  defaultOpen?: boolean
  open?: boolean
  disabled?: boolean
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
  open: Ref<boolean>
  disabled: boolean
  toggle: () => void
}

/**
 * Create the Collapsible Root component.
 */
export function createCollapsibleRoot(): (
  props?: CollapsibleRootProps
) => Mountable<HTMLElement> {
  return (props?: CollapsibleRootProps) => {
    const rt = getReactiveRuntime()
    const open = rt.ref(props?.defaultOpen ?? false)

    const toggle = () => {
      if (props?.disabled) return
      const next = !rt.unref(open)
      rt.setValue(open, next)
      props?.onOpenChange?.(next)
    }

    const getContext = (): CollapsibleContext => ({
      open,
      disabled: props?.disabled ?? false,
      toggle
    })

    return div({
      dataState: () => (rt.unref(open) ? 'open' : 'closed'),
      dataDisabled: () => (props?.disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      // rota children contract: invoke to get a Mountable, hand it to the
      // element factory (a Mountable IS a (host) => cleanup function).
      children: props?.children ? [props.children()] : undefined
    })
  }
}

/**
 * Create the Collapsible Trigger component.
 */
export function createCollapsibleTrigger(): (
  props?: CollapsibleTriggerProps,
  getContext?: () => CollapsibleContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: CollapsibleTriggerProps,
    getContext?: () => CollapsibleContext | undefined
  ) => {
    const rt = getReactiveRuntime()

    return button({
      type: 'button',
      ariaExpanded: () => String(rt.unref(getContext?.().open) ?? false),
      dataState: () => (rt.unref(getContext?.().open) ? 'open' : 'closed'),
      dataDisabled: () => (getContext?.().disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => {
        props?.onClick?.()
        getContext?.().toggle()
      }
    })
  }
}

/**
 * Create the Collapsible Content component.
 */
export function createCollapsibleContent(): (
  props?: CollapsibleContentProps,
  getContext?: () => CollapsibleContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: CollapsibleContentProps,
    getContext?: () => CollapsibleContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const forceMount = props?.forceMount ?? false

    return div({
      id: 'collapsible-content',
      role: 'region',
      dataState: () => (rt.unref(getContext?.().open) ? 'open' : 'closed'),
      hidden: () => (forceMount || rt.unref(getContext?.().open) ? false : true),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
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
