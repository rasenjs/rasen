/**
 * TagsInput - 标签输入组件
 *
 * 多标签输入组件，支持添加、删除和编辑标签。
 * 采用 Root + Input + Item + ItemText + ItemDelete 组合模式。
 */
import type { Mountable } from '@rasenjs/core'

export interface TagsInputContext {
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
 * 创建 TagsInput Root 组件
 */
export function createTagsInputRoot(): (
  props?: TagsInputRootProps
) => Mountable<HTMLElement> {
  return (props?: TagsInputRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      root.setAttribute('role', 'listbox')
      root.setAttribute('aria-label', 'Tags')
      root.setAttribute('aria-multiselectable', 'true')
      root.tabIndex = 0

      const disabled = props?.disabled ?? false
      const max = props?.max
      const delimiter = props?.delimiter ?? 'Enter'
      const addOnPaste = props?.addOnPaste ?? false
      const addOnBlur = props?.addOnBlur ?? false
      const allowCustomValue = props?.allowCustomValue ?? true

      const isControlled = props?.value !== undefined
      let internalValue: string[] = props?.value ?? props?.defaultValue ?? []
      let focusedIndex: number | null = null

      const updateValue = (newValue: string[]) => {
        if (!isControlled) {
          internalValue = newValue
        }
        props?.onValueChange?.(newValue)
      }

      const setFocusedIndex = (index: number | null) => {
        focusedIndex = index
      }

      const addTag = (tag: string) => {
        const trimmedTag = tag.trim()
        if (!trimmedTag) return
        if (disabled) return
        const currentValue = isControlled ? (props?.value ?? []) : internalValue
        if (max !== undefined && currentValue.length >= max) return
        if (!allowCustomValue && !currentValue.includes(trimmedTag)) return

        const newValue = [...currentValue, trimmedTag]
        if (!isControlled) {
          internalValue = newValue
        }
        props?.onValueChange?.(newValue)
      }

      const removeTag = (index: number) => {
        if (disabled) return
        const currentValue = isControlled ? (props?.value ?? []) : internalValue
        const newValue = [...currentValue]
        newValue.splice(index, 1)
        if (!isControlled) {
          internalValue = newValue
        }
        props?.onValueChange?.(newValue)

        if (focusedIndex !== null) {
          if (index < focusedIndex) {
            focusedIndex--
          } else if (index === focusedIndex) {
            focusedIndex = Math.max(0, newValue.length - 1)
            if (newValue.length === 0) {
              focusedIndex = null
            }
          }
        }
      }

      const context: TagsInputContext = {
        get value() {
          return isControlled ? (props?.value ?? []) : internalValue
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
          return focusedIndex
        },
        updateValue,
        setFocusedIndex,
        addTag,
        removeTag
      }

      const getContext = (): TagsInputContext | undefined => context

      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      if (disabled) {
        root.setAttribute('aria-disabled', 'true')
        root.setAttribute('data-disabled', '')
      }

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext)(root)
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
 * 创建 TagsInput Input 组件
 */
export function createTagsInputInput(): (
  props?: TagsInputInputProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TagsInputInputProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const input = document.createElement('input')
      input.type = 'text'
      if (props?.placeholder) {
        input.placeholder = props.placeholder
      }

      const ctx = getContext?.()

      if (props?.class) input.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(input.style, props.style)
        }
      }

      if (ctx?.disabled) {
        input.disabled = true
        input.setAttribute('data-disabled', '')
      }

      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement
        const context = getContext?.()
        if (!context) return

        const inputValue = target.value
        const delim = context.delimiter

        if (delim && delim !== 'Enter') {
          const parts = inputValue.split(delim)
          if (parts.length > 1) {
            for (const part of parts) {
              const trimmed = part.trim()
              if (trimmed) {
                context.addTag(trimmed)
              }
            }
            target.value = ''
          }
        }
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        const context = getContext?.()
        if (!context) return

        if (e.key === 'Enter') {
          e.preventDefault()
          const inputValue = input.value.trim()
          if (inputValue) {
            context.addTag(inputValue)
            input.value = ''
          }
          return
        }

