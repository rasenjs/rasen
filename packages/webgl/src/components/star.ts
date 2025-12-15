/**
 * Star component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

export interface StarProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  numPoints: MaybeRef<number>
  innerRadius: MaybeRef<number>
  outerRadius: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
}

/**
 * Generate star geometry
 */
function createStarGeometry(
  x: number,
  y: number,
  numPoints: number,
  innerRadius: number,
  outerRadius: number
): Float32Array {
  // Pre-allocate Float32Array
  const vertexCount = numPoints * 2 * 3 * 2 // points * 2 * triangles * vertices * coords
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  const angleStep = Math.PI / numPoints
  
  for (let i = 0; i < numPoints * 2; i++) {
    const angle1 = i * angleStep - Math.PI / 2
    const angle2 = (i + 1) * angleStep - Math.PI / 2
    
    const radius1 = i % 2 === 0 ? outerRadius : innerRadius
    const radius2 = (i + 1) % 2 === 0 ? outerRadius : innerRadius
    
    // Center point
    vertices[offset++] = x
    vertices[offset++] = y
    // First point
    vertices[offset++] = x + Math.cos(angle1) * radius1
    vertices[offset++] = y + Math.sin(angle1) * radius1
    // Second point
    vertices[offset++] = x + Math.cos(angle2) * radius2
    vertices[offset++] = y + Math.sin(angle2) * radius2
  }
  
  return vertices
}

/**
 * Star component
 */
export const star: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [StarProps]
> = (props: StarProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedPoints: number | null = null
  let cachedInnerRadius: number | null = null
  let cachedOuterRadius: number | null = null
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
      const points = unref(props.numPoints)
      const innerRadius = unref(props.innerRadius)
      const outerRadius = unref(props.outerRadius)
      const fill = unref(props.fill)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (fill && batchRenderer) {
        if (!cachedGeometry || 
            cachedPoints !== points ||
            cachedInnerRadius !== innerRadius ||
            cachedOuterRadius !== outerRadius) {
          cachedGeometry = createStarGeometry(0, 0, points, innerRadius, outerRadius)
          cachedPoints = points
          cachedInnerRadius = innerRadius
          cachedOuterRadius = outerRadius
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
      unref(props.numPoints),
      unref(props.innerRadius),
      unref(props.outerRadius),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
