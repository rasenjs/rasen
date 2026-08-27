/**
 * Group component for WebGL - hierarchical transforms
 *
 * Real node-tree hierarchy: children receive the group node as their mount
 * host, so mounting IS the parent-child relationship. Drawing pushes the
 * group transform, recurses children via drawChildren(), then pops.
 */

import { com, type Mountable, type Unmount } from '@rasenjs/core'
import type { PropValue } from '../../types'
import { createNode, type GlNode } from '../../node'
import { unref } from '../../utils'
import { getRenderContext } from '../../render-context'

export interface GroupProps {
  x?: PropValue<number>
  y?: PropValue<number>
  z?: PropValue<number>
  rotation?: PropValue<number>
  rotationX?: PropValue<number>
  rotationY?: PropValue<number>
  rotationZ?: PropValue<number>
  scaleX?: PropValue<number>
  scaleY?: PropValue<number>
  scaleZ?: PropValue<number>

  visible?: PropValue<boolean>
  opacity?: PropValue<number>

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
    return (parentNode: GlNode) => {
      const childUnmounts: (Unmount | undefined)[] = []
      const gl = parentNode.ctx

      const groupNode = createNode(parentNode, {
        // Container semantics: push transform → draw subtree → pop.
        // Children render through drawChildren() so nested groups compose.
        draw: (drawChildren) => {
          const visible = (unref(props.visible) as boolean) ?? true
          const opacity = (unref(props.opacity) as number) ?? 1
          if (!visible || opacity <= 0) return

          const rc = getRenderContext(gl)
          rc.pushTransform({
            tx: (unref(props.x) as number) ?? 0,
            ty: (unref(props.y) as number) ?? 0,
            tz: (unref(props.z) as number) ?? 0,
            rotationX: (unref(props.rotationX) as number) ?? 0,
            rotationY: (unref(props.rotationY) as number) ?? 0,
            // `rotation` is an alias for rotationZ (2D compatibility)
            rotationZ:
              (unref(props.rotationZ) as number) ??
              (unref(props.rotation) as number) ??
              0,
            scaleX: (unref(props.scaleX) as number) ?? 1,
            scaleY: (unref(props.scaleY) as number) ?? 1,
            scaleZ: (unref(props.scaleZ) as number) ?? 1,
            opacity
          })

          drawChildren()

          rc.popTransform()
        },
        deps: () => [
          unref(props.x),
          unref(props.y),
          unref(props.z),
          unref(props.rotation),
          unref(props.rotationX),
          unref(props.rotationY),
          unref(props.rotationZ),
          unref(props.scaleX),
          unref(props.scaleY),
          unref(props.scaleZ),
          unref(props.visible),
          unref(props.opacity)
        ]
      })

      // 层级即挂载：子组件收到的宿主是 group 节点本身，
      // 子节点自然挂进 group.children（显式空 hooks —— GL 全降级）。
      for (const child of props.children) {
        childUnmounts.push(child(groupNode, undefined))
      }

      // Cleanup: unmount children first（各自从 group.children 摘除自己），
      // 再把 group 自身从树上摘除。
      return () => {
        for (const unmount of childUnmounts) {
          unmount?.()
        }
        groupNode.remove()
      }
    }
  }
)
