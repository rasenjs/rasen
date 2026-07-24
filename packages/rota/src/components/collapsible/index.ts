/**
 * Collapsible - 可折叠组件
 *
 * 可以展开或折叠内容区域，支持受控和非受控模式。
 */
import type { Mountable, Ref } from '@rasenjs/core'

export type CollapsibleState = 'open' | 'closed'

export interface CollapsibleRootProps {
  defaultOpen?: boolean
  open?: boolean
  disabled?: boolean
  class?: string
  style?: Record<string, string | number> | string
  onOpenChange?: (open: boolean) => void
  children?: () => Mountable<HTMLElement>
}

export interface CollapsibleTriggerProps {
  asChild?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
  onClick?: () => void
}

export interface CollapsibleContentProps {
  asChild?: boolean
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface CollapsibleContext {
  open: Ref<boolean>
  disabled: boolean
  toggle: () => void
}

/**
 * 创建 Collapsible Root 组件
 */
export function createCollapsibleRoot(): (
  props?: CollapsibleRootProps
) => Mountable<HTMLElement> {
  return (props?: CollapsibleRootProps) => {
    return (host: HTMLElement) => {
      // Root 容器
      const root = document.createElement('div')
      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      // 渲染 children
      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(root)
      }

      host.appendChild(root)

      return () => {
        childUnmount?.()
        root.remove()
      }
    }
  }
}

/**
 * 创建 Collapsible Trigger 组件
 */
export function createCollapsibleTrigger(): (
  props?: CollapsibleTriggerProps
) => Mountable<HTMLElement> {
  return (props?: CollapsibleTriggerProps) => {
    return (host: HTMLElement) => {
      const button = document.createElement('button')
      button.type = 'button'

      if (props?.class) button.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(button.style, props.style)
        }
      }

      button.onclick = () => {
        props?.onClick?.()
      }

      host.appendChild(button)
      return () => button.remove()
    }
  }
}

/**
 * 创建 Collapsible Content 组件
 */
export function createCollapsibleContent(): (
  props?: CollapsibleContentProps
) => Mountable<HTMLElement> {
  return (props?: CollapsibleContentProps) => {
    return (host: HTMLElement) => {
      const content = document.createElement('div')
      content.id = 'collapsible-content'

      if (props?.class) content.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(content.style, props.style)
        }
      }

      const forceMount = props?.forceMount ?? false
      if (!forceMount) {
        content.style.display = 'none'
      }
      content.dataset.state = forceMount ? 'open' : 'closed'

      // 渲染 children
      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(content)
      }

      host.appendChild(content)

      return () => {
        childUnmount?.()
        content.remove()
      }
    }
  }
}

/**
 * Collapsible 组合组件
 */
export function createCollapsible(): (
  props?: CollapsibleRootProps
) => Mountable<HTMLElement> {
  const Root = createCollapsibleRoot()

  return (props?: CollapsibleRootProps) => {
    return (host: HTMLElement) => {
      return Root(props)(host)
    }
  }
}

export const collapsible = createCollapsible()
