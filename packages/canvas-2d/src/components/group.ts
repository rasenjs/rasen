import { com, type Mountable, type Unmount } from '@rasenjs/core'
import type { PropValue } from '../types'
import type { CanvasNode } from '../node'
import { createNode } from '../node'
import { unref, type CommonDrawProps, type TransformProps, withDrawProps, collectDrawPropsDependencies } from '../utils'

export interface GroupProps
  extends Partial<CommonDrawProps>, Partial<TransformProps> {
  // 子组件
  children: Array<Mountable<CanvasNode>>
  // 位置偏移
  x?: PropValue<number>
  y?: PropValue<number>
  // 裁剪区域(可选)
  clip?:
    | {
        x: number
        y: number
        width: number
        height: number
      }
 | PropValue<{ x: number; y: number; width: number; height: number }>
}

/**
 * group 组件 - Canvas 2D 组合节点（真实树层级）
 *
 * 相比 fragment,group 支持:
 * - 共享变换(rotation, scale, translate等)
 * - 共享透明度
 * - 裁剪区域
 * - 共享阴影效果
 *
 * 层级即挂载：子组件收到的宿主是 group 节点本身，
 * 子节点自然挂进 group.children；绘制时 group 先应用
 * 变换/裁剪，再前序递归 children。
 */
export const group = com(
  (props: GroupProps): Mountable<CanvasNode> => {
    return (parentNode: CanvasNode) => {
      const childUnmounts: (Unmount | undefined)[] = []

      const groupNode = createNode(parentNode, {
        draw: (ctx) => {
          ctx.save()

          // 应用位置偏移
          const x = props.x ? (unref(props.x) as number) : 0
          const y = props.y ? (unref(props.y) as number) : 0
          if (x !== 0 || y !== 0) {
            ctx.translate(x, y)
          }

          // 应用通用绘图属性(变换、透明度、阴影等)，随后递归 children
          withDrawProps(ctx, props, () => {
            // 应用裁剪区域
            if (props.clip) {
              const clip = unref(props.clip) as {
                x: number
                y: number
                width: number
                height: number
              }
              ctx.beginPath()
              ctx.rect(clip.x, clip.y, clip.width, clip.height)
              ctx.clip()
            }

            for (const child of groupNode.children) {
              child.draw(ctx)
            }
          })

          ctx.restore()
        },
        deps: () => [
          props.x ? unref(props.x) : undefined,
          props.y ? unref(props.y) : undefined,
          props.clip ? unref(props.clip) : undefined,
          ...collectDrawPropsDependencies(props)
        ]
      })

      // 挂载所有子组件（宿主 = group 节点，层级自然建立）
      for (const child of props.children) {
        const unmount = child(groupNode, undefined)
        childUnmounts.push(unmount)
      }

      // 返回 cleanup 函数
      return () => {
        // unmount 所有子组件（各自从 group.children 摘除自己）
        childUnmounts.forEach((unmount) => unmount?.())
        groupNode.remove()
      }
    }
  }
)
