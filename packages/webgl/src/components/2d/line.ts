/**
 * Line component (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

/**
 * Generate line vertices (as thick rectangle)
 * Now supports z coordinate for 3D
 */
function createLineGeometry(
  x1: number,
  y1: number,
  z: number,
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
    x1 + nx, y1 + ny, z,
    x2 + nx, y2 + ny, z,
    x1 - nx, y1 - ny, z,
    x2 + nx, y2 + ny, z,
    x2 - nx, y2 - ny, z,
    x1 - nx, y1 - ny, z
  ])
}

export interface LineProps extends CommonDrawProps, TransformProps {
  x1: MaybeRef<number>
  y1: MaybeRef<number>
  z?: MaybeRef<number>
  x2: MaybeRef<number>
  y2: MaybeRef<number>
  z2?: MaybeRef<number>
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
      const z = unref(props.z) ?? 0
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const stroke = unref(props.stroke)
      const lineWidth = unref(props.lineWidth) || 1
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      const rotationX = unref(props.rotationX) ?? 0
      const rotationY = unref(props.rotationY) ?? 0
      const rotation = unref(props.rotation) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1
      const scaleZ = unref(props.scaleZ) ?? 1

      if (!visible || opacity <= 0 || !stroke) return

      const renderContext = getRenderContext(gl)

      if (!cachedGeometry || 
          cachedX1 !== x1 ||
          cachedY1 !== y1 ||
          cachedX2 !== x2 ||
          cachedY2 !== y2 ||
          cachedLineWidth !== lineWidth) {
        cachedGeometry = createLineGeometry(0, 0, 0, x2 - x1, y2 - y1, lineWidth)
        cachedX1 = x1
        cachedY1 = y1
        cachedX2 = x2
        cachedY2 = y2
        cachedLineWidth = lineWidth
      }
      
      const color = parseColor(stroke)
      
      const transform = renderContext.getCurrentTransform()
      
      const finalOpacity = opacity * transform.opacity
      color.a *= finalOpacity
      
      const cos = Math.cos(transform.rotationZ)
      const sin = Math.sin(transform.rotationZ)
      const rotatedX = x1 * cos - y1 * sin
      const rotatedY = x1 * sin + y1 * cos
      
      const finalTransform = {
        tx: transform.tx + rotatedX * transform.scaleX,
        ty: transform.ty + rotatedY * transform.scaleY,
        tz: transform.tz + z * transform.scaleZ,
        rotationX: transform.rotationX + rotationX,
        rotationY: transform.rotationY + rotationY,
        rotationZ: transform.rotationZ + rotation,
        scaleX: transform.scaleX * scaleX,
        scaleY: transform.scaleY * scaleY,
        scaleZ: transform.scaleZ * scaleZ
      }

      renderContext.addShape(
        `line-${lineWidth}`,
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
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.visible),
      unref(props.opacity),
      unref(props.rotation),
      unref(props.rotationX),
      unref(props.rotationY),
      unref(props.scaleX),
      unref(props.scaleY),
      unref(props.scaleZ)
    ]
  })
}
