/**
 * Switch - 开关组件
 *
 * 双态按钮，用于在"开"和"关"状态之间切换。
 * 支持受控和非受控模式，完整的 ARIA 无障碍支持。
 */
import type { Mountable } from '@rasenjs/core'

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
 * 创建 Switch Root 组件
 */
export function createSwitchRoot(): (
  props?: SwitchRootProps,
  _getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: SwitchRootProps,
    _getContext?: () => SwitchContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const defaultChecked = props?.defaultChecked ?? false
      let internalChecked = defaultChecked

      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'switch')

      const isChecked = () => props?.checked ?? internalChecked
      const isDisabled = () => props?.disabled ?? false

      const updateAttributes = () => {
        const checked = isChecked()
        const disabled = isDisabled()

        button.setAttribute('aria-checked', String(checked))
        button.setAttribute('aria-disabled', String(disabled))
        if (props?.required) {
          button.setAttribute('aria-required', String(props.required))
        }
        button.dataset.state = checked ? 'checked' : 'unchecked'
        if (disabled) {
          button.dataset.disabled = ''
        } else {
          delete button.dataset.disabled
        }
      }

      const toggle = () => {
        if (isDisabled()) return

        const newValue = !internalChecked
        internalChecked = newValue
        updateAttributes()
        props?.onCheckedChange?.(newValue)
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }

      button.addEventListener('click', toggle)
      button.addEventListener('keydown', handleKeyDown)

      // 默认样式
      button.style.display = 'inline-block'
      button.style.position = 'relative'
      button.style.border = 'none'
      button.style.cursor = isDisabled() ? 'not-allowed' : 'pointer'
      button.style.padding = '0'
      button.style.margin = '0'
      button.style.backgroundColor = 'transparent'

      if (props?.class) {
        button.className = props.class
      }
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(button.style, props.style)
        }
      }

      updateAttributes()

      host.appendChild(button)

      return () => {
        button.removeEventListener('click', toggle)
        button.removeEventListener('keydown', handleKeyDown)
        button.remove()
      }
    }
  }
}

/**
 * 创建 Switch Thumb 组件
 */
export function createSwitchThumb(): (
  props?: SwitchThumbProps,
  getContext?: () => SwitchContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: SwitchThumbProps,
    getContext?: () => SwitchContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const thumb = document.createElement('span')

      const updateState = () => {
        const ctx = getContext?.()
        const checked = ctx?.checked ?? false
        thumb.dataset.state = checked ? 'checked' : 'unchecked'
      }

      updateState()

      // 默认样式
      thumb.style.display = 'block'
      thumb.style.width = '50%'
      thumb.style.height = '100%'
      thumb.style.backgroundColor = '#fff'
      thumb.style.borderRadius = '9999px'
      thumb.style.transition = 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)'
      thumb.style.transform = 'translateX(0)'

      if (props?.class) {
        thumb.className = props.class
      }
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(thumb.style, props.style)
        }
      }

      host.appendChild(thumb)

      return () => thumb.remove()
    }
  }
}

/**
 * Switch 预设
 */
export const switchRoot = createSwitchRoot()
export const switchThumb = createSwitchThumb()
