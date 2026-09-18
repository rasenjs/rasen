/**
 * Accordion - vertically stacked set of expandable panels.
 *
 * single/multiple modes, collapsible, controlled/uncontrolled, keyboard
 * navigation. Composed on @rasenjs/dom element factories: the open value
 * lives in a runtime ref and parts bind to it through reactive getters,
 * while the element registries that keyboard navigation needs stay here
 * (they hold live elements, not reactive state).
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, h3, text } from '@rasenjs/dom'
import type { ElementRef } from '../../internal/element-ref'
import {
  createRovingFocus,
  type RovingFocus
} from '../../internal/roving-focus'
import { withCleanup } from '../../internal/with-cleanup'

export type AccordionType = 'single' | 'multiple'
export type AccordionOrientation = 'vertical' | 'horizontal'
export type AccordionState = 'open' | 'closed'

export interface AccordionContext extends RovingFocus<HTMLButtonElement> {
  type: AccordionType
  collapsible: boolean
  disabled: boolean
  orientation: AccordionOrientation
  /** Reactive open value snapshot. */
  value: () => string | string[]
  setValue: (value: string | string[]) => void
  isOpen: (itemValue: string) => boolean
  toggleItem: (itemValue: string) => void
  /** Element cell of an item's trigger — keyboard navigation focuses these. */
  triggerRef: (itemValue: string) => ElementRef<HTMLButtonElement>
  getTriggerId: (itemValue: string) => string
  getHeaderId: (itemValue: string) => string
  getContentId: (itemValue: string) => string
  /** Focus the n-th enabled trigger (wraps around at both ends). */
}

export interface AccordionItemContext {
  value: string
  disabled: boolean
  headerId: string
}

