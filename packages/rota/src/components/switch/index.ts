/**
 * Switch - toggle component.
 *
 * Composed on top of @rasenjs/dom element factories: no direct element
 * creation or host manipulation here. The framework owns element creation,
 * attribute/event binding (static or reactive) and unmount cleanup.
 *
 * Value props are `PropValue`s, so `checked`, `disabled` and friends accept a
 * plain value, a ref or a getter — the JSX transform passes a getter for a
 * dynamic expression, and a controlled switch follows it.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { button, span } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'

export interface SwitchRootProps {
  checked?: PropValue<boolean>
  defaultChecked?: PropValue<boolean>
  disabled?: PropValue<boolean>
  required?: PropValue<boolean>
  name?: PropValue<string>
  value?: PropValue<string>
  id?: PropValue<string>
  onCheckedChange?: (checked: boolean) => void
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
  children?: (
    getContext: () => SwitchContext | undefined
  ) => Mountable<HTMLElement>
}

export interface SwitchThumbProps {
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
}

export interface SwitchContext {
  /** Reactive getters: a part follows the root by reading these in a binding. */
  checked: boolean
  disabled: boolean
}

/**
 * Create the Switch Root component.
 *
 * Controlled mode: pass `checked` (display follows it; call
 * `onCheckedChange` to change it). Uncontrolled mode: pass `defaultChecked`
 * and the component owns the state.
 */
export function createSwitchRoot(): (
  props?: SwitchRootProps,
  _getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: SwitchRootProps,
    _getContext?: () => SwitchContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const isControlled = props?.checked !== undefined
    const internal = rt.ref(readProp(props?.defaultChecked, false))

    const isChecked = (): boolean =>
      isControlled ? readProp(props?.checked, false) : rt.unref(internal)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const toggle = (): void => {
      if (isDisabled()) return
      const next = !isChecked()
      if (!isControlled) {
        rt.setValue(internal, next)
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
      id: props?.id,
      'aria-checked': () => String(isChecked()),
      'aria-disabled': () => String(isDisabled()),
      'aria-required': () => (readProp(props?.required, false) ? 'true' : undefined),
      'data-state': () => (isChecked() ? 'checked' : 'unchecked'),
      'data-disabled': () => (isDisabled() ? '' : undefined),
      // A disabled switch is taken out of the tab order explicitly, matching
      // the checkbox - relying on the native `disabled` alone leaves the
      // attribute off, so nothing can assert the tab order.
      tabIndex: () => (isDisabled() ? -1 : 0),
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
 * Create the Switch Thumb component.
 *
 * Pass the root's context getter to mirror the root state reactively:
 * `Root({ children: (getCtx) => Thumb({}, getCtx) })`.
 */
export function createSwitchThumb(): (
  props?: SwitchThumbProps,
  getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: SwitchThumbProps,
    getContext?: () => SwitchContext | undefined
  ) => {
    const isChecked = (): boolean => getContext?.()?.checked ?? false

    return span({
      'data-state': () => (isChecked() ? 'checked' : 'unchecked'),
      class: props?.class,
      style: props?.style
    })
  }
  return com(component)
}

/** Switch preset props: root props plus the thumb's own styling hooks. */
export type SwitchProps = Omit<SwitchRootProps, 'children'> & {
  thumbClass?: PropValue<string>
  thumbStyle?: PropValue<string | Record<string, string | number>>
}

/**
 * Switch preset: root with a thumb wired to the root context.
 */
export function createSwitch(): (
  props?: SwitchProps
) => Mountable<HTMLElement> {
  const Root = createSwitchRoot()
  const Thumb = createSwitchThumb()

  const component = (props?: SwitchProps) =>
    Root({
      checked: props?.checked,
      defaultChecked: props?.defaultChecked,
      disabled: props?.disabled,
      required: props?.required,
      name: props?.name,
      value: props?.value,
      id: props?.id,
      onCheckedChange: props?.onCheckedChange,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        Thumb({ class: props?.thumbClass, style: props?.thumbStyle }, getContext)
    })

  return com(component)
}

export const switchRoot = createSwitchRoot()
export const switchThumb = createSwitchThumb()
/** Preset: a root with a thumb already wired to the root context. */
export const switchControl = createSwitch()
