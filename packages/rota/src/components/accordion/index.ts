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
import { getReactiveRuntime } from '@rasenjs/core'
import { div, button, h3 } from '@rasenjs/dom'

export type AccordionType = 'single' | 'multiple'
export type AccordionOrientation = 'vertical' | 'horizontal'
export type AccordionState = 'open' | 'closed'

export interface AccordionContext {
  type: AccordionType
  collapsible: boolean
  disabled: boolean
  orientation: AccordionOrientation
  /** Reactive open value snapshot. */
  value: () => string | string[]
  setValue: (value: string | string[]) => void
  isOpen: (itemValue: string) => boolean
  toggleItem: (itemValue: string) => void
  registerTrigger: (el: HTMLElement, itemValue: string) => void
  unregisterTrigger: (el: HTMLElement) => void
  registerContent: (
    el: HTMLElement,
    itemValue: string,
    headerId: string
  ) => void
  unregisterContent: (el: HTMLElement) => void
  getTriggerId: (itemValue: string) => string
  getHeaderId: (itemValue: string) => string
  getContentId: (itemValue: string) => string
  focusTrigger: (index: number) => void
  getEnabledTriggers: () => HTMLElement[]
  getTriggerIndex: (el: HTMLElement) => number
  registerItem: (el: HTMLElement, itemValue: string, itemDisabled: boolean) => void
  unregisterItem: (el: HTMLElement) => void
  isItemDisabled: (itemValue: string) => boolean
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
  return (props?: AccordionRootProps) => {
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

    const triggerElements = new Map<HTMLElement, string>()
    const contentElements = new Map<
      HTMLElement,
      { value: string; headerId: string }
    >()
    const itemElements = new Map<HTMLElement, { value: string; disabled: boolean }>()
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

    const isItemDisabled = (itemValue: string): boolean => {
      if (disabled) return true
      for (const [, item] of itemElements) {
        if (item.value === itemValue && item.disabled) return true
      }
      return false
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
      if (isItemDisabled(itemValue)) return

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

    const registerTrigger = (el: HTMLElement, itemValue: string): void => {
      triggerElements.set(el, itemValue)
      el.id = getTriggerId(itemValue)
      el.setAttribute('aria-controls', getContentId(itemValue))
    }

    const unregisterTrigger = (el: HTMLElement): void => {
      triggerElements.delete(el)
    }

    const registerContent = (
      el: HTMLElement,
      itemValue: string,
      _headerId: string
    ): void => {
      contentElements.set(el, { value: itemValue, headerId: _headerId })
      el.id = getContentId(itemValue)
    }

    const unregisterContent = (el: HTMLElement): void => {
      contentElements.delete(el)
    }

    const registerItem = (
      el: HTMLElement,
      itemValue: string,
      itemDisabled: boolean
    ): void => {
      itemElements.set(el, { value: itemValue, disabled: itemDisabled })
    }

    const unregisterItem = (el: HTMLElement): void => {
      itemElements.delete(el)
    }

    const getEnabledTriggers = (): HTMLElement[] =>
      Array.from(triggerElements.keys()).filter(
        (el) => !isItemDisabled(triggerElements.get(el)!)
      )

    const getTriggerIndex = (el: HTMLElement): number =>
      getEnabledTriggers().indexOf(el)

    const focusTrigger = (index: number): void => {
      const enabled = getEnabledTriggers()
      if (enabled.length === 0) return
      const targetIndex = ((index % enabled.length) + enabled.length) % enabled.length
      enabled[targetIndex]?.focus()
    }

    const context: AccordionContext = {
      type,
      collapsible,
      disabled,
      orientation,
      value: current,
      setValue,
      isOpen,
      toggleItem,
      registerTrigger,
      unregisterTrigger,
      registerContent,
      unregisterContent,
      getTriggerId,
      getHeaderId,
      getContentId,
      focusTrigger,
      getEnabledTriggers,
      getTriggerIndex,
      registerItem,
      unregisterItem,
      isItemDisabled
    }
    const getContext = (): AccordionContext => context

    return div({
      dataOrientation: orientation,
      dataDisabled: disabled ? '' : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
}

/**
 * Create the Accordion Item component.
 */
export function createAccordionItem(): (
  props?: AccordionItemProps,
  getContext?: () => AccordionContext | undefined
) => Mountable<HTMLElement> {
  return (
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

    const itemContext: AccordionItemContext = {
      value: props.value,
      disabled: itemDisabled,
      headerId
    }

    return div({
      dataState: () => (ctx?.isOpen(props.value) ? 'open' : 'closed'),
      dataDisabled: itemDisabled ? '' : undefined,
      ariaDisabled: itemDisabled ? 'true' : undefined,
      class: props?.class,
      style: props?.style,
      // Element registries are set up before children mount so the parts
      // can resolve the item context synchronously. Always injected — the
      // item context stack must be balanced even without children.
      children: [
        (el: HTMLElement) => {
          if (ctx) ctx.registerItem(el, props.value, itemDisabled)
          pushItemContext(itemContext)
          const getCtx = getContext ?? (() => undefined)
          const getItemCtx = () => itemContext
          const unmount = props.children
            ? props.children(getCtx, getItemCtx)(el)
            : undefined
          return () => {
            popItemContext()
            if (ctx) ctx.unregisterItem(el)
            unmount?.()
          }
        }
      ]
    })
  }
}

/**
 * Create the Accordion Header component.
 */
export function createAccordionHeader(): (
  props?: AccordionHeaderProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AccordionHeaderProps,
    getContext?: () => AccordionContext | undefined,
    getItemContext?: () => AccordionItemContext | undefined
  ) => {
    const itemCtx = getItemContext?.() ?? getCurrentItemContext()

    return h3({
      role: 'heading',
      ariaLevel: 3,
      id: itemCtx?.headerId,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [props.children(getContext ?? (() => undefined), () => itemCtx)]
        : undefined
    })
  }
}

/**
 * Create the Accordion Trigger component.
 */
export function createAccordionTrigger(): (
  props?: AccordionTriggerProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  return (
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
      ariaExpanded: () => String(ctx?.isOpen(itemValue) ?? false),
      ariaDisabled: () => String(ctx?.isItemDisabled(itemValue) ?? false),
      dataState: () => (ctx?.isOpen(itemValue) ? 'open' : 'closed'),
      dataOrientation: ctx?.orientation,
      dataDisabled: () => (ctx?.isItemDisabled(itemValue) ? '' : undefined),
      class: props?.class,
      style: props?.style,
      // Trigger ids / aria-controls are written by the registry, which
      // needs the live element — so this wrapper is always injected.
      children: [
        (el: HTMLElement) => {
          if (ctx && itemCtx) ctx.registerTrigger(el, itemCtx.value)
          const unmount = props?.children ? props.children()(el) : undefined
          return () => {
            if (ctx) ctx.unregisterTrigger(el)
            unmount?.()
          }
        }
      ],
      onClick: () => {
        if (!ctx || !itemCtx) return
        if (ctx.isItemDisabled(itemCtx.value)) return
        ctx.toggleItem(itemCtx.value)
      },
      onKeydown: (e: Event) => {
        const ke = e as KeyboardEvent
        if (!ctx) return
        const enabledTriggers = ctx.getEnabledTriggers()
        const currentIndex = ctx.getTriggerIndex(ke.target as HTMLElement)
        if (currentIndex === -1) return

        const prevKey = ctx.orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
        const nextKey = ctx.orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'

        switch (ke.key) {
          case nextKey:
          case prevKey: {
            ke.preventDefault()
            ctx.focusTrigger(currentIndex + (ke.key === nextKey ? 1 : -1))
            break
          }
          case 'Home':
            ke.preventDefault()
            ctx.focusTrigger(0)
            break
          case 'End':
            ke.preventDefault()
            ctx.focusTrigger(enabledTriggers.length - 1)
            break
          case 'Enter':
          case ' ':
            ke.preventDefault()
            if (itemCtx && !ctx.isItemDisabled(itemCtx.value)) {
              ctx.toggleItem(itemCtx.value)
            }
            break
        }
      }
    })
  }
}

/**
 * Create the Accordion Content component.
 */
export function createAccordionContent(): (
  props?: AccordionContentProps,
  getContext?: () => AccordionContext | undefined,
  getItemContext?: () => AccordionItemContext | undefined
) => Mountable<HTMLElement> {
  return (
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
      ariaLabelledby: itemCtx?.headerId,
      dataState: () => (ctx?.isOpen(itemValue) ? 'open' : 'closed'),
      dataOrientation: ctx?.orientation,
      dataDisabled: () => (ctx?.isItemDisabled(itemValue) ? '' : undefined),
      hidden: () => (forceMount || ctx?.isOpen(itemValue) ? false : true),
      class: props?.class,
      style: props?.style,
      // Same as the trigger: the registry needs the live element.
      children: [
        (el: HTMLElement) => {
          if (ctx && itemCtx) {
            ctx.registerContent(el, itemCtx.value, itemCtx.headerId)
          }
          const unmount = props?.children ? props.children()(el) : undefined
          return () => {
            if (ctx) ctx.unregisterContent(el)
            unmount?.()
          }
        }
      ]
    })
  }
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
                            children: () => (triggerEl: HTMLElement) => {
                              triggerEl.textContent = item.label
                            }
                          },
                          getCtx2,
                          getItemCtx2
                        )
                    },
                    getCtx,
                    getItemCtx
                  )(itemEl)
                  const contentUnmount = Content(
                    {
                      class: props?.contentClass,
                      children: () => (contentEl: HTMLElement) => {
                        contentEl.textContent = item.content
                      }
                    },
                    getCtx,
                    getItemCtx
                  )(itemEl)
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
