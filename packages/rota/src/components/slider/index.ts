/**
 * Slider - pick one or more values from a range.
 *
 * Root + Track + Range + Thumb, Reka-style. Keyboard support is complete on
 * the thumb (arrows, Page Up/Down, Home/End), and dragging works with pointer
 * events: the thumb captures the pointer, and the value is derived from the
 * track rectangle — a read-only measurement, not DOM manipulation.
 *
 * The range's position is written as inline styles because that *is* the
 * mechanism, exactly like AspectRatio's padding. Everything cosmetic (colour,
 * thickness, thumb look) is yours through `data-*` and `data-orientation`.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, span } from '@rasenjs/dom'
import { readProp } from '../../internal/props'
import { toValue } from '@rasenjs/core'
import { createElementRef, type ElementRef } from '../../internal/element-ref'

export type SliderOrientation = 'horizontal' | 'vertical'

/** Functional: fills the track box so the consumer's colour shows through. */
const FILL_STYLE = {
  position: 'absolute',
  width: '100%',
  height: '100%'
} as const

export interface SliderContext {
  orientation: SliderOrientation
  disabled: boolean
  min: number
  max: number
  step: number
  /** Reactive snapshot of the values, one per thumb. */
  value: number[]
  /** Clamp and step-snap a raw value. */
  normalize: (raw: number) => number
  /** Percentage of a value within [min, max]. */
  percent: (value: number) => number
  setValueAt: (index: number, next: number) => void
  /** Called when a drag or key sequence ends. */
  commit: () => void
  /** Track element cell — drag math reads its rectangle. */
  trackRef: ElementRef<HTMLDivElement>
  thumbRef: (index: number) => ElementRef<HTMLButtonElement>
  /** Move a thumb by steps (used by the keyboard). */
  stepBy: (index: number, steps: number) => void
  /** Jump a thumb to the ends (Home / End). */
  jumpTo: (index: number, edge: 'min' | 'max') => void
  registerThumb: (index: number) => void
}

export interface SliderRootProps {
  value?: PropValue<number[]>
  defaultValue?: PropValue<number[]>
  min?: PropValue<number>
  max?: PropValue<number>
  step?: PropValue<number>
  orientation?: SliderOrientation
  disabled?: PropValue<boolean>
  /** Ids applied to the thumbs, in order. */
  name?: string
  onValueChange?: (value: number[]) => void
  onValueCommit?: (value: number[]) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => SliderContext | undefined
  ) => Mountable<HTMLElement>
}

export interface SliderTrackProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => SliderContext | undefined
  ) => Mountable<HTMLElement>
}

export interface SliderRangeProps {
  class?: string
  style?: Record<string, string | number> | string
}

export interface SliderThumbProps {
  /** Which value of the array this thumb drives. */
  index?: number
  class?: string
  style?: Record<string, string | number> | string
  /** Accessible name; defaults to the value. */
  label?: string
  children?: () => Mountable<HTMLElement>
}

/**
 * Create the Slider Root component.
 */
