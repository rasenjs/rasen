/**
 * Popover - a non-modal layer anchored to its trigger.
 *
 * Root + Trigger + Content composition, Reka/Radix-style API. Composed on
 * @rasenjs/dom element factories.
 *
 * Behaviour decisions worth stating, because they differ from Dialog:
 *
 * - **Non-modal.** Focus moves into the content when it opens and returns to
 *   the trigger when it closes, but Tab is *not* trapped - the user can leave
 *   the layer by tabbing, which is what separates a popover from a dialog.
 *   There is no `aria-modal`, and no overlay.
 * - **The trigger is inside the layer.** A press on the trigger counts as
 *   inside, otherwise the outside-press dismissal would fire first and the
 *   trigger's own toggle would reopen what it just closed.
 * - **Anchoring is CSS, not measurement.** The root is the positioning
 *   context and the content is placed to one of its four sides with
 *   `data-side` / `data-align` for the consumer to build on. That means no
 *   `getBoundingClientRect` during render, so it renders on the server and in
 *   a layout-free test environment. Collision detection, flipping and an
 *   arrow are deliberately out of scope; a consumer that needs them positions
 *   the content itself.
 * - **Focus leaving does not dismiss.** Escape and an outside press do. The
 *   content is arbitrary (often a form), so tabbing out of it should not
 *   destroy it - `dismissOnFocusOutside` opts in to the other behaviour.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { button, div } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'
import { toMountables, type ChildSlot } from '../../internal/children'
import { createElementRef } from '../../internal/element-ref'
import { createFocusScope } from '../../internal/focus-scope'
import { createDismissableLayer } from '../../internal/dismissable-layer'
import { withCleanup } from '../../internal/with-cleanup'

/** Which side of the trigger the content is placed on. */
export type PopoverSide = 'top' | 'right' | 'bottom' | 'left'
/** How the content is aligned along that side. */
export type PopoverAlign = 'start' | 'center' | 'end'

export interface PopoverContext {
  /** Reactive open state (property getter; read it inside bindings). */
  open: boolean
  setOpen: (open: boolean) => void
  /** Element cells the parts move focus between. */
  triggerElement: HTMLElement | null
  setTriggerElement: (el: HTMLElement | null) => void
  /** The content registers whatever id it renders, so `aria-controls` matches. */
  contentId: string | null
  setContentId: (id: string | null) => void
}

export interface PopoverRootProps {
  /** Id for the root element, which is also the positioning context. */
  id?: string
  defaultOpen?: PropValue<boolean>
  open?: PropValue<boolean>
  onOpenChange?: (open: boolean) => void
  class?: string
  style?: Record<string, string | number> | string
  /**
   * May return several parts (trigger and content): they become children of
   * the root, which is what keeps the root a valid positioning context.
   */
  children?: (getContext: () => PopoverContext | undefined) => ChildSlot
}

export interface PopoverTriggerProps {
  id?: string
  class?: string
  style?: Record<string, string | number> | string
  children?: () => Mountable<HTMLElement>
}

export interface PopoverContentProps {
  id?: string
  /** Default `bottom`. */
  side?: PopoverSide
  /** Default `center`. */
  align?: PopoverAlign
  class?: string
  style?: Record<string, string | number> | string
  /** Cancel to keep focus where it is. */
  onOpenAutoFocus?: (event: Event) => void
  /** Cancel to place focus yourself; the layer then stops managing it. */
  onCloseAutoFocus?: (event: Event) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
  onFocusOutside?: (event: FocusEvent) => void
  /** All three default to `true`. */
  dismissOnEscape?: boolean
  dismissOnPointerDownOutside?: boolean
  dismissOnFocusOutside?: boolean
  children?: () => Mountable<HTMLElement>
}

let idCounter = 0

/** Unique per instance, so two popovers on one page cannot collide. */
function generateId(kind: 'popover' | 'popover-content'): string {
  return `${kind}-${++idCounter}`
}

