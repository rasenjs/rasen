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
  z?: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  arrowSize?: MaybeRef<number>
}

function createArrowGeometry(
  dx: number,
  dy: number,
  lineWidth: number,
  arrowSize: number
): Float32Array {
  const vertices: number[] = []
  
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return new Float32Array(0)
  
  const nx = -dy / len * lineWidth / 2
  const ny = dx / len * lineWidth / 2
  
  const shortenRatio = 1 - arrowSize / len
  const x2Short = dx * shortenRatio
  const y2Short = dy * shortenRatio
  
  vertices.push(
    0 + nx, 0 + ny, 0,
    x2Short + nx, y2Short + ny, 0,
    0 - nx, 0 - ny, 0,
    
    x2Short + nx, y2Short + ny, 0,
    x2Short - nx, y2Short - ny, 0,
    0 - nx, 0 - ny, 0
  )
  
  const arrowAngle = Math.PI / 6
  const arrowDir = Math.atan2(dy, dx)
  
  const arrow1X = dx - Math.cos(arrowDir + arrowAngle) * arrowSize
  const arrow1Y = dy - Math.sin(arrowDir + arrowAngle) * arrowSize
  const arrow2X = dx - Math.cos(arrowDir - arrowAngle) * arrowSize
  const arrow2Y = dy - Math.sin(arrowDir - arrowAngle) * arrowSize
  
  vertices.push(
    dx, dy, 0,
    arrow1X, arrow1Y, 0,
    arrow2X, arrow2Y, 0
  )
  
  return new Float32Array(vertices)
}

export const arrow: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [ArrowProps]
> = (props: ArrowProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedDx: number | null = null
  let cachedDy: number | null = null
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
      const z = unref(props.z) ?? 0
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const fill = unref(props.fill) || unref(props.stroke)
      const lineWidth = unref(props.lineWidth) || 1
      const arrowSize = unref(props.arrowSize) || 10
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0 || !fill) return

      const renderContext = getRenderContext(gl)

      const dx = x2 - x1
      const dy = y2 - y1

      if (!cachedGeometry || 
          cachedDx !== dx ||
          cachedDy !== dy ||
          cachedLineWidth !== lineWidth ||
          cachedArrowSize !== arrowSize) {
        cachedGeometry = createArrowGeometry(dx, dy, lineWidth, arrowSize)
        cachedDx = dx
        cachedDy = dy
        cachedLineWidth = lineWidth
        cachedArrowSize = arrowSize
      }
      
      const color = parseColor(fill)
      
      const groupTransform = renderContext.getCurrentTransform()
      
      const finalOpacity = opacity * groupTransform.opacity
      color.a *= finalOpacity
      
      const cos = Math.cos(groupTransform.rotationZ)
      const sin = Math.sin(groupTransform.rotationZ)
      const rotatedX = x1 * cos - y1 * sin
      const rotatedY = x1 * sin + y1 * cos
      
      const finalTransform = {
        tx: groupTransform.tx + rotatedX * groupTransform.scaleX,
        ty: groupTransform.ty + rotatedY * groupTransform.scaleY,
        tz: groupTransform.tz + z * groupTransform.scaleZ,
        rotationX: groupTransform.rotationX,
        rotationY: groupTransform.rotationY,
        rotationZ: groupTransform.rotationZ,
        scaleX: groupTransform.scaleX,
        scaleY: groupTransform.scaleY,
        scaleZ: groupTransform.scaleZ
      }
      
      renderContext.addShape(
        `arrow-${lineWidth}-${arrowSize}`,
        cachedGeometry,
        color,
        finalTransform
      )
    },

    deps: () => [
      unref(props.x1),
      unref(props.y1),
      unref(props.z),
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
