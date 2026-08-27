/**
 * AlertDialog - 警告对话框组件
 *
 * 用于中断用户操作并要求确认重要操作。
 * 与 Dialog 的区别：
 * 1. 使用 role="alertdialog" 而非 role="dialog"
 * 2. 焦点默认聚焦到 Action 按钮
 * 3. 禁止通过 ESC 或点击外部关闭
 */
import type { Mountable } from '@rasenjs/core'

export interface AlertDialogContext {
  open: boolean
  setOpen: (open: boolean) => void
  titleId: string | null
  setTitleId: (id: string | null) => void
  descriptionId: string | null
  setDescriptionId: (id: string | null) => void
  actionElement: HTMLElement | null
  setActionElement: (el: HTMLElement | null) => void
  cancelElement: HTMLElement | null
  setCancelElement: (el: HTMLElement | null) => void
  previousFocusElement: HTMLElement | null
  setPreviousFocusElement: (el: HTMLElement | null) => void
}

export interface AlertDialogRootProps {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AlertDialogTriggerProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogContentProps {
  class?: string
  style?: Record<string, string | number> | string
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
  children?: (
    getContext: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
}

export interface AlertDialogTitleProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogDescriptionProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogActionProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogCancelProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AlertDialogOverlayProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

let titleIdCounter = 0
let descriptionIdCounter = 0

function generateTitleId(): string {
  return `alert-dialog-title-${++titleIdCounter}`
}

function generateDescriptionId(): string {
  return `alert-dialog-description-${++descriptionIdCounter}`
}

/**
 * 创建 AlertDialog Root 组件
 */
export function createAlertDialogRoot(): (
  props?: AlertDialogRootProps
) => Mountable<HTMLElement> {
  return (props?: AlertDialogRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      const isControlled = props?.open !== undefined
      let currentOpen = props?.open ?? props?.defaultOpen ?? false

      let currentTitleId: string | null = null
      let currentDescriptionId: string | null = null
      let currentActionElement: HTMLElement | null = null
      let currentCancelElement: HTMLElement | null = null
      let previousFocusElement: HTMLElement | null = null

      const setOpen = (open: boolean): void => {
        if (open === currentOpen) return
        if (!isControlled) {
          currentOpen = open
        }
        props?.onOpenChange?.(open)
      }

      const context: AlertDialogContext = {
        get open() {
          return isControlled ? (props?.open ?? false) : currentOpen
        },
        setOpen,
        get titleId() {
          return currentTitleId
        },
        setTitleId: (id: string | null) => {
          currentTitleId = id
        },
        get descriptionId() {
          return currentDescriptionId
        },
        setDescriptionId: (id: string | null) => {
          currentDescriptionId = id
        },
        get actionElement() {
          return currentActionElement
        },
        setActionElement: (el: HTMLElement | null) => {
          currentActionElement = el
        },
        get cancelElement() {
          return currentCancelElement
        },
        setCancelElement: (el: HTMLElement | null) => {
          currentCancelElement = el
        },
        get previousFocusElement() {
          return previousFocusElement
        },
        setPreviousFocusElement: (el: HTMLElement | null) => {
          previousFocusElement = el
        }
      }

      const getContext = (): AlertDialogContext | undefined => context

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext)(root, undefined)
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
 * 创建 AlertDialog Trigger 组件
 */
export function createAlertDialogTrigger(): (
  props?: AlertDialogTriggerProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogTriggerProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const trigger = document.createElement('button')
      trigger.type = 'button'

      if (props?.class) trigger.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(trigger.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        trigger.setAttribute('data-state', ctx.open ? 'open' : 'closed')

        trigger.addEventListener('click', () => {
          ctx.setOpen(true)
        })

        // Update data-state when open changes
        const checkState = (): void => {
          trigger.setAttribute('data-state', ctx.open ? 'open' : 'closed')
        }

        // Use a simple polling approach for state sync
        const interval = setInterval(checkState, 50)

        let childUnmount: (() => void) | undefined
        if (props?.children) {
          childUnmount = props.children()(trigger, undefined)
        }

        host.appendChild(trigger)

        return () => {
          clearInterval(interval)
          childUnmount?.()
          trigger.remove()
        }
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(trigger, undefined)
      }

      host.appendChild(trigger)

      return () => {
        childUnmount?.()
        trigger.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Overlay 组件
 */
export function createAlertDialogOverlay(): (
  props?: AlertDialogOverlayProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogOverlayProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const overlay = document.createElement('div')
      overlay.setAttribute('data-state', 'closed')

      if (props?.class) overlay.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(overlay.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        overlay.setAttribute('data-state', ctx.open ? 'open' : 'closed')

        // Prevent closing on overlay click for AlertDialog
        overlay.addEventListener('click', (e) => {
          e.stopPropagation()
        })
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(overlay, undefined)
      }

      host.appendChild(overlay)

      return () => {
        childUnmount?.()
        overlay.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Content 组件
 */
export function createAlertDialogContent(): (
  props?: AlertDialogContentProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogContentProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const ctx = getContext?.()
      const isOpen = ctx?.open ?? false

      const content = document.createElement('div')
      content.setAttribute('role', 'alertdialog')
      content.setAttribute('aria-modal', 'true')
      content.setAttribute('data-state', isOpen ? 'open' : 'closed')

      if (!isOpen) {
        content.setAttribute('hidden', '')
      }

      if (props?.class) content.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(content.style, props.style)
        }
      }

      // Set up aria-labelledby and aria-describedby when title/description are registered
      const updateAriaAttributes = (): void => {
        if (ctx?.titleId) {
          content.setAttribute('aria-labelledby', ctx.titleId)
        }
        if (ctx?.descriptionId) {
          content.setAttribute('aria-describedby', ctx.descriptionId)
        }
      }

      if (ctx) {
        // Handle Escape key - prevent default for AlertDialog
        const handleKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') {
            if (props?.onEscapeKeyDown) {
              props.onEscapeKeyDown(event)
            } else {
              // AlertDialog should NOT close on Escape by default
              event.preventDefault()
            }
          }
        }

        content.addEventListener('keydown', handleKeyDown)

        // Focus management on open
        if (isOpen) {
          const focusAction = (): void => {
            // Save current focus
            if (document.activeElement instanceof HTMLElement) {
              ;(
                ctx as AlertDialogContext & {
                  previousFocusElement: HTMLElement | null
                }
              ).previousFocusElement = document.activeElement
            }

            // Focus action button or cancel button
            requestAnimationFrame(() => {
              if (props?.onOpenAutoFocus) {
                const event = new Event('focus', { cancelable: true })
                props.onOpenAutoFocus(event)
                if (event.defaultPrevented) return
              }

              if (ctx.actionElement) {
                ctx.actionElement.focus()
              } else if (ctx.cancelElement) {
                ctx.cancelElement.focus()
              } else {
                content.focus()
              }
            })
          }

          focusAction()
        }
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext!)(content, undefined)
      }

      host.appendChild(content)

      // Update aria attributes after children are rendered
      updateAriaAttributes()

      return () => {
        childUnmount?.()
        content.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Title 组件
 */
export function createAlertDialogTitle(): (
  props?: AlertDialogTitleProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogTitleProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const title = document.createElement('h2')
      const titleId = generateTitleId()
      title.id = titleId

      if (props?.class) title.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(title.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.setTitleId(titleId)
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(title, undefined)
      }

      host.appendChild(title)

      return () => {
        if (ctx && ctx.titleId === titleId) {
          ctx.setTitleId(null)
        }
        childUnmount?.()
        title.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Description 组件
 */
export function createAlertDialogDescription(): (
  props?: AlertDialogDescriptionProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogDescriptionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const description = document.createElement('p')
      const descriptionId = generateDescriptionId()
      description.id = descriptionId

      if (props?.class) description.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(description.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.setDescriptionId(descriptionId)
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(description, undefined)
      }

      host.appendChild(description)

      return () => {
        if (ctx && ctx.descriptionId === descriptionId) {
          ctx.setDescriptionId(null)
        }
        childUnmount?.()
        description.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Action 组件
 */
export function createAlertDialogAction(): (
  props?: AlertDialogActionProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogActionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const action = document.createElement('button')
      action.type = 'button'

      if (props?.class) action.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(action.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.setActionElement(action)

        action.addEventListener('click', () => {
          ctx.setOpen(false)
        })
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(action, undefined)
      }

      host.appendChild(action)

      return () => {
        if (ctx && ctx.actionElement === action) {
          ctx.setActionElement(null)
        }
        childUnmount?.()
        action.remove()
      }
    }
  }
}

/**
 * 创建 AlertDialog Cancel 组件
 */
export function createAlertDialogCancel(): (
  props?: AlertDialogCancelProps,
  getContext?: () => AlertDialogContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AlertDialogCancelProps,
    getContext?: () => AlertDialogContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const cancel = document.createElement('button')
      cancel.type = 'button'

      if (props?.class) cancel.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(cancel.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        ctx.setCancelElement(cancel)

        cancel.addEventListener('click', () => {
          ctx.setOpen(false)
        })
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children()(cancel, undefined)
      }

      host.appendChild(cancel)

      return () => {
        if (ctx && ctx.cancelElement === cancel) {
          ctx.setCancelElement(null)
        }
        childUnmount?.()
        cancel.remove()
      }
    }
  }
}

/**
 * AlertDialog 组合组件
 */
export function createAlertDialog(): {
  Root: (props?: AlertDialogRootProps) => Mountable<HTMLElement>
  Trigger: (
    props?: AlertDialogTriggerProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Overlay: (
    props?: AlertDialogOverlayProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Content: (
    props?: AlertDialogContentProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Title: (
    props?: AlertDialogTitleProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Description: (
    props?: AlertDialogDescriptionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Action: (
    props?: AlertDialogActionProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
  Cancel: (
    props?: AlertDialogCancelProps,
    getContext?: () => AlertDialogContext | undefined
  ) => Mountable<HTMLElement>
} {
  const Root = createAlertDialogRoot()
  const Trigger = createAlertDialogTrigger()
  const Overlay = createAlertDialogOverlay()
  const Content = createAlertDialogContent()
  const Title = createAlertDialogTitle()
  const Description = createAlertDialogDescription()
  const Action = createAlertDialogAction()
  const Cancel = createAlertDialogCancel()

  return { Root, Trigger, Overlay, Content, Title, Description, Action, Cancel }
}

export const alertDialog = createAlertDialog()