        if (e.key === 'Backspace') {
          const inputValue = input.value
          if (inputValue === '' && context.value.length > 0) {
            e.preventDefault()
            context.setFocusedIndex(context.value.length - 1)
            const rootEl = input.closest('[role="listbox"]')
            if (rootEl) {
              ;(rootEl as HTMLElement).focus()
            }
          }
          return
        }
      }

      const handlePaste = (e: ClipboardEvent) => {
        const context = getContext?.()
        if (!context) return

        if (context.addOnPaste) {
          e.preventDefault()
          const pastedText = e.clipboardData?.getData('text') ?? ''
          const tags = pastedText.split(/[\s,;]+/).filter((t) => t.trim())
          for (const tag of tags) {
            context.addTag(tag.trim())
          }
          input.value = ''
        }
      }

      const handleBlur = (e: FocusEvent) => {
        const context = getContext?.()
        if (!context) return

        const relatedTarget = e.relatedTarget as HTMLElement | null
        const rootEl = input.closest('[role="listbox"]')
        if (relatedTarget && rootEl && rootEl.contains(relatedTarget)) {
          return
        }

        if (context.addOnBlur) {
          const inputValue = input.value.trim()
          if (inputValue) {
            context.addTag(inputValue)
            input.value = ''
          }
        }
      }

      input.addEventListener('input', handleInput)
      input.addEventListener('keydown', handleKeyDown)
      input.addEventListener('paste', handlePaste)
      input.addEventListener('blur', handleBlur)

      host.appendChild(input)

      return () => {
        input.removeEventListener('input', handleInput)
        input.removeEventListener('keydown', handleKeyDown)
        input.removeEventListener('paste', handlePaste)
        input.removeEventListener('blur', handleBlur)
        input.remove()
      }
    }
  }
}

/**
 * 创建 TagsInput Item 组件
 */
export function createTagsInputItem(): (
  props?: TagsInputItemProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TagsInputItemProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    return (host: HTMLElement) => {
      if (!props?.value) {
        return () => {}
      }

      const item = document.createElement('span')
      item.setAttribute('role', 'option')
      item.setAttribute('data-value', props.value)
      item.setAttribute('data-index', String(props.index))
      item.tabIndex = -1

      if (props?.class) item.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(item.style, props.style)
        }
      }

      const updateState = () => {
        const context = getContext?.()
        const isSelected = context?.focusedIndex === props.index
        item.setAttribute('data-state', isSelected ? 'selected' : 'unselected')
        item.setAttribute('aria-selected', String(isSelected))
        if (isSelected) {
          item.focus()
        }
      }

      updateState()

      const handleClick = () => {
        const context = getContext?.()
        if (!context) return
        context.setFocusedIndex(props.index)
      }

      item.addEventListener('click', handleClick)

      let childUnmount: (() => void) | undefined
      if (props?.children && getContext) {
        childUnmount = props.children(getContext)(item)
      }

      host.appendChild(item)

      return () => {
        item.removeEventListener('click', handleClick)
        childUnmount?.()
        item.remove()
      }
    }
  }
}

/**
 * 创建 TagsInput ItemText 组件
 */
export function createTagsInputItemText(): (
  props?: TagsInputItemTextProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: TagsInputItemTextProps,
    _getContext?: () => TagsInputContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const text = document.createElement('span')

      if (props?.class) text.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(text.style, props.style)
        }
      }

      host.appendChild(text)

      return () => {
        text.remove()
      }
    }
  }
}

/**
 * 创建 TagsInput ItemDelete 组件
 */
export function createTagsInputItemDelete(): (
  props?: TagsInputItemDeleteProps,
  getContext?: () => TagsInputContext | undefined
) => Mountable<HTMLButtonElement> {
  return (
    props?: TagsInputItemDeleteProps,
    getContext?: () => TagsInputContext | undefined
  ) => {
    return (host: HTMLButtonElement) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', 'Remove tag')
      button.tabIndex = -1

      if (props?.children) {
        button.textContent = props.children
      } else {
        button.textContent = '×'
      }

      if (props?.class) button.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(button.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx?.disabled) {
        button.disabled = true
        button.setAttribute('data-disabled', '')
      }

      const handleClick = (e: Event) => {
        e.stopPropagation()
        const context = getContext?.()
        if (!context) return

        const item = button.closest('[data-index]')
        if (item) {
          const index = parseInt(item.getAttribute('data-index') ?? '-1', 10)
          if (index >= 0) {
            context.removeTag(index)
          }
        }
      }

      button.addEventListener('click', handleClick)

      host.appendChild(button)

      return () => {
        button.removeEventListener('click', handleClick)
        button.remove()
      }
    }
  }
}

/**
 * TagsInput 组合组件
 */
