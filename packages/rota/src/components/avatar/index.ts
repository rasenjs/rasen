/**
 * Avatar - 头像组件
 *
 * 用于显示用户头像，支持图片加载失败时显示备用内容。
 */
import type { Mountable } from '@rasenjs/core'

export type ImageLoadingStatus = 'loading' | 'loaded' | 'error'
export type FallbackVisibility = 'visible' | 'hidden'

export interface AvatarRootProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AvatarImageProps {
  src?: string
  srcSet?: string
  sizes?: string
  alt?: string
  loading?: 'eager' | 'lazy'
  class?: string
  style?: Record<string, string | number> | string
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void
}

export interface AvatarFallbackProps {
  delayMs?: number
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface AvatarContext {
  status: ImageLoadingStatus
  setStatus: (status: ImageLoadingStatus) => void
}

/**
 * 创建 Avatar Root 组件
 */
export function createAvatarRoot(): (
  props?: AvatarRootProps
) => Mountable<HTMLElement> {
  const contextMap = new WeakMap<HTMLElement, AvatarContext>()

  return (props?: AvatarRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('span')
      root.style.display = 'inline-block'
      root.style.position = 'relative'
      root.style.overflow = 'hidden'
      root.style.width = '100%'
      root.style.height = '100%'

      if (props?.class) {
        root.className = props.class
      }
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      const context: AvatarContext = {
        status: 'loading',
        setStatus: (status: ImageLoadingStatus) => {
          context.status = status
        }
      }
      contextMap.set(root, context)

      host.appendChild(root)

      return () => {
        contextMap.delete(root)
        root.remove()
      }
    }
  }
}

/**
 * 创建 Avatar Image 组件
 */
export function createAvatarImage(): (
  props?: AvatarImageProps,
  getContext?: () => AvatarContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AvatarImageProps,
    getContext?: () => AvatarContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const img = document.createElement('img')

      img.style.position = 'absolute'
      img.style.top = '0'
      img.style.right = '0'
      img.style.bottom = '0'
      img.style.left = '0'
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'

      if (props?.src) img.src = props.src
      if (props?.srcSet) img.srcset = props.srcSet
      if (props?.sizes) img.sizes = props.sizes
      if (props?.alt !== undefined) img.alt = props.alt
      if (props?.loading) img.loading = props.loading
      if (props?.class) img.className = props.class

      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(img.style, props.style)
        }
      }

      const setStatus = (status: ImageLoadingStatus) => {
        img.dataset.state = status
        const ctx = getContext?.()
        if (ctx) ctx.setStatus(status)
        props?.onLoadingStatusChange?.(status)
      }

      img.onload = () => setStatus('loaded')
      img.onerror = () => setStatus('error')

      host.appendChild(img)

      return () => img.remove()
    }
  }
}

/**
 * 创建 Avatar Fallback 组件
 */
export function createAvatarFallback(): (
  props?: AvatarFallbackProps,
  getContext?: () => AvatarContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: AvatarFallbackProps,
    getContext?: () => AvatarContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const fallback = document.createElement('span')

      fallback.style.position = 'absolute'
      fallback.style.top = '0'
      fallback.style.right = '0'
      fallback.style.bottom = '0'
      fallback.style.left = '0'
      fallback.style.display = 'flex'
      fallback.style.alignItems = 'center'
      fallback.style.justifyContent = 'center'

      if (props?.class) fallback.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(fallback.style, props.style)
        }
      }

      const delayMs = props?.delayMs ?? 0
      let timer: number | null = null
      let visible = delayMs === 0

      if (visible) {
        fallback.style.opacity = '1'
        fallback.dataset.state = 'visible'
      } else {
        fallback.style.opacity = '0'
        fallback.dataset.state = 'hidden'
      }

      const updateVisibility = () => {
        const ctx = getContext?.()
        const status = ctx?.status ?? 'loading'

        if (status === 'error' || status === 'loading') {
          if (!visible) {
            if (delayMs > 0) {
              timer = window.setTimeout(() => {
                visible = true
                fallback.style.opacity = '1'
                fallback.dataset.state = 'visible'
              }, delayMs)
            } else {
              visible = true
              fallback.style.opacity = '1'
              fallback.dataset.state = 'visible'
            }
          }
        } else {
          visible = false
          fallback.style.opacity = '0'
          fallback.dataset.state = 'hidden'
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
        }
      }

      // 初始检查
      updateVisibility()

      // 监听状态变化
      const interval = setInterval(() => {
        const ctx = getContext?.()
        if (ctx) {
          updateVisibility()
        }
      }, 50) as unknown as number

      host.appendChild(fallback)

      return () => {
        if (timer) clearTimeout(timer)
        clearInterval(interval)
        fallback.remove()
      }
    }
  }
}

/**
 * Avatar 预设（组合版）
 */
export function createAvatar(): (props?: {
  src?: string
  alt?: string
  fallback?: () => Mountable<HTMLElement>
  class?: string
  style?: Record<string, string | number> | string
}) => Mountable<HTMLElement> {
  const Root = createAvatarRoot()
  const Image = createAvatarImage()
  const Fallback = createAvatarFallback()

  return (props) => {
    return (host: HTMLElement) => {
      const contextMap = new WeakMap<HTMLElement, AvatarContext>()

      const getContext = (): AvatarContext | undefined => {
        return contextMap.get(host)
      }

      const setContext = (ctx: AvatarContext) => {
        contextMap.set(host, ctx)
      }

      // Root
      const rootMount = Root({
        class: props?.class,
        style: props?.style,
        children: () => (container: HTMLElement) => {
          const ctx: AvatarContext = {
            status: 'loading',
            setStatus: (status) => {
              ctx.status = status
            }
          }
          setContext(ctx)

          const unmounts: (() => void)[] = []

          // Image
          if (props?.src) {
            const imgMount = Image(
              { src: props.src, alt: props.alt },
              getContext
            )(container)
            if (typeof imgMount === 'function') unmounts.push(imgMount)
          }

          // Fallback
          if (props?.fallback) {
            const fallbackMount = Fallback(
              { delayMs: 0 },
              getContext
            )(container)
            if (typeof fallbackMount === 'function')
              unmounts.push(fallbackMount)
          }

          return () => {
            unmounts.forEach((u) => u())
          }
        }
      })(host)

      return rootMount
    }
  }
}

export const avatar = createAvatar()
