/**
 * Accordion - 手风琴组件
 *
 * 垂直堆叠的交互式标题集合，每个标题都可以展开或折叠关联的内容区域。
 * 支持 single/multiple 模式，受控/非受控模式，键盘导航。
 */
import type { Mountable } from '@rasenjs/core'

export type AccordionType = 'single' | 'multiple'
export type AccordionOrientation = 'vertical' | 'horizontal'
export type AccordionState = 'open' | 'closed'

export interface AccordionContext {
  type: AccordionType
  collapsible: boolean
  disabled: boolean
  orientation: AccordionOrientation
  value: string | string[]
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
  registerItem: (
    el: HTMLElement,
    itemValue: string,
    itemDisabled: boolean
  ) => void
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

// Module-level stack for item context passing
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

function updateTriggerState(
  el: HTMLElement,
  _triggerValue: string,
  isOpen: boolean,
  disabled: boolean,
  orientation: AccordionOrientation
): void {
  el.setAttribute('aria-expanded', String(isOpen))
  el.setAttribute('data-state', isOpen ? 'open' : 'closed')
  el.setAttribute('data-orientation', orientation)
  if (disabled) {
    el.setAttribute('aria-disabled', 'true')
    el.setAttribute('data-disabled', '')
  } else {
    el.removeAttribute('aria-disabled')
    el.removeAttribute('data-disabled')
  }
}

function updateContentState(
  el: HTMLElement,
  _contentValue: string,
  isOpen: boolean,
  headerId: string,
  disabled: boolean,
  orientation: AccordionOrientation
): void {
  el.setAttribute('role', 'region')
  el.setAttribute('aria-labelledby', headerId)
  el.setAttribute('data-state', isOpen ? 'open' : 'closed')
  el.setAttribute('data-orientation', orientation)
  if (disabled) {
    el.setAttribute('data-disabled', '')
  } else {
    el.removeAttribute('data-disabled')
  }
  if (isOpen) {
    el.removeAttribute('hidden')
  } else {
    el.setAttribute('hidden', '')
  }
}

/**
 * 创建 Accordion Root 组件
 */
export function createAccordionRoot(): (
  props?: AccordionRootProps
) => Mountable<HTMLElement> {
  return (props?: AccordionRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')

      const type = props?.type ?? 'single'
      const collapsible = props?.collapsible ?? false
      const disabled = props?.disabled ?? false
      const orientation = props?.orientation ?? 'vertical'

      root.setAttribute('data-orientation', orientation)
      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      const isControlled = props?.value !== undefined
      let currentValue: string | string[] = normalizeValue(
        props?.value ?? props?.defaultValue ?? (type === 'multiple' ? [] : ''),
        type
      )

      const triggerElements = new Map<HTMLElement, string>()
      const contentElements = new Map<
        HTMLElement,
        { value: string; headerId: string }
      >()
      const itemElements = new Map<
        HTMLElement,
        { value: string; disabled: boolean }
      >()
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
        if (type === 'single') {
          return currentValue === itemValue
        }
        return Array.isArray(currentValue) && currentValue.includes(itemValue)
      }

      const updateAllStates = (): void => {
        triggerElements.forEach((triggerValue, el) => {
          const itemDisabled = isItemDisabled(triggerValue)
          updateTriggerState(
            el,
            triggerValue,
            isOpen(triggerValue),
            itemDisabled,
            orientation
          )
        })
        contentElements.forEach(({ value: contentValue, headerId }, el) => {
          const itemDisabled = isItemDisabled(contentValue)
          updateContentState(
            el,
            contentValue,
            isOpen(contentValue),
            headerId,
            itemDisabled,
            orientation
          )
        })
      }

      const setValue = (newValue: string | string[]): void => {
        const normalized = normalizeValue(newValue, type)
        if (JSON.stringify(normalized) === JSON.stringify(currentValue)) return
        currentValue = normalized
        if (!isControlled) {
          updateAllStates()
        }
        props?.onValueChange?.(normalized)
      }

      const toggleItem = (itemValue: string): void => {
        const itemDisabled = isItemDisabled(itemValue)
        if (itemDisabled) return

        if (type === 'single') {
          if (currentValue === itemValue) {
            if (collapsible) {
              setValue('')
            }
          } else {
            setValue(itemValue)
          }
        } else {
          const currentArr = Array.isArray(currentValue) ? currentValue : []
          if (currentArr.includes(itemValue)) {
            setValue(currentArr.filter((v) => v !== itemValue))
          } else {
            setValue([...currentArr, itemValue])
          }
        }
      }

      const registerTrigger = (el: HTMLElement, itemValue: string): void => {
        triggerElements.set(el, itemValue)
        const triggerId = getTriggerId(itemValue)
        const contentId = getContentId(itemValue)
        el.id = triggerId
        el.setAttribute('role', 'button')
        el.setAttribute('aria-controls', contentId)
        el.setAttribute('tabindex', '-1')
        updateTriggerState(
          el,
          itemValue,
          isOpen(itemValue),
          isItemDisabled(itemValue),
          orientation
        )
      }

      const unregisterTrigger = (el: HTMLElement): void => {
        triggerElements.delete(el)
      }

      const registerContent = (
        el: HTMLElement,
        itemValue: string,
        headerId: string
      ): void => {
        contentElements.set(el, { value: itemValue, headerId })
        el.id = getContentId(itemValue)
        updateContentState(
          el,
          itemValue,
          isOpen(itemValue),
          headerId,
          isItemDisabled(itemValue),
          orientation
        )
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

      const isItemDisabled = (itemValue: string): boolean => {
        if (disabled) return true
        for (const [, item] of itemElements) {
          if (item.value === itemValue && item.disabled) return true
        }
        return false
      }

      const getEnabledTriggers = (): HTMLElement[] => {
        return Array.from(triggerElements.keys()).filter(
          (el) => !isItemDisabled(triggerElements.get(el)!)
        )
      }

      const getTriggerIndex = (el: HTMLElement): number => {
        const enabled = getEnabledTriggers()
        return enabled.indexOf(el)
      }

      const focusTrigger = (index: number): void => {
        const enabled = getEnabledTriggers()
        if (enabled.length === 0) return
        const targetIndex =
          ((index % enabled.length) + enabled.length) % enabled.length
        enabled[targetIndex]?.focus()
      }

      const context: AccordionContext = {
        type,
        collapsible,
        disabled,
        orientation,
        value: currentValue,
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

      const getContext = (): AccordionContext | undefined => context

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext)(root)
      }

      host.appendChild(root)

      return () => {
        childUnmount?.()
        root.remove()
      }
    }
  }
}

