/**
 * Skybox — renders a panoramic sky texture as a large sphere around the scene.
 *
 * The sphere is rendered at the camera position with depth writing disabled,
 * so it always appears behind all other geometry.
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps } from '../../../types'
import { unref, createTexture } from '../../../utils'
import { getRenderContext } from '../../../render-context'
import { element } from '../../element'

export interface SkyboxProps extends CommonDrawProps {
  /** Panoramic sky texture (equirectangular). */
  texture: MaybeRef<TexImageSource | HTMLImageElement | HTMLCanvasElement | undefined>
  /** Radius of the sky sphere. Default 500. */
  radius?: MaybeRef<number>
  /** Camera eye position — skybox renders centered on this point. */
  position?: MaybeRef<{ x: number; y: number; z: number }>
}

/**
 * Generate a UV sphere mesh (positions + UVs).
 * The sphere is centered at origin with the given radius and segment counts.
 */
function createSphere(radius: number, widthSegs: number, heightSegs: number) {
  const positions: number[] = []
  const uvs: number[] = []

  for (let y = 0; y <= heightSegs; y++) {
    for (let x = 0; x <= widthSegs; x++) {
      const u = x / widthSegs
      const v = y / heightSegs
      // Offset U by 0.25 so texture center aligns with -Z (camera forward)
      const theta = (u + 0.25) * Math.PI * 2
      const phi = v * Math.PI

      const px = -radius * Math.sin(phi) * Math.cos(theta)
      const py = radius * Math.cos(phi)
      const pz = radius * Math.sin(phi) * Math.sin(theta)

      positions.push(px, py, pz)
      uvs.push(u, v)
    }
  }

  // Triangulate the grid into an indexed triangle list (like the glTF loader
  // does). The batch renderer draws with drawArrays (no index buffer), so the
  // vertices MUST be emitted in triangle order — a raw grid does not work.
  const verts: number[] = []
  const texs: number[] = []
  const idx = (y: number, x: number) => y * (widthSegs + 1) + x
  for (let y = 0; y < heightSegs; y++) {
    for (let x = 0; x < widthSegs; x++) {
      const a = idx(y, x)
      const b = idx(y + 1, x)
      const c = idx(y, x + 1)
      const d = idx(y + 1, x + 1)
      // Two triangles per quad: (a, b, c) and (b, d, c)
      for (const i of [a, b, c, b, d, c]) {
        verts.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
        texs.push(uvs[i * 2], uvs[i * 2 + 1])
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    uv: new Float32Array(texs),
  }
}

// Cache sphere geometry (only created once)
let cachedSphere: { vertices: Float32Array; uv: Float32Array } | null = null
let cachedRadius = 0

function getSphereGeometry(radius: number) {
  if (!cachedSphere || cachedRadius !== radius) {
    cachedSphere = createSphere(radius, 64, 32)
    cachedRadius = radius
  }
  return cachedSphere
}

/**
 * Skybox — renders a panoramic sky texture around the scene.
 *
 * @example
 * ```tsx
 * <skybox texture={skyTexture} radius={500} />
 * ```
 */
export const skybox: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [SkyboxProps]
> = (props: SkyboxProps) => {
  return element({
    getBounds: () => null,

    draw: (gl) => {
      const textureSource = unref(props.texture)
      if (!textureSource) return

      const radius = unref(props.radius) ?? 500
      const pos = unref(props.position) ?? { x: 0, y: 0, z: 0 }
      const renderContext = getRenderContext(gl)
      const batch = renderContext.getBatchRenderer()
      if (!batch) return

      const texture = createTexture(gl, textureSource, {
        wrapS: gl.REPEAT,
        wrapT: gl.CLAMP_TO_EDGE,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
      })
      const sphere = getSphereGeometry(radius)

      // Skybox is positioned at the camera eye — always surrounds the viewer.
      // depthWrite=false so it renders as background and scene geometry
      // (drawn after) still passes depth test and covers it.
      renderContext.addShape(
        `skybox-${radius}`,
        sphere.vertices,
        { r: 1, g: 1, b: 1, a: 1 },
        { tx: pos.x, ty: pos.y, tz: pos.z, scaleX: 1, scaleY: 1, scaleZ: 1 },
        sphere.uv,
        texture,
        undefined,
        false,
        undefined,
        undefined,
        true,
      )
    },

    deps: () => [props.texture, props.radius, props.position],
  })
}
