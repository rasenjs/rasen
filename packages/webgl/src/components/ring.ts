/**
 * Ring component (donut shape)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

export interface RingProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  innerRadius: MaybeRef<number>
  outerRadius: MaybeRef<number>
  fill?: MaybeRef<string>
  segments?: MaybeRef<number>
}

/**
 * Generate ring geometry (donut)
 */
function createRingGeometry(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  segments: number = 32
): Float32Array {
  // Pre-allocate Float32Array
  const vertexCount = (segments + 1) * 6 * 2 // segments * 2 triangles * 3 vertices * 2 coords
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i <= segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2
    const angle2 = ((i + 1) / segments) * Math.PI * 2
    
    const inner1X = x + Math.cos(angle1) * innerRadius
    const inner1Y = y + Math.sin(angle1) * innerRadius
    const outer1X = x + Math.cos(angle1) * outerRadius
    const outer1Y = y + Math.sin(angle1) * outerRadius
    
    const inner2X = x + Math.cos(angle2) * innerRadius
    const inner2Y = y + Math.sin(angle2) * innerRadius
    const outer2X = x + Math.cos(angle2) * outerRadius
    const outer2Y = y + Math.sin(angle2) * outerRadius
    
    // Triangle 1
    vertices[offset++] = inner1X
    vertices[offset++] = inner1Y
    vertices[offset++] = outer1X
    vertices[offset++] = outer1Y
    vertices[offset++] = inner2X
    vertices[offset++] = inner2Y
    
    // Triangle 2
    vertices[offset++] = outer1X
    vertices[offset++] = outer1Y
    vertices[offset++] = outer2X
    vertices[offset++] = outer2Y
    vertices[offset++] = inner2X
    vertices[offset++] = inner2Y
  }
  
  return vertices
}

/**
 * Ring component
 */
export const ring: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [RingProps]
> = (props: RingProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedInnerRadius: number | null = null
  let cachedOuterRadius: number | null = null
  let cachedSegments: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsOR: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const outerRadius = unref(props.outerRadius)
      
      if (cachedBounds && cachedBoundsOR === outerRadius) {
        const x = unref(props.x)
        const y = unref(props.y)
        cachedBounds.x = x - outerRadius
        cachedBounds.y = y - outerRadius
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const size = outerRadius * 2

      cachedBounds = {
        x: x - outerRadius,
        y: y - outerRadius,
        width: size,
        height: size
      }
      cachedBoundsOR = outerRadius
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const innerRadius = unref(props.innerRadius)
      const outerRadius = unref(props.outerRadius)
      const fill = unref(props.fill)
      const segments = unref(props.segments) ?? 32
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (fill && batchRenderer) {
        if (!cachedGeometry || 
            cachedInnerRadius !== innerRadius ||
            cachedOuterRadius !== outerRadius ||
            cachedSegments !== segments) {
          cachedGeometry = createRingGeometry(0, 0, innerRadius, outerRadius, segments)
          cachedInnerRadius = innerRadius
          cachedOuterRadius = outerRadius
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
      unref(props.innerRadius),
      unref(props.outerRadius),
      unref(props.fill),
      unref(props.segments),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
