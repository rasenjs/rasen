import { describe, it, expect, vi } from 'vitest'
import { compose } from '@rasenjs/rota/primitives/compose'

describe('@rasenjs/rota - compose', () => {
  it('should mount all components to the host', () => {
    const container = document.createElement('div')

    const comp1 = () => (host: HTMLElement) => {
      const el = document.createElement('span')
      el.id = 'comp1'
      host.appendChild(el)
      return () => el.remove()
    }

    const comp2 = () => (host: HTMLElement) => {
      const el = document.createElement('span')
      el.id = 'comp2'
      host.appendChild(el)
      return () => el.remove()
    }

    compose(comp1, comp2)()(container)

    expect(container.querySelector('#comp1')).toBeTruthy()
    expect(container.querySelector('#comp2')).toBeTruthy()
  })

  it('should call unmount for all components', () => {
    const container = document.createElement('div')
    const unmount1 = vi.fn()
    const unmount2 = vi.fn()

    const comp1 = () => (_host: HTMLElement) => unmount1
    const comp2 = () => (_host: HTMLElement) => unmount2

    const unmount = compose(comp1, comp2)()(container)
    unmount?.()

    expect(unmount1).toHaveBeenCalled()
    expect(unmount2).toHaveBeenCalled()
  })

  it('should work with a single component', () => {
    const container = document.createElement('div')

    const comp = () => (host: HTMLElement) => {
      const el = document.createElement('div')
      el.id = 'single'
      host.appendChild(el)
      return () => el.remove()
    }

    compose(comp)()(container)

    expect(container.querySelector('#single')).toBeTruthy()
  })

  it('should work with zero components', () => {
    const container = document.createElement('div')
    const unmount = compose()()(container)

    expect(container.children.length).toBe(0)
    expect(() => unmount?.()).not.toThrow()
  })

  it('should handle components that return undefined unmount', () => {
    const container = document.createElement('div')

    const comp = () => (_host: HTMLElement) => undefined

    const unmount = compose(comp)()(container)
    expect(() => unmount?.()).not.toThrow()
  })

  it('should mount components in order', () => {
    const container = document.createElement('div')
    const order: number[] = []

    const comp1 = () => (_host: HTMLElement) => {
      order.push(1)
      return () => {}
    }
    const comp2 = () => (_host: HTMLElement) => {
      order.push(2)
      return () => {}
    }
    const comp3 = () => (_host: HTMLElement) => {
      order.push(3)
      return () => {}
    }

    compose(comp1, comp2, comp3)()(container)

    expect(order).toEqual([1, 2, 3])
  })
})
