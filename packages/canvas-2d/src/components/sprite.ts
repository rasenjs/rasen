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
  /**
   * The frame grid, read through `unref` even though the type says `number`.
   *
   * The type stays `number` because widening it to `PropValue<number>` is a breaking
   * change for callers and their tests, and it buys nothing at runtime: this
   * framework's JSX compiler **wraps a member expression or a call in a getter**, so
   * the ordinary spelling `frameWidth={geometry.frameWidth}` delivers a *function*
   * here, and `drawImage` then receives a function for a crop length and draws
   * nothing — silently, with no error, because a no-op is what the canvas spec says
   * to do with a non-finite argument.
   *
   * `unref` unwraps a ref *and* calls a function (up to five levels), so reading
   * every one of these through it makes both a plain number and the wrapped spelling
   * work. That is the whole fix: the bug was a raw read, not the type.
   */
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
      // `unref` because a member-expression prop arrives as a getter; see the
      // interface's note on `frameWidth`.
      const frameWidth = unref(props.frameWidth as never) as number
      const frameHeight = unref(props.frameHeight as never) as number
      const width = props.width ? (unref(props.width) as number) : frameWidth
      const height = props.height ? (unref(props.height) as number) : frameHeight
      return { x, y, width, height }
    },

    draw: (ctx: Context2D) => {
      const img = unref(props.image) as CanvasImageSource
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const frameIndex = unref(props.frame) as number
      const columns = props.columns === undefined ? 1 : (unref(props.columns as never) as number)
      const frameWidth = unref(props.frameWidth as never) as number
      const frameHeight = unref(props.frameHeight as never) as number

      const width = props.width ? (unref(props.width) as number) : frameWidth
      const height = props.height ? (unref(props.height) as number) : frameHeight

      const col = frameIndex % columns
      const row = Math.floor(frameIndex / columns)

      const cropX = col * frameWidth
      const cropY = row * frameHeight

      withDrawProps(
        ctx,
        props,
        () => {
          ctx.drawImage(img, cropX, cropY, frameWidth, frameHeight, x, y, width, height)
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
