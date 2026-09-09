/**
 * Asset loader — loads all Kenney Racing models, textures, and sounds.
 *
 * Track pieces / decorations / AI trucks are single-mesh GLBs → loaded with
 * the standard merged loader. The player truck is loaded as SEPARATE parts
 * (body + wheels) so the wheels can spin and steer independently, matching
 * the Godot vehicle.gd effects.
 */

import { loadGLB, type LoadedGLTF } from '@rasenjs/gfx'
import { Mat4x4f } from '@rasenjs/math'

export interface RacingAssets {
  models: Map<string, LoadedGLTF>
  /** Player truck split into named parts (body, wheels, underside). */
  truckParts: Map<string, TruckPart>
  textures: Map<string, HTMLImageElement>
  sounds: Map<string, HTMLAudioElement>
}

/**
 * A single truck part: geometry centered on its own bounding-box center
 * (so it can spin/steer around its own origin) plus the world offset of that
 * center (so the renderer can place it back in the truck's local space).
 */
export interface TruckPart {
  geo: LoadedGLTF
  center: { x: number; y: number; z: number }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function loadSound(url: string): HTMLAudioElement {
  const audio = new Audio(url)
  audio.preload = 'auto'
  return audio
}

/**
 * Load a GLB and return each node-with-mesh as a separate part. Each part's
 * geometry is centered on its own bounding-box center (so a wheel can spin
 * around its hub), and the world offset of that center is returned separately
 * so the renderer can place the part back in the truck's local space.
 */
export async function loadGLBParts(
  url: string,
  _textureUrl?: string,
  sharedTexture?: HTMLImageElement | HTMLCanvasElement,
): Promise<Map<string, TruckPart>> {
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  const view = new DataView(buf)

  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) throw new Error(`Invalid GLB: ${magic.toString(16)}`)

