/**
 * Checkbox: form participation.
 *
 * The control the user sees is a `<button>`, and a button submits nothing on
 * its own. The component renders a hidden native input when given a `name`,
 * and these assertions read the value back through `new FormData(form)` rather
 * than looking for a `name` attribute - because the defect worth preventing is
 * precisely "an attribute that looks like form participation but never reaches
 * the form", which is what this component had before: `name`/`value` set on a
 * `type="button"` (never a submitter) and `required` mapped only to
 * `aria-required` (announced to a screen reader, enforced by nothing).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { checkbox } from '@rasenjs/rota'
import type { CheckboxRootProps } from '@rasenjs/rota'

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

function mount(props: CheckboxRootProps = {}): void {
  mounted.push(checkbox(props)(form))
}

const nativeInput = (): HTMLInputElement | null =>
  form.querySelector<HTMLInputElement>('input[type="checkbox"]')

const button = (): HTMLButtonElement => form.querySelector('button')!

const submitted = (): FormDataEntryValue | null =>
  new FormData(form).get('agree')

describe('@rasenjs/rota - Checkbox form participation', () => {
  it('should render no native input without a name', () => {
    mount()

    // Without a `name` there is nothing to submit, so there is nothing to hide.
    expect(nativeInput()).toBeNull()
  })

  it('should submit its value when checked', () => {
    mount({ name: 'agree', value: 'yes', defaultChecked: true })

    expect(submitted()).toBe('yes')
  })

  it('should submit nothing when unchecked', () => {
    mount({ name: 'agree', value: 'yes' })

    // An unchecked checkbox is simply absent from the form data: that is how a
    // form distinguishes "no" from "not asked".
    expect(submitted()).toBeNull()
  })

  it('should follow the state as the user toggles it', () => {
    mount({ name: 'agree', value: 'yes' })
    expect(submitted()).toBeNull()

    button().click()
    expect(submitted()).toBe('yes')

    button().click()
    expect(submitted()).toBeNull()
  })

  it('should carry the indeterminate state as unchecked', () => {
    mount({ name: 'agree', value: 'yes', defaultChecked: 'indeterminate' })

    // `mixed` is a presentation of partial selection, not a submitted value;
    // a form has no third state.
    expect(submitted()).toBeNull()
  })

  it('should carry required to the browser, not just to aria', () => {
    mount({ name: 'agree', value: 'yes', required: true })

    expect(nativeInput()?.required).toBe(true)
    // The accessible requirement stays too - it is what a screen reader reads
    // out before the browser refuses the submission.
    expect(button().getAttribute('aria-required')).toBe('true')
  })

  it('should keep the native input hidden, out of the tab order and out of the a11y tree', () => {
    mount({ name: 'agree', value: 'yes' })

    const input = nativeInput()!
    // The button is the control the user sees and operates; the input exists
    // only so the form can be submitted.
    expect(input.tabIndex).toBe(-1)
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.style.position).toBe('absolute')
    expect(input.style.width).toBe('1px')
  })

  it('should not put name or value on the button', () => {
    mount({ name: 'agree', value: 'yes' })

    // They used to live here, where they were dead weight: a `type="button"`
    // is never a submitter, so nothing ever read them.
    const btn = button()
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.hasAttribute('name')).toBe(false)
    expect(btn.hasAttribute('value')).toBe(false)
  })

  it('should disable the native input with the control', () => {
    mount({ name: 'agree', value: 'yes', disabled: true, defaultChecked: true })

    // A disabled control must not submit either.
    expect(nativeInput()?.disabled).toBe(true)
    expect(submitted()).toBeNull()
  })
})
