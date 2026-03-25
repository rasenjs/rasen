/**
 * Wedge component (pie slice) (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface WedgeProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  radius: MaybeRef<number>
  angle: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  rotation?: MaybeRef<number>
  segments?: MaybeRef<number>
}

function createWedgeGeometry(
  x: number,
  y: number,
  z: number,
  radius: number,
  angle: number,
  rotation: number = 0,
  segments: number = 32
): Float32Array {
  const startAngle = rotation
  const endAngle = rotation + angle
  const angleRange = endAngle - startAngle
  const actualSegments = Math.max(1, Math.round(segments * (angle / (Math.PI * 2))))
  const segmentAngle = angleRange / actualSegments
  
  const vertexCount = actualSegments * 3 * 3
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < actualSegments; i++) {
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

export const wedge: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [WedgeProps]
> = (props: WedgeProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedRadius: number | null = null
  let cachedAngle: number | null = null
  let cachedRotation: number | null = null
  let cachedSegments: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsR: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const radius = unref(props.radius)
      
      if (cachedBounds && cachedBoundsR === radius) {
        const x = unref(props.x)
        const y = unref(props.y)
        cachedBounds.x = x - radius
        cachedBounds.y = y - radius
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const size = radius * 2

      cachedBounds = {
        x: x - radius,
        y: y - radius,
        width: size,
        height: size
      }
      cachedBoundsR = radius
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const z = unref(props.z) ?? 0
      const radius = unref(props.radius)
      const angle = unref(props.angle)
      const rotation = unref(props.rotation) ?? 0
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

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
            cachedAngle !== angle ||
            cachedRotation !== rotation ||
            cachedSegments !== segments) {
          cachedGeometry = createWedgeGeometry(0, 0, 0, radius, angle, rotation, segments)
          cachedRadius = radius
          cachedAngle = angle
          cachedRotation = rotation
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
          `wedge-${segments}`,
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
      unref(props.angle),
      unref(props.rotation),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.segments),
      unref(props.visible),
      unref(props.opacity),
      unref(props.rotationX),
      unref(props.rotationY),
      unref(props.scaleX),
      unref(props.scaleY),
      unref(props.scaleZ)
    ]
  })
}
