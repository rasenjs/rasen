/**
 * Ellipse component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface EllipseProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  radiusX: MaybeRef<number>
  radiusY: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  segments?: MaybeRef<number>
}

/**
 * Generate ellipse geometry
 */
function createEllipseGeometry(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  segments: number = 32
): Float32Array {
  // Pre-allocate Float32Array
  const vertexCount = (segments + 1) * 3 * 2
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i <= segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2
    const angle2 = ((i + 1) / segments) * Math.PI * 2
    
    // Center point
    vertices[offset++] = x
    vertices[offset++] = y
    // First point on ellipse
    vertices[offset++] = x + Math.cos(angle1) * radiusX
    vertices[offset++] = y + Math.sin(angle1) * radiusY
    // Second point on ellipse
    vertices[offset++] = x + Math.cos(angle2) * radiusX
    vertices[offset++] = y + Math.sin(angle2) * radiusY
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
      const radiusX = unref(props.radiusX)
      const radiusY = unref(props.radiusY)
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1
      const rotation = unref(props.rotation) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1

      if (!visible || opacity <= 0) return

      const renderContext = getRenderContext(gl)

      if (fill) {
        if (!cachedGeometry || 
            cachedRadiusX !== radiusX ||
            cachedRadiusY !== radiusY ||
            cachedSegments !== segments) {
          cachedGeometry = createEllipseGeometry(0, 0, radiusX, radiusY, segments)
          cachedRadiusX = radiusX
          cachedRadiusY = radiusY
          cachedSegments = segments
        }
        const color = parseColor(fill)
        
        // Get accumulated transform from group hierarchy
        const transform = renderContext.getCurrentTransform()
        
        // Combine local opacity with group opacity
        const finalOpacity = opacity * transform.opacity
        color.a *= finalOpacity
        
        // Apply parent rotation to local position
        const cos = Math.cos(transform.rotation)
        const sin = Math.sin(transform.rotation)
        const rotatedX = x * cos - y * sin
        const rotatedY = x * sin + y * cos
        
        const finalTransform = {
          tx: transform.tx + rotatedX * transform.scaleX,
          ty: transform.ty + rotatedY * transform.scaleY,
          rotation: transform.rotation + rotation,
          scaleX: transform.scaleX * scaleX,
          scaleY: transform.scaleY * scaleY
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
      unref(props.radiusX),
      unref(props.radiusY),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.segments),
      unref(props.visible),
      unref(props.opacity),
      unref(props.rotation),
      unref(props.scaleX),
      unref(props.scaleY)
    ]
  })
}
