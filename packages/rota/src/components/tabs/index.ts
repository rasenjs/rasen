/**
 * Tabs - layered content panels, one visible at a time.
 *
 * Controlled and uncontrolled modes, horizontal or vertical orientation.
 * Composed on @rasenjs/dom element factories: the active tab is a runtime
 * ref, so triggers and contents update through reactive attribute bindings.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button } from '@rasenjs/dom'

export type TabsOrientation = 'horizontal' | 'vertical'

export interface TabsContext {
  /** Reactive current value; reads inside bindings track it. */
  value: () => string
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

/**
 * Create the Tabs Root component.
 */
export function createTabsRoot(): (
  props?: TabsRootProps
) => Mountable<HTMLElement> {
  const component = (props?: TabsRootProps) => {
    const rt = getReactiveRuntime()
    const orientation = props?.orientation ?? 'horizontal'

    const isControlled = props?.value !== undefined
    const internal = rt.ref(props?.value ?? props?.defaultValue ?? '')
    const current = (): string =>
      isControlled ? (props?.value ?? '') : rt.unref(internal)

    const setValue = (value: string): void => {
      if (value === current()) return
      if (!isControlled) {
        rt.setValue(internal, value)
      }
      props?.onValueChange?.(value)
    }

    // Registries kept for the context contract (and future keyboard nav);
    // attribute state itself flows through reactive bindings below.
    const triggerElements = new Map<HTMLElement, string>()
    const contentElements = new Map<HTMLElement, string>()

    const context: TabsContext = {
      value: current,
      setValue,
      orientation,
      registerTrigger: (el, value) => void triggerElements.set(el, value),
      unregisterTrigger: (el) => void triggerElements.delete(el),
      registerContent: (el, value) => void contentElements.set(el, value),
      unregisterContent: (el) => void contentElements.delete(el)
    }
    const getContext = (): TabsContext => context

    return div({
      'data-orientation': orientation,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Tabs List component.
 */
export function createTabsList(): (
  props?: TabsListProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TabsListProps,
    getContext?: () => TabsContext | undefined
  ) => {
    const ctx = getContext?.()
    const orientation = ctx?.orientation ?? 'horizontal'

    return div({
      role: 'tablist',
      'aria-orientation': orientation,
      'data-orientation': orientation,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [props.children(getContext ?? (() => undefined))]
        : undefined
    })
  }
  return com(component)
}

/**
 * Create the Tabs Trigger component.
 */
export function createTabsTrigger(): (
  props?: TabsTriggerProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TabsTriggerProps,
    getContext?: () => TabsContext | undefined
  ) => {
    if (!props?.value) {
      throw new Error('TabsTrigger: "value" prop is required')
    }

    const disabled = props?.disabled ?? false
    const ctx = getContext?.()

    return button({
      type: 'button',
      role: 'tab',
      tabIndex: -1,
      'aria-selected': () => String(ctx?.value() === props.value),
      'data-state': () => (ctx?.value() === props.value ? 'active' : 'inactive'),
      'data-orientation': ctx?.orientation,
      'aria-disabled': disabled ? 'true' : undefined,
      'data-disabled': disabled ? '' : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => {
        if (!disabled) ctx?.setValue(props.value)
      }
    })
  }
  return com(component)
}

/**
 * Create the Tabs Content component.
 */
export function createTabsContent(): (
  props?: TabsContentProps,
  getContext?: () => TabsContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TabsContentProps,
    getContext?: () => TabsContext | undefined
  ) => {
    if (!props?.value) {
      throw new Error('TabsContent: "value" prop is required')
    }

    const forceMount = props?.forceMount ?? false
    const ctx = getContext?.()

    return div({
      role: 'tabpanel',
      'data-state': () =>
        ctx?.value() === props.value ? 'active' : 'hidden',
      hidden: () => (forceMount || ctx?.value() === props.value ? false : true),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Tabs preset: root + list + triggers/contents from a data array.
 */
export interface TabItem {
  value: string
  label: string
  content: string
  disabled?: boolean
}

export function createTabs(): (
  props?: Omit<TabsRootProps, 'children'> & {
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

  return (props) =>
    Root({
      defaultValue: props?.defaultValue,
      value: props?.value,
      onValueChange: props?.onValueChange,
      orientation: props?.orientation,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        div({
          children: [
            List(
              {
                class: props?.listClass,
                children: (getCtx) =>
                  div({
                    children: (props?.tabs ?? []).map((tab) =>
                      Trigger(
                        {
                          value: tab.value,
                          disabled: tab.disabled,
                          class: props?.triggerClass,
                          children: () => (el: HTMLElement) => {
                            el.textContent = tab.label
                            return undefined
                          }
                        },
                        getCtx
                      )
                    )
                  }),
                },
                getContext
              ),
              ...(props?.tabs ?? []).map((tab) =>
                Content(
                  {
                    value: tab.value,
                    class: props?.contentClass,
                    children: () => (el: HTMLElement) => {
                      el.textContent = tab.content
                      return undefined
                    }
                  },
                  getContext
                )
              )
          ]
        })
    })
}

export const tabs = createTabs()
