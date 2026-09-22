/**
 * Tooltip - a short description shown on hover or focus.
 *
 * Root + Trigger + Content, composed like the other layered components.
 *
 * Where this deliberately differs from Popover, because the two are not the
 * same widget with different triggers:
 *
 * - The content **describes** the trigger (`aria-describedby`), it does not
 *   label it or control it. It is a description, so it is not focusable and
 *   must not hold interactive content.
 * - **Focus never moves into it.** The user keeps their place; the tooltip
 *   appears beside them. Popover moves focus in and gives it back.
 * - It opens on pointer *hover* as well as focus, and closes when the pointer
 *   leaves or the trigger blurs. There is no outside-press dismissal, because
 *   there is no state to dismiss: nothing was selected.
 * - **Escape dismisses it and it stays dismissed** until the pointer leaves
 *   and comes back (or the trigger blurs and refocuses). WCAG "Content on
 *   Hover or Focus" requires exactly that: dismissible, and it must not
 *   immediately reappear.
 * - **Hoverable, as WCAG requires.** The hover area is the whole root, not
 *   just the trigger: `pointerenter`/`pointerleave` account for descendants,
 *   and the content is a descendant, so moving the pointer onto the tooltip
 *   keeps it open rather than making it vanish as the user reaches for it.
 *   That only holds while there is no un-hoverable gap between trigger and
 *   tooltip - the gap belongs to neither - so make the visual separation with
 *   padding on the content rather than a margin or an offset.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { span } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'
import { toMountables } from '../../internal/children'
import { createElementRef } from '../../internal/element-ref'
import {
  intoContainer,
  type ContainerProp
} from '../../internal/into-container'
import { createDismissableLayer } from '../../internal/dismissable-layer'
import { withCleanup } from '../../internal/with-cleanup'
import type { PopoverAlign, PopoverSide } from '../popover'

/** How long the pointer must rest on the trigger before the tooltip opens. */
export const DEFAULT_TOOLTIP_DELAY = 700

/**
 * The placement vocabulary, under tooltip-appropriate names. The geometry is
 * shared with Popover - both are a layer placed against a trigger - but a
 * tooltip's API should not have to say "Popover" to describe where it goes.
 */
export type TooltipSide = PopoverSide
export type TooltipAlign = PopoverAlign

export interface TooltipContext {
  /** Reactive open state (property getter; read it inside bindings). */
  open: boolean
  setOpen: (open: boolean) => void
  /** Pointer entered the trigger: arm the open delay. */
  pointerEnter: () => void
  /** Pointer left the trigger. */
  pointerLeave: () => void
  /** Trigger received focus: show without delay. */
  focus: () => void
  /** Trigger lost focus. */
  blur: () => void
  /** Escape: hide and refuse to reopen until the trigger is re-engaged. */
  escape: () => void
  /** The content registers the id it renders, so `aria-describedby` matches. */
  contentId: string | null
  setContentId: (id: string | null) => void
}

export interface TooltipRootProps {
  /** Id for the root element, which is also the positioning context. */
  id?: string
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  onOpenChange?: (open: boolean) => void
  /** Milliseconds before the tooltip opens on hover. Default 700. */
  delayMs?: number
  class?: string
  style?: Record<string, string | number> | string
  /** May return several parts (trigger and content): they become children. */
  children?: (
    getContext: () => TooltipContext | undefined
  ) => Mountable<HTMLElement> | Mountable<HTMLElement>[]
}

export interface TooltipTriggerProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  /**
   * Whether the trigger itself is focusable (default `true`).
   *
   * A tooltip has to be reachable without a mouse, so the trigger is put in
   * the tab order. Set this to `false` when the child already is focusable and
   * you do not want a second tab stop.
   */
  focusable?: boolean
  children?: () => Mountable<HTMLElement>
}

