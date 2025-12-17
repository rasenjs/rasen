/**
 * Polygon component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds, Point } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface PolygonProps extends CommonDrawProps, TransformProps {
  points: MaybeRef<Point[]>
  x?: MaybeRef<number>
  y?: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  closed?: MaybeRef<boolean>
}

/**
 * Generate polygon geometry
 */
function createPolygonGeometry(
  points: Point[],
  offsetX: number = 0,
  offsetY: number = 0
): Float32Array {
  if (points.length < 3) return new Float32Array(0)
  
  const vertices: number[] = []
  
  // Calculate center point
  let centerX = 0
  let centerY = 0
  for (const p of points) {
    centerX += p.x
    centerY += p.y
  }
  centerX = centerX / points.length + offsetX
  centerY = centerY / points.length + offsetY
  
  // Create triangles from center to each edge
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    
    // Triangle: center, p1, p2
    vertices.push(centerX, centerY)
    vertices.push(p1.x + offsetX, p1.y + offsetY)
    vertices.push(p2.x + offsetX, p2.y + offsetY)
  }
  
  return new Float32Array(vertices)
}

/**
 * Polygon component
 */
export const polygon: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [PolygonProps]
> = (props: PolygonProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedPoints: Array<{ x: number; y: number }> | null = null
  
  return element({
    getBounds: (): Bounds => {
      const points = unref(props.points)
      if (!points || points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 }
      }
      
      const offsetX = unref(props.x) ?? 0
      const offsetY = unref(props.y) ?? 0
      const lineWidth = unref(props.lineWidth) || 0
      const halfLineWidth = lineWidth / 2

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const p of points) {
        minX = Math.min(minX, p.x + offsetX)
        minY = Math.min(minY, p.y + offsetY)
        maxX = Math.max(maxX, p.x + offsetX)
        maxY = Math.max(maxY, p.y + offsetY)
      }

      return {
        x: minX - halfLineWidth,
        y: minY - halfLineWidth,
        width: maxX - minX + lineWidth,
        height: maxY - minY + lineWidth
      }
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const points = unref(props.points)
      if (!points || points.length < 3) return
      
      const offsetX = unref(props.x) ?? 0
      const offsetY = unref(props.y) ?? 0
      const fill = unref(props.fill)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      const rotation = unref(props.rotation) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1

      const renderContext = getRenderContext(gl)

      if (fill) {
        // Check cache - need deep compare for points array
        let needsRegen = !cachedGeometry || 
          !cachedPoints || 
          cachedPoints.length !== points.length
        
        if (!needsRegen && cachedPoints) {
          for (let i = 0; i < points.length; i++) {
            if (cachedPoints[i].x !== points[i].x || cachedPoints[i].y !== points[i].y) {
              needsRegen = true
              break
            }
          }
        }
        
        if (needsRegen) {
          cachedGeometry = createPolygonGeometry(points, 0, 0)
          cachedPoints = points.map(p => ({ x: p.x, y: p.y }))
        }
        
        // Type guard: ensure geometry is not null after regeneration
        if (cachedGeometry) {
          const color = parseColor(fill)
          
          // Get accumulated transform from group hierarchy
          const transform = renderContext.getCurrentTransform()
          
          // Combine local opacity with group opacity
          const finalOpacity = opacity * transform.opacity
          color.a *= finalOpacity
          
          // Apply parent rotation to local position
          const cos = Math.cos(transform.rotation)
          const sin = Math.sin(transform.rotation)
          const rotatedX = offsetX * cos - offsetY * sin
          const rotatedY = offsetX * sin + offsetY * cos
          
          const finalTransform = {
            tx: transform.tx + rotatedX * transform.scaleX,
            ty: transform.ty + rotatedY * transform.scaleY,
            rotation: transform.rotation + rotation,
            scaleX: transform.scaleX * scaleX,
            scaleY: transform.scaleY * scaleY
          }
          
          renderContext.addShape(
            `polygon-${points.length}`,
            cachedGeometry,
            color,
            finalTransform
          )
        }
      }
    },

    deps: () => [
      unref(props.points),
      unref(props.x),
      unref(props.y),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.closed),
      unref(props.visible),
      unref(props.opacity)
    ]
  })
}