export function createSliderRoot(): (
  props?: SliderRootProps
) => Mountable<HTMLElement> {
  const component = (props?: SliderRootProps) => {
    const rt = getReactiveRuntime()

    const orientation = props?.orientation ?? 'horizontal'
    const min = (): number => readProp(props?.min, 0)
    const max = (): number => readProp(props?.max, 100)
    const step = (): number => readProp(props?.step, 1)
    const isDisabled = (): boolean => readProp(props?.disabled, false)

    const isControlled = props?.value !== undefined
    const initial = readProp(props?.defaultValue, [min()])
    const internal = rt.ref<number[]>([...initial])
    const current = (): number[] =>
      isControlled ? readProp(props?.value, []) : rt.unref(internal)

    const clamp = (raw: number): number =>
      Math.min(Math.max(raw, min()), max())
    const normalize = (raw: number): number => {
      const base = min()
      const stride = step()
      const snapped = Math.round((raw - base) / stride) * stride + base
      // Floating point: 0.1 steps produce 0.30000000000000004 otherwise.
      return clamp(Number(snapped.toFixed(10)))
    }

    const percent = (value: number): number => {
      const lowest = min()
      const highest = max()
      return highest === lowest ? 0 : ((value - lowest) / (highest - lowest)) * 100
    }

    const trackRef = createElementRef<HTMLDivElement>(rt)
    const thumbRefs = new Map<number, ElementRef<HTMLButtonElement>>()

    const thumbRef = (index: number): ElementRef<HTMLButtonElement> => {
      let ref = thumbRefs.get(index)
      if (!ref) {
        ref = createElementRef<HTMLButtonElement>(rt)
        thumbRefs.set(index, ref)
      }
      return ref
    }

    const write = (next: number[], commit: boolean): void => {
      if (!isControlled) {
        rt.setValue(internal, next)
      }
      props?.onValueChange?.(next)
      if (commit) props?.onValueCommit?.(next)
    }

    const setValueAt = (index: number, next: number): void => {
      const value = [...current()]
      if (index < 0 || index >= value.length) return
      const normalized = normalize(next)
      if (value[index] === normalized) return
      value[index] = normalized
      write(value, false)
    }

    const stepBy = (index: number, steps: number): void => {
      const value = current()
      setValueAt(index, (value[index] ?? min()) + steps * step())
    }

    const jumpTo = (index: number, edge: 'min' | 'max'): void => {
      setValueAt(index, edge === 'min' ? min() : max())
    }

    const commit = (): void => {
      props?.onValueCommit?.([...current()])
    }

    const context: SliderContext = {
      orientation,
      get disabled() {
        return isDisabled()
      },
      get min() {
        return min()
      },
      get max() {
        return max()
      },
      get step() {
        return step()
      },
      get value() {
        return current()
      },
      normalize,
      percent,
      setValueAt,
      commit,
      trackRef,
      thumbRef,
      stepBy,
      jumpTo,
      registerThumb: () => {}
    }
    const getContext = (): SliderContext => context

    return div({
      role: 'group',
      'data-orientation': orientation,
      'data-disabled': () => (isDisabled() ? '' : undefined),
      'aria-disabled': () => (isDisabled() ? 'true' : undefined),
      class: props?.class,
      // The track fills the root box, so these are the mechanism.
      style: {
        position: 'relative',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Slider Track component.
 */
export function createSliderTrack(): (
  props?: SliderTrackProps,
  getContext?: () => SliderContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: SliderTrackProps,
    getContext?: () => SliderContext | undefined
  ) => {
    const ctx = getContext?.()

    return div({
      ref: ctx?.trackRef,
      'data-orientation': ctx?.orientation,
      class: props?.class,
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: props?.children
        ? [props.children(getContext ?? (() => undefined))]
        : undefined
    })
  }
  return com(component)
}

/**
 * Create the Slider Range component (the filled part of the track).
 */
export function createSliderRange(): (
  props?: SliderRangeProps,
  getContext?: () => SliderContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: SliderRangeProps,
    getContext?: () => SliderContext | undefined
  ) => {
    const ctx = getContext?.()
    const orientation = ctx?.orientation ?? 'horizontal'

    const edges = (): Record<string, string> => {
      const values = ctx?.value ?? []
      const min = ctx?.percent(Math.min(...values)) ?? 0
      const max = ctx?.percent(Math.max(...values)) ?? 0
      return orientation === 'horizontal'
        ? { left: `${min}%`, right: `${100 - max}%` }
        : { bottom: `${min}%`, top: `${100 - max}%` }
    }

    const bind = (key: 'left' | 'right' | 'top' | 'bottom'): (() => string) => () =>
      edges()[key] ?? '0%'

    return div({
      'data-orientation': orientation,
      style: {
        ...FILL_STYLE,
        left: bind('left'),
        right: bind('right'),
        top: bind('top'),
        bottom: bind('bottom'),
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      class: props?.class
    })
  }
  return com(component)
}

/**
 * Create the Slider Thumb component.
 */
export function createSliderThumb(): (
  props?: SliderThumbProps,
  getContext?: () => SliderContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: SliderThumbProps,
    getContext?: () => SliderContext | undefined
  ) => {
    const ctx = getContext?.()
    const index = props?.index ?? 0
    const disabledNow = (): boolean => ctx?.disabled ?? false

    const valueAt = (): number => (ctx?.value ?? [])[index] ?? ctx?.min ?? 0

    const axis = (): 'vertical' | 'horizontal' =>
      (ctx?.orientation ?? 'horizontal') === 'vertical' ? 'vertical' : 'horizontal'

    /** Value implied by a pointer position over the track. */
    const valueFromPointer = (clientX: number, clientY: number): number | null => {
      const track = ctx?.trackRef.value
      if (!ctx || !track) return null
      const rect = track.getBoundingClientRect()
      const ratio =
        axis() === 'horizontal'
          ? rect.width === 0
            ? 0
            : (clientX - rect.left) / rect.width
          : rect.height === 0
            ? 0
            : (rect.bottom - clientY) / rect.height
      const clamped = Math.min(Math.max(ratio, 0), 1)
      return ctx.min + clamped * (ctx.max - ctx.min)
    }

    const handleKeyDown = (e: Event): void => {
      const event = e as KeyboardEvent
      const current = getContext?.()
      if (!current || disabledNow()) return

      const vertical = axis() === 'vertical'
      const up = vertical ? 'ArrowUp' : 'ArrowRight'
      const down = vertical ? 'ArrowDown' : 'ArrowLeft'
      const page = 10

      switch (event.key) {
        case up:
          event.preventDefault()
          current.stepBy(index, 1)
          current.commit()
          break
        case down:
          event.preventDefault()
          current.stepBy(index, -1)
          current.commit()
          break
        case 'PageUp':
          event.preventDefault()
          current.stepBy(index, page)
          current.commit()
          break
        case 'PageDown':
          event.preventDefault()
          current.stepBy(index, -page)
          current.commit()
          break
        case 'Home':
          event.preventDefault()
          current.jumpTo(index, 'min')
          current.commit()
          break
        case 'End':
          event.preventDefault()
          current.jumpTo(index, 'max')
          current.commit()
          break
        default:
          break
      }
    }

    /** Pointer drag: capture on the thumb, follow the pointer on the track. */
    const handlePointerDown = (e: Event): void => {
      const event = e as PointerEvent
      const current = getContext?.()
      if (!current || disabledNow()) return
      const target = event.currentTarget as HTMLButtonElement
      target.setPointerCapture(event.pointerId)
      target.focus()

      const fromPointer = valueFromPointer(event.clientX, event.clientY)
      if (fromPointer !== null) current.setValueAt(index, fromPointer)
    }

    const handlePointerMove = (e: Event): void => {
      const event = e as PointerEvent
      const current = getContext?.()
      if (!current || disabledNow()) return
      const target = event.currentTarget as HTMLButtonElement
      if (!target.hasPointerCapture(event.pointerId)) return
      const fromPointer = valueFromPointer(event.clientX, event.clientY)
      if (fromPointer !== null) current.setValueAt(index, fromPointer)
    }

    const handlePointerUp = (e: Event): void => {
      const event = e as PointerEvent
      const current = getContext?.()
      if (!current) return
      const target = event.currentTarget as HTMLButtonElement
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId)
      }
      current.commit()
    }

    const percentNow = (): number => ctx?.percent(valueAt()) ?? 0

    return span({
      role: 'slider',
      tabIndex: () => (disabledNow() ? -1 : 0),
      ref: ctx?.thumbRef(index),
      'aria-valuemin': ctx?.min,
      'aria-valuemax': ctx?.max,
      'aria-valuenow': () => valueAt(),
      'aria-valuetext': () => props?.label,
      'aria-orientation': ctx?.orientation ?? 'horizontal',
      'aria-disabled': () => (disabledNow() ? 'true' : undefined),
      'data-orientation': ctx?.orientation ?? 'horizontal',
      'data-disabled': () => (disabledNow() ? '' : undefined),
      // Functional: the thumb is positioned along the track by this offset.
      style: {
        position: 'absolute',
        ...(axis() === 'horizontal'
          ? { left: () => `${percentNow()}%` }
          : { bottom: () => `${percentNow()}%` }),
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      class: props?.class,
      children: props?.children ? [props.children()] : undefined,
      onKeyDown: handleKeyDown,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    })
  }
  return com(component)
}

export type SliderProps = SliderRootProps & {
  trackClass?: string
  rangeClass?: string
  thumbClass?: string
}

/**
 * Slider preset: root + track + range + one thumb per value.
 */
export function createSlider(): (props?: SliderProps) => Mountable<HTMLElement> {
  const Root = createSliderRoot()
  const Track = createSliderTrack()
  const Range = createSliderRange()
  const Thumb = createSliderThumb()

  const component = (props?: SliderProps) => {
    const initial = props?.value ?? props?.defaultValue ?? [props?.min ?? 0]

    return Root({
      value: props?.value,
      defaultValue: props?.defaultValue,
      min: props?.min,
      max: props?.max,
      step: props?.step,
      orientation: props?.orientation,
      disabled: props?.disabled,
      name: props?.name,
      onValueChange: props?.onValueChange,
      onValueCommit: props?.onValueCommit,
      class: props?.class,
      style: props?.style,
      children: (getContext) => (host: HTMLElement) => {
        const track = Track(
          {
            class: props?.trackClass,
            children: (getCtx) => (el: HTMLElement) => {
              const inner: (() => void)[] = []

              const range = Range({ class: props?.rangeClass }, getCtx)(el, undefined)
              if (typeof range === 'function') inner.push(range)

              const count = Math.max(toValue(props?.value ?? initial).length, 1)
              for (let index = 0; index < count; index++) {
                const thumb = Thumb(
                  { index, class: props?.thumbClass },
                  getCtx
                )(el, undefined)
                if (typeof thumb === 'function') inner.push(thumb)
              }

              return () => {
                for (const stop of inner) stop()
              }
            }
          },
          getContext
        )(host, undefined)

        return () => {
          if (typeof track === 'function') track()
        }
      }
    })
  }

  return com(component)
}

export const slider = createSlider()
