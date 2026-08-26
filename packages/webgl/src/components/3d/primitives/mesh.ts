/**
 * Mesh component — renders an arbitrary 3D triangle mesh (loaded from OBJ /
 * GLTF etc.). The missing generic-geometry piece of the Rasen 3D story.
 *
 * Geometry is pre-baked (vertices + per-vertex UVs, already triangulated);
 * the component submits it to the batch renderer with a full T·R·S transform
 * and an optional texture. Reactive like every other shape.
 */

import type { Component3D } from '../../../node'
import type { MaybeRef, CommonDrawProps, TransformProps } from '../../../types'
import { unref, createTexture } from '../../../utils'
import { getRenderContext } from '../../../render-context'
import { element } from '../../element'

export interface MeshGeometry {
  /** Triangle vertices, xyz per vertex (world-unit local space). */
  vertices: Float32Array
  /** Per-vertex UVs (uv per vertex). Optional (defaults to zeros). */
  uv?: Float32Array
  /** Per-vertex normals (nx, ny, nz per vertex). Optional. Used for lighting. */
  normals?: Float32Array
}

export interface MeshProps extends CommonDrawProps, TransformProps {
  geometry: MaybeRef<MeshGeometry>
  x?: MaybeRef<number>
  y?: MaybeRef<number>
  texture?: MaybeRef<TexImageSource | undefined> | undefined
}

/**
 * Mesh — 3D triangle mesh primitive.
 *
 * @example
 * ```ts
 * <mesh geometry={marioGeo} texture={colormap} x={0} y={0} z={0} scale={32} rotationY={Math.PI} />
 * ```
 */
export const mesh: Component3D<MeshProps> = (props: MeshProps) => {
  return element({
    getBounds: () => null, // 3D — full redraw

    draw: (gl) => {
      const geo = unref(props.geometry)
      const textureSource = unref(props.texture)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      const x = unref(props.x) ?? 0
      const y = unref(props.y) ?? 0
      const z = unref(props.z) ?? 0
      const s = unref(props.scale) ?? 1
      const scaleX = (unref(props.scaleX) ?? 1) * s
      const scaleY = (unref(props.scaleY) ?? 1) * s
      const scaleZ = (unref(props.scaleZ) ?? 1) * s
      const rotationX = unref(props.rotationX) ?? 0
      const rotationY = unref(props.rotationY) ?? 0
      const rotationZ = (unref(props.rotationZ) ?? 0) + (unref(props.rotation) ?? 0)

      if (!visible || opacity <= 0 || !geo || geo.vertices.length === 0) return

      const renderContext = getRenderContext(gl)
      const batch = renderContext.getBatchRenderer()
      if (!batch) return

      const transform = renderContext.getCurrentTransform()
      const texture = textureSource ? createTexture(gl, textureSource) : null

      // Lighting is computed per-pixel in the fragment shader from world-space
      // normals (passed via `normals`). No CPU-side vertex color baking here.
      const finalTransform = {
        tx: transform.tx + x * transform.scaleX,
        ty: transform.ty + y * transform.scaleY,
        tz: transform.tz + z * transform.scaleZ,
        rotationX: transform.rotationX + rotationX,
        rotationY: transform.rotationY + rotationY,
        rotationZ: transform.rotationZ + rotationZ,
        scaleX: transform.scaleX * scaleX,
        scaleY: transform.scaleY * scaleY,
        scaleZ: transform.scaleZ * scaleZ,
      }

      renderContext.addShape(
        `mesh-${geo.vertices.length}`,
        geo.vertices,
        { r: 1, g: 1, b: 1, a: opacity * transform.opacity },
        finalTransform,
        geo.uv,
        texture,
        undefined,
        undefined,
        geo.normals,
      )
    },

    deps: () => [
      unref(props.geometry),
      unref(props.texture),
      unref(props.x),
      unref(props.y),
      unref(props.z),
      unref(props.scale),
      unref(props.scaleX),
      unref(props.scaleY),
      unref(props.scaleZ),
      unref(props.rotation),
      unref(props.rotationX),
      unref(props.rotationY),
      unref(props.rotationZ),
      unref(props.visible),
      unref(props.opacity),
    ],
  })
}