/**
 * 创建 Accordion Item 组件
 */
export function createAccordionItem(): (
  props?: AccordionItemProps,
  getContext?: () => AccordionContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AccordionItemProps,
    getContext?: () => AccordionContext | undefined
  ) => {
    return (host: HTMLElement) => {
      if (!props?.value) {
        throw new Error('AccordionItem: "value" prop is required')
      }

      const item = document.createElement('div')
      if (props?.class) item.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(item.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.registerItem(item, props.value, props?.disabled ?? false)
      }

      const itemDisabled = props?.disabled ?? false
      const headerId =
        ctx?.getHeaderId(props.value) ?? generateId('accordion-header')

      const itemContext: AccordionItemContext = {
        value: props.value,
        disabled: itemDisabled,
        headerId
      }

      pushItemContext(itemContext)

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        const getCtx = getContext ?? (() => undefined)
        const getItemCtx = () => itemContext
        childUnmount = props.children(getCtx, getItemCtx)(item)
      }

      host.appendChild(item)

      return () => {
        if (ctx) {
          ctx.unregisterItem(item)
        }
        popItemContext()
        childUnmount?.()
        item.remove()
      }
    }
  }
}

/**
 * 创建 Accordion Header 组件
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
    return (host: HTMLElement) => {
      const header = document.createElement('h3')
      header.setAttribute('role', 'heading')
      header.setAttribute('aria-level', '3')

      const itemCtx = getItemContext?.()
      if (itemCtx) {
        header.id = itemCtx.headerId
      }

      if (props?.class) header.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(header.style, props.style)
        }
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        const getCtx = getContext ?? (() => undefined)
        const getItemCtx = getItemContext ?? (() => getCurrentItemContext())
        childUnmount = props.children(getCtx, getItemCtx)(header)
      }

      host.appendChild(header)

      return () => {
        childUnmount?.()
        header.remove()
      }
    }
  }
}

/**
 * 创建 Accordion Trigger 组件
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
    return (host: HTMLElement) => {
      const trigger = document.createElement('button')
      trigger.type = 'button'
      trigger.setAttribute('tabindex', '-1')

      if (props?.class) trigger.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(trigger.style, props.style)
        }
      }

      const ctx = getContext?.()
      const itemCtx = getItemContext?.() ?? getCurrentItemContext()

      if (ctx && itemCtx) {
        ctx.registerTrigger(trigger, itemCtx.value)

        trigger.addEventListener('click', () => {
          if (ctx.isItemDisabled(itemCtx.value)) return
          ctx.toggleItem(itemCtx.value)
        })

        trigger.addEventListener('keydown', (e: KeyboardEvent) => {
          const enabledTriggers = ctx.getEnabledTriggers()
          const currentIndex = ctx.getTriggerIndex(trigger)
          if (currentIndex === -1) return

          const orientation = ctx.orientation
          const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
          const nextKey =
            orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'

          switch (e.key) {
            case nextKey:
            case prevKey: {
              e.preventDefault()
              const direction = e.key === nextKey ? 1 : -1
              const newIndex = currentIndex + direction
              ctx.focusTrigger(newIndex)
              break
            }
            case 'Home':
              e.preventDefault()
              ctx.focusTrigger(0)
              break
            case 'End':
              e.preventDefault()
              ctx.focusTrigger(enabledTriggers.length - 1)
              break
            case 'Enter':
            case ' ':
              e.preventDefault()
              if (!ctx.isItemDisabled(itemCtx.value)) {
                ctx.toggleItem(itemCtx.value)
              }
              break
          }
        })
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(trigger)
      }

      host.appendChild(trigger)

      return () => {
        if (ctx) {
          ctx.unregisterTrigger(trigger)
        }
        childUnmount?.()
        trigger.remove()
      }
    }
  }
}

/**
 * 创建 Accordion Content 组件
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
    return (host: HTMLElement) => {
      const content = document.createElement('div')
      const forceMount = props?.forceMount ?? false

      if (props?.class) content.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(content.style, props.style)
        }
      }

      const ctx = getContext?.()
      const itemCtx = getItemContext?.() ?? getCurrentItemContext()

      if (ctx && itemCtx) {
        ctx.registerContent(content, itemCtx.value, itemCtx.headerId)
      }

      if (!forceMount && ctx && itemCtx) {
        const isOpenState = ctx.isOpen(itemCtx.value)
        if (!isOpenState) {
          content.setAttribute('hidden', '')
          content.setAttribute('data-state', 'closed')
        } else {
          content.setAttribute('data-state', 'open')
        }
      } else if (forceMount) {
        content.setAttribute(
          'data-state',
          ctx && itemCtx && ctx.isOpen(itemCtx.value) ? 'open' : 'closed'
        )
      } else {
        content.setAttribute('data-state', 'closed')
        content.setAttribute('hidden', '')
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        const shouldRender =
          !ctx || !itemCtx || ctx.isOpen(itemCtx.value) || forceMount
        if (shouldRender) {
          childUnmount = props.children()(content)
        }
      }

      host.appendChild(content)

      return () => {
        if (ctx) {
          ctx.unregisterContent(content)
        }
        childUnmount?.()
        content.remove()
      }
    }
  }
}

/**
 * Accordion 组合组件
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

  return (
    props?: Omit<AccordionRootProps, 'children'> & {
      itemClass?: string
      headerClass?: string
      triggerClass?: string
      contentClass?: string
      items?: AccordionItemData[]
    }
  ) => {
    return (host: HTMLElement) => {
      return Root({
        type: props?.type ?? 'single',
        collapsible: props?.collapsible,
        defaultValue: props?.defaultValue,
        value: props?.value,
        onValueChange: props?.onValueChange,
        disabled: props?.disabled,
        orientation: props?.orientation,
        class: props?.class,
        style: props?.style,
        children: (getContext) => (root: HTMLElement) => {
          const unmounts: (() => void)[] = []

          if (props?.items) {
            props.items.forEach((item) => {
              const itemHost = document.createElement('div')
              const itemUnmount = Item(
                {
                  value: item.value,
                  disabled: item.disabled,
                  class: props?.itemClass,
                  children: (getCtx, getItemCtx) => (itemEl: HTMLElement) => {
                    const headerHost = document.createElement('div')
                    const headerUnmount = Header(
                      {
                        class: props?.headerClass,
                        children:
                          (getCtx2, getItemCtx2) => (headerEl: HTMLElement) => {
                            const triggerHost = document.createElement('div')
                            const triggerUnmount = Trigger(
                              {
                                class: props?.triggerClass,
                                children: () => (trigger: HTMLElement) => {
                                  trigger.textContent = item.label
                                  return () => {}
                                }
                              },
                              getCtx2,
                              getItemCtx2
                            )(triggerHost)
                            if (triggerUnmount)
                              headerEl.appendChild(triggerHost)
                            return () => {
                              triggerUnmount?.()
                              triggerHost.remove()
                            }
                          }
                      },
                      getCtx,
                      getItemCtx
                    )(headerHost)
                    if (headerUnmount) itemEl.appendChild(headerHost)

                    const contentHost = document.createElement('div')
                    const contentUnmount = Content(
                      {
                        class: props?.contentClass,
                        children: () => (content: HTMLElement) => {
                          content.innerHTML = `<p>${item.content}</p>`
                          return () => {}
                        }
                      },
                      getCtx,
                      getItemCtx
                    )(contentHost)
                    if (contentUnmount) itemEl.appendChild(contentHost)

                    return () => {
                      headerUnmount?.()
                      contentUnmount?.()
                      headerHost.remove()
                      contentHost.remove()
                    }
                  }
                },
                getContext
              )(itemHost)
              if (itemUnmount) {
                unmounts.push(itemUnmount)
                root.appendChild(itemHost)
              }
            })
          }

          return () => {
            unmounts.forEach((u) => u())
          }
        }
      })(host)
    }
  }
}

export const accordion = createAccordion()
