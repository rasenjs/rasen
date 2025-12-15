/**
 * Arc component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

export interface ArcProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
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
 */
function createArcGeometry(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32
): Float32Array {
  const angleRange = endAngle - startAngle
  const segmentAngle = angleRange / segments
  
  // Pre-allocate Float32Array
  const vertexCount = segments * 3 * 2
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < segments; i++) {
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
      const radius = unref(props.radius)
      const startAngle = unref(props.startAngle)
      const endAngle = unref(props.endAngle)
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
            cachedStartAngle !== startAngle ||
            cachedEndAngle !== endAngle ||
            cachedSegments !== segments) {
          cachedGeometry = createArcGeometry(0, 0, radius, startAngle, endAngle, segments)
          cachedRadius = radius
          cachedStartAngle = startAngle
          cachedEndAngle = endAngle
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
      unref(props.startAngle),
      unref(props.endAngle),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.segments),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
