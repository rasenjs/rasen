/**
 * Star component (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface StarProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  numPoints: MaybeRef<number>
  innerRadius: MaybeRef<number>
  outerRadius: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
}

/**
 * Generate star geometry
 * Now supports z coordinate for 3D
 */
function createStarGeometry(
  x: number,
  y: number,
  z: number,
  numPoints: number,
  innerRadius: number,
  outerRadius: number
): Float32Array {
  const vertexCount = numPoints * 2 * 3 * 3
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  const angleStep = Math.PI / numPoints
  
  for (let i = 0; i < numPoints * 2; i++) {
    const angle1 = i * angleStep - Math.PI / 2
    const angle2 = (i + 1) * angleStep - Math.PI / 2
    
    const radius1 = i % 2 === 0 ? outerRadius : innerRadius
    const radius2 = (i + 1) % 2 === 0 ? outerRadius : innerRadius
    
    vertices[offset++] = x
    vertices[offset++] = y
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle1) * radius1
    vertices[offset++] = y + Math.sin(angle1) * radius1
    vertices[offset++] = z
    vertices[offset++] = x + Math.cos(angle2) * radius2
    vertices[offset++] = y + Math.sin(angle2) * radius2
    vertices[offset++] = z
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
      const z = unref(props.z) ?? 0
      const points = unref(props.numPoints)
      const innerRadius = unref(props.innerRadius)
      const outerRadius = unref(props.outerRadius)
      const fill = unref(props.fill)
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
            cachedPoints !== points ||
            cachedInnerRadius !== innerRadius ||
            cachedOuterRadius !== outerRadius) {
          cachedGeometry = createStarGeometry(0, 0, 0, points, innerRadius, outerRadius)
          cachedPoints = points
          cachedInnerRadius = innerRadius
          cachedOuterRadius = outerRadius
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
          `star-${points}`,
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
      unref(props.numPoints),
      unref(props.innerRadius),
      unref(props.outerRadius),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
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
