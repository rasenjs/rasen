/**
 * TagsInput - multi-tag input.
 *
 * Root + Input + Item + ItemText + ItemDelete composition. Composed on
 * @rasenjs/dom element factories and `com`, with no direct DOM work:
 *
 * - element access goes through `ref` cells exposed by the context
 *   (rootRef / inputRef), never through querySelector/closest
 * - each part carries its own index; the delete button is told which tag it
 *   belongs to instead of walking up the DOM looking for `[data-index]`
 * - events are bound as props (onKeyDown/onPaste/onBlur/onClick)
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, span, button, input as inputEl, text } from '@rasenjs/dom'
import { createElementRef, type ElementRef } from '../../internal/element-ref'

export interface TagsInputContext {
  /** Reactive reads (property getters; read them inside bindings). */
  value: string[]
  disabled: boolean
  max: number | undefined
  delimiter: string | RegExp
  addOnPaste: boolean
  addOnBlur: boolean
  allowCustomValue: boolean
  focusedIndex: number | null
  /** Element cells for parts that need to move or test focus. */
  rootRef: ElementRef<HTMLDivElement>
  inputRef: ElementRef<HTMLInputElement>
  updateValue: (value: string[]) => void
  setFocusedIndex: (index: number | null) => void
  addTag: (tag: string) => void
  removeTag: (index: number) => void
}

export interface TagsInputRootProps {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  max?: number
  delimiter?: string | RegExp
  addOnPaste?: boolean
  addOnBlur?: boolean
  allowCustomValue?: boolean
  disabled?: boolean
  class?: string
  style?: Record<string, string | number> | string
  /** Keyboard handling for the listbox (escape, arrows, delete). */
  onKeyDown?: (event: KeyboardEvent) => void
  /** May return several parts: they become siblings inside the listbox. */
  children?: (
    getContext: () => TagsInputContext | undefined
  ) => Mountable<HTMLElement> | Mountable<HTMLElement>[]
}

export interface TagsInputInputProps {
  placeholder?: string
  class?: string
  style?: Record<string, string | number> | string
}

export interface TagsInputItemProps {
  value: string
  index: number
  class?: string
  style?: Record<string, string | number> | string
  /** Receives the context and this item's index. */
  children?: (
    getContext: () => TagsInputContext | undefined,
    index: number
  ) => Mountable<HTMLElement>
}

export interface TagsInputItemTextProps {
  class?: string
  style?: Record<string, string | number> | string
  /** Label content — usually `() => text({ content: tag })`. */
  children?: () => Mountable<HTMLElement>
}

export interface TagsInputItemDeleteProps {
  /** Index of the tag this button removes. */
  index?: number
  class?: string
  style?: Record<string, string | number> | string
  children?: string
}

/**
 * Create the TagsInput Root component.
 */
export function createTagsInputRoot(): (
  props?: TagsInputRootProps
) => Mountable<HTMLElement> {
  const component = (props?: TagsInputRootProps) => {
    const rt = getReactiveRuntime()

    const disabled = props?.disabled ?? false
    const max = props?.max
    const delimiter = props?.delimiter ?? 'Enter'
    const addOnPaste = props?.addOnPaste ?? false
    const addOnBlur = props?.addOnBlur ?? false
    const allowCustomValue = props?.allowCustomValue ?? true

    const isControlled = props?.value !== undefined
    const internalValue = rt.ref<string[]>(
      props?.value ?? props?.defaultValue ?? []
    )
    const focused = rt.ref<number | null>(null)
    const rootRef = createElementRef<HTMLDivElement>(rt)
    const inputRef = createElementRef<HTMLInputElement>(rt)

    const currentValue = (): string[] =>
      isControlled ? (props?.value ?? []) : rt.unref(internalValue)

    const updateValue = (newValue: string[]): void => {
      if (!isControlled) {
        rt.setValue(internalValue, newValue)
      }
      props?.onValueChange?.(newValue)
    }

    const addTag = (tag: string): void => {
      const trimmed = tag.trim()
      if (!trimmed || disabled) return
      const value = currentValue()
      if (max !== undefined && value.length >= max) return
      if (!allowCustomValue) return
      updateValue([...value, trimmed])
    }

    const removeTag = (index: number): void => {
      if (disabled) return
      const value = currentValue()
      if (index < 0 || index >= value.length) return
      const next = [...value]
      next.splice(index, 1)
      updateValue(next)

      const focusedIndex = rt.unref(focused)
      if (focusedIndex !== null) {
        if (index < focusedIndex) {
          rt.setValue(focused, focusedIndex - 1)
        } else if (index === focusedIndex) {
          rt.setValue(
            focused,
            next.length === 0 ? null : Math.max(0, next.length - 1)
          )
        }
      }
    }

    const context: TagsInputContext = {
      get value() {
        return currentValue()
      },
      get disabled() {
        return disabled
      },
      get max() {
        return max
      },
      get delimiter() {
        return delimiter
      },
      get addOnPaste() {
        return addOnPaste
      },
      get addOnBlur() {
        return addOnBlur
      },
      get allowCustomValue() {
        return allowCustomValue
      },
      get focusedIndex() {
        return rt.unref(focused)
      },
      rootRef,
      inputRef,
      updateValue,
      setFocusedIndex: (index) => rt.setValue(focused, index),
      addTag,
      removeTag
    }
    const getContext = (): TagsInputContext => context

    return div({
      role: 'listbox',
      'aria-label': 'Tags',
      'aria-multiselectable': 'true',
      'aria-disabled': disabled ? 'true' : undefined,
      'data-disabled': disabled ? '' : undefined,
      tabIndex: 0,
      ref: rootRef,
      class: props?.class,
      style: props?.style,
      onKeyDown: (e: Event) => props?.onKeyDown?.(e as KeyboardEvent),
      children: props?.children
        ? toArray(props.children(getContext))
        : undefined
    })
  }
  return com(component)
}

