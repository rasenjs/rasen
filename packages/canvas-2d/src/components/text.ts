import type { SyncComponent } from '@rasenjs/core'
import type { ReadonlyRef, Ref } from '@rasenjs/core'
import { unref } from '../utils'
import { element } from './element'

/**
 * text 组件属性
 */
export interface TextProps {
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
  letterSpacing?: number | Ref<number> | ReadonlyRef<number>
  textDecoration?: 'underline' | Ref<'underline'> | ReadonlyRef<'underline'>
}

/**
 * text 组件 - 绘制文本
 */
export const text: SyncComponent<CanvasRenderingContext2D, TextProps> = (
  props
) => {
  return element({
    getBounds: (ctx) => {
      const textContent = unref(props.text)
      const x = unref(props.x)
      const y = unref(props.y)
      const font = props.font ? unref(props.font) : '16px sans-serif'
      const textAlign = props.textAlign ? unref(props.textAlign) : 'start'
      const textBaseline = props.textBaseline
        ? unref(props.textBaseline)
        : 'alphabetic'
      const letterSpacing = props.letterSpacing ? unref(props.letterSpacing) : 0

      ctx.font = font
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline

      let textWidth = ctx.measureText(textContent).width

      // 如果有字间距,需要计算额外宽度
      if (letterSpacing > 0) {
        const numChars = textContent.length
        textWidth += (numChars - 1) * letterSpacing
      }

      let textX = x

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
    },

    draw: (ctx) => {
      const textContent = unref(props.text)
      const x = unref(props.x)
      const y = unref(props.y)
      const fill = props.fill ? unref(props.fill) : '#000000'
      const font = props.font ? unref(props.font) : '16px sans-serif'
      const textAlign = props.textAlign ? unref(props.textAlign) : 'start'
      const textBaseline = props.textBaseline
        ? unref(props.textBaseline)
        : 'alphabetic'
      const letterSpacing = props.letterSpacing ? unref(props.letterSpacing) : 0
      const textDecoration = props.textDecoration
        ? unref(props.textDecoration)
        : undefined

      ctx.fillStyle = fill
      ctx.font = font
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline

      if (letterSpacing > 0) {
        // 逐字符绘制以支持字间距
        let currentX = x
        const chars = textContent.split('')

        // 调整起始位置（考虑textAlign）
        if (
          textAlign === 'center' ||
          textAlign === 'right' ||
          textAlign === 'end'
        ) {
          let totalWidth = 0
          for (const char of chars) {
            totalWidth += ctx.measureText(char).width + letterSpacing
          }
          totalWidth -= letterSpacing // 最后一个字符不需要额外间距

          if (textAlign === 'center') {
            currentX = x - totalWidth / 2
          } else {
            currentX = x - totalWidth
          }
        }

        for (let i = 0; i < chars.length; i++) {
          ctx.fillText(chars[i], currentX, y)
          const charWidth = ctx.measureText(chars[i]).width
          currentX += charWidth + letterSpacing
        }

        // 绘制下划线
        if (textDecoration === 'underline') {
          const totalWidth =
            currentX -
            (textAlign === 'center' ||
            textAlign === 'right' ||
            textAlign === 'end'
              ? (x - currentX + x) / 2
              : x)
          const fontSize = parseFloat(font)
          const underlineY = y + fontSize * 0.1
          const startX =
            textAlign === 'center'
              ? x - totalWidth / 2
              : textAlign === 'right' || textAlign === 'end'
                ? x - totalWidth
                : x

          ctx.save()
          ctx.strokeStyle = fill
          ctx.lineWidth = Math.max(1, fontSize * 0.05)
          ctx.beginPath()
          ctx.moveTo(startX, underlineY)
          ctx.lineTo(startX + totalWidth - letterSpacing, underlineY)
          ctx.stroke()
          ctx.restore()
        }
      } else {
        ctx.fillText(textContent, x, y)

        // 绘制下划线
        if (textDecoration === 'underline') {
          const metrics = ctx.measureText(textContent)
          const textWidth = metrics.width
          const fontSize = parseFloat(font)
          const underlineY = y + fontSize * 0.1

          let startX = x
          if (textAlign === 'center') {
            startX = x - textWidth / 2
          } else if (textAlign === 'right' || textAlign === 'end') {
            startX = x - textWidth
          }

          ctx.save()
          ctx.strokeStyle = fill
          ctx.lineWidth = Math.max(1, fontSize * 0.05)
          ctx.beginPath()
          ctx.moveTo(startX, underlineY)
          ctx.lineTo(startX + textWidth, underlineY)
          ctx.stroke()
          ctx.restore()
        }
      }
    },

    deps: () => [
      unref(props.text),
      unref(props.x),
      unref(props.y),
      props.fill ? unref(props.fill) : undefined,
      props.font ? unref(props.font) : undefined,
      props.textAlign ? unref(props.textAlign) : undefined,
      props.textBaseline ? unref(props.textBaseline) : undefined,
      props.letterSpacing ? unref(props.letterSpacing) : undefined,
      props.textDecoration ? unref(props.textDecoration) : undefined
    ]
  })
}
