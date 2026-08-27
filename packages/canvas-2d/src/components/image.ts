import { createNode, type Component2D, type CanvasNode, type Context2D } from '../node'
import type { PropValue } from '../types'
import {
  unref,
  type CommonDrawProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies,
  pointerHandlersFrom,
} from '../utils'

/**
 * 图片裁剪区域
 */
export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

/**
 * image 组件属性
 */
export interface ImageProps extends CommonDrawProps, TransformProps {
  image: PropValue<CanvasImageSource>
  x: PropValue<number>
  y: PropValue<number>
  width?: PropValue<number>
  height?: PropValue<number>
  crop?: PropValue<ImageCrop> // 裁剪区域
}

/**
 * image 组件 - 绘制图片
 */
export const image: Component2D<ImageProps> = (
  props: ImageProps
) => {
  return (node: CanvasNode) => {
    const n = createNode(node, {
    bounds: () => {
      const img = unref(props.image) as CanvasImageSource | undefined
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const crop = props.crop ? (unref(props.crop) as ImageCrop) : undefined

      let imgWidth = 0
      let imgHeight = 0
      if (img && typeof img === 'object' && 'width' in img && 'height' in img) {
        imgWidth = (img as { width: number }).width
        imgHeight = (img as { height: number }).height
      }

      const width = props.width
        ? (unref(props.width) as number)
        : crop
          ? crop.width
          : imgWidth
      const height = props.height
        ? (unref(props.height) as number)
        : crop
          ? crop.height
          : imgHeight

      return { x, y, width, height }
    },

    draw: (ctx: Context2D) => {
      const img = unref(props.image) as CanvasImageSource | undefined
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const crop = props.crop ? (unref(props.crop) as ImageCrop) : undefined

      // Source not ready yet (async load / pool slot not initialized) —
      // skip this frame instead of crashing on `'width' in undefined`.
      if (!img || typeof img !== 'object') return

      let imgWidth = 0
      let imgHeight = 0
      if ('width' in img && 'height' in img) {
        imgWidth = (img as { width: number }).width
        imgHeight = (img as { height: number }).height
      }

      const width = props.width
        ? (unref(props.width) as number)
        : crop
          ? crop.width
          : imgWidth
      const height = props.height
        ? (unref(props.height) as number)
        : crop
          ? crop.height
          : imgHeight

      withDrawProps(
        ctx,
        props,
        () => {
          if (crop) {
            ctx.drawImage(
              img,
              crop.x,
              crop.y,
              crop.width,
              crop.height,
              x,
              y,
              width,
              height
            )
          } else {
            ctx.drawImage(img, x, y, width, height)
          }
        },
        {
          transformCenter: {
            x: x + width / 2,
            y: y + height / 2
          }
        }
      )
    },

    on: pointerHandlersFrom(props),

    deps: () => [
      unref(props.image),
      unref(props.x),
      unref(props.y),
      props.width ? unref(props.width) : undefined,
      props.height ? unref(props.height) : undefined,
      props.crop ? unref(props.crop) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
    })
    return () => n.remove()
  }
}
