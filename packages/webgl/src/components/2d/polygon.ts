/**
 * Polygon component (2D/3D unified)
 * Supports both regular polygons (sides + radius) and custom polygons (points array)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds, Point } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface PolygonProps extends CommonDrawProps, TransformProps {
  points?: MaybeRef<Point[]>
  x?: MaybeRef<number>
  y?: MaybeRef<number>
  z?: MaybeRef<number>
  sides?: MaybeRef<number>
  radius?: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  closed?: MaybeRef<boolean>
  cornerRadius?: MaybeRef<number>
}

function createPolygonGeometry(
  points: Point[],
  z: number = 0
): Float32Array {
  if (points.length < 3) return new Float32Array(0)
  
  const vertices: number[] = []
  
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    
    vertices.push(0, 0, z)
    vertices.push(p1.x, p1.y, z)
    vertices.push(p2.x, p2.y, z)
  }
  
  return new Float32Array(vertices)
}

function calculatePoints(
  _x: number,
  _y: number,
  sides: number | undefined,
  radius: number | undefined,
  customPoints: Point[] | undefined
): { points: Point[], centerX: number, centerY: number } {
  if (sides !== undefined && radius !== undefined) {
    const pts: Point[] = []
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2
      pts.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      })
    }
    return { points: pts, centerX: 0, centerY: 0 }
  } else if (customPoints && customPoints.length >= 3) {
    let centerX = 0
    let centerY = 0
    for (const p of customPoints) {
      centerX += p.x
      centerY += p.y
    }
    centerX /= customPoints.length
    centerY /= customPoints.length
    
    const normalizedPoints = customPoints.map(p => ({
      x: p.x - centerX,
      y: p.y - centerY
    }))
    
    return { points: normalizedPoints, centerX, centerY }
  }
  
  return { points: [], centerX: 0, centerY: 0 }
}

export const polygon: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [PolygonProps]
> = (props: PolygonProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedPoints: Array<{ x: number; y: number }> | null = null
  let cachedCenterX: number = 0
  let cachedCenterY: number = 0
  
  return element({
    getBounds: (): Bounds => {
      const x = unref(props.x) ?? 0
      const y = unref(props.y) ?? 0
      const sides = unref(props.sides)
      const radius = unref(props.radius)
      const customPoints = unref(props.points)
      const lineWidth = unref(props.lineWidth) || 0
      const halfLineWidth = lineWidth / 2

      if (sides !== undefined && radius !== undefined) {
        return {
          x: x - radius - halfLineWidth,
          y: y - radius - halfLineWidth,
          width: radius * 2 + lineWidth,
          height: radius * 2 + lineWidth
        }
      }

      if (!customPoints || customPoints.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 }
      }

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const p of customPoints) {
        minX = Math.min(minX, p.x + x)
        minY = Math.min(minY, p.y + y)
        maxX = Math.max(maxX, p.x + x)
        maxY = Math.max(maxY, p.y + y)
      }

      return {
        x: minX - halfLineWidth,
        y: minY - halfLineWidth,
        width: maxX - minX + lineWidth,
        height: maxY - minY + lineWidth
      }
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x) ?? 0
      const y = unref(props.y) ?? 0
      const z = unref(props.z) ?? 0
      const sides = unref(props.sides)
      const radius = unref(props.radius)
      const customPoints = unref(props.points)
      const fill = unref(props.fill)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      const rotation = unref(props.rotation) ?? 0
      const rotationX = unref(props.rotationX) ?? 0
      const rotationY = unref(props.rotationY) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1
      const scaleZ = unref(props.scaleZ) ?? 1

      const renderContext = getRenderContext(gl)

      if (fill) {
        const { points, centerX, centerY } = calculatePoints(x, y, sides, radius, customPoints)
        
        if (points.length < 3) return

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
          cachedGeometry = createPolygonGeometry(points, 0)
          cachedPoints = points.map(p => ({ x: p.x, y: p.y }))
          cachedCenterX = centerX
          cachedCenterY = centerY
        }
        
        if (cachedGeometry) {
          const color = parseColor(fill)
          
          const transform = renderContext.getCurrentTransform()
          
          const finalOpacity = opacity * transform.opacity
          color.a *= finalOpacity
          
          const posX = (sides !== undefined ? x : cachedCenterX + x)
          const posY = (sides !== undefined ? y : cachedCenterY + y)
          
          const cos = Math.cos(transform.rotationZ)
          const sin = Math.sin(transform.rotationZ)
          const rotatedX = posX * cos - posY * sin
          const rotatedY = posX * sin + posY * cos
          
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
      unref(props.z),
      unref(props.sides),
      unref(props.radius),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.closed),
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
