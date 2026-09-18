/**
 * Avatar - user avatar with image/fallback switching.
 *
 * Shows the image when it loads; falls back to the fallback content on
 * error or while loading. Composed on @rasenjs/dom element factories;
 * load status is a runtime ref so the fallback reacts without polling.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { span, img } from '@rasenjs/dom'

export type ImageLoadingStatus = 'loading' | 'loaded' | 'error'
export type FallbackVisibility = 'visible' | 'hidden'

export interface AvatarRootProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: (getContext: () => AvatarContext | undefined) => Mountable<HTMLElement>
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
  /** Reactive load status; parts bind to it. */
  status: () => ImageLoadingStatus
  setStatus: (status: ImageLoadingStatus) => void
}

/**
 * Create the Avatar Root component.
 */
export function createAvatarRoot(): (
  props?: AvatarRootProps
) => Mountable<HTMLElement> {
  const contextMap = new WeakMap<HTMLElement, AvatarContext>()

  const component = (props?: AvatarRootProps) => {
    const rt = getReactiveRuntime()
    const statusRef = rt.ref<ImageLoadingStatus>('loading')

    return span({
      class: props?.class,
      // Positioning/overflow are functional: image and fallback stack
      // inside this box via absolute positioning.
      style: {
        display: 'inline-block',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: props?.children
        ? [
            (el: HTMLElement) => {
              const getContext = (): AvatarContext => ({
                status: () => rt.unref(statusRef),
                setStatus: (s) => rt.setValue(statusRef, s)
              })
              contextMap.set(el, getContext())
              const unmount = props.children!(getContext)(el, undefined)
              return () => {
                contextMap.delete(el)
                unmount?.()
              }
            }
          ]
        : undefined
    })
  }
  return com(component)
}

/**
 * Create the Avatar Image component.
 */
export function createAvatarImage(): (
  props?: AvatarImageProps,
  getContext?: () => AvatarContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AvatarImageProps,
    getContext?: () => AvatarContext | undefined
  ) => {
    const setStatus = (status: ImageLoadingStatus) => {
      getContext?.()?.setStatus(status)
      props?.onLoadingStatusChange?.(status)
    }

    return img({
      src: props?.src,
      srcSet: props?.srcSet,
      sizes: props?.sizes,
      alt: props?.alt,
      loading: props?.loading,
      'data-state': 'loading',
      class: props?.class,
      // Fill the root box over the fallback — functional positioning.
      style: {
        position: 'absolute',
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      onLoad: () => setStatus('loaded'),
      onError: () => setStatus('error')
    })
  }
  return com(component)
}

/**
 * Create the Avatar Fallback component.
 */
export function createAvatarFallback(): (
  props?: AvatarFallbackProps,
  getContext?: () => AvatarContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: AvatarFallbackProps,
    getContext?: () => AvatarContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const delayMs = props?.delayMs ?? 0
    const delayedVisible = rt.ref(delayMs === 0)

    const shouldShow = () => {
      const status = getContext?.()?.status() ?? 'loading'
      return (
        status !== 'loaded' &&
        (delayMs === 0 || rt.unref(delayedVisible))
      )
    }

    return span({
      'data-state': () => (shouldShow() ? 'visible' : 'hidden'),
      // Opacity (not hidden) so consumers can transition the swap in CSS.
      style: {
        opacity: () => (shouldShow() ? '1' : '0'),
        position: 'absolute',
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      // The delay timer belongs to the element lifetime: started at mount,
      // cleared on unmount. The wrapper is always injected so that the timer
      // is scheduled even when the consumer passes no children.
      children: [
        (el: HTMLElement) => {
          const timer =
            delayMs > 0
              ? setTimeout(() => rt.setValue(delayedVisible, true), delayMs)
              : null
          const unmount = props?.children
            ? props.children()(el, undefined)
            : undefined
          return () => {
            if (timer !== null) clearTimeout(timer)
            unmount?.()
          }
        }
      ]
    })
  }
  return com(component)
}

/**
 * Avatar preset: root + image + fallback wired to one context.
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

  return (props) =>
    Root({
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        span({
          children: [
            Image({ src: props?.src, alt: props?.alt }, getContext),
            Fallback({ delayMs: 0, children: props?.fallback }, getContext)
          ]
        })
    })
}

export const avatar = createAvatar()
