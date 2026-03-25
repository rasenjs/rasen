/**
 * Rectangle component (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

/**
 * Generate rectangle vertices (two triangles)
 * Now supports z coordinate for 3D
 */
function createRectGeometry(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number
): Float32Array {
  return new Float32Array([
    x, y, z,
    x + width, y, z,
    x, y + height, z,
    x + width, y, z,
    x + width, y + height, z,
    x, y + height, z
  ])
}

export interface RectProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  width: MaybeRef<number>
  height: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  cornerRadius?: MaybeRef<number | number[]>
}

/**
 * Rectangle component
 */
export const rect: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [RectProps]
> = (props: RectProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedWidth: number | null = null
  let cachedHeight: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsW: number | null = null
  let cachedBoundsH: number | null = null
  let cachedBoundsLW: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const width = unref(props.width)
      const height = unref(props.height)
      const lineWidth = unref(props.lineWidth) || 0
      
      if (cachedBounds && cachedBoundsW === width && cachedBoundsH === height && cachedBoundsLW === lineWidth) {
        const x = unref(props.x)
        const y = unref(props.y)
        const halfLineWidth = lineWidth / 2
        cachedBounds.x = x - halfLineWidth
        cachedBounds.y = y - halfLineWidth
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const halfLineWidth = lineWidth / 2

      cachedBounds = {
        x: x - halfLineWidth,
        y: y - halfLineWidth,
        width: width + lineWidth,
        height: height + lineWidth
      }
      cachedBoundsW = width
      cachedBoundsH = height
      cachedBoundsLW = lineWidth
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const z = unref(props.z) ?? 0
      const width = unref(props.width)
      const height = unref(props.height)
      const fill = unref(props.fill)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      const rotation = unref(props.rotation) ?? 0
      const rotationX = unref(props.rotationX) ?? 0
      const rotationY = unref(props.rotationY) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1
      const scaleZ = unref(props.scaleZ) ?? 1

      if (!visible || opacity <= 0) return

      const renderContext = getRenderContext(gl)

      if (fill) {
        if (!cachedGeometry || 
            cachedWidth !== width ||
            cachedHeight !== height) {
          cachedGeometry = createRectGeometry(0, 0, 0, width, height)
          cachedWidth = width
          cachedHeight = height
        }

        const color = parseColor(fill)
        
        const transform = renderContext.getCurrentTransform()
        
        const finalOpacity = opacity * transform.opacity
        color.a *= finalOpacity
        
        const cos = Math.cos(transform.rotationZ)
        const sin = Math.sin(transform.rotationZ)
        const rotatedX = x * cos - y * sin
        const rotatedY = x * sin + y * cos
        
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
          `rect-${width}-${height}`,
          cachedGeometry,
          color,
          finalTransform
        )
      }
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.z),
      unref(props.width),
      unref(props.height),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.cornerRadius),
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