/**
 * Where the content sits, relative to the root. `data-side` / `data-align` are
 * emitted alongside so a consumer styles the offset (and any arrow) in CSS
 * rather than the component guessing with measurements.
 */
function placement(
  side: PopoverSide,
  align: PopoverAlign
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
 * Create the Popover Root component.
 */
export function createPopoverRoot(): (
  props?: PopoverRootProps
) => Mountable<HTMLElement> {
  const component = (props?: PopoverRootProps) => {
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

    const triggerRef = createElementRef<HTMLElement>(rt)
    let currentContentId: string | null = null

    const context: PopoverContext = {
      get open() {
        return currentOpen()
      },
      setOpen,
      get triggerElement() {
        return triggerRef.value
      },
      setTriggerElement: (el) => {
        triggerRef.value = el
      },
      get contentId() {
        return currentContentId
      },
      setContentId: (id) => {
        currentContentId = id
      }
    }
    const getContext = (): PopoverContext => context

    return div({
      id: props?.id,
      // The positioning context for the content. Documented, because a
      // consumer that moves the content out of the root has to provide one.
      style: {
        position: 'relative',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      'data-state': () => (currentOpen() ? 'open' : 'closed'),
      class: props?.class,
      children: toMountables(props?.children?.(getContext))
    })
  }
  return com(component)
}

/**
 * Create the Popover Trigger component.
 */
export function createPopoverTrigger(): (
  props?: PopoverTriggerProps,
  getContext?: () => PopoverContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: PopoverTriggerProps,
    getContext?: () => PopoverContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const ctx = getContext?.()
    const triggerRef = createElementRef<HTMLButtonElement>(rt)

    // Handed to the context as soon as the element exists: the dismissable
    // layer treats it as inside the layer, and closing focus returns to it.
    rt.subscribe(() => triggerRef.value, (el) => ctx?.setTriggerElement(el))

    return button({
      type: 'button',
      id: props?.id,
      ref: triggerRef,
      'aria-haspopup': 'dialog',
      'aria-expanded': () => (ctx?.open ? 'true' : 'false'),
      // Points at the panel the layer actually rendered, which is registered
      // by that panel rather than guessed here.
      'aria-controls': () => ctx?.contentId ?? undefined,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined,
      onClick: () => ctx?.setOpen(!ctx.open)
    })
  }
  return com(component)
}

/**
 * Create the Popover Content component.
 */
export function createPopoverContent(): (
  props?: PopoverContentProps,
  getContext?: () => PopoverContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: PopoverContentProps,
    getContext?: () => PopoverContext | undefined
  ) => {
    const rt = getReactiveRuntime()
    const ctx = getContext?.()
    const side = props?.side ?? 'bottom'
    const align = props?.align ?? 'center'

    const contentRef = createElementRef<HTMLDivElement>(rt)
    const contentId = props?.id ?? generateId('popover-content')
    ctx?.setContentId(contentId)

    // Non-modal: focus moves in and back out, but Tab is not trapped, so the
    // user can leave the layer the way they leave any other region.
    const scope = createFocusScope({
      container: () => contentRef.value,
      trapped: false
    })
    const layer = createDismissableLayer({
      container: () => contentRef.value,
      dismissOnEscape: props?.dismissOnEscape ?? true,
      dismissOnPointerDownOutside: props?.dismissOnPointerDownOutside ?? true,
      // Defaults to `false`, matching Dialog. Focus leaving the layer is not
      // the user saying "done": the content is arbitrary, often a form, and
      // tabbing from it to the next control should not destroy it. Escape and
      // an outside press are the gestures that mean dismissal; a consumer that
      // wants focus-out dismissal asks for it.
      dismissOnFocusOutside: props?.dismissOnFocusOutside ?? false,
      // The trigger belongs to this layer. Without it a press on the trigger
      // reads as "outside": the layer closes on pointerdown and then the
      // trigger's click toggles it straight back open.
      isInside: (target) =>
        (!!contentRef.value && !!target && contentRef.value.contains(target)) ||
        (!!ctx?.triggerElement &&
          !!target &&
          ctx.triggerElement.contains(target)),
      onDismiss: () => ctx?.setOpen(false),
      // No default `preventDefault()`: like Dialog, a popover closes on Escape.
      // The consumer's handler may veto it, which is the layer's contract.
      onEscapeKeyDown: (event) => props?.onEscapeKeyDown?.(event),
      onPointerDownOutside: (event) => props?.onPointerDownOutside?.(event),
      onFocusOutside: (event) => props?.onFocusOutside?.(event)
    })

    if (ctx) {
      let entered = false

      const enter = (): void => {
        scope.activate()
        layer.activate()

        const event = new Event('focus', { cancelable: true })
        props?.onOpenAutoFocus?.(event)
        if (event.defaultPrevented) return

        // Deferred a microtask: an element factory writes its `ref` while
        // binding, i.e. before the element is in the tree, and focusing a
        // detached element does nothing. The microtask runs once the enclosing
        // mount has returned, by which point the panel is in the document.
        // No `target`: the first focusable child, or the panel itself when it
        // has none.
        queueMicrotask(() => scope.focus())
      }

      const leave = (): void => {
        layer.deactivate()
        const event = new Event('focus', { cancelable: true })
        props?.onCloseAutoFocus?.(event)
        // A prevented onCloseAutoFocus means "I will place focus myself".
        scope.deactivate(!event.defaultPrevented)
      }

      // One subscription over both inputs: the panel mounting, and the open
      // state. Both are read unconditionally, on the evaluation that collects
      // dependencies too - a short-circuiting getter
      // (`contentRef.value ? ctx.open : false`) never reads `ctx.open` while
      // the ref is still null, so the subscription would never hear about the
      // panel opening.
      const sync = (): void => {
        const mounted = !!contentRef.value
        const open = !!ctx.open
        if (mounted && open && !entered) {
          entered = true
          enter()
        } else if ((!mounted || !open) && entered) {
          entered = false
          leave()
        }
      }
      rt.subscribe(() => {
        const mounted = !!contentRef.value
        const open = !!ctx.open
        return mounted && open
      }, sync)
      sync()
    }

    const content = div({
      id: contentId,
      // A non-modal dialog: the role announces a layer the user entered, and
      // the absence of `aria-modal` says it is not the only thing on the page.
      role: 'dialog',
      ref: contentRef,
      // Focusable so it can hold focus (the scope focuses it when it has no
      // focusable child).
      tabIndex: -1,
      'data-state': () => (ctx?.open ? 'open' : 'closed'),
      'data-side': side,
      'data-align': align,
      hidden: () => !ctx?.open,
      class: props?.class,
      style: {
        position: 'absolute',
        margin: '0',
        ...placement(side, align),
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: props?.children ? [props.children()] : undefined
    })

    return withCleanup(content, () => {
      // Unconditional teardown: whatever state the signals are in, listeners
      // must not outlive the element.
      layer.deactivate()
      scope.deactivate(false)
    })
  }
  return com(component)
}

/**
 * The Popover parts.
 *
 * Exported as a set of parts rather than a single preset, matching its closest
 * sibling (`dialog`): a popover's content is arbitrary consumer markup, so the
 * panel has to be composable rather than filled in from a props object.
 */
export function createPopover(): {
  Root: (props?: PopoverRootProps) => Mountable<HTMLElement>
  Trigger: (
    props?: PopoverTriggerProps,
    getContext?: () => PopoverContext | undefined
  ) => Mountable<HTMLElement>
  Content: (
    props?: PopoverContentProps,
    getContext?: () => PopoverContext | undefined
  ) => Mountable<HTMLElement>
} {
  return {
    Root: createPopoverRoot(),
    Trigger: createPopoverTrigger(),
    Content: createPopoverContent()
  }
}

export const popover = createPopover()
