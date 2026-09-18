import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { text } from '@rasenjs/dom'
import { createLabel, label } from '@rasenjs/rota/components/label'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Label', () => {
  it('should render a label element', () => {
    const container = document.createElement('div')
    createLabel()()(container)

    expect(container.querySelector('label')).toBeTruthy()
  })

  it('should point at the control through `for`', () => {
    const container = document.createElement('div')
    createLabel()({ htmlFor: 'email' })(container)

    expect(container.querySelector('label')?.getAttribute('for')).toBe('email')
  })

  it('should apply custom class and style', () => {
    const container = document.createElement('div')
    createLabel()({ class: 'lbl', style: { fontWeight: '600' } })(container)

    const el = container.querySelector('label') as HTMLLabelElement
    expect(el.className).toContain('lbl')
    expect(el.style.fontWeight).toBe('600')
  })

  it('should render children', () => {
    const container = document.createElement('div')
    label({ htmlFor: 'x', children: () => text({ content: 'Email' }) })(container)

    expect(container.querySelector('label')?.textContent).toBe('Email')
  })

  it('should remove the label on unmount', () => {
    const container = document.createElement('div')
    const unmount = label()(container)
    expect(container.querySelector('label')).toBeTruthy()

    unmount?.()
    expect(container.querySelector('label')).toBeFalsy()
  })
})
