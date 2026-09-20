/**
 * Tabs - layered content panels, one visible at a time.
 *
 * Controlled and uncontrolled modes, horizontal or vertical orientation.
 * Composed on @rasenjs/dom element factories: the active tab is a runtime
 * ref, so triggers and contents update through reactive attribute bindings.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, text } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'
import { createElementRef } from '../../internal/element-ref'

export type TabsOrientation = 'horizontal' | 'vertical'

export interface TabsContext {
  /** Reactive current value; reads inside bindings track it. */
  value: () => string
  setValue: (value: string) => void
  orientation: TabsOrientation
  /** The concrete id each part rendered, keyed by tab value. */
  triggerIdOf: (value: string) => string | undefined
  contentIdOf: (value: string) => string | undefined
  setTriggerId: (value: string, id: string) => void
  setContentId: (value: string, id: string) => void
}

let idCounter = 0

/** Unique per instance, so two Tabs on one page cannot collide. */
function generateId(kind: 'tab' | 'tabpanel'): string {
  return `${kind}-${++idCounter}`
}

export interface TabsRootProps {
  id?: string
  defaultValue?: PropValue<string>
  value?: PropValue<string>
  onValueChange?: (value: string) => void
  orientation?: TabsOrientation
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => TabsContext | undefined
  ) => Mountable<HTMLElement>
}

export interface TabsListProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => TabsContext | undefined
  ) => Mountable<HTMLElement>
}

export interface TabsTriggerProps {
  id?: string
  value: string
  disabled?: PropValue<boolean>
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
  children?: () => Mountable<HTMLElement>
}

export interface TabsContentProps {
  id?: string
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

    const rootRef = createElementRef<HTMLDivElement>(rt)

    const isControlled = props?.value !== undefined
    const internal = rt.ref(readProp(props?.defaultValue, ''))
    const current = (): string =>
      isControlled ? readProp(props?.value, '') : rt.unref(internal)

    const setValue = (value: string): void => {
      if (value === current()) return
      if (!isControlled) {
        rt.setValue(internal, value)
      }
      props?.onValueChange?.(value)
    }

    const triggerIds = new Map<string, string>()
    const contentIds = new Map<string, string>()

    // Keyboard navigation. Arrows move focus only (manual activation): the
    // focused trigger is activated by Enter/Space, which the native button
    // behaviour already turns into a click. Disabled tabs are skipped and
    // movement wraps. Triggers register in mount order, which is DOM order, so
    // the registry doubles as the ordered tab list.
    //
    // Disabled is read off the element rather than captured at mount, because
    // the prop is reactive and a snapshot would go stale.
    const isTabDisabled = (el: HTMLElement): boolean =>
      el.getAttribute('aria-disabled') === 'true'

    const enabledTabs = (): HTMLElement[] => {
      const root = rootRef.value
      if (!root) return []
      return [...root.querySelectorAll<HTMLElement>('[role="tab"]')].filter(
        (el) => !isTabDisabled(el)
      )
    }

    const moveFocus = (dir: 1 | -1): void => {
      const tabs = enabledTabs()
      if (tabs.length === 0) return
      const active = document.activeElement as HTMLElement | null
      const index = active ? tabs.indexOf(active) : -1
      if (index === -1) {
        tabs[dir === 1 ? 0 : tabs.length - 1]?.focus()
        return
      }
      tabs[(index + dir + tabs.length) % tabs.length]?.focus()
    }

    const focusEdge = (edge: 'first' | 'last'): void => {
      const tabs = enabledTabs()
      if (tabs.length === 0) return
      const target = edge === 'first' ? tabs[0] : tabs[tabs.length - 1]
      target?.focus()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
      const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'

      if (event.key === nextKey) {
        event.preventDefault()
        moveFocus(1)
        return
      }
      if (event.key === prevKey) {
        event.preventDefault()
        moveFocus(-1)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        focusEdge('first')
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        focusEdge('last')
      }
    }

    const context: TabsContext = {
      value: current,
      setValue,
      orientation,
      triggerIdOf: (value) => triggerIds.get(value),
      contentIdOf: (value) => contentIds.get(value),
      setTriggerId: (value, id) => void triggerIds.set(value, id),
      setContentId: (value, id) => void contentIds.set(value, id)
    }
    const getContext = (): TabsContext => context

    return div({
      id: props?.id,
      ref: rootRef,
      'data-orientation': orientation,
      onKeyDown: (e: Event) => handleKeyDown(e as KeyboardEvent),
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
      id: props?.id,
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

    const disabled = (): boolean => readProp(props?.disabled, false)
    const ctx = getContext?.()
    // The consumer's id wins; either way the context learns the real one so the
    // panel can point back at it.
    const triggerId = props?.id ?? generateId('tab')
    ctx?.setTriggerId(props.value, triggerId)

    return button({
      type: 'button',
      id: triggerId,
      role: 'tab',
      'aria-controls': () => ctx?.contentIdOf(props.value),
      // Roving tabindex: only the active tab is in the tab order; the arrows
      // move between tabs from there.
      tabIndex: () => (ctx?.value() === props.value ? 0 : -1),
      'aria-selected': () => String(ctx?.value() === props.value),
      'data-state': () => (ctx?.value() === props.value ? 'active' : 'inactive'),
      'data-orientation': ctx?.orientation,
      'aria-disabled': () => (disabled() ? 'true' : undefined),
      'data-disabled': () => (disabled() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => {
        if (!disabled()) ctx?.setValue(props.value)
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
    const contentId = props?.id ?? generateId('tabpanel')
    ctx?.setContentId(props.value, contentId)

    return div({
      id: contentId,
      role: 'tabpanel',
      'aria-labelledby': () => ctx?.triggerIdOf(props.value),
      'data-state': () =>
        ctx?.value() === props.value ? 'active' : 'inactive',
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
  /** Id for this tab's trigger (`role="tab"`). */
  id?: string
  /** Id for this tab's panel (`role="tabpanel"`). */
  panelId?: string
}

export function createTabs(): (
  props?: Omit<TabsRootProps, 'children'> & {
    listId?: string
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
      id: props?.id,
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
                id: props?.listId,
                class: props?.listClass,
                children: (getCtx) =>
                  div({
                    children: (props?.tabs ?? []).map((tab) =>
                      Trigger(
                        {
                          id: tab.id,
                          value: tab.value,
                          disabled: tab.disabled,
                          class: props?.triggerClass,
                          children: () => text({ content: tab.label })
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
                    id: tab.panelId,
                    value: tab.value,
                    class: props?.contentClass,
                    children: () => text({ content: tab.content })
                  },
                  getContext
                )
              )
          ]
        })
    })
}

export const tabs = createTabs()
