/**
 * Toggle - a two-state button.
 *
 * The button stays a button: it reports its state through `aria-pressed` and
 * `data-state` rather than switching roles. Use ToggleGroup when the buttons
 * belong together.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { button, text } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'

export interface ToggleProps {
  pressed?: PropValue<boolean>
  defaultPressed?: PropValue<boolean>
  disabled?: PropValue<boolean>
  id?: PropValue<string>
  onPressedChange?: (pressed: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

/**
 * Create the Toggle component.
 */
export function createToggle(): (props?: ToggleProps) => Mountable<HTMLElement> {
  const component = (props?: ToggleProps) => {
    const rt = getReactiveRuntime()

    const isControlled = props?.pressed !== undefined
    const internal = rt.ref(readProp(props?.defaultPressed, false))
    const isPressed = (): boolean =>
      isControlled ? readProp(props?.pressed, false) : rt.unref(internal)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const toggle = (): void => {
      if (isDisabled()) return
      const next = !isPressed()
      if (!isControlled) {
        rt.setValue(internal, next)
      }
      props?.onPressedChange?.(next)
    }

    return button({
      type: 'button',
      id: props?.id,
      'aria-pressed': () => String(isPressed()),
      'data-state': () => (isPressed() ? 'on' : 'off'),
      disabled: () => isDisabled(),
      'data-disabled': () => (isDisabled() ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: toggle
    })
  }
  return com(component)
}

export const toggle = createToggle()

/** Convenience: a toggle with text content. */
export function toggleText(
  content: string,
  props?: Omit<ToggleProps, 'children'>
): Mountable<HTMLElement> {
  return toggle({ ...props, children: () => text({ content }) })
}
