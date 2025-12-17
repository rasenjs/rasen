/**
 * Line component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

/**
 * Generate line vertices (as thick rectangle)
 */
function createLineGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number
): Float32Array {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = -dy / len * thickness / 2
  const ny = dx / len * thickness / 2
  
  return new Float32Array([
    // Triangle 1
    x1 + nx, y1 + ny,
    x2 + nx, y2 + ny,
    x1 - nx, y1 - ny,
    // Triangle 2
    x2 + nx, y2 + ny,
    x2 - nx, y2 - ny,
    x1 - nx, y1 - ny
  ])
}

export interface LineProps extends CommonDrawProps, TransformProps {
  x1: MaybeRef<number>
  y1: MaybeRef<number>
  x2: MaybeRef<number>
  y2: MaybeRef<number>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
}

/**
 * Line component
 */
export const line: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [LineProps]
> = (props: LineProps) => {
  // Line geometry must include absolute coords since endpoints define the shape
  let cachedGeometry: Float32Array | null = null
  let cachedX1: number | null = null
  let cachedY1: number | null = null
  let cachedX2: number | null = null
  let cachedY2: number | null = null
  let cachedLineWidth: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const x1 = unref(props.x1)
      const y1 = unref(props.y1)
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const lineWidth = unref(props.lineWidth) || 1
      const halfLineWidth = lineWidth / 2

      const minX = Math.min(x1, x2) - halfLineWidth
      const minY = Math.min(y1, y2) - halfLineWidth
      const maxX = Math.max(x1, x2) + halfLineWidth
      const maxY = Math.max(y1, y2) + halfLineWidth

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x1 = unref(props.x1)
      const y1 = unref(props.y1)
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const stroke = unref(props.stroke)
      const lineWidth = unref(props.lineWidth) || 1
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0 || !stroke) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (batchRenderer) {
        if (!cachedGeometry || 
            cachedX1 !== x1 ||
            cachedY1 !== y1 ||
            cachedX2 !== x2 ||
            cachedY2 !== y2 ||
            cachedLineWidth !== lineWidth) {
          cachedGeometry = createLineGeometry(x1, y1, x2, y2, lineWidth)
          cachedX1 = x1
          cachedY1 = y1
          cachedX2 = x2
          cachedY2 = y2
          cachedLineWidth = lineWidth
        }
        const color = parseColor(stroke)
        
        // Get accumulated transform from group hierarchy
        const groupTransform = renderContext.getCurrentTransform()
        
        // Combine local opacity with group opacity
        const finalOpacity = opacity * groupTransform.opacity
        color.a *= finalOpacity
        
        // Create full transform matrix
        const cos = Math.cos(groupTransform.rotation)
        const sin = Math.sin(groupTransform.rotation)
        const transform = [
          groupTransform.scaleX * cos,
          groupTransform.scaleX * sin,
          0,
          -groupTransform.scaleY * sin,
          groupTransform.scaleY * cos,
          0,
          groupTransform.tx,
          groupTransform.ty,
          1
        ]
        
        batchRenderer.addShape(cachedGeometry, color, transform)
      }
    },

    deps: () => [
      unref(props.x1),
      unref(props.y1),
      unref(props.x2),
      unref(props.y2),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