/** Normalize a children result into an array of mountables. */
function toArray(
  value: Mountable<HTMLElement> | Mountable<HTMLElement>[]
): Mountable<HTMLElement>[] {
  return Array.isArray(value) ? value : [value]
}

/**
 * Create the TagsInput Input component.
 */
export function createTagsInputInput(): (
  props?: TagsInputInputProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TagsInputInputProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    const ctx = getContext?.()

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      const current = getContext?.()
      if (!current) return

      const delim = current.delimiter
      if (delim && delim !== 'Enter') {
        const parts = target.value.split(delim)
        if (parts.length > 1) {
          for (const part of parts) {
            const trimmed = part.trim()
            if (trimmed) current.addTag(trimmed)
          }
          target.value = ''
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const current = getContext?.()
      if (!current) return
      const target = e.target as HTMLInputElement

      if (e.key === 'Enter') {
        e.preventDefault()
        const inputValue = target.value.trim()
        if (inputValue) {
          current.addTag(inputValue)
          target.value = ''
        }
        return
      }

      if (e.key === 'Backspace' && target.value === '' && current.value.length > 0) {
        e.preventDefault()
        current.setFocusedIndex(current.value.length - 1)
        // Move focus to the listbox through the ref the root exposed.
        current.rootRef?.value?.focus()
      }
    }

    const handlePaste = (e: ClipboardEvent) => {
      const current = getContext?.()
      if (!current) return
      if (!current.addOnPaste) return

      e.preventDefault()
      const pasted = e.clipboardData?.getData('text') ?? ''
      for (const tag of pasted.split(/[\s,;]+/)) {
        const trimmed = tag.trim()
        if (trimmed) current.addTag(trimmed)
      }
      ;(e.target as HTMLInputElement).value = ''
    }

    const handleBlur = (e: FocusEvent) => {
      const current = getContext?.()
      if (!current) return
      const target = e.target as HTMLInputElement
      const related = e.relatedTarget as HTMLElement | null

      // Focus moving inside the component (e.g. onto a delete button) must
      // not commit the pending tag — the root ref answers that question.
      if (related && current.rootRef?.value?.contains(related)) return

      if (current.addOnBlur) {
        const inputValue = target.value.trim()
        if (inputValue) {
          current.addTag(inputValue)
          target.value = ''
        }
      }
    }

    return inputEl({
      type: 'text',
      placeholder: props?.placeholder,
      ref: ctx?.inputRef,
      disabled: () => getContext?.()?.disabled ?? false,
      'data-disabled': () => (getContext?.()?.disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onPaste: handlePaste,
      onBlur: handleBlur
    })
  }
  return com(component)
}

/**
 * Create the TagsInput Item component.
 */
export function createTagsInputItem(): (
  props?: TagsInputItemProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TagsInputItemProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    if (!props?.value) {
      return () => undefined
    }

    const rt = getReactiveRuntime()
    const ctx = getContext?.()
    const itemRef = createElementRef<HTMLSpanElement>(rt)
    const index = props.index
    const isSelected = (): boolean => ctx?.focusedIndex === index

    // Focus follows selection. The effect reacts to both the index and the
    // element arriving through the ref, so it needs no DOM lookup.
    const focusIfSelected = (): void => {
      if (isSelected()) itemRef.value?.focus()
    }
    rt.subscribe(() => ctx?.focusedIndex ?? null, focusIfSelected)
    rt.subscribe(() => itemRef.value, focusIfSelected)

    return span({
      role: 'option',
      ref: itemRef,
      'data-value': props.value,
      'data-index': String(index),
      'aria-selected': () => String(isSelected()),
      'data-state': () => (isSelected() ? 'selected' : 'unselected'),
      tabIndex: -1,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [props.children(getContext ?? (() => undefined), index)]
        : undefined,
      onClick: () => ctx?.setFocusedIndex(index)
    })
  }
  return com(component)
}

