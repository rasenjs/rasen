/**
 * Avatar - user avatar with image/fallback switching.
 *
 * Shows the image when it loads; falls back to the fallback content on
 * error or while loading. Composed on @rasenjs/dom element factories;
 * load status is a runtime ref so the fallback reacts without polling.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { span, img } from '@rasenjs/web/elements'
import { createElementRef } from '../../internal/element-ref'
import { readProp } from '../../internal/props'
import { toMountables } from '../../internal/children'

export type ImageLoadingStatus = 'loading' | 'loaded' | 'error'
export type FallbackVisibility = 'visible' | 'hidden'

export interface AvatarRootProps {
  /** Id for the avatar box itself. */
  id?: string
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
  /** May return several parts: they become children of the root box. */
  children?: (
    getContext: () => AvatarContext | undefined
  ) => Mountable<HTMLElement> | Mountable<HTMLElement>[]
}

export interface AvatarImageProps {
  src?: PropValue<string>
  srcSet?: PropValue<string>
  sizes?: PropValue<string>
  alt?: PropValue<string>
  loading?: PropValue<'eager' | 'lazy'>
  class?: string
  style?: Record<string, string | number> | string
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void
}

export interface AvatarFallbackProps {
  delayMs?: PropValue<number>
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
  const component = (props?: AvatarRootProps) => {
    const rt = getReactiveRuntime()
    const statusRef = rt.ref<ImageLoadingStatus>('loading')

    return span({
      id: props?.id,
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
              const produced = props.children!(getContext)
              const parts = toMountables(produced) ?? []
              const unmounts = parts.map((part) => part(el, undefined))
              return () => {
                for (const unmount of unmounts) {
                  if (typeof unmount === 'function') unmount()
                }
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
      // Follows the loading status: pinned to 'loading' it would keep
      // reporting that after the image had loaded or failed.
      'data-state': () => getContext?.()?.status() ?? 'loading',
      hidden: () => getContext?.()?.status() === 'error',
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
    const delayMs = (): number => readProp(props?.delayMs, 0)
    const delayedVisible = rt.ref(readProp(props?.delayMs, 0) === 0)
    const fallbackRef = createElementRef<HTMLSpanElement>(rt)

    const shouldShow = () => {
      const status = getContext?.()?.status() ?? 'loading'
      return (
        status !== 'loaded' &&
        (delayMs() === 0 || rt.unref(delayedVisible))
      )
    }

    // The delay timer starts once the element is in the DOM (the ref is
    // written during mount). It flips a component-local ref, so a fire after
    // unmount is harmless; the element lifetime owns the start, not the stop.
    if (delayMs() > 0) {
      const wait = delayMs()
      rt.subscribe(
        () => fallbackRef.value,
        (el) => {
          if (!el) return
          setTimeout(() => rt.setValue(delayedVisible, true), wait)
        }
      )
    }

    return span({
      ref: fallbackRef,
      class: props?.class,
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
      children: props?.children ? [props.children()] : undefined
    })
  }
  return com(component)
}

/**
 * Avatar preset: root + image + fallback wired to one context.
 */
export function createAvatar(): (props?: {
  /** Id for the avatar container itself. */
  id?: string
  src?: PropValue<string>
  alt?: PropValue<string>
  /**
   * Per-part class hooks. The parts take their own `class`; without these the
   * preset had no way to reach them, so `fallbackClass` was silently dropped.
   */
  imageClass?: string
  fallbackClass?: string
  fallback?: () => Mountable<HTMLElement>
  /** Milliseconds to wait before the fallback appears (0 = immediately). */
  delayMs?: PropValue<number>
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void
  class?: string
  style?: Record<string, string | number> | string
}) => Mountable<HTMLElement> {
  const Root = createAvatarRoot()
  const Image = createAvatarImage()
  const Fallback = createAvatarFallback()

  return (props) =>
    Root({
      id: props?.id,
      class: props?.class,
      style: props?.style,
      children: (getContext) => [
        Image(
          {
            src: props?.src,
            alt: props?.alt,
            class: props?.imageClass,
            onLoadingStatusChange: props?.onLoadingStatusChange
          },
          getContext
        ),
        Fallback(
          {
            class: props?.fallbackClass,
            children: props?.fallback,
            delayMs: props?.delayMs
          },
          getContext
        )
      ]
    })
}

export const avatar = createAvatar()
