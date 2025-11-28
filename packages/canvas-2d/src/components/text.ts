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
 * text 组件 - 绘制文本
 */
export const text: SyncComponent<
  CanvasRenderingContext2D,
  {
    text: string | Ref<string> | ReadonlyRef<string>
    x: number | Ref<number> | ReadonlyRef<number>
    y: number | Ref<number> | ReadonlyRef<number>
    fill?: string | Ref<string> | ReadonlyRef<string>
    font?: string | Ref<string> | ReadonlyRef<string>
    textAlign?:
      | CanvasTextAlign
      | Ref<CanvasTextAlign>
      | ReadonlyRef<CanvasTextAlign>
    textBaseline?:
      | CanvasTextBaseline
      | Ref<CanvasTextBaseline>
      | ReadonlyRef<CanvasTextBaseline>
  }
> = (props) => {
  return (ctx) => {
    let currentBounds: Bounds | null = null
    let componentId: symbol | null = null

    const getBounds = (): Bounds => {
      const text = unref(props.text)
      const x = unref(props.x)
      const y = unref(props.y)
      const font = props.font ? unref(props.font) : '16px sans-serif'
      const textAlign = props.textAlign ? unref(props.textAlign) : 'start'
      const textBaseline = props.textBaseline
        ? unref(props.textBaseline)
        : 'alphabetic'

      ctx.font = font
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline

      const metrics = ctx.measureText(text)
      let textX = x
      const textWidth = metrics.width

      if (textAlign === 'center') {
        textX = x - textWidth / 2
      } else if (textAlign === 'right' || textAlign === 'end') {
        textX = x - textWidth
      }

      const fontSize = parseFloat(font)
      let textY = y
      const textHeight = fontSize * 1.2

      if (textBaseline === 'middle') {
        textY = y - textHeight / 2
      } else if (textBaseline === 'top' || textBaseline === 'hanging') {
        // y 已经是顶部
      } else if (textBaseline === 'bottom' || textBaseline === 'ideographic') {
        textY = y - textHeight
      } else {
        textY = y - fontSize
      }

      const padding = 2
      return {
        x: textX - padding,
        y: textY - padding,
        width: textWidth + padding * 2,
        height: textHeight + padding * 2
      }
    }

    const drawFn = () => {
      const text = unref(props.text)
      const x = unref(props.x)
      const y = unref(props.y)
      const fill = props.fill ? unref(props.fill) : '#000000'
      const font = props.font ? unref(props.font) : '16px sans-serif'
      const textAlign = props.textAlign ? unref(props.textAlign) : 'start'
      const textBaseline = props.textBaseline
        ? unref(props.textBaseline)
        : 'alphabetic'

      ctx.fillStyle = fill
      ctx.font = font
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline
      ctx.fillText(text, x, y)
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
        unref(props.text),
        unref(props.x),
        unref(props.y),
        props.fill ? unref(props.fill) : undefined,
        props.font ? unref(props.font) : undefined,
        props.textAlign ? unref(props.textAlign) : undefined,
        props.textBaseline ? unref(props.textBaseline) : undefined
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
