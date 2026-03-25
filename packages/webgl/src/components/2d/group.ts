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
  
  children: Array<Mountable<WebGLRenderingContext | WebGL2RenderingContext>>
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
  (props: GroupProps): Mountable<WebGLRenderingContext | WebGL2RenderingContext> => {
    return (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const runtime = getReactiveRuntime()
      
      // Auto-create RenderContext if not exists (for testing)
      if (!hasRenderContext(gl)) {
        new RenderContext(gl)
      }
      
      const renderContext = getRenderContext(gl)
      
      // Child unmount functions
      const childUnmounts: (Unmount | undefined)[] = []
      let componentId: symbol | null = null
      let groupContext: GroupContext | null = null
      
      const x: Ref<number> = runtime.isRef(props.x) ? props.x as Ref<number> : runtime.ref(unref(props.x) ?? 0)
      const y: Ref<number> = runtime.isRef(props.y) ? props.y as Ref<number> : runtime.ref(unref(props.y) ?? 0)
      const z: Ref<number> = runtime.isRef(props.z) ? props.z as Ref<number> : runtime.ref(unref(props.z) ?? 0)
      const rotation: Ref<number> = runtime.isRef(props.rotation) ? props.rotation as Ref<number> : runtime.ref(unref(props.rotation) ?? 0)
      const rotationX: Ref<number> = runtime.isRef(props.rotationX) ? props.rotationX as Ref<number> : runtime.ref(unref(props.rotationX) ?? 0)
      const rotationY: Ref<number> = runtime.isRef(props.rotationY) ? props.rotationY as Ref<number> : runtime.ref(unref(props.rotationY) ?? 0)
      const rotationZ: Ref<number> = runtime.isRef(props.rotationZ) ? props.rotationZ as Ref<number> : runtime.ref(unref(props.rotationZ) ?? rotation.value)
      const scaleX: Ref<number> = runtime.isRef(props.scaleX) ? props.scaleX as Ref<number> : runtime.ref(unref(props.scaleX) ?? 1)
      const scaleY: Ref<number> = runtime.isRef(props.scaleY) ? props.scaleY as Ref<number> : runtime.ref(unref(props.scaleY) ?? 1)
      const scaleZ: Ref<number> = runtime.isRef(props.scaleZ) ? props.scaleZ as Ref<number> : runtime.ref(unref(props.scaleZ) ?? 1)
      const visible: Ref<boolean> = runtime.isRef(props.visible) ? props.visible as Ref<boolean> : runtime.ref(unref(props.visible) ?? true)
      const opacity: Ref<number> = runtime.isRef(props.opacity) ? props.opacity as Ref<number> : runtime.ref(unref(props.opacity) ?? 1)
      
      // Group's draw function - apply transform and draw children
      const drawGroup = () => {
        if (!visible.value || opacity.value <= 0) return
        if (!groupContext) return
        
        renderContext.pushTransform({
          tx: x.value,
          ty: y.value,
          tz: z.value,
          rotation: rotation.value,
          rotationX: rotationX.value,
          rotationY: rotationY.value,
          rotationZ: rotationZ.value,
          scaleX: scaleX.value,
          scaleY: scaleY.value,
          scaleZ: scaleZ.value,
          opacity: opacity.value
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
        const unmount = child(gl)
        childUnmounts.push(unmount)
      }
      
      // Exit group context
      exitGroupContext(gl)
      
      // Mark as dirty to trigger initial render
      renderContext.markDirty()
      
      runtime.watch(
        () => [
          x.value,
          y.value,
          z.value,
          rotation.value,
          rotationX.value,
          rotationY.value,
          rotationZ.value,
          scaleX.value,
          scaleY.value,
          scaleZ.value,
          visible.value,
          opacity.value
        ],
        () => {
          renderContext.markDirty()
        },
        { immediate: false }
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
