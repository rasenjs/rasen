/**
 * Collapsible - expandable content region.
 *
 * Controlled and uncontrolled modes. Composed on @rasenjs/dom element
 * factories; the context exposes the open state as a ref so parts can
 * bind to it reactively.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'

export type CollapsibleState = 'open' | 'closed'

export interface CollapsibleRootProps {
  /** Id for the root element. */
  id?: string
  /**
   * Id for the content panel. The trigger's `aria-controls` follows it, so a
   * consumer that names the panel gets a labelled relationship for free.
   */
  contentId?: string
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  disabled?: PropValue<boolean>
  class?: string
  style?: Record<string, string | number> | string
  onOpenChange?: (open: boolean) => void
  children?: (getContext: () => CollapsibleContext | undefined) => Mountable<HTMLElement>
}

export interface CollapsibleTriggerProps {
  id?: string
  asChild?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
  onClick?: () => void
}

export interface CollapsibleContentProps {
  id?: string
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
  /**
   * The content panel's id. The panel registers whatever id it actually
   * renders, so `aria-controls` can never point at something that is not there
   * (that is the failure mode a hardcoded id invites).
   */
  contentId: () => string
  setContentId: (id: string) => void
}

let contentIdCounter = 0

function generateContentId(): string {
  return `collapsible-content-${++contentIdCounter}`
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

    // The panel's id lives here so the trigger can point at it; the panel
    // overwrites it with whatever id it ends up rendering.
    let currentContentId = props?.contentId ?? generateContentId()

    const getContext = (): CollapsibleContext => ({
      isOpen,
      disabled: isDisabled(),
      toggle,
      contentId: () => currentContentId,
      setContentId: (id) => {
        currentContentId = id
      }
    })

    return div({
      id: props?.id,
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
      id: props?.id,
      'aria-expanded': () => String(isOpen()),
      'aria-controls': () => getContext?.()?.contentId(),
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
    // The consumer's id wins; either way the context learns the real one so the
    // trigger's aria-controls matches.
    const ctx = getContext?.()
    const contentId = props?.id ?? ctx?.contentId() ?? generateContentId()
    ctx?.setContentId(contentId)

    return div({
      id: contentId,
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
    triggerId?: string
    contentId?: string
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
      id: props?.id,
      contentId: props?.contentId,
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
                id: props?.triggerId,
                class: props?.triggerClass,
                style: props?.triggerStyle,
                children: props?.trigger
              },
              getContext
            ),
            Content(
              {
                id: props?.contentId,
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