export function createTagsInput(): (
  props?: TagsInputRootProps & {
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
) => Mountable<HTMLElement> {
  const Root = createTagsInputRoot()
  const Input = createTagsInputInput()
  const Item = createTagsInputItem()
  const ItemText = createTagsInputItemText()
  const ItemDelete = createTagsInputItemDelete()

  return (props) => {
    return (host: HTMLElement) => {
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
        children: (getContext) => (root: HTMLElement) => {
          const unmounts: (() => void)[] = []
          const context = getContext()
          if (!context) {
            return () => {}
          }

          const items = context.value
          for (let i = 0; i < items.length; i++) {
            const itemHost = document.createElement('span')
            const itemUnmount = Item(
              {
                value: items[i],
                index: i,
                class: props?.itemClass,
                style: props?.itemStyle,
                children: (getCtx) => (item: HTMLElement) => {
                  const innerUnmounts: (() => void)[] = []

                  const textHost = document.createElement('span')
                  const textUnmount = ItemText(
                    {
                      class: props?.itemTextClass,
                      style: props?.itemTextStyle
                    },
                    getCtx
                  )(textHost)
                  textHost.textContent = items[i]
                  item.appendChild(textHost)
                  if (textUnmount) innerUnmounts.push(textUnmount)

                  const deleteHost = document.createElement('button')
                  const deleteUnmount = ItemDelete(
                    {
                      class: props?.itemDeleteClass,
                      style: props?.itemDeleteStyle,
                      children: props?.itemDeleteChildren
                    },
                    getCtx
                  )(deleteHost)
                  item.appendChild(deleteHost)
                  if (deleteUnmount) innerUnmounts.push(deleteUnmount)

                  return () => {
                    for (const unmount of innerUnmounts) {
                      unmount()
                    }
                  }
                }
              },
              getContext
            )(itemHost)
            root.appendChild(itemHost)
            if (itemUnmount) unmounts.push(itemUnmount)
          }

          const updateItemStates = () => {
            const focusedIdx = context.focusedIndex
            const itemEls = root.querySelectorAll('[role="option"]')
            itemEls.forEach((el, idx) => {
              const isSelected = idx === focusedIdx
              el.setAttribute(
                'data-state',
                isSelected ? 'selected' : 'unselected'
              )
              el.setAttribute('aria-selected', String(isSelected))
              if (isSelected) {
                ;(el as HTMLElement).focus()
              }
            })
          }

          const inputHost = document.createElement('div')
          const inputUnmount = Input(
            {
              class: props?.inputClass,
              style: props?.inputStyle,
              placeholder: props?.inputPlaceholder
            },
            getContext
          )(inputHost)
          root.appendChild(inputHost)
          if (inputUnmount) unmounts.push(inputUnmount)

          const originalSetFocusedIndex = context.setFocusedIndex
          context.setFocusedIndex = (index: number | null) => {
            originalSetFocusedIndex(index)
            updateItemStates()
          }

          const originalRemoveTag = context.removeTag
          context.removeTag = (index: number) => {
            originalRemoveTag(index)
            // Remove the item element from DOM
            const itemEls = root.querySelectorAll('[role="option"]')
            const itemEl = itemEls[index]
            if (itemEl) {
              itemEl.closest('[data-index]')?.remove()
            }
            // Update remaining item states
            updateItemStates()
          }

          const handleKeyDown = (e: KeyboardEvent) => {
            const ctx = getContext()
            if (!ctx) return

            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              if (ctx.focusedIndex === null) {
                ctx.setFocusedIndex(ctx.value.length - 1)
              } else if (ctx.focusedIndex > 0) {
                ctx.setFocusedIndex(ctx.focusedIndex - 1)
              }
              return
            }

            if (e.key === 'ArrowRight') {
              e.preventDefault()
              if (ctx.focusedIndex !== null) {
                if (ctx.focusedIndex < ctx.value.length - 1) {
                  ctx.setFocusedIndex(ctx.focusedIndex + 1)
                } else {
                  ctx.setFocusedIndex(null)
                  const input = root.querySelector('input')
                  input?.focus()
                }
              }
              return
            }

            if (e.key === 'Delete' && ctx.focusedIndex !== null) {
              e.preventDefault()
              ctx.removeTag(ctx.focusedIndex)
              return
            }

            if (e.key === 'Backspace' && ctx.focusedIndex !== null) {
              e.preventDefault()
              ctx.removeTag(ctx.focusedIndex)
              return
            }

            if (e.key === 'Escape') {
              e.preventDefault()
              ctx.setFocusedIndex(null)
              const input = root.querySelector('input')
              input?.focus()
              return
            }
          }

          root.addEventListener('keydown', handleKeyDown)
          unmounts.push(() =>
            root.removeEventListener('keydown', handleKeyDown)
          )

          return () => {
            for (const unmount of unmounts) {
              unmount()
            }
          }
        }
      })(host)
    }
  }
}

export const tagsInput = createTagsInput()
