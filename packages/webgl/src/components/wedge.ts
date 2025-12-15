/**
 * Wedge component (pie slice)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

export interface WedgeProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  radius: MaybeRef<number>
  angle: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  rotation?: MaybeRef<number>
  segments?: MaybeRef<number>
}

/**
 * Generate wedge geometry
 */
function createWedgeGeometry(
  x: number,
  y: number,
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
  
  // Pre-allocate Float32Array
  const vertexCount = actualSegments * 3 * 2 // triangles * vertices * coords
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < actualSegments; i++) {
    const angle1 = startAngle + segmentAngle * i
    const angle2 = startAngle + segmentAngle * (i + 1)
    
    // Center point
    vertices[offset++] = x
    vertices[offset++] = y
    // First point on arc
    vertices[offset++] = x + Math.cos(angle1) * radius
    vertices[offset++] = y + Math.sin(angle1) * radius
    // Second point on arc
    vertices[offset++] = x + Math.cos(angle2) * radius
    vertices[offset++] = y + Math.sin(angle2) * radius
  }
  
  return vertices
}

/**
 * Wedge component
 */
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
      const radius = unref(props.radius)
      const angle = unref(props.angle)
      const rotation = unref(props.rotation) ?? 0
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (fill && batchRenderer) {
        if (!cachedGeometry || 
            cachedRadius !== radius ||
            cachedAngle !== angle ||
            cachedRotation !== rotation ||
            cachedSegments !== segments) {
          cachedGeometry = createWedgeGeometry(0, 0, radius, angle, rotation, segments)
          cachedRadius = radius
          cachedAngle = angle
          cachedRotation = rotation
          cachedSegments = segments
        }
        const color = parseColor(fill)
        color.a *= opacity
        const transform = createTranslationMatrix(x, y)
        batchRenderer.addShape(cachedGeometry, color, transform)
      }
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radius),
      unref(props.angle),
      unref(props.rotation),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.segments),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
