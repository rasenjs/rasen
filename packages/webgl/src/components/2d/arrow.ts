/**
 * Arrow component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface ArrowProps extends CommonDrawProps, TransformProps {
  x1: MaybeRef<number>
  y1: MaybeRef<number>
  x2: MaybeRef<number>
  y2: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  arrowSize?: MaybeRef<number>
}

/**
 * Generate arrow geometry (line + arrowhead)
 */
function createArrowGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
  arrowSize: number
): Float32Array {
  const vertices: number[] = []
  
  // Line body
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = -dy / len * lineWidth / 2
  const ny = dx / len * lineWidth / 2
  
  // Shorten line to make room for arrowhead
  const shortenRatio = 1 - arrowSize / len
  const x2Short = x1 + dx * shortenRatio
  const y2Short = y1 + dy * shortenRatio
  
  // Line triangles
  vertices.push(
    x1 + nx, y1 + ny,
    x2Short + nx, y2Short + ny,
    x1 - nx, y1 - ny,
    
    x2Short + nx, y2Short + ny,
    x2Short - nx, y2Short - ny,
    x1 - nx, y1 - ny
  )
  
  // Arrowhead
  const arrowAngle = Math.PI / 6 // 30 degrees
  const arrowDir = Math.atan2(dy, dx)
  
  const arrow1X = x2 - Math.cos(arrowDir + arrowAngle) * arrowSize
  const arrow1Y = y2 - Math.sin(arrowDir + arrowAngle) * arrowSize
  const arrow2X = x2 - Math.cos(arrowDir - arrowAngle) * arrowSize
  const arrow2Y = y2 - Math.sin(arrowDir - arrowAngle) * arrowSize
  
  vertices.push(
    x2, y2,
    arrow1X, arrow1Y,
    arrow2X, arrow2Y
  )
  
  return new Float32Array(vertices)
}

/**
 * Arrow component
 */
export const arrow: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [ArrowProps]
> = (props: ArrowProps) => {
  // Arrow geometry must include absolute coords since line endpoints define the shape
  let cachedGeometry: Float32Array | null = null
  let cachedX1: number | null = null
  let cachedY1: number | null = null
  let cachedX2: number | null = null
  let cachedY2: number | null = null
  let cachedLineWidth: number | null = null
  let cachedArrowSize: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const x1 = unref(props.x1)
      const y1 = unref(props.y1)
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const lineWidth = unref(props.lineWidth) || 1
      const arrowSize = unref(props.arrowSize) || 10
      const margin = Math.max(lineWidth, arrowSize) / 2

      const minX = Math.min(x1, x2) - margin
      const minY = Math.min(y1, y2) - margin
      const maxX = Math.max(x1, x2) + margin
      const maxY = Math.max(y1, y2) + margin

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
      const fill = unref(props.fill) || unref(props.stroke)
      const lineWidth = unref(props.lineWidth) || 1
      const arrowSize = unref(props.arrowSize) || 10
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0 || !fill) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (batchRenderer) {
        if (!cachedGeometry || 
            cachedX1 !== x1 ||
            cachedY1 !== y1 ||
            cachedX2 !== x2 ||
            cachedY2 !== y2 ||
            cachedLineWidth !== lineWidth ||
            cachedArrowSize !== arrowSize) {
          cachedGeometry = createArrowGeometry(x1, y1, x2, y2, lineWidth, arrowSize)
          cachedX1 = x1
          cachedY1 = y1
          cachedX2 = x2
          cachedY2 = y2
          cachedLineWidth = lineWidth
          cachedArrowSize = arrowSize
        }
        const color = parseColor(fill)
        
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
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.arrowSize),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
