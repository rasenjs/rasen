import type { Component2D } from '../node'
import type { PropValue } from '../types'
import {
  unref,
  type CommonDrawProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies,
  pointerHandlersFrom,
} from '../utils'
import { createNode, type CanvasNode, type Context2D } from '../node'

export interface SpriteProps extends CommonDrawProps, TransformProps {
  image: PropValue<CanvasImageSource>
  x: PropValue<number>
  y: PropValue<number>
  frameWidth: number
  frameHeight: number
  frame: PropValue<number>
  columns?: number
  width?: PropValue<number>
  height?: PropValue<number>
}

export const sprite: Component2D<SpriteProps> = (
  props: SpriteProps
) => {
  return (node: CanvasNode) => {
    const n = createNode(node, {
    bounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const width = props.width ? (unref(props.width) as number) : props.frameWidth
      const height = props.height ? (unref(props.height) as number) : props.frameHeight
      return { x, y, width, height }
    },

    draw: (ctx: Context2D) => {
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

    on: pointerHandlersFrom(props),

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
    return () => n.remove()
  }
}
