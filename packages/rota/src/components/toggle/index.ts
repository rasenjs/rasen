/**
 * Toggle - a two-state button.
 *
 * The button stays a button: it reports its state through `aria-pressed` and
 * `data-state` rather than switching roles. Use ToggleGroup when the buttons
 * belong together.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { button, text } from '@rasenjs/dom'

export interface ToggleProps {
  pressed?: boolean
  defaultPressed?: boolean
  disabled?: boolean
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
    const internal = rt.ref(props?.pressed ?? props?.defaultPressed ?? false)
    const isPressed = (): boolean =>
      isControlled ? (props?.pressed ?? false) : rt.unref(internal)
    const disabled = props?.disabled ?? false

    const toggle = (): void => {
      if (disabled) return
      const next = !isPressed()
      if (!isControlled) {
        rt.setValue(internal, next)
      }
      props?.onPressedChange?.(next)
    }

    return button({
      type: 'button',
      'aria-pressed': () => String(isPressed()),
      'data-state': () => (isPressed() ? 'on' : 'off'),
      disabled,
      'data-disabled': disabled ? '' : undefined,
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
