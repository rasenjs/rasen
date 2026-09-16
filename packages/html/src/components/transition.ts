/**
 * HTML transition component for SSR
 * 
 * In SSR, transitions are not animated - we simply render the content
 * when the condition is true, and render nothing when false.
 * This maintains API compatibility with the DOM version.
 */
import { type Mountable, type PropValue, com, toValue } from '@rasenjs/core'
import type { SSRNode } from '../host-hooks'

export interface TransitionConfig {
  when: PropValue<boolean>
  children: () => Mountable<SSRNode>
  name?: string
  appear?: boolean
  onEnter?: (el: unknown) => void
  onAfterEnter?: (el: unknown) => void
  onLeave?: (el: unknown) => void
  onAfterLeave?: (el: unknown) => void
}

export const transition = com((config: TransitionConfig): Mountable<SSRNode> => {
  const { when, children } = config
  
  return (host: SSRNode) => {
    let currentUnmount: (() => void) | undefined
    
    const render = (visible: boolean) => {
      if (currentUnmount) {
        currentUnmount()
        currentUnmount = undefined
      }
      
      if (visible) {
        const mountable = children()
        currentUnmount = mountable(host, undefined)
      }
    }
    
    // toValue 统一处理 boolean / getter / Ref
    const value = toValue(when)
    
    render(value)
    
    return () => {
      if (currentUnmount) {
        currentUnmount()
      }
    }
  }
})

export const fade = {
  name: 'fade'
}

export const slide = {
  name: 'slide'
}

export const scale = {
  name: 'scale'
}
