import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createTagsInputRoot,
  createTagsInputInput,
  createTagsInputItem,
  createTagsInputItemText,
  createTagsInputItemDelete,
  createTagsInput,
  tagsInput
} from '@rasenjs/rota/components/tags-input'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - TagsInput', () => {
  describe('createTagsInputRoot', () => {
    it('should render a div element with role listbox', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('listbox')
    })

    it('should have aria-label="Tags"', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-label')).toBe('Tags')
    })

    it('should have aria-multiselectable="true"', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-multiselectable')).toBe('true')
    })

    it('should have tabindex="0"', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root()(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('tabindex')).toBe('0')
    })

    it('should have aria-disabled="true" when disabled', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('aria-disabled')).toBe('true')
    })

    it('should have data-disabled when disabled', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('div')
      expect(el?.getAttribute('data-disabled')).toBe('')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root({ class: 'my-tags-input' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-tags-input')
    })

    it('should apply custom style', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      Root({ style: { backgroundColor: 'red' } })(container)

      const el = container.querySelector('div')
      expect(el?.style.backgroundColor).toBe('red')
    })

    it('should provide context to children', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()

      Root({
        defaultValue: ['tag1', 'tag2'],
        children: (getContext) => (host) => {
          const ctx = getContext()
          expect(ctx?.value).toEqual(['tag1', 'tag2'])
          expect(ctx?.disabled).toBe(false)
          expect(ctx?.max).toBe(undefined)
          expect(ctx?.allowCustomValue).toBe(true)
          expect(ctx?.focusedIndex).toBe(null)

          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)

      expect(container.querySelector('span')).toBeTruthy()
    })

    it('should support controlled value', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()

      Root({
        value: ['controlled'],
        children: (getContext) => (host) => {
          const ctx = getContext()
          expect(ctx?.value).toEqual(['controlled'])
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should support default value', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()

      Root({
        defaultValue: ['default1', 'default2'],
        children: (getContext) => (host) => {
          const ctx = getContext()
          expect(ctx?.value).toEqual(['default1', 'default2'])
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should call onValueChange when addTag is called', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.addTag('new-tag')
          expect(onChangeMock).toHaveBeenCalledWith(['new-tag'])
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should call onValueChange when removeTag is called', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        defaultValue: ['tag1', 'tag2'],
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.removeTag(0)
          expect(onChangeMock).toHaveBeenCalledWith(['tag2'])
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should not add tag when disabled', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        disabled: true,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.addTag('new-tag')
          expect(onChangeMock).not.toHaveBeenCalled()
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should not add tag when max is reached', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        defaultValue: ['tag1', 'tag2'],
        max: 2,
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.addTag('tag3')
          expect(onChangeMock).not.toHaveBeenCalled()
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should not add empty tag', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.addTag('   ')
          expect(onChangeMock).not.toHaveBeenCalled()
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should trim tag before adding', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Root = createTagsInputRoot()

      Root({
        onValueChange: onChangeMock,
        children: (getContext) => (host) => {
          const ctx = getContext()
          ctx?.addTag('  tag  ')
          expect(onChangeMock).toHaveBeenCalledWith(['tag'])
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })

    it('should update focusedIndex with setFocusedIndex', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()

      Root({
        defaultValue: ['tag1', 'tag2', 'tag3'],
        children: (getContext) => (host) => {
          const ctx = getContext()
          expect(ctx?.focusedIndex).toBe(null)
          ctx?.setFocusedIndex(1)
          expect(ctx?.focusedIndex).toBe(1)
          const span = document.createElement('span')
          host.appendChild(span)
          return () => span.remove()
        }
      })(container)
    })
  })

  describe('createTagsInputInput', () => {
    it('should render an input element', () => {
      const container = document.createElement('div')
      const Input = createTagsInputInput()
      Input()(container)

      const el = container.querySelector('input')
      expect(el).toBeTruthy()
      expect(el?.type).toBe('text')
    })

    it('should have placeholder when provided', () => {
      const container = document.createElement('div')
      const Input = createTagsInputInput()
      Input({ placeholder: 'Add tags...' })(container)

      const el = container.querySelector('input')
      expect(el?.placeholder).toBe('Add tags...')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Input = createTagsInputInput()
      Input({ class: 'my-input' })(container)

      const el = container.querySelector('input')
      expect(el?.className).toContain('my-input')
    })

    it('should be disabled when context is disabled', () => {
      const container = document.createElement('div')
      const Input = createTagsInputInput()
      Input({}, () => ({
        value: [],
        disabled: true,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: () => {},
        setFocusedIndex: () => {},
        addTag: () => {},
        removeTag: () => {}
      }))(container)

      const el = container.querySelector('input')
      expect(el?.disabled).toBe(true)
      expect(el?.getAttribute('data-disabled')).toBe('')
    })

    it('should add tag on Enter key', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Input = createTagsInputInput()
      Input({}, () => ({
        value: [],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: onChangeMock,
        setFocusedIndex: () => {},
        addTag: (tag: string) => onChangeMock([tag]),
        removeTag: () => {}
      }))(container)

      const input = container.querySelector('input') as HTMLInputElement
      input.value = 'new-tag'
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      })
      input.dispatchEvent(event)

      expect(onChangeMock).toHaveBeenCalledWith(['new-tag'])
      expect(input.value).toBe('')
    })

    it('should not add empty tag on Enter key', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const Input = createTagsInputInput()
      Input({}, () => ({
        value: [],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: onChangeMock,
        setFocusedIndex: () => {},
        addTag: (tag: string) => onChangeMock([tag]),
        removeTag: () => {}
      }))(container)

      const input = container.querySelector('input') as HTMLInputElement
      input.value = ''
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      })
      input.dispatchEvent(event)

      expect(onChangeMock).not.toHaveBeenCalled()
    })

    it('should focus last tag on Backspace when input is empty', () => {
      const container = document.createElement('div')
      const root = document.createElement('div')
      root.setAttribute('role', 'listbox')
      root.tabIndex = 0
      container.appendChild(root)

      const setFocusedIndexMock = vi.fn()
      const Input = createTagsInputInput()
      Input({}, () => ({
        value: ['tag1', 'tag2'],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: () => {},
        setFocusedIndex: setFocusedIndexMock,
        addTag: () => {},
        removeTag: () => {}
      }))(root)

      const input = root.querySelector('input') as HTMLInputElement
      input.value = ''
      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true
      })
      input.dispatchEvent(event)

      expect(setFocusedIndexMock).toHaveBeenCalledWith(1)
    })
  })

  describe('createTagsInputItem', () => {
    it('should render a span element with role option', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 0 })(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('option')
    })

    it('should have data-value attribute', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'my-tag', index: 0 })(container)

      const el = container.querySelector('span')
      expect(el?.getAttribute('data-value')).toBe('my-tag')
    })

    it('should have data-index attribute', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 2 })(container)

      const el = container.querySelector('span')
      expect(el?.getAttribute('data-index')).toBe('2')
    })

    it('should have data-state="unselected" by default', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 0 })(container)

      const el = container.querySelector('span')
      expect(el?.getAttribute('data-state')).toBe('unselected')
    })

    it('should have data-state="selected" when focusedIndex matches', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 1 }, () => ({
        value: ['tag1', 'tag2'],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: 1,
        updateValue: () => {},
        setFocusedIndex: () => {},
        addTag: () => {},
        removeTag: () => {}
      }))(container)

      const el = container.querySelector('span')
      expect(el?.getAttribute('data-state')).toBe('selected')
      expect(el?.getAttribute('aria-selected')).toBe('true')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 0, class: 'my-item' })(container)

      const el = container.querySelector('span')
      expect(el?.className).toContain('my-item')
    })

    it('should set focusedIndex on click', () => {
      const container = document.createElement('div')
      const setFocusedIndexMock = vi.fn()
      const Item = createTagsInputItem()
      Item({ value: 'tag1', index: 2 }, () => ({
        value: ['tag1', 'tag2', 'tag3'],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: () => {},
        setFocusedIndex: setFocusedIndexMock,
        addTag: () => {},
        removeTag: () => {}
      }))(container)

      const el = container.querySelector('span')
      el?.click()

      expect(setFocusedIndexMock).toHaveBeenCalledWith(2)
    })
  })

  describe('createTagsInputItemText', () => {
    it('should render a span element', () => {
      const container = document.createElement('div')
      const ItemText = createTagsInputItemText()
      ItemText()(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const ItemText = createTagsInputItemText()
      ItemText({ class: 'my-text' })(container)

      const el = container.querySelector('span')
      expect(el?.className).toContain('my-text')
    })
  })

  describe('createTagsInputItemDelete', () => {
    it('should render a button element', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
      expect(el?.type).toBe('button')
    })

    it('should have aria-label="Remove tag"', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-label')).toBe('Remove tag')
    })

    it('should have × as default text content', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete()(container)

      const el = container.querySelector('button')
      expect(el?.textContent).toBe('×')
    })

    it('should accept custom text content', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete({ children: 'Remove' })(container)

      const el = container.querySelector('button')
      expect(el?.textContent).toBe('Remove')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete({ class: 'my-delete' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-delete')
    })

    it('should remove tag on click', () => {
      const container = document.createElement('div')
      const removeTagMock = vi.fn()
      const ItemDelete = createTagsInputItemDelete()

      const item = document.createElement('span')
      item.setAttribute('data-index', '1')
      container.appendChild(item)

      ItemDelete({}, () => ({
        value: ['tag1', 'tag2'],
        disabled: false,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: () => {},
        setFocusedIndex: () => {},
        addTag: () => {},
        removeTag: removeTagMock
      }))(item)

      const btn = item.querySelector('button')
      btn?.click()

      expect(removeTagMock).toHaveBeenCalledWith(1)
    })

    it('should be disabled when context is disabled', () => {
      const container = document.createElement('div')
      const ItemDelete = createTagsInputItemDelete()
      ItemDelete({}, () => ({
        value: ['tag1'],
        disabled: true,
        max: undefined,
        delimiter: 'Enter',
        addOnPaste: false,
        addOnBlur: false,
        allowCustomValue: true,
        focusedIndex: null,
        updateValue: () => {},
        setFocusedIndex: () => {},
        addTag: () => {},
        removeTag: () => {}
      }))(container)

      const el = container.querySelector('button')
      expect(el?.disabled).toBe(true)
      expect(el?.getAttribute('data-disabled')).toBe('')
    })
  })

  describe('createTagsInput (composed)', () => {
    it('should render root with input', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1'] })(container)

      expect(container.querySelector('[role="listbox"]')).toBeTruthy()
      expect(container.querySelector('input')).toBeTruthy()
    })

    it('should render items', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1', 'tag2'] })(container)

      const items = container.querySelectorAll('[role="option"]')
      expect(items.length).toBe(2)
    })

    it('should pass class to root', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ class: 'my-tags-input' })(container)

      const root = container.querySelector('[role="listbox"]')
      expect(root?.className).toContain('my-tags-input')
    })

    it('should pass inputClass to input', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ inputClass: 'my-input' })(container)

      const input = container.querySelector('input')
      expect(input?.className).toContain('my-input')
    })

    it('should pass itemClass to items', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1'], itemClass: 'my-item' })(container)

      const item = container.querySelector('[role="option"]')
      expect(item?.className).toContain('my-item')
    })

    it('should handle keyboard navigation (ArrowLeft)', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1', 'tag2', 'tag3'] })(container)

      const root = container.querySelector('[role="listbox"]') as HTMLElement
      root.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true
      })
      root.dispatchEvent(event)

      // Should focus last item
      const items = container.querySelectorAll('[role="option"]')
      expect(items[items.length - 1]?.getAttribute('data-state')).toBe(
        'selected'
      )
    })

    it('should handle keyboard navigation (ArrowRight)', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1', 'tag2'] })(container)

      const root = container.querySelector('[role="listbox"]') as HTMLElement
      root.focus()

      // First move left to select last item
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      )

      // Then move right
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )

      const items = container.querySelectorAll('[role="option"]')
      expect(items[items.length - 1]?.getAttribute('data-state')).toBe(
        'unselected'
      )
    })

    it('should handle Delete key to remove focused tag', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const TagsInput = createTagsInput()
      TagsInput({
        defaultValue: ['tag1', 'tag2'],
        onValueChange: onChangeMock
      })(container)

      const root = container.querySelector('[role="listbox"]') as HTMLElement
      root.focus()

      // ArrowLeft when no tag is focused selects the last tag (tag2)
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      )

      // Delete removes the focused tag (tag2)
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      )

      expect(onChangeMock).toHaveBeenCalledWith(['tag1'])
    })

    it('should handle Backspace key to remove focused tag', () => {
      const container = document.createElement('div')
      const onChangeMock = vi.fn()
      const TagsInput = createTagsInput()
      TagsInput({
        defaultValue: ['tag1', 'tag2'],
        onValueChange: onChangeMock
      })(container)

      const root = container.querySelector('[role="listbox"]') as HTMLElement
      root.focus()

      // Select last tag
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      )

      // Delete it with Backspace
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      )

      expect(onChangeMock).toHaveBeenCalledWith(['tag1'])
    })

    it('should handle Escape key to deselect and focus input', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      TagsInput({ defaultValue: ['tag1'] })(container)

      const root = container.querySelector('[role="listbox"]') as HTMLElement
      root.focus()

      // Select tag
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      )

      const input = container.querySelector('input') as HTMLInputElement
      const focusSpy = vi.spyOn(input, 'focus')

      // Escape
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )

      expect(focusSpy).toHaveBeenCalled()
    })
  })

  describe('tagsInput preset', () => {
    it('should render with default props', () => {
      const container = document.createElement('div')
      tagsInput()(container)

      const root = container.querySelector('[role="listbox"]')
      expect(root).toBeTruthy()
    })

    it('should render with value', () => {
      const container = document.createElement('div')
      tagsInput({ value: ['preset-tag'] })(container)

      const items = container.querySelectorAll('[role="option"]')
      expect(items.length).toBe(1)
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createTagsInputRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove composed component on unmount', () => {
      const container = document.createElement('div')
      const TagsInput = createTagsInput()
      const unmount = TagsInput({ defaultValue: ['tag1'] })(container)

      expect(container.querySelector('[role="listbox"]')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('[role="listbox"]')).toBeFalsy()
    })
  })
})
