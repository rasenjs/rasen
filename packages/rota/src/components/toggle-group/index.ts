/**
 * ToggleGroup - a set of toggles that belong together.
 *
 * `single` behaves like a radio group (one option on, `aria-checked`) while
 * `multiple` keeps independent toggle buttons (`aria-pressed`) inside a group.
 * Both share one roving-focus implementation: arrows move between items and
 * only one item is a tab stop.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, text } from '@rasenjs/web/elements'
import {
  createRovingFocus,
  type Orientation,
  type RovingFocus
} from '../../internal/roving-focus'
import { withCleanup } from '../../internal/with-cleanup'
import { readProp } from '../../internal/props'

export type ToggleGroupType = 'single' | 'multiple'
export type ToggleGroupOrientation = Orientation

export interface ToggleGroupContext extends RovingFocus {
  type: ToggleGroupType
  orientation: ToggleGroupOrientation
  disabled: boolean
  /** Reactive snapshot of the pressed values. */
  value: string[]
  isPressed: (itemValue: string) => boolean
  press: (itemValue: string) => void
}

export interface ToggleGroupRootProps {
  type?: ToggleGroupType
  value?: PropValue<string[]>
  defaultValue?: PropValue<string[]>
  onValueChange?: (value: string[]) => void
  disabled?: PropValue<boolean>
  orientation?: ToggleGroupOrientation
  /** Whether arrow navigation wraps around (default `true`). */
  loop?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => ToggleGroupContext | undefined
  ) => Mountable<HTMLElement>
}

export interface ToggleGroupItemProps {
  value: string
  disabled?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

/**
 * Create the ToggleGroup Root component.
 */
export function createToggleGroupRoot(): (
  props?: ToggleGroupRootProps
) => Mountable<HTMLElement> {
  const component = (props?: ToggleGroupRootProps) => {
    const rt = getReactiveRuntime()

    const type = props?.type ?? 'single'
    const orientation = props?.orientation ?? 'horizontal'

    const isControlled = props?.value !== undefined
    const internal = rt.ref<string[]>(readProp(props?.defaultValue, []))
    const current = (): string[] =>
      isControlled ? readProp(props?.value, []) : rt.unref(internal)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const roving = createRovingFocus({
      rt,
      isGroupDisabled: isDisabled,
      loop: props?.loop ?? true
    })

    const setValue = (next: string[]): void => {
      if (!isControlled) {
        rt.setValue(internal, next)
      }
      props?.onValueChange?.(next)
    }

    const press = (itemValue: string): void => {
      if (roving.isItemDisabled(itemValue)) return
      const value = current()

      if (type === 'single') {
        // Single mode always keeps exactly one option pressed.
        if (value[0] === itemValue) return
        setValue([itemValue])
        return
      }

      setValue(
        value.includes(itemValue)
          ? value.filter((entry) => entry !== itemValue)
          : [...value, itemValue]
      )
    }

    const context: ToggleGroupContext = {
      ...roving,
      type,
      orientation,
      get disabled() {
        return isDisabled()
      },
      get value() {
        return current()
      },
      isPressed: (itemValue) => current().includes(itemValue),
      press
    }
    const getContext = (): ToggleGroupContext => context

    return div({
      role: type === 'single' ? 'radiogroup' : 'group',
      'data-orientation': orientation,
      'aria-disabled': () => (isDisabled() ? 'true' : undefined),
      'data-disabled': () => (isDisabled() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the ToggleGroup Item component.
 */
export function createToggleGroupItem(): (
  props?: ToggleGroupItemProps,
  getContext?: () => ToggleGroupContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: ToggleGroupItemProps,
    getContext?: () => ToggleGroupContext | undefined
  ) => {
    if (!props?.value) {
      throw new Error('ToggleGroupItem: "value" prop is required')
    }

    const itemValue = props.value
    const ctx = getContext?.()
    ctx?.registerItem(itemValue, props.disabled ?? false)

    const isPressed = (): boolean => ctx?.isPressed(itemValue) ?? false
    const single = (): boolean => (ctx?.type ?? 'single') === 'single'
    const disabledNow = (): boolean => ctx?.isItemDisabled(itemValue) ?? false

    /** Roving tabindex: one tab stop per group. */
    const tabIndex = (): number => {
      const current = getContext?.()
      if (!current) return 0
      if (current.type === 'single') {
        return current.isPressed(itemValue) ? 0 : -1
      }
      const first = current.enabledValues()[0]
      return first === itemValue || current.isPressed(itemValue) ? 0 : -1
    }

    const onKeyDown = (e: Event): void => {
      const event = e as KeyboardEvent
      const current = getContext?.()
      if (!current) return
      if (current.handleArrows(event, itemValue, current.orientation)) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        current.press(itemValue)
      }
    }

    return withCleanup(
      button({
      type: 'button',
      // Single mode is a radio group, so its items are radios; multiple mode
      // keeps plain toggle buttons.
      role: single() ? 'radio' : undefined,
      'aria-checked': single() ? () => String(isPressed()) : undefined,
      'aria-pressed': single() ? undefined : () => String(isPressed()),
      'data-state': () => (isPressed() ? 'on' : 'off'),
      tabIndex,
      ref: ctx?.itemRef(itemValue),
      disabled: () => disabledNow(),
      'data-disabled': () => (disabledNow() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => getContext?.()?.press(itemValue),
      onKeyDown
      }),
      () => getContext?.()?.unregisterItem(itemValue)
    )
  }
  return com(component)
}

export type ToggleGroupProps = ToggleGroupRootProps & {
  items?: Array<{ value: string; label: string; disabled?: boolean }>
  itemClass?: string
  /** Custom item content; defaults to `text({ content: label })`. */
  itemChildren?: (item: { value: string; label: string }) => Mountable<HTMLElement>
}

/**
 * ToggleGroup preset: root plus one item per entry.
 */
export function createToggleGroup(): (
  props?: ToggleGroupProps
) => Mountable<HTMLElement> {
  const Root = createToggleGroupRoot()
  const Item = createToggleGroupItem()

  const component = (props?: ToggleGroupProps) =>
    Root({
      type: props?.type,
      value: props?.value,
      defaultValue: props?.defaultValue,
      onValueChange: props?.onValueChange,
      disabled: props?.disabled,
      orientation: props?.orientation,
      loop: props?.loop,
      class: props?.class,
      style: props?.style,
      children: (getContext) => (host: HTMLElement) => {
        const unmounts: (() => void)[] = []
        for (const item of props?.items ?? []) {
          const unmount = Item(
            {
              value: item.value,
              disabled: item.disabled,
              class: props?.itemClass,
              children: () => props?.itemChildren?.(item) ?? textOf(item.label)
            },
            getContext
          )(host, undefined)
          if (typeof unmount === 'function') unmounts.push(unmount)
        }
        return () => {
          for (const unmount of unmounts) unmount()
        }
      }
    })

  return com(component)
}

/** Label fallback for preset items. */
function textOf(content: string): Mountable<HTMLElement> {
  return text({ content })
}

export const toggleGroup = createToggleGroup()
