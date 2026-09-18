/**
 * Switch - toggle component.
 *
 * Composed on top of @rasenjs/dom element factories: no direct element
 * creation or host manipulation here. The framework owns element creation,
 * attribute/event binding (static or reactive) and unmount cleanup, so the
 * same component benefits from hydration-aware bindings for free.
 */
import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import { button, span } from '@rasenjs/dom'

export interface SwitchRootProps {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  onCheckedChange?: (checked: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => SwitchContext | undefined
  ) => Mountable<HTMLElement>
}

export interface SwitchThumbProps {
  class?: string
  style?: Record<string, string | number> | string
}

export interface SwitchContext {
  checked: boolean
  disabled: boolean
}

/**
 * Create the Switch Root component.
 *
 * Controlled mode: pass `checked` (display follows it; call
 * `onCheckedChange` to change it). Uncontrolled mode: pass
 * `defaultChecked`; the component owns the state.
 */
export function createSwitchRoot(): (
  props?: SwitchRootProps,
  _getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: SwitchRootProps,
    _getContext?: () => SwitchContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const checked = rt.ref(props?.defaultChecked ?? false)

    const isChecked = () =>
      props?.checked !== undefined ? props.checked : rt.unref(checked)
    const isDisabled = () => props?.disabled ?? false

    const toggle = () => {
      if (isDisabled()) return
      const next = !isChecked()
      if (props?.checked === undefined) {
        rt.setValue(checked, next)
      }
      props?.onCheckedChange?.(next)
    }

    const getContext = (): SwitchContext => ({
      get checked() {
        return isChecked()
      },
      get disabled() {
        return isDisabled()
      }
    })

    return button({
      type: 'button',
      role: 'switch',
      ariaChecked: () => String(isChecked()),
      ariaDisabled: () => String(isDisabled()),
      ariaRequired: props?.required ? 'true' : undefined,
      dataState: () => (isChecked() ? 'checked' : 'unchecked'),
      dataDisabled: () => (isDisabled() ? '' : undefined),
      name: props?.name,
      value: props?.value,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [(el) => props.children!(getContext)(el)]
        : undefined,
      onClick: toggle,
      onKeydown: (e: Event) => {
        const ke = e as KeyboardEvent
        if (ke.key === ' ' || ke.key === 'Enter') {
          ke.preventDefault()
          toggle()
        }
      }
    })
  }
}

/**
 * Create the Switch Thumb component.
 *
 * Pass the root's context getter to mirror the root state reactively:
 * `Root({ children: (getCtx) => Thumb({}, getCtx) })`.
 */
export function createSwitchThumb(): (
  props?: SwitchThumbProps,
  getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: SwitchThumbProps,
    getContext?: () => SwitchContext | undefined
  ) => {
    return span({
      dataState: () => (getContext?.().checked ? 'checked' : 'unchecked'),
      class: props?.class,
      style: props?.style
    })
  }
}

/**
 * Switch preset: root with a thumb wired to the root context.
 */
export function createSwitch(): (
  props?: Omit<SwitchRootProps, 'children'> & {
    thumbClass?: string
    thumbStyle?: Record<string, string | number> | string
  }
) => Mountable<HTMLElement> {
  const Root = createSwitchRoot()
  const Thumb = createSwitchThumb()

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
        Thumb(
          { class: props?.thumbClass, style: props?.thumbStyle },
          getContext
        )
    })
}

export const switchRoot = createSwitchRoot()
export const switchThumb = createSwitchThumb()
export const sw = createSwitch()
