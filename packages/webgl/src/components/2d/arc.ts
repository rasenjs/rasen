/**
 * Arc component (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface ArcProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  radius: MaybeRef<number>
  startAngle: MaybeRef<number>
  endAngle: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  segments?: MaybeRef<number>
}

/**
 * Generate arc geometry (pie slice)
 * Now supports z coordinate for 3D
 */
function createArcGeometry(
  x: number,
  y: number,
  z: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32
): Float32Array {
  const angleRange = endAngle - startAngle
  const segmentAngle = angleRange / segments
  
  const vertexCount = segments * 3 * 3
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < segments; i++) {
    const angle1 = startAngle + segmentAngle * i
    const angle2 = startAngle + segmentAngle * (i + 1)
    
    vertices[offset++] = x
    vertices[offset++] = y
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle1) * radius
    vertices[offset++] = y + Math.sin(angle1) * radius
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle2) * radius
    vertices[offset++] = y + Math.sin(angle2) * radius
    vertices[offset++] = z
  }
  
  return vertices
}

/**
 * Arc component
 */
export const arc: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [ArcProps]
> = (props: ArcProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedRadius: number | null = null
  let cachedStartAngle: number | null = null
  let cachedEndAngle: number | null = null
  let cachedSegments: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsR: number | null = null
  let cachedBoundsLW: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const radius = unref(props.radius)
      const lineWidth = unref(props.lineWidth) || 0
      
      if (cachedBounds && cachedBoundsR === radius && cachedBoundsLW === lineWidth) {
        const x = unref(props.x)
        const y = unref(props.y)
        const halfLineWidth = lineWidth / 2
        cachedBounds.x = x - radius - halfLineWidth
        cachedBounds.y = y - radius - halfLineWidth
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const halfLineWidth = lineWidth / 2

      cachedBounds = {
        x: x - radius - halfLineWidth,
        y: y - radius - halfLineWidth,
        width: (radius + halfLineWidth) * 2,
        height: (radius + halfLineWidth) * 2
      }
      cachedBoundsR = radius
      cachedBoundsLW = lineWidth
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const z = unref(props.z) ?? 0
      const radius = unref(props.radius)
      const startAngle = unref(props.startAngle)
      const endAngle = unref(props.endAngle)
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
            cachedRadius !== radius ||
            cachedStartAngle !== startAngle ||
            cachedEndAngle !== endAngle ||
            cachedSegments !== segments) {
          cachedGeometry = createArcGeometry(0, 0, 0, radius, startAngle, endAngle, segments)
          cachedRadius = radius
          cachedStartAngle = startAngle
          cachedEndAngle = endAngle
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
          `arc-${radius}-${segments}`,
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
      unref(props.radius),
      unref(props.startAngle),
      unref(props.endAngle),
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
