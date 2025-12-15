/**
 * Rectangle component
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps, Bounds } from '../types'
import { unref, parseColor, createTranslationMatrix } from '../utils'
import { getRenderContext } from '../render-context'
import { element } from './element'

/**
 * Generate rectangle vertices (two triangles)
 */
function createRectGeometry(
  x: number,
  y: number,
  width: number,
  height: number
): Float32Array {
  return new Float32Array([
    // Triangle 1
    x, y,
    x + width, y,
    x, y + height,
    // Triangle 2
    x + width, y,
    x + width, y + height,
    x, y + height
  ])
}

export interface RectProps extends CommonDrawProps, TransformProps {
  x: MaybeRef<number>
  y: MaybeRef<number>
  width: MaybeRef<number>
  height: MaybeRef<number>
  fill?: MaybeRef<string>
  stroke?: MaybeRef<string>
  lineWidth?: MaybeRef<number>
  cornerRadius?: MaybeRef<number | number[]>
}

/**
 * Rectangle component
 */
export const rect: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [RectProps]
> = (props: RectProps) => {
  let cachedGeometry: Float32Array | null = null
  let cachedWidth: number | null = null
  let cachedHeight: number | null = null
  let cachedBounds: Bounds | null = null
  let cachedBoundsW: number | null = null
  let cachedBoundsH: number | null = null
  let cachedBoundsLW: number | null = null
  
  return element({
    getBounds: (): Bounds => {
      const width = unref(props.width)
      const height = unref(props.height)
      const lineWidth = unref(props.lineWidth) || 0
      
      if (cachedBounds && cachedBoundsW === width && cachedBoundsH === height && cachedBoundsLW === lineWidth) {
        const x = unref(props.x)
        const y = unref(props.y)
        const halfLineWidth = lineWidth / 2
        cachedBounds.x = x - halfLineWidth
        cachedBounds.y = y - halfLineWidth
        return cachedBounds
      }
      
      const x = unref(props.x)
      const y = unref(props.y)
      const halfLineWidth = lineWidth / 2

      cachedBounds = {
        x: x - halfLineWidth,
        y: y - halfLineWidth,
        width: width + lineWidth,
        height: height + lineWidth
      }
      cachedBoundsW = width
      cachedBoundsH = height
      cachedBoundsLW = lineWidth
      return cachedBounds
    },

    draw: (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const x = unref(props.x)
      const y = unref(props.y)
      const width = unref(props.width)
      const height = unref(props.height)
      const fill = unref(props.fill)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      if (!visible || opacity <= 0) return

      // Get batch renderer
      const renderContext = getRenderContext(gl)
      const batchRenderer = renderContext.getBatchRenderer()

      if (fill && batchRenderer) {
        // Check cache (only on size changes)
        if (!cachedGeometry || 
            cachedWidth !== width ||
            cachedHeight !== height) {
          cachedGeometry = createRectGeometry(0, 0, width, height)
          cachedWidth = width
          cachedHeight = height
        }

        // Parse color
        const color = parseColor(fill)
        color.a *= opacity

        // Use transform for positioning
        const transform = createTranslationMatrix(x, y)

        // Add to batch
        batchRenderer.addShape(cachedGeometry, color, transform)
      }

      // TODO: Implement stroke
      // TODO: Implement corner radius
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.width),
      unref(props.height),
      unref(props.fill),
      unref(props.stroke),
      unref(props.lineWidth),
      unref(props.cornerRadius),
      unref(props.visible),
      unref(props.opacity),
      unref(props.rotation),
      unref(props.scaleX),
      unref(props.scaleY)
    ]
  })
}