export interface AccordionRootProps {
  type: AccordionType
  collapsible?: boolean
  defaultValue?: string | string[]
  value?: string | string[]
  onValueChange?: (value: string | string[]) => void
  disabled?: boolean
  orientation?: AccordionOrientation
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => AccordionContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AccordionItemProps {
  value: string
  disabled?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => AccordionContext | undefined,
    getItemContext: () => AccordionItemContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AccordionHeaderProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => AccordionContext | undefined,
    getItemContext: () => AccordionItemContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AccordionTriggerProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AccordionContentProps {
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

let idCounter = 0

function generateId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

function normalizeValue(
  value: string | string[],
  type: AccordionType
): string | string[] {
  if (type === 'single') {
    return Array.isArray(value) ? (value[0] ?? '') : value
  }
  return Array.isArray(value) ? value : value ? [value] : []
}

// Module-level stack for item context passing.
const itemContextStack: AccordionItemContext[] = []

function pushItemContext(ctx: AccordionItemContext): void {
  itemContextStack.push(ctx)
}

function popItemContext(): void {
  itemContextStack.pop()
}

function getCurrentItemContext(): AccordionItemContext | undefined {
  return itemContextStack[itemContextStack.length - 1]
}

/**
 * Create the Accordion Root component.
 */
export function createAccordionRoot(): (
  props?: AccordionRootProps
) => Mountable<HTMLElement> {
  const component = (props?: AccordionRootProps) => {
    const rt = getReactiveRuntime()

    const type = props?.type ?? 'single'
    const collapsible = props?.collapsible ?? false
    const disabled = props?.disabled ?? false
    const orientation = props?.orientation ?? 'vertical'

    const isControlled = props?.value !== undefined
    const internal = rt.ref<string | string[]>(
      normalizeValue(
        props?.value ?? props?.defaultValue ?? (type === 'multiple' ? [] : ''),
        type
      )
    )
    const current = (): string | string[] =>
      isControlled
        ? normalizeValue(props?.value ?? (type === 'multiple' ? [] : ''), type)
        : rt.unref(internal)

    const roving = createRovingFocus<HTMLButtonElement>({
      rt,
      isGroupDisabled: () => disabled,
      loop: true
    })
    const triggerIds = new Map<string, string>()
    const headerIds = new Map<string, string>()
    const contentIds = new Map<string, string>()

    const getTriggerId = (itemValue: string): string => {
      if (!triggerIds.has(itemValue)) {
        triggerIds.set(itemValue, generateId('accordion-trigger'))
      }
      return triggerIds.get(itemValue)!
    }

    const getHeaderId = (itemValue: string): string => {
      if (!headerIds.has(itemValue)) {
        headerIds.set(itemValue, generateId('accordion-header'))
      }
      return headerIds.get(itemValue)!
    }

    const getContentId = (itemValue: string): string => {
      if (!contentIds.has(itemValue)) {
        contentIds.set(itemValue, generateId('accordion-content'))
      }
      return contentIds.get(itemValue)!
    }

    const isOpen = (itemValue: string): boolean => {
      const value = current()
      if (type === 'single') {
        return value === itemValue
      }
      return Array.isArray(value) && value.includes(itemValue)
    }

    const setValue = (newValue: string | string[]): void => {
      const normalized = normalizeValue(newValue, type)
      if (JSON.stringify(normalized) === JSON.stringify(current())) return
      if (!isControlled) {
        rt.setValue(internal, normalized)
      }
      props?.onValueChange?.(normalized)
    }

    const toggleItem = (itemValue: string): void => {
      if (roving.isItemDisabled(itemValue)) return

      const value = current()
      if (type === 'single') {
        if (value === itemValue) {
          if (collapsible) setValue('')
        } else {
          setValue(itemValue)
        }
      } else {
        const currentArr = Array.isArray(value) ? value : []
        if (currentArr.includes(itemValue)) {
          setValue(currentArr.filter((v) => v !== itemValue))
        } else {
          setValue([...currentArr, itemValue])
        }
      }
    }

    /**
     * Enabled item values in mount order. Liveness is judged through the ref
     * cell (`isConnected`), so an unmounted trigger drops out on its own —
     * no unregister bookkeeping and no DOM queries.
     */
    const context: AccordionContext = {
      type,
      collapsible,
      disabled,
      orientation,
      value: current,
      setValue,
      isOpen,
      toggleItem,
      ...roving,
      // Accordion names the cell after what it drives (a trigger's button).
      triggerRef: roving.itemRef,
      getTriggerId,
      getHeaderId,
      getContentId
    }
    const getContext = (): AccordionContext => context

    return div({
      'data-orientation': orientation,
      'data-disabled': disabled ? '' : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Accordion Item component.
 */
export function createAccordionItem(): (
  props?: AccordionItemProps,
  getContext?: () => AccordionContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AccordionItemProps,
    getContext?: () => AccordionContext | undefined
  ) => {
    if (!props?.value) {
      throw new Error('AccordionItem: "value" prop is required')
    }

    const ctx = getContext?.()
    const itemDisabled = props.disabled ?? false
    const headerId =
      ctx?.getHeaderId(props.value) ?? generateId('accordion-header')

    // Items announce themselves (value + disabled flag); no element needed.
    ctx?.registerItem(props.value, itemDisabled)

    const itemContext: AccordionItemContext = {
      value: props.value,
      disabled: itemDisabled,
      headerId
    }

    return withCleanup(
      div({
        'data-state': () => (ctx?.isOpen(props.value) ? 'open' : 'closed'),
        'data-disabled': itemDisabled ? '' : undefined,
        'aria-disabled': itemDisabled ? 'true' : undefined,
        class: props?.class,
        style: props?.style,
      // The item context is pushed for parts that are not handed it
      // explicitly (the parts below thread it themselves).
      children: [
        (el: HTMLElement) => {
          pushItemContext(itemContext)
          const getCtx = getContext ?? (() => undefined)
          const getItemCtx = () => itemContext
          const unmount = props.children
            ? props.children(getCtx, getItemCtx)(el, undefined)
            : undefined
          return () => {
            popItemContext()
            unmount?.()
          }
          }
        ]
      }),
      () => ctx?.unregisterItem(props.value)
    )
  }
  return com(component)
}

/**
 * Create the Accordion Header component.
 */
export function createAccordionHeader(): (
  props?: AccordionHeaderProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AccordionHeaderProps,
    getContext?: () => AccordionContext | undefined,
    getItemContext?: () => AccordionItemContext | undefined
  ) => {
    const itemCtx = getItemContext?.() ?? getCurrentItemContext()

    return h3({
      role: 'heading',
      'aria-level': 3,
      id: itemCtx?.headerId,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [props.children(getContext ?? (() => undefined), () => itemCtx)]
        : undefined
    })
  }
  return com(component)
}

/**
 * Create the Accordion Trigger component.
 */
export function createAccordionTrigger(): (
  props?: AccordionTriggerProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AccordionTriggerProps,
    getContext?: () => AccordionContext | undefined,
    getItemContext?: () => AccordionItemContext | undefined
  ) => {
    const ctx = getContext?.()
    const itemCtx = getItemContext?.() ?? getCurrentItemContext()

    const itemValue = itemCtx?.value ?? ''

    return button({
      type: 'button',
      role: 'button',
      tabIndex: -1,
      // Ids and aria-controls are computed from the item value, so no
      // element registration is involved.
      id: itemCtx ? ctx?.getTriggerId(itemCtx.value) : undefined,
      'aria-controls': itemCtx ? ctx?.getContentId(itemCtx.value) : undefined,
      ref: itemCtx ? ctx?.triggerRef(itemCtx.value) : undefined,
      'aria-expanded': () => String(ctx?.isOpen(itemValue) ?? false),
      'aria-disabled': () => String(ctx?.isItemDisabled(itemValue) ?? false),
      'data-state': () => (ctx?.isOpen(itemValue) ? 'open' : 'closed'),
      'data-orientation': ctx?.orientation,
      'data-disabled': () => (ctx?.isItemDisabled(itemValue) ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => {
        if (!ctx || !itemCtx) return
        if (ctx.isItemDisabled(itemCtx.value)) return
        ctx.toggleItem(itemCtx.value)
      },
      onKeyDown: (e: Event) => {
        const ke = e as KeyboardEvent
        if (!ctx || !itemCtx) return

        // Arrows / Home / End move between triggers (and skip disabled ones);
        // the shared helper owns that behaviour.
        if (ctx.handleArrows(ke, itemCtx.value, ctx.orientation)) return

        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault()
          if (!ctx.isItemDisabled(itemCtx.value)) {
            ctx.toggleItem(itemCtx.value)
          }
        }
      }
    })
  }
  return com(component)
}

/**
 * Create the Accordion Content component.
 */
export function createAccordionContent(): (
  props?: AccordionContentProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AccordionContentProps,
    getContext?: () => AccordionContext | undefined,
    getItemContext?: () => AccordionItemContext | undefined
  ) => {
    const ctx = getContext?.()
    const itemCtx = getItemContext?.() ?? getCurrentItemContext()
    const forceMount = props?.forceMount ?? false
    const itemValue = itemCtx?.value ?? ''

    return div({
      role: 'region',
      'aria-labelledby': itemCtx?.headerId,
      'data-state': () => (ctx?.isOpen(itemValue) ? 'open' : 'closed'),
      'data-orientation': ctx?.orientation,
      'data-disabled': () => (ctx?.isItemDisabled(itemValue) ? '' : undefined),
      hidden: () => (forceMount || ctx?.isOpen(itemValue) ? false : true),
      // Both ids come from the item value; nothing is registered.
      id: itemCtx ? ctx?.getContentId(itemCtx.value) : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Accordion preset built from a data array.
 */
export interface AccordionItemData {
  value: string
  label: string
  content: string
  disabled?: boolean
}

export function createAccordion(): (
  props?: Omit<AccordionRootProps, 'children'> & {
    itemClass?: string
    headerClass?: string
    triggerClass?: string
    contentClass?: string
    items?: AccordionItemData[]
  }
) => Mountable<HTMLElement> {
  const Root = createAccordionRoot()
  const Item = createAccordionItem()
  const Header = createAccordionHeader()
  const Trigger = createAccordionTrigger()
  const Content = createAccordionContent()

  return (props) =>
    Root({
      type: props?.type ?? 'single',
      collapsible: props?.collapsible,
      defaultValue: props?.defaultValue,
      value: props?.value,
      onValueChange: props?.onValueChange,
      disabled: props?.disabled,
      orientation: props?.orientation,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        div({
          children: (props?.items ?? []).map((item) =>
            Item(
              {
                value: item.value,
                disabled: item.disabled,
                class: props?.itemClass,
                children: (getCtx, getItemCtx) => (itemEl: HTMLElement) => {
                  const headerUnmount = Header(
                    {
                      class: props?.headerClass,
                      children: (getCtx2, getItemCtx2) =>
                        Trigger(
                          {
                            class: props?.triggerClass,
                            children: () => text({ content: item.label })
                          },
                          getCtx2,
                          getItemCtx2
                        )
                    },
                    getCtx,
                    getItemCtx
                  )(itemEl, undefined)
                  const contentUnmount = Content(
                    {
                      class: props?.contentClass,
                      children: () => text({ content: item.content })
                    },
                    getCtx,
                    getItemCtx
                  )(itemEl, undefined)
                  return () => {
                    headerUnmount?.()
                    contentUnmount?.()
                  }
                }
              },
              getContext
            )
          )
        })
    })
}

export const accordion = createAccordion()
