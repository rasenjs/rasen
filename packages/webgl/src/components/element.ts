/**
 * Element component - base for all WebGL 2D components
 */

import { com, getReactiveRuntime, type Mountable } from '@rasenjs/core'
import {
  RenderContext,
  getRenderContext,
  hasRenderContext
} from '../render-context'
import type { Bounds } from '../types'

export interface ElementProps {
  /** Calculate component bounds */
  getBounds: () => Bounds
  /** Draw function */
  draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => void
  /** Collect reactive dependencies */
  deps: () => unknown[]
}

/**
 * Element component - base for all WebGL shapes
 * 
 * Handles:
 * - Registration with RenderContext
 * - Reactive dependency tracking
 * - Dirty region marking
 * - Cleanup
 */
export const element = com(
  (props: ElementProps): Mountable<WebGLRenderingContext | WebGL2RenderingContext> => {
    const { getBounds, draw, deps } = props

    return (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      // Auto-create RenderContext if not exists
      if (!hasRenderContext(gl)) {
        new RenderContext(gl)
      }

      const renderContext = getRenderContext(gl)
      let currentBounds: Bounds | null = null
      
      const drawFn = () => draw(gl)
      
      // Initialize bounds
      currentBounds = getBounds()
      
      // Register component
      const componentId = renderContext.register({
        bounds: () => currentBounds,
        draw: drawFn
      })
      
      // Mark initial dirty region
      renderContext.markDirty(currentBounds)
      
      // Watch for reactive changes - optimize: only update when deps actually change
      const runtime = getReactiveRuntime()
      let prevDeps: unknown[] = []
      
      const stopWatch = runtime.watch(
        deps,
        (newDeps) => {
          // Check if deps actually changed (avoid unnecessary getBounds calls)
          let changed = false
          if (!prevDeps || prevDeps.length !== newDeps.length) {
            changed = true
          } else {
            for (let i = 0; i < newDeps.length; i++) {
              if (prevDeps[i] !== newDeps[i]) {
                changed = true
                break
              }
            }
          }
          
          if (!changed) return
          prevDeps = [...newDeps]
          
          const newBounds = getBounds()
          
          // Mark old bounds dirty
          if (currentBounds) {
            renderContext.markDirty(currentBounds)
          }
          
          // Update bounds
          currentBounds = newBounds
          
          // Mark new bounds dirty
          renderContext.markDirty(currentBounds)
        },
        { deep: true }
      )
      
      // Cleanup
      return () => {
        stopWatch()
        renderContext.unregister(componentId)
      }
    }
  }
)
