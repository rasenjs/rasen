/**
 * Ring component (donut shape) (2D/3D unified)
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../../types'
import { unref, parseColor } from '../../utils'
import { getRenderContext } from '../../render-context'
import { element } from '../element'

export interface RingProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  z?: MaybeRef<number>
  innerRadius: MaybeRef<number>
  outerRadius: MaybeRef<number>
  fill?: MaybeRef<string>
  segments?: MaybeRef<number>
}

/**
 * Generate ring geometry (donut)
 * Now supports z coordinate for 3D
 */
function createRingGeometry(
  x: number,
  y: number,
  z: number,
  innerRadius: number,
  outerRadius: number,
  segments: number = 32
): Float32Array {
  const vertexCount = segments * 6 * 3
  const vertices = new Float32Array(vertexCount)
  let offset = 0
  
  for (let i = 0; i < segments; i++) {
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
    
    vertices[offset++] = inner1X
    vertices[offset++] = inner1Y
    vertices[offset++] = z
    vertices[offset++] = outer1X
    vertices[offset++] = outer1Y
    vertices[offset++] = z
    vertices[offset++] = inner2X
    vertices[offset++] = inner2Y
    vertices[offset++] = z
    
    vertices[offset++] = outer1X
    vertices[offset++] = outer1Y
    vertices[offset++] = z
    vertices[offset++] = outer2X
    vertices[offset++] = outer2Y
    vertices[offset++] = z
    vertices[offset++] = inner2X
    vertices[offset++] = inner2Y
    vertices[offset++] = z
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
      const z = unref(props.z) ?? 0
      const innerRadius = unref(props.innerRadius)
      const outerRadius = unref(props.outerRadius)
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
            cachedInnerRadius !== innerRadius ||
            cachedOuterRadius !== outerRadius ||
            cachedSegments !== segments) {
          cachedGeometry = createRingGeometry(0, 0, 0, innerRadius, outerRadius, segments)
          cachedInnerRadius = innerRadius
          cachedOuterRadius = outerRadius
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
          `ring-${segments}`,
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
      unref(props.innerRadius),
      unref(props.outerRadius),
      unref(props.fill),
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
