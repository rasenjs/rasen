/**
 * Circle component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

/**
 * Generate circle vertices (triangle fan approximation)
 */
function createCircleGeometry(
  x: number,
  y: number,
  radius: number,
  segments: number = 32
): Float32Array {
  // Pre-allocate Float32Array for better performance
  const vertexCount = (segments + 1) * 3 * 2 // (segments+1) triangles, 3 vertices, 2 coords
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i <= segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2
    const angle2 = ((i + 1) / segments) * Math.PI * 2
    
    // Triangle: center, point1, point2
    vertices[offset++] = x
    vertices[offset++] = y
    vertices[offset++] = x + Math.cos(angle1) * radius
    vertices[offset++] = y + Math.sin(angle1) * radius
    vertices[offset++] = x + Math.cos(angle2) * radius
    vertices[offset++] = y + Math.sin(angle2) * radius
  }
  
  return vertices
}

export interface CircleProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  radius: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  segments?: MaybeRef<number> // Number of segments for circle approximation
}

/**
 * Circle component
 */
export const circle: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [CircleProps]
> = (props: CircleProps) => {
  // Cache geometry to avoid recalculating every frame
  // Geometry is generated at origin (0,0), position is handled by transform matrix
  let cachedGeometry: Float32Array | null = null
  let cachedRadius: number | null = null
  let cachedSegments: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsRadius: number | null = null
  let cachedBoundsLineWidth: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const radius = unref(props.radius)
      const lineWidth = unref(props.lineWidth) || 0
      
      // Cache bounds if radius and lineWidth unchanged
      if (cachedBounds && cachedBoundsRadius === radius && cachedBoundsLineWidth === lineWidth) {
        // Update position only
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
      const size = (radius + halfLineWidth) * 2

      cachedBounds = {
        x: x - radius - halfLineWidth,
        y: y - radius - halfLineWidth,
        width: size,
        height: size
      }
      cachedBoundsRadius = radius
      cachedBoundsLineWidth = lineWidth
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const radius = unref(props.radius)
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0 || radius <= 0) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (fill && batchRenderer) {
        // Check if geometry needs to be regenerated (only on shape changes)
        if (cachedGeometry === null || 
            cachedRadius !== radius || 
            cachedSegments !== segments) {
          cachedGeometry = createCircleGeometry(0, 0, radius, segments)
          cachedRadius = radius
          cachedSegments = segments
        }

        // Parse color
        const color = parseColor(fill)
        color.a *= opacity

        // Use transform matrix for positioning
        const transform = createTranslationMatrix(x, y)

        // Add to batch
        batchRenderer.addShape(cachedGeometry, color, transform)
      }

      // TODO: Implement stroke
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radius),
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
