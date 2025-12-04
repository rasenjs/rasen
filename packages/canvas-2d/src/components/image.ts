import type { SyncComponent } from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies
} from '../utils'
import { element } from './element'

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
  image:
    | CanvasImageSource
    | Ref<CanvasImageSource>
    | ReadonlyRef<CanvasImageSource>
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  width?: number | Ref<number> | ReadonlyRef<number>
  height?: number | Ref<number> | ReadonlyRef<number>
  crop?: ImageCrop | Ref<ImageCrop> | ReadonlyRef<ImageCrop> // 裁剪区域
}

/**
 * image 组件 - 绘制图片
 */
export const image: SyncComponent<CanvasRenderingContext2D, [ImageProps]> = (
  props: ImageProps
) => {
  return element({
    getBounds: () => {
      const img = unref(props.image) as CanvasImageSource
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const crop = props.crop ? (unref(props.crop) as ImageCrop) : undefined

      let imgWidth = 0
      let imgHeight = 0
      if ('width' in img && 'height' in img) {
        imgWidth = img.width as number
        imgHeight = img.height as number
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

    draw: (ctx) => {
      const img = unref(props.image) as CanvasImageSource
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const crop = props.crop ? (unref(props.crop) as ImageCrop) : undefined

      let imgWidth = 0
      let imgHeight = 0
      if ('width' in img && 'height' in img) {
        imgWidth = img.width as number
        imgHeight = img.height as number
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
}
