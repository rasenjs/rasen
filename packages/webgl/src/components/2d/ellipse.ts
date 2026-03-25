/**
 * Ellipse component (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface EllipseProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  radiusX: MaybeRef<number>
  radiusY: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  segments?: MaybeRef<number>
}

/**
 * Generate ellipse geometry
 * Now supports z coordinate for 3D
 */
function createEllipseGeometry(
  x: number,
  y: number,
  z: number,
  radiusX: number,
  radiusY: number,
  segments: number = 32
): Float32Array {
  const vertexCount = segments * 3 * 3
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2
    const angle2 = ((i + 1) / segments) * Math.PI * 2
    
    vertices[offset++] = x
    vertices[offset++] = y
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle1) * radiusX
    vertices[offset++] = y + Math.sin(angle1) * radiusY
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle2) * radiusX
    vertices[offset++] = y + Math.sin(angle2) * radiusY
    vertices[offset++] = z
  }
  
  return vertices
}

/**
 * Ellipse component
 */
export const ellipse: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [EllipseProps]
> = (props: EllipseProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedRadiusX: number | null = null
  let cachedRadiusY: number | null = null
  let cachedSegments: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsRX: number | null = null
  let cachedBoundsRY: number | null = null
  let cachedBoundsLW: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const radiusX = unref(props.radiusX)
      const radiusY = unref(props.radiusY)
      const lineWidth = unref(props.lineWidth) || 0
      
      if (cachedBounds && cachedBoundsRX === radiusX && cachedBoundsRY === radiusY && cachedBoundsLW === lineWidth) {
        const x = unref(props.x)
        const y = unref(props.y)
        const halfLineWidth = lineWidth / 2
        cachedBounds.x = x - radiusX - halfLineWidth
        cachedBounds.y = y - radiusY - halfLineWidth
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const halfLineWidth = lineWidth / 2

      cachedBounds = {
        x: x - radiusX - halfLineWidth,
        y: y - radiusY - halfLineWidth,
        width: (radiusX + halfLineWidth) * 2,
        height: (radiusY + halfLineWidth) * 2
      }
      cachedBoundsRX = radiusX
      cachedBoundsRY = radiusY
      cachedBoundsLW = lineWidth
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const z = unref(props.z) ?? 0
      const radiusX = unref(props.radiusX)
      const radiusY = unref(props.radiusY)
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
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
            cachedRadiusX !== radiusX ||
            cachedRadiusY !== radiusY ||
            cachedSegments !== segments) {
          cachedGeometry = createEllipseGeometry(0, 0, 0, radiusX, radiusY, segments)
          cachedRadiusX = radiusX
          cachedRadiusY = radiusY
          cachedSegments = segments
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
          `ellipse-${radiusX}-${radiusY}-${segments}`,
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
      unref(props.radiusX),
      unref(props.radiusY),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.segments),
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
