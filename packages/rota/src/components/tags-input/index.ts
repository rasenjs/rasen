/**
 * TagsInput - multi-tag input.
 *
 * Root + Input + Item + ItemText + ItemDelete composition. Composed on
 * @rasenjs/dom element factories: value and focus are runtime refs exposed
 * through getter-backed context properties, so items update reactively
 * instead of being patched attribute-by-attribute after every change.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, span, button, input as inputEl } from '@rasenjs/dom'

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
  children?: (
    getContext: () => TagsInputContext | undefined
  ) => Mountable<HTMLElement>
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
  children?: (
    getContext: () => TagsInputContext | undefined
  ) => Mountable<HTMLElement>
}

export interface TagsInputItemTextProps {
  class?: string
  style?: Record<string, string | number> | string
}

export interface TagsInputItemDeleteProps {
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
          rt.setValue(focused, next.length === 0 ? null : Math.max(0, next.length - 1))
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
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
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
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      const ctx = getContext?.()
      if (!ctx) return

      const delim = ctx.delimiter
      if (delim && delim !== 'Enter') {
        const parts = target.value.split(delim)
        if (parts.length > 1) {
          for (const part of parts) {
            const trimmed = part.trim()
            if (trimmed) ctx.addTag(trimmed)
          }
          target.value = ''
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const ctx = getContext?.()
      if (!ctx) return

      if (e.key === 'Enter') {
        e.preventDefault()
        const inputValue = (e.target as HTMLInputElement).value.trim()
        if (inputValue) {
          ctx.addTag(inputValue)
          ;(e.target as HTMLInputElement).value = ''
        }
        return
      }

      if (e.key === 'Backspace') {
        const inputValue = (e.target as HTMLInputElement).value
        if (inputValue === '' && ctx.value.length > 0) {
          e.preventDefault()
          ctx.setFocusedIndex(ctx.value.length - 1)
          const rootEl = (e.target as HTMLElement).closest('[role="listbox"]')
          if (rootEl) (rootEl as HTMLElement).focus()
        }
      }
    }

    const handlePaste = (e: ClipboardEvent) => {
      const ctx = getContext?.()
      if (!ctx) return
      if (!ctx.addOnPaste) return

      e.preventDefault()
      const pasted = e.clipboardData?.getData('text') ?? ''
      for (const tag of pasted.split(/[\s,;]+/)) {
        const trimmed = tag.trim()
        if (trimmed) ctx.addTag(trimmed)
      }
      ;(e.target as HTMLInputElement).value = ''
    }

    const handleBlur = (e: FocusEvent) => {
      const ctx = getContext?.()
      if (!ctx) return

      const target = e.target as HTMLInputElement
      const related = e.relatedTarget as HTMLElement | null
      const rootEl = target.closest('[role="listbox"]')
      if (related && rootEl && rootEl.contains(related)) return

      if (ctx.addOnBlur) {
        const inputValue = target.value.trim()
        if (inputValue) {
          ctx.addTag(inputValue)
          target.value = ''
        }
      }
    }

    return inputEl({
      type: 'text',
      placeholder: props?.placeholder,
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

    const ctx = getContext?.()
    const isSelected = (): boolean => ctx?.focusedIndex === props.index

    return span({
      role: 'option',
      'data-value': props.value,
      'data-index': String(props.index),
      'aria-selected': () => String(isSelected()),
      'data-state': () => (isSelected() ? 'selected' : 'unselected'),
      tabIndex: -1,
      class: props?.class,
      style: props?.style,
      children: [
        (el: HTMLElement) => {
          // Moving focus is an element-level effect: focus the item while it
          // is the selected one.
          const stop = ctx
            ? getReactiveRuntime().subscribe(
                () => ctx.focusedIndex,
                () => {
                  if (isSelected()) el.focus()
                }
              )
            : undefined
          if (isSelected()) el.focus()

          const unmount = props.children
            ? props.children(getContext ?? (() => undefined))(el, undefined)
            : undefined
          return () => {
            stop?.()
            unmount?.()
          }
        }
      ],
      onClick: () => ctx?.setFocusedIndex(props.index)
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
      style: props?.style
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
      children: [
        (el: HTMLElement) => {
          el.textContent = props?.children ?? '×'
          return undefined
        }
      ],
      onClick: (e: Event) => {
        e.stopPropagation()
        const current = getContext?.()
        if (!current) return
        const item = (e.target as HTMLElement).closest('[data-index]')
        if (!item) return
        const index = parseInt(item.getAttribute('data-index') ?? '-1', 10)
        if (index >= 0) current.removeTag(index)
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
 * TagsInput preset: root + input + items from the current value.
 *
 * Items are rendered from the value at mount; the input's own add/remove
 * path updates the value and the focused index, and `each`-style
 * reconciliation is intentionally left out for now (the parts above are
 * reactive, the preset's list is not).
 */
export function createTagsInput(): (
  props?: TagsInputProps
) => Mountable<HTMLElement> {
  const Root = createTagsInputRoot()
  const Input = createTagsInputInput()
  const Item = createTagsInputItem()
  const ItemText = createTagsInputItemText()
  const ItemDelete = createTagsInputItemDelete()

  const component = (props?: TagsInputProps) =>
    Root({
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
      children: (getContext) => (root: HTMLElement) => {
        const ctx = getContext()
        if (!ctx) return () => undefined

        const unmounts: (() => void)[] = []

        ctx.value.forEach((tag, index) => {
          const itemHost = document.createElement('span')
          const itemUnmount = Item(
            {
              value: tag,
              index,
              class: props?.itemClass,
              style: props?.itemStyle,
              children: (getCtx) => (item: HTMLElement) => {
                const textEl = ItemText(
                  {
                    class: props?.itemTextClass,
                    style: props?.itemTextStyle
                  },
                  getCtx
                )(item, undefined)
                if (typeof textEl === 'function') unmounts.push(textEl)

                const deleteEl = ItemDelete(
                  {
                    class: props?.itemDeleteClass,
                    style: props?.itemDeleteStyle,
                    children: props?.itemDeleteChildren
                  },
                  getCtx
                )(item, undefined)
                if (typeof deleteEl === 'function') unmounts.push(deleteEl)

                return undefined
              }
            },
            getContext
          )(itemHost, undefined)
          if (typeof itemUnmount === 'function') unmounts.push(itemUnmount)
          root.appendChild(itemHost)
        })

        const inputElHost = document.createElement('span')
        const inputUnmount = Input(
          {
            class: props?.inputClass,
            style: props?.inputStyle,
            placeholder: props?.inputPlaceholder
          },
          getContext
        )(inputElHost, undefined)
        if (typeof inputUnmount === 'function') unmounts.push(inputUnmount)
        root.appendChild(inputElHost)

        const handleKeyDown = (e: KeyboardEvent): void => {
          const current = getContext()
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
                root.querySelector('input')?.focus()
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
            root.querySelector('input')?.focus()
          }
        }

        root.addEventListener('keydown', handleKeyDown)
        unmounts.push(() => root.removeEventListener('keydown', handleKeyDown))

        return () => {
          for (const unmount of unmounts) unmount()
        }
      }
    })

  return com(component)
}

export const tagsInput = createTagsInput()
