/**
 * Element component - base for all WebGL 2D components
 */

import {
  com,
  getReactiveRuntime,
  getBatchContext,
  type Mountable
} from '@rasenjs/core'
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
          
          // Optimize: for position-only changes, reuse bounds object
          // Most common case: x/y changed but size unchanged
          if (currentBounds && newBounds && 
              currentBounds.width === newBounds.width && 
              currentBounds.height === newBounds.height) {
            // Just update position in existing object (no new allocation)
            const oldX = currentBounds.x
            const oldY = currentBounds.y
            currentBounds.x = newBounds.x
            currentBounds.y = newBounds.y
            
            // Mark union of old and new position
            const minX = Math.min(oldX, newBounds.x)
            const minY = Math.min(oldY, newBounds.y)
            const maxX = Math.max(oldX + currentBounds.width, newBounds.x + currentBounds.width)
            const maxY = Math.max(oldY + currentBounds.height, newBounds.y + currentBounds.height)
            
            // Reuse newBounds object for dirty region (avoid new allocation)
            newBounds.x = minX
            newBounds.y = minY
            newBounds.width = maxX - minX
            newBounds.height = maxY - minY
            renderContext.markDirty(newBounds)
          } else {
            // Size changed or first update - replace bounds
            renderContext.markDirty(newBounds || currentBounds || undefined)
            currentBounds = newBounds
          }
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
