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

export interface SpriteProps extends CommonDrawProps, TransformProps {
  image: CanvasImageSource | Ref<CanvasImageSource> | ReadonlyRef<CanvasImageSource>
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  frameWidth: number
  frameHeight: number
  frame: number | Ref<number> | ReadonlyRef<number>
  columns?: number
  width?: number | Ref<number> | ReadonlyRef<number>
  height?: number | Ref<number> | ReadonlyRef<number>
}

export const sprite: SyncComponent<CanvasRenderingContext2D, [SpriteProps]> = (
  props: SpriteProps
) => {
  return element({
    getBounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const width = props.width ? (unref(props.width) as number) : props.frameWidth
      const height = props.height ? (unref(props.height) as number) : props.frameHeight
      return { x, y, width, height }
    },

    draw: (ctx) => {
      const img = unref(props.image) as CanvasImageSource
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const frameIndex = unref(props.frame) as number
      const columns = props.columns ?? 1
      
      const width = props.width ? (unref(props.width) as number) : props.frameWidth
      const height = props.height ? (unref(props.height) as number) : props.frameHeight
      
      const col = frameIndex % columns
      const row = Math.floor(frameIndex / columns)
      
      const cropX = col * props.frameWidth
      const cropY = row * props.frameHeight

      withDrawProps(
        ctx,
        props,
        () => {
          ctx.drawImage(
            img,
            cropX,
            cropY,
            props.frameWidth,
            props.frameHeight,
            x,
            y,
            width,
            height
          )
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
      unref(props.frame),
      props.width ? unref(props.width) : undefined,
      props.height ? unref(props.height) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
