/**
 * Element component - base for all WebGL 2D components
 */

import {
  com,
  getReactiveRuntime,
  type Mountable
} from '@rasenjs/core'
import {
  RenderContext,
  getRenderContext,
  hasRenderContext
} from '../render-context'
import type { GlNode } from '../node'
import type { Bounds } from '../types'

export interface ElementProps {
  /**
   * Calculate component bounds.
   * Return `null` for 3D components (depth/camera dependent) — the
   * RenderContext falls back to full redraws for them.
   */
  getBounds: () => Bounds | null
  /** Draw function */
  draw: (gl: GlNode['ctx']) => void
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
  (props: ElementProps): Mountable<GlNode> => {
    const { getBounds, draw, deps } = props

    return (node: GlNode) => {
      const gl = node.ctx
      // Auto-create RenderContext if not exists（配置经 node.rcOptions 注入）
      if (!hasRenderContext(gl)) {
        new RenderContext(gl, node.rcOptions)
      }

      const renderContext = getRenderContext(gl)
      let currentBounds: Bounds | null = null
      
      const drawFn = () => draw(gl)
      
      // Initialize bounds
      currentBounds = getBounds()
      
      // Register component — register() itself marks the screen dirty, so a
      // newly mounted component becomes visible without extra bookkeeping.
      const componentId = renderContext.register({
        bounds: () => currentBounds,
        draw: drawFn
      })
      
      // Watch for reactive changes - optimize: only update when deps actually change
      const runtime = getReactiveRuntime()
      let prevDeps: unknown[] = []
      
      const stopWatch = runtime.subscribe(
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
        }
      )
      
      // Cleanup
      return () => {
        stopWatch()
        renderContext.unregister(componentId)
      }
    }
  }
)
