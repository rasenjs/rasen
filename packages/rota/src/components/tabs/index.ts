/**
 * Tabs - 标签页组件
 *
 * 一组分层的内容区域，一次只显示一个标签面板。
 * 支持受控和非受控模式，水平和垂直方向。
 */
import type { Mountable } from '@rasenjs/core'

export type TabsOrientation = 'horizontal' | 'vertical'

export interface TabsContext {
  value: string
  setValue: (value: string) => void
  orientation: TabsOrientation
  registerTrigger: (el: HTMLElement, value: string) => void
  unregisterTrigger: (el: HTMLElement) => void
  registerContent: (el: HTMLElement, value: string) => void
  unregisterContent: (el: HTMLElement) => void
}

export interface TabsRootProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  orientation?: TabsOrientation
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => TabsContext | undefined
  ) => Mountable<HTMLElement>
}

export interface TabsListProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => TabsContext | undefined
  ) => Mountable<HTMLElement>
}

export interface TabsTriggerProps {
  value: string
  disabled?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface TabsContentProps {
  value: string
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

function updateTriggerState(
  el: HTMLElement,
  triggerValue: string,
  currentValue: string,
  disabled: boolean,
  orientation: TabsOrientation
): void {
  const isActive = currentValue === triggerValue
  el.setAttribute('aria-selected', String(isActive))
  el.setAttribute('data-state', isActive ? 'active' : 'inactive')
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
  contentValue: string,
  currentValue: string
): void {
  const isActive = currentValue === contentValue
  el.setAttribute('data-state', isActive ? 'active' : 'hidden')
  if (isActive) {
    el.removeAttribute('hidden')
  } else {
    el.setAttribute('hidden', '')
  }
}

/**
 * 创建 Tabs Root 组件
 */
export function createTabsRoot(): (
  props?: TabsRootProps
) => Mountable<HTMLElement> {
  return (props?: TabsRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      const orientation = props?.orientation ?? 'horizontal'

      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }
      root.setAttribute('data-orientation', orientation)

      const isControlled = props?.value !== undefined
      let currentValue = props?.value ?? props?.defaultValue ?? ''

      const triggerElements = new Map<HTMLElement, string>()
      const contentElements = new Map<HTMLElement, string>()

      const updateAllStates = (): void => {
        triggerElements.forEach((triggerValue, el) => {
          const disabled = el.hasAttribute('data-disabled')
          updateTriggerState(
            el,
            triggerValue,
            currentValue,
            disabled,
            orientation
          )
        })
        contentElements.forEach((contentValue, el) => {
          updateContentState(el, contentValue, currentValue)
        })
      }

      const setValue = (value: string): void => {
        if (value === currentValue) return
        currentValue = value
        if (!isControlled) {
          updateAllStates()
        }
        props?.onValueChange?.(value)
      }

      const registerTrigger = (el: HTMLElement, value: string): void => {
        triggerElements.set(el, value)
        updateTriggerState(
          el,
          value,
          currentValue,
          el.hasAttribute('data-disabled'),
          orientation
        )
      }

      const unregisterTrigger = (el: HTMLElement): void => {
        triggerElements.delete(el)
      }

      const registerContent = (el: HTMLElement, value: string): void => {
        contentElements.set(el, value)
        updateContentState(el, value, currentValue)
      }

      const unregisterContent = (el: HTMLElement): void => {
        contentElements.delete(el)
      }

      const context: TabsContext = {
        value: currentValue,
        setValue,
        orientation,
        registerTrigger,
        unregisterTrigger,
        registerContent,
        unregisterContent
      }

      const getContext = (): TabsContext | undefined => context

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
 * 创建 Tabs List 组件
 */
export function createTabsList(): (
  props?: TabsListProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TabsListProps,
    getContext?: () => TabsContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const list = document.createElement('div')
      list.setAttribute('role', 'tablist')

      const ctx = getContext?.()
      if (ctx) {
        list.setAttribute('aria-orientation', ctx.orientation)
        list.setAttribute('data-orientation', ctx.orientation)
      }

      if (props?.class) list.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(list.style, props.style)
        }
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        const getCtx = getContext ?? (() => undefined)
        childUnmount = props.children(getCtx)(list)
      }

      host.appendChild(list)

      return () => {
        childUnmount?.()
        list.remove()
      }
    }
  }
}

/**
 * 创建 Tabs Trigger 组件
 */