/**
 * Create the TagsInput ItemText component.
 */
export function createTagsInputItemText(): (
  props?: TagsInputItemTextProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  const component = (props?: TagsInputItemTextProps) =>
    span({
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children()] : undefined
    })
  return com(component)
}

/**
 * Create the TagsInput ItemDelete component.
 */
export function createTagsInputItemDelete(): (
  props?: TagsInputItemDeleteProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: TagsInputItemDeleteProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      'aria-label': 'Remove tag',
      tabIndex: -1,
      disabled: () => ctx?.disabled ?? false,
      'data-disabled': () => (ctx?.disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      children: [text({ content: props?.children ?? '×' })],
      onClick: (e: Event) => {
        e.stopPropagation()
        if (props?.index === undefined) return
        getContext?.()?.removeTag(props.index)
      }
    })
  }
  return com(component)
}

export type TagsInputProps = TagsInputRootProps & {
  inputClass?: string
  inputStyle?: Record<string, string | number> | string
  inputPlaceholder?: string
  itemClass?: string
  itemStyle?: Record<string, string | number> | string
  itemTextClass?: string
  itemTextStyle?: Record<string, string | number> | string
  itemDeleteClass?: string
  itemDeleteStyle?: Record<string, string | number> | string
  itemDeleteChildren?: string
}

/**
 * TagsInput preset: root + input + one item per tag.
 */
export function createTagsInput(): (
  props?: TagsInputProps
) => Mountable<HTMLElement> {
  const Root = createTagsInputRoot()
  const Input = createTagsInputInput()
  const Item = createTagsInputItem()
  const ItemText = createTagsInputItemText()
  const ItemDelete = createTagsInputItemDelete()

  const component = (props?: TagsInputProps) => {
    // The context only exists once Root mounts; the keyboard handler and the
    // item list both read it through this closure.
    let ctx: TagsInputContext | undefined

    return Root({
      value: props?.value,
      defaultValue: props?.defaultValue,
      onValueChange: props?.onValueChange,
      max: props?.max,
      delimiter: props?.delimiter,
      addOnPaste: props?.addOnPaste,
      addOnBlur: props?.addOnBlur,
      allowCustomValue: props?.allowCustomValue,
      disabled: props?.disabled,
      class: props?.class,
      style: props?.style,
      onKeyDown: (e) => {
        props?.onKeyDown?.(e)
        const current = ctx
        if (!current) return

        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (current.focusedIndex === null) {
            current.setFocusedIndex(current.value.length - 1)
          } else if (current.focusedIndex > 0) {
            current.setFocusedIndex(current.focusedIndex - 1)
          }
          return
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (current.focusedIndex !== null) {
            if (current.focusedIndex < current.value.length - 1) {
              current.setFocusedIndex(current.focusedIndex + 1)
            } else {
              current.setFocusedIndex(null)
              current.inputRef?.value?.focus()
            }
          }
          return
        }

        if (
          (e.key === 'Delete' || e.key === 'Backspace') &&
          current.focusedIndex !== null
        ) {
          e.preventDefault()
          current.removeTag(current.focusedIndex)
          return
        }

        if (e.key === 'Escape') {
          e.preventDefault()
          current.setFocusedIndex(null)
          current.inputRef?.value?.focus()
        }
      },
      // Items and input are siblings inside the listbox: the children result
      // is an array of mountables, so nothing is created or appended here.
      children: (getContext) => {
        const context = getContext()
        ctx = context
        const items = (context?.value ?? []).map((tag, index) =>
          Item(
            {
              value: tag,
              index,
              class: props?.itemClass,
              style: props?.itemStyle,
              children: (getCtx, itemIndex) =>
                span({
                  children: [
                    ItemText(
                      {
                        class: props?.itemTextClass,
                        style: props?.itemTextStyle,
                        children: () => text({ content: tag })
                      },
                      getCtx
                    ),
                    ItemDelete(
                      {
                        index: itemIndex,
                        class: props?.itemDeleteClass,
                        style: props?.itemDeleteStyle,
                        children: props?.itemDeleteChildren
                      },
                      getCtx
                    )
                  ]
                })
            },
            getContext
          )
        )

        const input = Input(
          {
            class: props?.inputClass,
            style: props?.inputStyle,
            placeholder: props?.inputPlaceholder
          },
          getContext
        )

        return [...items, input]
      }
    })
  }

  return com(component)
}

export const tagsInput = createTagsInput()
