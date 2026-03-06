import { com, type Mountable, type PropValue } from '@rasenjs/core'
import { watchProp, unref } from '../utils'

export interface TransitionGroupConfig<T> {
  items: PropValue<T[]>
  children: (item: T, index: number) => Mountable<HTMLElement>
  name?: string
  tag?: string
  onEnter?: (el: HTMLElement, index: number) => void
  onAfterEnter?: (el: HTMLElement, index: number) => void
  onLeave?: (el: HTMLElement, index: number) => void
  onAfterLeave?: (el: HTMLElement, index: number) => void
  onMove?: (el: HTMLElement, index: number) => void
}

interface ItemInstance {
  el: HTMLElement
  wrapper: HTMLElement
  unmount?: () => void
}

interface SimpleRect {
  left: number
  top: number
}

export const transitionGroup = com(<T extends object>(
  config: TransitionGroupConfig<T>
): Mountable<HTMLElement> => {
  return (host: HTMLElement) => {
    const { items, children, name = 'v', tag = 'div' } = config
    let instances = new Map<unknown, ItemInstance>()

    const container = document.createElement(tag)
    container.style.position = 'relative'
    host.appendChild(container)

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
      const duration = parseFloat(style.transitionDuration)
      
      if (duration === 0) {
        finished = true
        element.removeEventListener('transitionend', onEnd)
        done()
      }
    }

    const enter = (el: HTMLElement, index: number) => {
      config.onEnter?.(el, index)
      
      el.classList.add(`${name}-enter-from`, `${name}-enter-active`)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.remove(`${name}-enter-from`)
          el.classList.add(`${name}-enter-to`)

          endTransition(el, () => {
            el.classList.remove(`${name}-enter-active`, `${name}-enter-to`)
            config.onAfterEnter?.(el, index)
          })
        })
      })
    }

    const leave = (el: HTMLElement, index: number, done: () => void) => {
      config.onLeave?.(el, index)
      
      el.classList.add(`${name}-leave-from`, `${name}-leave-active`)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.remove(`${name}-leave-from`)
          el.classList.add(`${name}-leave-to`)

          endTransition(el, () => {
            el.classList.remove(`${name}-leave-active`, `${name}-leave-to`)
            config.onAfterLeave?.(el, index)
            done()
          })
        })
      })
    }

    const getKey = (item: T, index: number): unknown => {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        return (item as { id: unknown }).id
      }
      if (typeof item === 'object' && item !== null) {
        return item
      }
      return index
    }

    const updateList = () => {
      const currentItems = unref(items)
      
      // Step 1: 记录所有现有元素的位置
      const prevPositions = new Map<unknown, SimpleRect>()
      instances.forEach((instance, key) => {
        const rect = instance.el.getBoundingClientRect()
        prevPositions.set(key, { left: rect.left, top: rect.top })
      })
      
      const newKeys = new Set<unknown>()
      const keysToRemove = new Set<unknown>(instances.keys())
      const newItemsKeys: unknown[] = []
      
      // Step 2: 更新 DOM - 添加新元素，重新排序
      currentItems.forEach((item, index) => {
        const key = getKey(item, index)
        newKeys.add(key)
        keysToRemove.delete(key)
        
        if (instances.has(key)) {
          // 已存在的元素，可能需要移动位置
          const instance = instances.get(key)!
          // 将元素移到正确位置
          container.appendChild(instance.wrapper)
        } else {
          // 新元素
          newItemsKeys.push(key)
          const mountable = children(item, index)
          const wrapper = document.createElement(tag)
          wrapper.style.display = 'contents'
          container.appendChild(wrapper)
          
          const unmount = mountable(wrapper)
          const el = wrapper.firstElementChild as HTMLElement || wrapper
          
          const instance: ItemInstance = { el, wrapper, unmount }
          instances.set(key, instance)
        }
      })

      // Step 3: 移除不需要的元素
      keysToRemove.forEach(key => {
        const instance = instances.get(key)!
        const index = Array.from(instances.keys()).indexOf(key)
        leave(instance.el, index, () => {
          instance.unmount?.()
          instance.wrapper.remove()
          instances.delete(key)
        })
      })

      // Step 4: 对新元素应用 enter 动画
      newItemsKeys.forEach(key => {
        const instance = instances.get(key)
        if (instance) {
          const index = currentItems.findIndex(item => getKey(item, 0) === key)
          enter(instance.el, index)
        }
      })

      // Step 5: FLIP 动画 - 在下一帧应用移动动画（只对已存在的元素）
      requestAnimationFrame(() => {
        instances.forEach((instance, key) => {
          // 跳过新元素
          if (newItemsKeys.includes(key)) return
          
          const prevRect = prevPositions.get(key)
          if (!prevRect) return
          
          const newRect = instance.el.getBoundingClientRect()
          const dx = prevRect.left - newRect.left
          const dy = prevRect.top - newRect.top
          
          if (dx !== 0 || dy !== 0) {
            // FLIP: Invert
            instance.el.style.transform = `translate(${dx}px, ${dy}px)`
            instance.el.style.transition = 'none'
            
            // FLIP: Play
            requestAnimationFrame(() => {
              instance.el.style.transition = 'transform 0.3s ease'
              instance.el.style.transform = ''
              
              const index = Array.from(instances.keys()).indexOf(key)
              if (index !== -1) {
                config.onMove?.(instance.el, index)
              }
            })
          }
        })
      })
    }

    watchProp(() => unref(items), updateList, false)

    return () => {
      instances.forEach(instance => {
        instance.unmount?.()
      })
      instances.clear()
      container.remove()
    }
  }
})

export const listFade = {
  name: 'list-fade'
}

export const listSlide = {
  name: 'list-slide'
}
