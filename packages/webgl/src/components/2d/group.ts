/**
 * Group component for WebGL - hierarchical transforms
 */

import {
  com,
  getReactiveRuntime,
  type Mountable,
  type Unmount
} from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../../types'
import type { GlNode } from '../../node'
import { unref } from '../../utils'
import {
  getRenderContext,
  hasRenderContext,
  RenderContext,
  enterGroupContext,
  exitGroupContext,
  type GroupContext
} from '../../render-context'

export interface GroupProps {
  x?: number | Ref<number> | ReadonlyRef<number>
  y?: number | Ref<number> | ReadonlyRef<number>
  z?: number | Ref<number> | ReadonlyRef<number>
  rotation?: number | Ref<number> | ReadonlyRef<number>
  rotationX?: number | Ref<number> | ReadonlyRef<number>
  rotationY?: number | Ref<number> | ReadonlyRef<number>
  rotationZ?: number | Ref<number> | ReadonlyRef<number>
  scaleX?: number | Ref<number> | ReadonlyRef<number>
  scaleY?: number | Ref<number> | ReadonlyRef<number>
  scaleZ?: number | Ref<number> | ReadonlyRef<number>
  
  visible?: boolean | Ref<boolean> | ReadonlyRef<boolean>
  opacity?: number | Ref<number> | ReadonlyRef<number>
  
  children: Array<Mountable<GlNode>>
}

/**
 * Group component - hierarchical transforms for WebGL
 * 
 * Groups allow you to:
 * - Apply transforms to multiple shapes together
 * - Create parent-child hierarchies (tank = body + turret)
 * - Organize scene structure
 * 
 * @example
 * ```typescript
 * // Tank with rotating turret
 * const tank = group({
 *   x: 100,
 *   y: 100,
 *   rotation: tankAngle,
 *   children: [
 *     // Tank body
 *     rect({ x: -25, y: -15, width: 50, height: 30, color: '#4a4a4a' }),
 *     
 *     // Turret (additional rotation)
 *     group({
 *       rotation: turretAngle,
 *       children: [
 *         rect({ x: -10, y: -5, width: 30, height: 10, color: '#333' })
 *       ]
 *     })
 *   ]
 * })
 * ```
 */
export const group = com(
  (props: GroupProps): Mountable<GlNode> => {
    return (node: GlNode) => {
      const gl = node.ctx
      const runtime = getReactiveRuntime()
      
      // Auto-create RenderContext if not exists (for testing)
      if (!hasRenderContext(gl)) {
        new RenderContext(gl, node.rcOptions)
      }
      
      const renderContext = getRenderContext(gl)
      
      // Child unmount functions
      const childUnmounts: (Unmount | undefined)[] = []
      let componentId: symbol | null = null
      let groupContext: GroupContext | null = null
      
      const x = runtime.isRef(props.x) ? (props.x as unknown as Ref<number>) : runtime.ref((unref(props.x) as number) ?? 0)
      const y = runtime.isRef(props.y) ? (props.y as unknown as Ref<number>) : runtime.ref((unref(props.y) as number) ?? 0)
      const z = runtime.isRef(props.z) ? (props.z as unknown as Ref<number>) : runtime.ref((unref(props.z) as number) ?? 0)
      const rotation = runtime.isRef(props.rotation) ? (props.rotation as unknown as Ref<number>) : runtime.ref((unref(props.rotation) as number) ?? 0)
      const rotationX = runtime.isRef(props.rotationX) ? (props.rotationX as unknown as Ref<number>) : runtime.ref((unref(props.rotationX) as number) ?? 0)
      const rotationY = runtime.isRef(props.rotationY) ? (props.rotationY as unknown as Ref<number>) : runtime.ref((unref(props.rotationY) as number) ?? 0)
      const rotationZ = runtime.isRef(props.rotationZ) ? (props.rotationZ as unknown as Ref<number>) : runtime.ref((unref(props.rotationZ) as number) ?? unref(rotation))
      const scaleX = runtime.isRef(props.scaleX) ? (props.scaleX as unknown as Ref<number>) : runtime.ref((unref(props.scaleX) as number) ?? 1)
      const scaleY = runtime.isRef(props.scaleY) ? (props.scaleY as unknown as Ref<number>) : runtime.ref((unref(props.scaleY) as number) ?? 1)
      const scaleZ = runtime.isRef(props.scaleZ) ? (props.scaleZ as unknown as Ref<number>) : runtime.ref((unref(props.scaleZ) as number) ?? 1)
      const visible = runtime.isRef(props.visible) ? (props.visible as unknown as Ref<boolean>) : runtime.ref((unref(props.visible) as boolean) ?? true)
      const opacity = runtime.isRef(props.opacity) ? (props.opacity as unknown as Ref<number>) : runtime.ref((unref(props.opacity) as number) ?? 1)
      
      // Group's draw function - apply transform and draw children
      const drawGroup = () => {
        if (!unref(visible) || unref(opacity) <= 0) return
        if (!groupContext) return
        
        renderContext.pushTransform({
          tx: unref(x),
          ty: unref(y),
          tz: unref(z),
          rotation: unref(rotation),
          rotationX: unref(rotationX),
          rotationY: unref(rotationY),
          rotationZ: unref(rotationZ),
          scaleX: unref(scaleX),
          scaleY: unref(scaleY),
          scaleZ: unref(scaleZ),
          opacity: unref(opacity)
        })
        
        // Draw all children in group's transform context
        for (const childDraw of groupContext.childDrawFunctions) {
          childDraw()
        }
        
        // Pop transform state
        renderContext.popTransform()
      }
      
      // Register group component BEFORE entering group context
      // This prevents the group from adding itself to its own children
      componentId = renderContext.register({
        bounds: () => null, // Groups don't have their own bounds
        draw: drawGroup
      })
      
      // Enter group context to collect children
      groupContext = enterGroupContext(gl)
      
      // Mount all children (in group context)
      for (const child of props.children) {
        const unmount = child(node, undefined)
        childUnmounts.push(unmount)
      }
      
      // Exit group context
      exitGroupContext(gl)
      
      runtime.subscribe(
        () => [
          unref(x),
          unref(y),
          unref(z),
          unref(rotation),
          unref(rotationX),
          unref(rotationY),
          unref(rotationZ),
          unref(scaleX),
          unref(scaleY),
          unref(scaleZ),
          unref(visible),
          unref(opacity)
        ],
        () => {
          renderContext.markDirty()
        }
      )
      
      // Cleanup
      return () => {
        if (componentId) {
          renderContext.unregister(componentId)
        }
        for (const unmount of childUnmounts) {
          unmount?.()
        }
      }
    }
  }
)