export function createTabsTrigger(): (
  props?: TabsTriggerProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TabsTriggerProps,
    getContext?: () => TabsContext | undefined
  ) => {
    return (host: HTMLElement) => {
      if (!props?.value) {
        throw new Error('TabsTrigger: "value" prop is required')
      }

      const trigger = document.createElement('button')
      trigger.type = 'button'
      trigger.setAttribute('role', 'tab')
      trigger.setAttribute('tabindex', '-1')

      const disabled = props?.disabled ?? false
      if (disabled) {
        trigger.setAttribute('aria-disabled', 'true')
        trigger.setAttribute('data-disabled', '')
      }

      if (props?.class) trigger.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(trigger.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.registerTrigger(trigger, props.value)

        trigger.addEventListener('click', () => {
          if (disabled) return
          ctx.setValue(props.value)
        })
      }

      // Render children
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
 * 创建 Tabs Content 组件
 */
export function createTabsContent(): (
  props?: TabsContentProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TabsContentProps,
    getContext?: () => TabsContext | undefined
  ) => {
    return (host: HTMLElement) => {
      if (!props?.value) {
        throw new Error('TabsContent: "value" prop is required')
      }

      const content = document.createElement('div')
      content.setAttribute('role', 'tabpanel')

      const forceMount = props?.forceMount ?? false

      if (props?.class) content.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(content.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.registerContent(content, props.value)
      }

      if (!forceMount && ctx) {
        const isActive = ctx.value === props.value
        if (!isActive) {
          content.setAttribute('hidden', '')
          content.setAttribute('data-state', 'hidden')
        } else {
          content.setAttribute('data-state', 'active')
        }
      } else if (forceMount) {
        content.setAttribute(
          'data-state',
          ctx && ctx.value === props.value ? 'active' : 'hidden'
        )
      } else {
        content.setAttribute('data-state', 'hidden')
        content.setAttribute('hidden', '')
      }

      // Render children
      let childUnmount: (() => void) | undefined
      if (props?.children || forceMount) {
        const shouldRender = !ctx || ctx.value === props.value || forceMount
        if (shouldRender && props?.children) {
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
 * Tabs 组合组件
 */
export interface TabItem {
  value: string
  label: string
  content: string
  disabled?: boolean
}

export function createTabs(): (
  props?: TabsRootProps & {
    listClass?: string
    listStyle?: Record<string, string | number> | string
    triggerClass?: string
    contentClass?: string
    tabs?: TabItem[]
  }
) => Mountable<HTMLElement> {
  const Root = createTabsRoot()
  const List = createTabsList()
  const Trigger = createTabsTrigger()
  const Content = createTabsContent()

  return (
    props?: TabsRootProps & {
      listClass?: string
      triggerClass?: string
      contentClass?: string
      tabs?: TabItem[]
    }
  ) => {
    return (host: HTMLElement) => {
      return Root({
        defaultValue: props?.defaultValue,
        value: props?.value,
        onValueChange: props?.onValueChange,
        orientation: props?.orientation,
        class: props?.class,
        style: props?.style,
        children: (getContext) => (root: HTMLElement) => {
          const unmounts: (() => void)[] = []

          // Create list
          const listHost = document.createElement('div')
          const listUnmount = List(
            {
              class: props?.listClass,
              children: (getCtx) => (list: HTMLElement) => {
                const triggerUnmounts: (() => void)[] = []
                const contentUnmounts: (() => void)[] = []

                // Create triggers and contents from tabs array
                if (props?.tabs) {
                  props.tabs.forEach((tab) => {
                    // Create trigger
                    const triggerHost = document.createElement('div')
                    const triggerUnmount = Trigger(
                      {
                        value: tab.value,
                        disabled: tab.disabled,
                        class: props?.triggerClass,
                        children: () => (trigger: HTMLElement) => {
                          trigger.textContent = tab.label
                          return () => {}
                        }
                      },
                      getCtx
                    )(triggerHost)
                    if (triggerUnmount) triggerUnmounts.push(triggerUnmount)
                    list.appendChild(triggerHost)

                    // Create content
                    const contentHost = document.createElement('div')
                    const contentUnmount = Content(
                      {
                        value: tab.value,
                        class: props?.contentClass,
                        children: () => (content: HTMLElement) => {
                          content.innerHTML = `<p>${tab.content}</p>`
                          return () => {}
                        }
                      },
                      getCtx
                    )(contentHost)
                    if (contentUnmount) contentUnmounts.push(contentUnmount)
                    root.appendChild(contentHost)
                  })
                }

                return () => {
                  triggerUnmounts.forEach((u) => u())
                  contentUnmounts.forEach((u) => u())
                }
              }
            },
            getContext
          )(listHost)
          if (listUnmount) unmounts.push(listUnmount)
          root.appendChild(listHost)

          return () => {
            unmounts.forEach((u) => u())
          }
        }
      })(host)
    }
  }
}

export const tabs = createTabs()
