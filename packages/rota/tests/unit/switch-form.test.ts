/**
 * Switch: form participation.
 *
 * Same defect and same fix as Checkbox - the visible control is a `<button>`,
 * so the component renders a hidden native input once it is given a `name`.
 * The assertions go through `new FormData(form)` because that is the only way
 * to tell real participation from a `name` attribute that nothing reads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { switchControl } from '@rasenjs/rota'
import type { SwitchRootProps } from '@rasenjs/rota'

let form: HTMLFormElement
const mounted: Array<(() => void) | undefined> = []

beforeEach(() => {
  useReactiveRuntime()
  form = document.createElement('form')
  document.body.appendChild(form)
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount?.()
  form.remove()
})

function mount(props: SwitchRootProps = {}): void {
  mounted.push(switchControl(props)(form))
}

const nativeInput = (): HTMLInputElement | null =>
  form.querySelector<HTMLInputElement>('input[type="checkbox"]')

const button = (): HTMLButtonElement => form.querySelector('button')!

const submitted = (): FormDataEntryValue | null =>
  new FormData(form).get('notify')

describe('@rasenjs/rota - Switch form participation', () => {
  it('should render no native input without a name', () => {
    mount()

    expect(nativeInput()).toBeNull()
  })

  it('should submit its value when on', () => {
    mount({ name: 'notify', value: 'on', defaultChecked: true })

    expect(submitted()).toBe('on')
  })

  it('should submit nothing when off', () => {
    mount({ name: 'notify', value: 'on' })

    expect(submitted()).toBeNull()
  })

  it('should follow the state as the user toggles it', () => {
    mount({ name: 'notify', value: 'on' })
    expect(submitted()).toBeNull()

    button().click()
    expect(submitted()).toBe('on')

    button().click()
    expect(submitted()).toBeNull()
  })

  it('should use a native checkbox for a boolean value', () => {
    mount({ name: 'notify', value: 'on' })

    // The switch role describes how the control looks and is announced; the
    // value it carries is still an on/off checkbox as far as the form is
    // concerned.
    expect(nativeInput()?.type).toBe('checkbox')
  })

  it('should carry required to the browser', () => {
    mount({ name: 'notify', value: 'on', required: true })

    expect(nativeInput()?.required).toBe(true)
    expect(button().getAttribute('aria-required')).toBe('true')
  })

  it('should keep the native input hidden, out of the tab order and out of the a11y tree', () => {
    mount({ name: 'notify', value: 'on' })

    const input = nativeInput()!
    expect(input.tabIndex).toBe(-1)
    expect(input.getAttribute('aria-hidden')).toBe('true')
  })

  it('should not put name or value on the button', () => {
    mount({ name: 'notify', value: 'on' })

    const btn = button()
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.hasAttribute('name')).toBe(false)
    expect(btn.hasAttribute('value')).toBe(false)
  })

  it('should disable the native input with the control', () => {
    mount({ name: 'notify', value: 'on', disabled: true, defaultChecked: true })

    expect(nativeInput()?.disabled).toBe(true)
    expect(submitted()).toBeNull()
  })
})
