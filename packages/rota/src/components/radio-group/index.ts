/**
 * RadioGroup - exactly one option selected.
 *
 * Root + Item + Indicator, Reka-style. The items share one tab stop and
 * selection follows focus, which is the behaviour the radio role implies:
 * arrow keys move *and* select.
 *
 * With `name` set, each item renders a hidden radio input so the group
 * participates in a form the way a native radio group does.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, input, text } from '@rasenjs/dom'
import {
  createRovingFocus,
  type Orientation,
  type RovingFocus
} from '../../internal/roving-focus'
import { withCleanup } from '../../internal/with-cleanup'

export type RadioGroupOrientation = Orientation

/** Functional: the input speaks for the group in forms, never for the eye. */
const HIDDEN_INPUT_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: '0'
} as const

export interface RadioGroupContext extends RovingFocus {
  orientation: RadioGroupOrientation
  disabled: boolean
  required: boolean
  name?: string
  /** Reactive snapshot of the selected value. */
  value: string
  select: (itemValue: string) => void
}

export interface RadioGroupRootProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  name?: string
  orientation?: RadioGroupOrientation
  /** Whether arrow navigation wraps around (default `true`). */
  loop?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => RadioGroupContext | undefined
  ) => Mountable<HTMLElement>
}

export interface RadioGroupItemProps {
  value: string
  disabled?: boolean
  required?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => RadioGroupContext | undefined
  ) => Mountable<HTMLElement>
}