  let offset = 12
  const jsonLen = view.getUint32(offset, true)
  offset += 8
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, offset, jsonLen)))
  offset += jsonLen

  let binOffset = 0
  let binLen = 0
  if (offset < buf.byteLength) {
    binLen = view.getUint32(offset, true)
    offset += 8
    binOffset = offset
  }
  const binView = new Uint8Array(buf, binOffset, binLen)

  const getTypeSize = (t: string) => (t === 'SCALAR' ? 1 : t === 'VEC2' ? 2 : t === 'VEC3' ? 3 : 4)
  const getComponentSize = (ct: number) => (ct === 5126 ? 4 : ct === 5123 ? 2 : ct === 5125 ? 4 : 1)

  const readAccessor = (accessor: { bufferView: number; componentType: number; count: number; type: string }) => {
    const bv = json.bufferViews[accessor.bufferView]
    const baseOffset = bv.byteOffset ?? 0
    const components = getTypeSize(accessor.type)
    const bytesPerComponent = getComponentSize(accessor.componentType)
    const stride = bv.byteStride
    const abOffset = binView.byteOffset
    if (stride && stride > components * bytesPerComponent) {
      const result = new Float32Array(accessor.count * components)
      for (let i = 0; i < accessor.count; i++) {
        const o = baseOffset + i * stride
        for (let c = 0; c < components; c++) {
          result[i * components + c] = new DataView(binView.buffer, abOffset + o + c * bytesPerComponent, bytesPerComponent).getFloat32(0, true)
        }
      }
      return result
    }
    const byteLength = bv.byteLength
    const tightStart = abOffset + baseOffset
    switch (accessor.componentType) {
      case 5126: return new Float32Array(binView.buffer, tightStart, Math.min(byteLength / 4, accessor.count * components))
      case 5123: return new Uint16Array(binView.buffer, tightStart, Math.min(byteLength / 2, accessor.count * components))
      case 5125: return new Uint32Array(binView.buffer, tightStart, Math.min(byteLength / 4, accessor.count * components))
      case 5121: return new Uint8Array(binView.buffer, tightStart, Math.min(byteLength, accessor.count * components))
      default: return new Float32Array(binView.buffer, tightStart, Math.min(byteLength / 4, accessor.count * components))
    }
  }

  const parts = new Map<string, TruckPart>()
  const rootNodes = json.scenes?.[0]?.nodes ?? []

  const visit = (nodeIdx: number, parent: Mat4x4f) => {
    const node = json.nodes[nodeIdx]
    if (!node) return
    let local = Mat4x4f.identity()
    if (node.translation) local = local.multiply(Mat4x4f.translate(node.translation[0], node.translation[1], node.translation[2]))
    if (node.rotation) local = local.multiply(quatToMat4(node.rotation as [number, number, number, number]))
    if (node.scale) local = local.multiply(Mat4x4f.scale(node.scale[0], node.scale[1], node.scale[2]))
    const world = parent.multiply(local)

    if (node.mesh !== undefined && json.meshes?.[node.mesh]) {
      const mesh = json.meshes[node.mesh]
      const allPos: number[] = []
      const allUV: number[] = []
      const allNorm: number[] = []
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      const m = world.source
      for (const prim of mesh.primitives) {
        const posData = readAccessor(json.accessors[prim.attributes.POSITION]) as Float32Array
        const uvData = prim.attributes.TEXCOORD_0 !== undefined
          ? readAccessor(json.accessors[prim.attributes.TEXCOORD_0]) as Float32Array
          : null
        const normData = prim.attributes.NORMAL !== undefined
          ? readAccessor(json.accessors[prim.attributes.NORMAL]) as Float32Array
          : null
        const emit = (vi: number) => {
          const x = posData[vi * 3], y = posData[vi * 3 + 1], z = posData[vi * 3 + 2]
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12]
          const wy = m[1] * x + m[5] * y + m[9] * z + m[13]
          const wz = m[2] * x + m[6] * y + m[10] * z + m[14]
          allPos.push(wx, wy, wz)
          minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz)
          maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz)
          if (uvData) allUV.push(uvData[vi * 2], uvData[vi * 2 + 1])
          if (normData) {
            const nx = normData[vi * 3], ny = normData[vi * 3 + 1], nz = normData[vi * 3 + 2]
            const nwx = m[0] * nx + m[4] * ny + m[8] * nz
            const nwy = m[1] * nx + m[5] * ny + m[9] * nz
            const nwz = m[2] * nx + m[6] * ny + m[10] * nz
            const nl = Math.hypot(nwx, nwy, nwz) || 1
            allNorm.push(nwx / nl, nwy / nl, nwz / nl)
          }
        }
        if (prim.indices !== undefined) {
          const idx = readAccessor(json.accessors[prim.indices]) as Uint16Array | Uint32Array
          for (let i = 0; i < idx.length; i++) emit(idx[i])
        } else {
          for (let i = 0; i < posData.length / 3; i++) emit(i)
        }
      }
      // Center the geometry on its own bounding-box center so the part can
      // spin/steer around its own origin (e.g. a wheel around its hub).
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const cz = (minZ + maxZ) / 2
      const centered = new Float32Array(allPos.length)
      for (let i = 0; i < allPos.length; i += 3) {
        centered[i] = allPos[i] - cx
        centered[i + 1] = allPos[i + 1] - cy
        centered[i + 2] = allPos[i + 2] - cz
      }
      parts.set(node.name ?? `part-${nodeIdx}`, {
        geo: {
          vertices: centered,
          uv: allUV.length ? new Float32Array(allUV) : undefined,
          normals: allNorm.length ? new Float32Array(allNorm) : undefined,
          texture: sharedTexture,
          bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        },
        center: { x: cx, y: cy, z: cz },
      })
    }
    for (const c of node.children ?? []) visit(c, world)
  }

  for (const rn of rootNodes) visit(rn, Mat4x4f.identity())
  return parts
}

function quatToMat4(q: [number, number, number, number]): Mat4x4f {
  const [x, y, z, w] = q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z
  return new Mat4x4f([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ])
}

export async function loadRacingAssets(onProgress?: (msg: string) => void): Promise<RacingAssets> {
  onProgress?.('Loading 3D models...')

  const sharedColormap = await loadImage('/models/Textures/colormap.png')

  const modelList = [
    'track-straight', 'track-corner', 'track-finish', 'track-bump', 'track-tents',
    'decoration-empty', 'decoration-forest', 'decoration-tents',
    'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-red',
  ]
  const models = new Map<string, LoadedGLTF>()
  for (const name of modelList) {
    models.set(name, await loadGLB(`/models/${name}.glb`, '/models/Textures/colormap.png', sharedColormap))
    onProgress?.(`Models: ${models.size}/${modelList.length}`)
  }

  onProgress?.('Loading player truck parts...')
  const truckParts = await loadGLBParts('/models/vehicle-truck-yellow.glb', '/models/Textures/colormap.png', sharedColormap)

  onProgress?.('Loading textures...')
  const textures = new Map<string, HTMLImageElement>()
  textures.set('smoke', await loadImage('/smoke.png'))

  onProgress?.('Loading sounds...')
  const sounds = new Map<string, HTMLAudioElement>()
  for (const name of ['engine', 'skid', 'impact']) {
    sounds.set(name, loadSound(`/sounds/${name}.ogg`))
  }

  onProgress?.('Ready!')
  return { models, truckParts, textures, sounds }
}