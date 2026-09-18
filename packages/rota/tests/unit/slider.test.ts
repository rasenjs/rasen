import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createSlider,
  createSliderRoot,
  createSliderTrack,
  createSliderRange,
  createSliderThumb,
  slider
} from '@rasenjs/rota/components/slider'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

afterEach(() => {
  document.body.innerHTML = ''
})

const mountSlider = (props: Parameters<ReturnType<typeof createSlider>>[0]) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  createSlider()(props)(container)
  return container
}

const thumbs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[role="slider"]')) as HTMLElement[]

const press = (el: HTMLElement, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

describe('@rasenjs/rota - Slider', () => {
  it('should render a group with a slider thumb', () => {
    const c = mountSlider({ defaultValue: [30] })

    expect(c.querySelector('[role="group"]')).toBeTruthy()
    const thumb = thumbs(c)[0]!
    expect(thumb.getAttribute('aria-valuemin')).toBe('0')
    expect(thumb.getAttribute('aria-valuemax')).toBe('100')
    expect(thumb.getAttribute('aria-valuenow')).toBe('30')
  })

  it('should step with the arrow keys', () => {
    const c = mountSlider({ defaultValue: [30], step: 5 })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')
    expect(thumb.getAttribute('aria-valuenow')).toBe('35')

    press(thumb, 'ArrowLeft')
    expect(thumb.getAttribute('aria-valuenow')).toBe('30')
  })

  it('should page by ten steps', () => {
    const c = mountSlider({ defaultValue: [50], step: 2 })
    const thumb = thumbs(c)[0]!

    press(thumb, 'PageUp')
    expect(thumb.getAttribute('aria-valuenow')).toBe('70')

    press(thumb, 'PageDown')
    expect(thumb.getAttribute('aria-valuenow')).toBe('50')
  })

  it('should jump to the ends with Home and End', () => {
    const c = mountSlider({ defaultValue: [40], min: 10, max: 60 })
    const thumb = thumbs(c)[0]!

    press(thumb, 'Home')
    expect(thumb.getAttribute('aria-valuenow')).toBe('10')

    press(thumb, 'End')
    expect(thumb.getAttribute('aria-valuenow')).toBe('60')
  })

  it('should clamp instead of running past the ends', () => {
    const c = mountSlider({ defaultValue: [99], min: 0, max: 100, step: 5 })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')
    expect(thumb.getAttribute('aria-valuenow')).toBe('100')
  })

  it('should snap to the step grid', () => {
    const c = mountSlider({ defaultValue: [0], step: 0.1 })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')
    // 0.30000000000000004 would be a floating point artifact.
    expect(thumb.getAttribute('aria-valuenow')).toBe('0.1')
  })

  it('should report changes and commits separately', () => {
    const changes: number[][] = []
    const commits: number[][] = []
    const c = mountSlider({
      defaultValue: [0],
      onValueChange: (next) => changes.push(next),
      onValueCommit: (next) => commits.push(next)
    })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')

    expect(changes).toEqual([[1]])
    expect(commits).toEqual([[1]])
  })

  it('should not change itself while controlled', () => {
    const changes: number[][] = []
    const c = mountSlider({
      value: [20],
      onValueChange: (next) => changes.push(next)
    })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')

    expect(changes).toEqual([[21]])
    expect(thumb.getAttribute('aria-valuenow')).toBe('20')
  })

  it('should ignore keys while disabled', () => {
    const changes: number[][] = []
    const c = mountSlider({
      defaultValue: [10],
      disabled: true,
      onValueChange: (next) => changes.push(next)
    })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')

    expect(changes).toEqual([])
    expect(thumb.tabIndex).toBe(-1)
    expect(thumb.getAttribute('data-disabled')).toBe('')
  })

  it('should follow the orientation for keys', () => {
    const c = mountSlider({
      defaultValue: [10],
      orientation: 'vertical'
    })
    const thumb = thumbs(c)[0]!

    press(thumb, 'ArrowRight')
    expect(thumb.getAttribute('aria-valuenow')).toBe('10')

    press(thumb, 'ArrowUp')
    expect(thumb.getAttribute('aria-valuenow')).toBe('11')
  })

  it('should position the range from the value', () => {
    const c = mountSlider({ defaultValue: [25], rangeClass: 'range' })

    const range = c.querySelector('.range') as HTMLElement
    // Left edge at 25%, right edge at 75% remains.
    expect(range.style.left).toBe('25%')
    expect(range.style.right).toBe('75%')
  })

  it('should render one thumb per value', () => {
    const c = mountSlider({ defaultValue: [20, 80], rangeClass: 'range' })

    expect(thumbs(c).length).toBe(2)
    expect(thumbs(c).map((el) => el.getAttribute('aria-valuenow'))).toEqual([
      '20',
      '80'
    ])
    // A range selection fills between the two values.
    const range = c.querySelector('.range') as HTMLElement
    expect(range.style.left).toBe('20%')
    expect(range.style.right).toBe('20%')
  })

  it('should expose the orientation on root and thumb', () => {
    const c = mountSlider({ defaultValue: [0], orientation: 'vertical' })

    expect(c.querySelector('[role="group"]')?.getAttribute('data-orientation')).toBe(
      'vertical'
    )
    expect(thumbs(c)[0]!.getAttribute('data-orientation')).toBe('vertical')
  })

  it('should mount from the parts with a shared context', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const Root = createSliderRoot()
    const Track = createSliderTrack()
    const Range = createSliderRange()
    const Thumb = createSliderThumb()

    Root({
      defaultValue: [5],
      max: 10,
      children: (getContext) => (host: HTMLElement) => {
        const unmount = Track(
          {
            children: (getCtx) => (el: HTMLElement) => {
              const stops: (() => void)[] = []
              const range = Range({}, getCtx)(el, undefined)
              if (typeof range === 'function') stops.push(range)
              const thumb = Thumb({ index: 0 }, getCtx)(el, undefined)
              if (typeof thumb === 'function') stops.push(thumb)
              return () => stops.forEach((stop) => stop())
            }
          },
          getContext
        )(host, undefined)
        return () => typeof unmount === 'function' && unmount()
      }
    })(container)

    expect(thumbs(container)[0]!.getAttribute('aria-valuemax')).toBe('10')
  })

  it('should remove everything on unmount', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = slider({ defaultValue: [10] })(container)
    expect(thumbs(container).length).toBe(1)

    unmount?.()
    expect(container.querySelectorAll('[role="slider"]').length).toBe(0)
  })
})