export interface RadioGroupIndicatorProps {
  /** Keep the indicator mounted while unchecked. */
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * Create the RadioGroup Root component.
 */
export function createRadioGroupRoot(): (
  props?: RadioGroupRootProps
) => Mountable<HTMLElement> {
  const component = (props?: RadioGroupRootProps) => {
    const rt = getReactiveRuntime()

    const orientation = props?.orientation ?? 'vertical'
    const disabled = props?.disabled ?? false
    const required = props?.required ?? false

    const isControlled = props?.value !== undefined
    const internal = rt.ref(props?.value ?? props?.defaultValue ?? '')
    const current = (): string =>
      isControlled ? (props?.value ?? '') : rt.unref(internal)

    const roving = createRovingFocus({
      rt,
      isGroupDisabled: () => disabled,
      loop: props?.loop ?? true
    })

    const select = (itemValue: string): void => {
      if (roving.isItemDisabled(itemValue)) return
      if (itemValue === current()) return
      if (!isControlled) {
        rt.setValue(internal, itemValue)
      }
      props?.onValueChange?.(itemValue)
    }

    const context: RadioGroupContext = {
      ...roving,
      orientation,
      disabled,
      required,
      name: props?.name,
      get value() {
        return current()
      },
      select
    }
    const getContext = (): RadioGroupContext => context

    return div({
      role: 'radiogroup',
      'aria-orientation': orientation,
      'aria-required': required ? 'true' : undefined,
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
 * Create the RadioGroup Item component.
 */
export function createRadioGroupItem(): (
  props?: RadioGroupItemProps,
  getContext?: () => RadioGroupContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: RadioGroupItemProps,
    getContext?: () => RadioGroupContext | undefined
  ) => {
    if (!props?.value) {
      throw new Error('RadioGroupItem: "value" prop is required')
    }

    const itemValue = props.value
    const ctx = getContext?.()
    ctx?.registerItem(itemValue, props.disabled ?? false)

    const isChecked = (): boolean => ctx?.value === itemValue
    const disabledNow = (): boolean => ctx?.isItemDisabled(itemValue) ?? false

    /**
     * Selection follows focus: find where an arrow key lands, move there and
     * select it (Home / End go to the ends).
     */
    const onKeyDown = (e: Event): void => {
      const event = e as KeyboardEvent
      const current = getContext?.()
      if (!current) return

      const position = current.indexOf(itemValue)
      if (position === -1) return

      const values = current.enabledValues()
      const vertical = current.orientation === 'vertical'
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
      const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft'

      let raw: number | null = null
      if (event.key === nextKey) raw = position + 1
      else if (event.key === prevKey) raw = position - 1
      else if (event.key === 'Home') raw = 0
      else if (event.key === 'End') raw = values.length - 1

      if (raw !== null) {
        event.preventDefault()
        const target = current.resolveIndex(raw)
        if (target === -1) return
        current.focusItem(target)
        current.select(values[target]!)
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        current.select(itemValue)
      }
    }

    return withCleanup(
      button({
      type: 'button',
      role: 'radio',
      'aria-checked': () => String(isChecked()),
      'aria-required': props.required ? 'true' : undefined,
      'data-state': () => (isChecked() ? 'checked' : 'unchecked'),
      // Roving tabindex: the checked item is the group's tab stop, falling
      // back to the first enabled item so the group is reachable by keyboard.
      tabIndex: () => {
        const current = getContext?.()
        if (!current) return 0
        if (current.value === itemValue) return 0
        if (!current.value && current.enabledValues()[0] === itemValue) return 0
        return -1
      },
      ref: ctx?.itemRef(itemValue),
      disabled: () => disabledNow(),
      'data-disabled': () => (disabledNow() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: [
        // Form participation: a real radio input, hidden from view and from
        // the accessibility tree (the button is the control the user sees).
        ...(ctx?.name
          ? [
              input({
                type: 'radio',
                name: ctx.name,
                value: itemValue,
                checked: () => isChecked(),
                tabIndex: -1,
                'aria-hidden': 'true',
                style: HIDDEN_INPUT_STYLE
              })
            ]
          : []),
        ...(props.children ? [props.children(getContext ?? (() => undefined))] : [])
      ],
      onClick: () => getContext?.()?.select(itemValue),
      onKeyDown
      }),
      () => getContext?.()?.unregisterItem(itemValue)
    )
  }
  return com(component)
}

/**
 * Create the RadioGroup Indicator component.
 *
 * Rendered only while its item is checked, unless `forceMount` is set.
 */
export function createRadioGroupIndicator(): (
  props?: RadioGroupIndicatorProps,
  getContext?: () => RadioGroupContext | undefined,
  getItemValue?: () => string
) => Mountable<HTMLElement> {
  const component = (
    props?: RadioGroupIndicatorProps,
    getContext?: () => RadioGroupContext | undefined,
    getItemValue?: () => string
  ) => {
    const forceMount = props?.forceMount ?? false
    const isChecked = (): boolean =>
      getContext?.()?.value === (getItemValue?.() ?? '')

    if (!forceMount && !isChecked()) {
      return () => undefined
    }

    return div({
      'data-state': () => (isChecked() ? 'checked' : 'unchecked'),
      hidden: () => forceMount && !isChecked(),
      class: props?.class,
      style: props?.style
    })
  }
  return com(component)
}

export type RadioGroupProps = RadioGroupRootProps & {
  items?: Array<{ value: string; label: string; disabled?: boolean }>
  itemClass?: string
  indicatorClass?: string
  /** Custom item content; defaults to the label. */
  itemChildren?: (item: { value: string; label: string }) => Mountable<HTMLElement>
}

/**
 * RadioGroup preset: root plus one item (with indicator) per entry.
 */
export function createRadioGroup(): (
  props?: RadioGroupProps
) => Mountable<HTMLElement> {
  const Root = createRadioGroupRoot()
  const Item = createRadioGroupItem()
  const Indicator = createRadioGroupIndicator()

  const component = (props?: RadioGroupProps) =>
    Root({
      value: props?.value,
      defaultValue: props?.defaultValue,
      onValueChange: props?.onValueChange,
      disabled: props?.disabled,
      required: props?.required,
      name: props?.name,
      orientation: props?.orientation,
      loop: props?.loop,
      class: props?.class,
      style: props?.style,
      children: (getContext) => (host: HTMLElement) => {
        const unmounts: (() => void)[] = []

        for (const entry of props?.items ?? []) {
          const unmount = Item(
            {
              value: entry.value,
              disabled: entry.disabled,
              class: props?.itemClass,
              children: (getCtx) => (el: HTMLElement) => {
                const inner: (() => void)[] = []

                const indicator = Indicator(
                  { class: props?.indicatorClass },
                  getCtx,
                  () => entry.value
                )(el, undefined)
                if (typeof indicator === 'function') inner.push(indicator)

                const label =
                  props?.itemChildren?.(entry) ?? text({ content: entry.label })
                const mountedLabel = label(el, undefined)
                if (typeof mountedLabel === 'function') inner.push(mountedLabel)

                return () => {
                  for (const stop of inner) stop()
                }
              }
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

export const radioGroup = createRadioGroup()
