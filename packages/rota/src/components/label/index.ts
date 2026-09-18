/**
 * Label - an accessible label for a control.
 *
 * Renders a `<label>` pointing at the control's id, so clicking the label
 * focuses the control (and toggles it, for checkboxes and switches).
 */
import type { Mountable } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import { label as labelEl } from '@rasenjs/dom'

export interface LabelProps {
  /** Id of the labelled control (`for`). */
  htmlFor?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

/**
 * Create the Label component.
 */
export function createLabel(): (props?: LabelProps) => Mountable<HTMLElement> {
  const component = (props?: LabelProps) =>
    labelEl({
      for: props?.htmlFor,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  return com(component)
}

export const label = createLabel()
