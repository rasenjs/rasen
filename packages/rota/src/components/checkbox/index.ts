/**
 * Checkbox - tri-state checkbox control.
 *
 * Supports checked / unchecked / indeterminate, controlled and uncontrolled
 * modes. Root + Indicator composition, Reka/Radix-style API.
 * Composed on @rasenjs/dom element factories.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { button, span } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'

export type CheckboxCheckedState = boolean | 'indeterminate'

export interface CheckboxContext {
  isChecked: boolean
  isIndeterminate: boolean
}

export interface CheckboxRootProps {
  checked?: PropValue<CheckboxCheckedState>
  defaultChecked?: PropValue<CheckboxCheckedState>
  disabled?: PropValue<boolean>
  required?: PropValue<boolean>
  name?: PropValue<string>
  value?: PropValue<string>
  id?: PropValue<string>
  onCheckedChange?: (checked: CheckboxCheckedState) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => CheckboxContext | undefined
  ) => Mountable<HTMLElement>
}

export interface CheckboxIndicatorProps {
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
}

function getCheckedState(state: CheckboxCheckedState): {
  isChecked: boolean
  isIndeterminate: boolean
  dataState: 'checked' | 'unchecked' | 'indeterminate'
  ariaChecked: 'true' | 'false' | 'mixed'
} {
  const isChecked = state === true
  const isIndeterminate = state === 'indeterminate'
  const dataState = isChecked
    ? 'checked'
    : isIndeterminate
      ? 'indeterminate'
      : 'unchecked'
  const ariaChecked = isChecked ? 'true' : isIndeterminate ? 'mixed' : 'false'
  return { isChecked, isIndeterminate, dataState, ariaChecked }
}

/**
 * Create the Checkbox Root component.
 */
export function createCheckboxRoot(): (
  props?: CheckboxRootProps
) => Mountable<HTMLElement> {
  const component = (props?: CheckboxRootProps) => {
    const isControlled = props?.checked !== undefined
    const rt = getReactiveRuntime()
    const internal = rt.ref<CheckboxCheckedState>(
      readProp(props?.defaultChecked, false)
    )
    const current = (): CheckboxCheckedState =>
      isControlled ? readProp(props?.checked, false) : rt.unref(internal)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const toggle = (): void => {
      if (isDisabled()) return

      const cur = current()
      let newValue: CheckboxCheckedState
      if (cur === false) {
        newValue = true
      } else if (cur === true) {
        newValue = 'indeterminate'
      } else {
        newValue = false
      }

      if (!isControlled) {
        rt.setValue(internal, newValue)
      }
      props?.onCheckedChange?.(newValue)
    }

    const state = () => getCheckedState(current())
    const getContext = (): CheckboxContext => ({
      get isChecked() {
        return state().isChecked
      },
      get isIndeterminate() {
        return state().isIndeterminate
      }
    })

    return button({
      type: 'button',
      role: 'checkbox',
      id: props?.id,
      tabIndex: () => (isDisabled() ? -1 : 0),
      'aria-checked': () => state().ariaChecked,
      'data-state': () => state().dataState,
      'aria-disabled': () => (isDisabled() ? 'true' : undefined),
      'data-disabled': () => (isDisabled() ? '' : undefined),
      'aria-required': () =>
        readProp(props?.required, false) ? 'true' : undefined,
      disabled: () => isDisabled(),
      name: props?.name,
      value: props?.value,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined,
      onClick: toggle,
      onKeyDown: (e: Event) => {
        const ke = e as KeyboardEvent
        if (ke.key === ' ' || ke.key === 'Enter') {
          ke.preventDefault()
          toggle()
        }
      }
    })
  }
  return com(component)
}

/**
 * Create the Checkbox Indicator component.
 *
 * Renders nothing while unchecked unless `forceMount` is set; the
 * presence binding is reactive on the root context.
 */
export function createCheckboxIndicator(): (
  props?: CheckboxIndicatorProps,
  getContext?: () => CheckboxContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: CheckboxIndicatorProps,
    getContext?: () => CheckboxContext | undefined
  ) => {
    const forceMount = props?.forceMount ?? false

    const isVisible = (): boolean =>
      forceMount ||
      (getContext?.()?.isChecked ?? false) ||
      (getContext?.()?.isIndeterminate ?? false)

    // Mount-time render decision (same semantics as before the factory
    // migration): unchecked without forceMount renders nothing at all.
    if (!isVisible()) {
      return () => undefined
    }

    return span({
      'data-state': () => {
        const ctx = getContext?.()
        return ctx?.isIndeterminate
          ? 'indeterminate'
          : ctx?.isChecked
            ? 'checked'
            : 'unchecked'
      },
      hidden: () => !isVisible(),
      class: props?.class,
      style: props?.style
    })
  }
  return com(component)
}

/**
 * Checkbox preset: root + indicator wired to one context.
 */
export function createCheckbox(): (
  props?: Omit<CheckboxRootProps, 'children'> & {
    indicatorClass?: string
    indicatorStyle?: Record<string, string | number> | string
    forceMount?: boolean
  }
) => Mountable<HTMLElement> {
  const Root = createCheckboxRoot()
  const Indicator = createCheckboxIndicator()

  return (props) =>
    Root({
      checked: props?.checked,
      defaultChecked: props?.defaultChecked,
      disabled: props?.disabled,
      required: props?.required,
      name: props?.name,
      value: props?.value,
      onCheckedChange: props?.onCheckedChange,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        Indicator(
          {
            forceMount: props?.forceMount,
            class: props?.indicatorClass,
            style: props?.indicatorStyle
          },
          getContext
        )
    })
}

export const checkbox = createCheckbox()
