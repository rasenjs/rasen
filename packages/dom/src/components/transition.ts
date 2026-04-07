import { com, type Mountable, type PropValue } from '@rasenjs/core'
import { watchProp, unref } from '../utils'

export interface TransitionConfig {
  when: PropValue<boolean>
  children: () => Mountable<HTMLElement>
  name?: string
  appear?: boolean
  onEnter?: (el: HTMLElement) => void
  onAfterEnter?: (el: HTMLElement) => void
  onLeave?: (el: HTMLElement) => void
  onAfterLeave?: (el: HTMLElement) => void
}

export const transition = com((config: TransitionConfig): Mountable<HTMLElement> => {
  return (host: HTMLElement) => {
    const { when, children, name = 'v' } = config
    let el: HTMLElement | null = null
    let currentUnmount: (() => void) | undefined
    let isLeaving = false
    let pendingLeaveRAF: number | null = null

    const endTransition = (element: HTMLElement, done: () => void) => {
      let finished = false
      
      const onEnd = (e: TransitionEvent) => {
        if (e.target === element && !finished) {
          finished = true
          element.removeEventListener('transitionend', onEnd)
          done()
        }
      }
      element.addEventListener('transitionend', onEnd)

      const style = getComputedStyle(element)
      const hasTransition = style.transitionDuration !== '0s' || style.transitionProperty !== 'all'
      
      if (!hasTransition) {
        finished = true
        element.removeEventListener('transitionend', onEnd)
        done()
      }
    }

    const removeElement = () => {
      if (el) {
        el.remove()
        el = null
      }
      if (currentUnmount) {
        currentUnmount()
        currentUnmount = undefined
      }
      isLeaving = false
    }

    const enter = () => {
      if (el || isLeaving) return

      const mountable = children()
      currentUnmount = mountable(host)
      el = host.firstElementChild as HTMLElement | null

      if (!el) return

      config.onEnter?.(el)

      el.classList.add(`${name}-enter-from`, `${name}-enter-active`)

      requestAnimationFrame(() => {
        if (!el) return
        el.classList.remove(`${name}-enter-from`)
        el.classList.add(`${name}-enter-to`)

        endTransition(el, () => {
          if (!el) return
          el.classList.remove(`${name}-enter-active`, `${name}-enter-to`)
          config.onAfterEnter?.(el)
        })
      })
    }

    const leave = () => {
      if (!el || isLeaving) return

      isLeaving = true
      config.onLeave?.(el)

      el.classList.add(`${name}-leave-from`, `${name}-leave-active`)

      pendingLeaveRAF = requestAnimationFrame(() => {
        if (!el) return
        el.classList.remove(`${name}-leave-from`)
        el.classList.add(`${name}-leave-to`)

        endTransition(el, () => {
          if (!el) return
          el.classList.remove(`${name}-leave-active`, `${name}-leave-to`)
          config.onAfterLeave?.(el)
          removeElement()
        })
      })
    }

    watchProp(() => unref(when), (visible) => {
      if (visible) {
        enter()
      } else {
        leave()
      }
    }, false)

    return () => {
      if (pendingLeaveRAF !== null) {
        cancelAnimationFrame(pendingLeaveRAF)
        pendingLeaveRAF = null
      }
      removeElement()
    }
  }
})

export const fade = {
  name: 'fade',
  enterClass: 'opacity-0',
  enterActiveClass: 'transition-opacity duration-300',
  enterToClass: 'opacity-100',
  leaveClass: 'opacity-100',
  leaveActiveClass: 'transition-opacity duration-300',
  leaveToClass: 'opacity-0'
}

export const slide = {
  name: 'slide',
  enterClass: 'translate-x-full',
  enterActiveClass: 'transition-transform duration-300',
  enterToClass: 'translate-x-0',
  leaveClass: 'translate-x-0',
  leaveActiveClass: 'transition-transform duration-300',
  leaveToClass: '-translate-x-full'
}

export const scale = {
  name: 'scale',
  enterClass: 'scale-0 opacity-0',
  enterActiveClass: 'transition-all duration-300',
  enterToClass: 'scale-100 opacity-100',
  leaveClass: 'scale-100 opacity-100',
  leaveActiveClass: 'transition-all duration-300',
  leaveToClass: 'scale-0 opacity-0'
}
