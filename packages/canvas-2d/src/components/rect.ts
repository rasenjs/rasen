import { getReactiveRuntime } from '@rasenjs/core'
import type { SyncComponent } from '@rasenjs/core'
import type { ReadonlyRef, Ref } from '@rasenjs/core'
import {
  getRenderContext,
  hasRenderContext,
  type Bounds
} from '../render-context'
import { unref } from '../utils'

/**
 * rect 组件 - 绘制矩形
 */
export const rect: SyncComponent<
  CanvasRenderingContext2D,
  {
    x: number | Ref<number> | ReadonlyRef<number>
    y: number | Ref<number> | ReadonlyRef<number>
    width: number | Ref<number> | ReadonlyRef<number>
    height: number | Ref<number> | ReadonlyRef<number>
    fill?: string | Ref<string> | ReadonlyRef<string>
    stroke?: string | Ref<string> | ReadonlyRef<string>
    lineWidth?: number | Ref<number> | ReadonlyRef<number>
  }
> = (props) => {
  return (ctx) => {
    let currentBounds: Bounds | null = null
    let componentId: symbol | null = null

    const getBounds = (): Bounds => {
      const x = unref(props.x)
      const y = unref(props.y)
      const width = unref(props.width)
      const height = unref(props.height)
      const lineWidth = props.stroke ? unref(props.lineWidth) || 1 : 0
      const halfLineWidth = lineWidth / 2
      return {
        x: x - halfLineWidth,
        y: y - halfLineWidth,
        width: width + lineWidth,
        height: height + lineWidth
      }
    }

    const drawFn = () => {
      const x = unref(props.x)
      const y = unref(props.y)
      const width = unref(props.width)
      const height = unref(props.height)
      const fill = props.fill ? unref(props.fill) : undefined
      const stroke = props.stroke ? unref(props.stroke) : undefined
      const lineWidth = props.lineWidth ? unref(props.lineWidth) : 1

      if (fill) {
        ctx.fillStyle = fill
        ctx.fillRect(x, y, width, height)
      }

      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        ctx.strokeRect(x, y, width, height)
      }
    }

    const update = () => {
      const newBounds = getBounds()

      if (hasRenderContext(ctx)) {
        const renderContext = getRenderContext(ctx)
        if (currentBounds) {
          renderContext.markDirty(currentBounds)
        }
        renderContext.markDirty(newBounds)
        currentBounds = newBounds
      } else {
        drawFn()
        currentBounds = newBounds
      }
    }

    if (hasRenderContext(ctx)) {
      const renderContext = getRenderContext(ctx)
      componentId = renderContext.register({
        bounds: () => currentBounds,
        draw: drawFn
      })
    }

    const stop = getReactiveRuntime().watch(
      () => [
        unref(props.x),
        unref(props.y),
        unref(props.width),
        unref(props.height),
        props.fill ? unref(props.fill) : undefined,
        props.stroke ? unref(props.stroke) : undefined,
        props.lineWidth ? unref(props.lineWidth) : undefined
      ],
      update,
      { immediate: true }
    )

    return () => {
      stop()
      if (hasRenderContext(ctx) && componentId) {
        const renderContext = getRenderContext(ctx)
        if (currentBounds) {
          renderContext.markDirty(currentBounds)
        }
        renderContext.unregister(componentId)
      }
    }
  }
}