export interface TooltipContentProps extends ContainerProp {
  id?: string
  /** Default `top`. */
  side?: TooltipSide
  /** Default `center`. */
  align?: TooltipAlign
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

let idCounter = 0

function generateId(kind: 'tooltip' | 'tooltip-content'): string {
  return `${kind}-${++idCounter}`
}

/** Placement, expressed in CSS so nothing needs measuring during render. */
function placement(
  side: TooltipSide,
  align: TooltipAlign
): Record<string, string> {
  const horizontal = side === 'top' || side === 'bottom'

  const across: Record<PopoverAlign, Record<string, string>> = horizontal
    ? {
        start: { left: '0' },
        center: { left: '50%', transform: 'translateX(-50%)' },
        end: { right: '0' }
      }
    : {
        start: { top: '0' },
        center: { top: '50%', transform: 'translateY(-50%)' },
        end: { bottom: '0' }
      }

  const along: Record<PopoverSide, Record<string, string>> = {
    top: { bottom: '100%' },
    bottom: { top: '100%' },
    left: { right: '100%' },
    right: { left: '100%' }
  }

  return { ...along[side], ...across[align] }
}

/**
 * Create the Tooltip Root component.
 */
export function createTooltipRoot(): (
  props?: TooltipRootProps
) => Mountable<HTMLElement> {
  const component = (props?: TooltipRootProps) => {
    const rt = getReactiveRuntime()

    const isControlled = props?.open !== undefined
    const internal = rt.ref(readProp(props?.defaultOpen, false))
    const currentOpen = (): boolean =>
      isControlled ? readProp(props?.open, false) : rt.unref(internal)

    const setOpen = (open: boolean): void => {
      if (open === currentOpen()) return
      if (!isControlled) {
        rt.setValue(internal, open)
      }
      props?.onOpenChange?.(open)
    }

    const delayMs = (): number => props?.delayMs ?? DEFAULT_TOOLTIP_DELAY

    let timer: ReturnType<typeof setTimeout> | null = null
    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    /**
     * After Escape the tooltip must not come straight back while the pointer
     * is still on the trigger: WCAG requires the dismissal to stick until the
     * user re-engages. Cleared when the pointer leaves or the trigger blurs,
     * which is what "re-engage" means.
     */
    let dismissed = false

    let currentContentId: string | null = null

    const pointerEnter = (): void => {
      if (dismissed) return
      clearTimer()
      const delay = delayMs()
      if (delay <= 0) {
        setOpen(true)
        return
      }
      timer = setTimeout(() => {
        timer = null
        setOpen(true)
      }, delay)
    }

    const pointerLeave = (): void => {
      clearTimer()
      dismissed = false
      setOpen(false)
    }

    const focus = (): void => {
      if (dismissed) return
      // No delay on focus: a keyboard user has already committed to the
      // element, and making them wait is the main complaint about tooltips.
      clearTimer()
      setOpen(true)
    }

    const blur = (): void => {
      clearTimer()
      dismissed = false
      setOpen(false)
    }

    const escape = (): void => {
      clearTimer()
      dismissed = true
      setOpen(false)
    }

    const rootRef = createElementRef<HTMLSpanElement>(rt)

    // Escape is handled on the document, not on the trigger. A user who only
    // hovers never puts focus on the trigger, so a keydown there would never
    // fire - and "dismissible" is a WCAG requirement for hover content too.
    // The dismissable layer gives exactly that: Escape, and nothing else.
    const escapeLayer = createDismissableLayer({
      container: () => rootRef.value,
      dismissOnEscape: true,
      dismissOnPointerDownOutside: false,
      dismissOnFocusOutside: false,
      onEscapeKeyDown: (event) => {
        escape()
        // Handled here, so the layer does not also run its own dismissal.
        event.preventDefault()
      }
    })

    const context: TooltipContext = {
      get open() {
        return currentOpen()
      },
      setOpen,
      pointerEnter,
      pointerLeave,
      focus,
      blur,
      escape,
      get contentId() {
        return currentContentId
      },
      setContentId: (id) => {
        currentContentId = id
      }
    }
    const getContext = (): TooltipContext => context

    const root = span({
      id: props?.id,
      ref: rootRef,
      style: {
        position: 'relative',
        display: 'inline-block',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      'data-state': () => (currentOpen() ? 'open' : 'closed'),
      // The hover area covers the trigger *and* the tooltip. Hanging these on
      // the trigger alone would close the tooltip the moment the pointer moved
      // onto it - the content is not the trigger - which is the WCAG failure
      // this shape avoids.
      onPointerEnter: () => pointerEnter(),
      onPointerLeave: () => pointerLeave(),
      class: props?.class,
      // `toMountables`, not `[children]`: the slot may already be an array,
      // and wrapping it again nests it - which the element factory does not
      // flatten, so nothing renders at all.
      children: toMountables(props?.children?.(getContext))
    })

    // The listener follows the open state. `subscribe` only reports changes,
    // so the current state is applied once up front as well - otherwise a
    // tooltip that starts open would never arm its Escape handling.
    const syncLayer = (): void => {
      if (currentOpen()) escapeLayer.activate()
      else escapeLayer.deactivate()
    }
    rt.subscribe(() => currentOpen(), syncLayer)
    syncLayer()

    // Neither the pending timer nor the document listener may outlive the
    // component.
    return withCleanup(root, () => {
      clearTimer()
      escapeLayer.deactivate()
    })
  }
  return com(component)
}

/**
 * Create the Tooltip Trigger component.
 */
export function createTooltipTrigger(): (
  props?: TooltipTriggerProps,
  getContext?: () => TooltipContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TooltipTriggerProps,
    getContext?: () => TooltipContext | undefined
  ) => {
    const ctx = getContext?.()

    return span({
      id: props?.id,
      // Focusable so the tooltip is reachable without a mouse, which is the
      // requirement; `focusable: false` is for a trigger whose child already
      // takes focus.
      tabIndex: (props?.focusable ?? true) ? 0 : undefined,
      // Points at the description only while it is there. A dangling
      // aria-describedby is worse than none: it announces an empty
      // description.
      'aria-describedby': () => (ctx?.open ? ctx.contentId ?? undefined : undefined),
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onFocus: () => ctx?.focus(),
      onBlur: () => ctx?.blur()
    })
  }
  return com(component)
}

/**
 * Create the Tooltip Content component.
 */
export function createTooltipContent(): (
  props?: TooltipContentProps,
  getContext?: () => TooltipContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TooltipContentProps,
    getContext?: () => TooltipContext | undefined
  ) => {
    const ctx = getContext?.()
    const side = props?.side ?? 'top'
    const align = props?.align ?? 'center'

    const rt = getReactiveRuntime()
    const contentRef = createElementRef<HTMLSpanElement>(rt)

    const contentId = props?.id ?? generateId('tooltip-content')
    ctx?.setContentId(contentId)

    const content = span({
      id: contentId,
      role: 'tooltip',
      ref: contentRef,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      'data-side': side,
      'data-align': align,
      hidden: () => !ctx?.open,
      class: props?.class,
      style: {
        position: 'absolute',
        // Hit-testable, so the pointer can rest on it (WCAG "hoverable").
        // That is not the same as interactive: it is a description and holds
        // no controls - anything interactive belongs in a Popover.
        ...placement(side, align),
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: props?.children ? [props.children()] : undefined
    })

    return intoContainer(content, contentRef, props?.container)
  }
  return com(component)
}

/**
 * The Tooltip parts, exported like the other layered components.
 */
export function createTooltip(): {
  Root: (props?: TooltipRootProps) => Mountable<HTMLElement>
  Trigger: (
    props?: TooltipTriggerProps,
    getContext?: () => TooltipContext | undefined
  ) => Mountable<HTMLElement>
  Content: (
    props?: TooltipContentProps,
    getContext?: () => TooltipContext | undefined
  ) => Mountable<HTMLElement>
} {
  return {
    Root: createTooltipRoot(),
    Trigger: createTooltipTrigger(),
    Content: createTooltipContent()
  }
}

export const tooltip = createTooltip()
