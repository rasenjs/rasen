/**
 * glTF 2.0 / GLB loader.
 *
 * Parses the binary glTF container (JSON + binary chunk), extracts mesh
 * geometry (triangulated positions + UVs) and texture references, and
 * returns data ready for rasen's `mesh` component.
 */

import type { MeshGeometry } from '../components/3d/primitives/mesh'
import { Mat4x4f } from '@rasenjs/math'

export interface LoadedGLTF extends MeshGeometry {
  texture?: HTMLImageElement | HTMLCanvasElement
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

interface GLTFAccessor {
  bufferView: number
  componentType: number
  count: number
  type: string
  min?: number[]
  max?: number[]
}

interface GLTFBufferView {
  buffer: number
  /** Byte offset within the buffer. Defaults to 0 per the glTF spec. */
  byteOffset?: number
  byteLength: number
  byteStride?: number
}

function getTypeSize(type: string): number {
  switch (type) {
    case 'SCALAR': return 1
    case 'VEC2': return 2
    case 'VEC3': return 3
    case 'VEC4': return 4
    default: return 1
  }
}

function getComponentSize(componentType: number): number {
  switch (componentType) {
    case 5126: return 4 // FLOAT
    case 5123: return 2 // UNSIGNED_SHORT
    case 5125: return 4 // UNSIGNED_INT
    case 5121: return 1 // UNSIGNED_BYTE
    default: return 4
  }
}

function readAccessor(
  accessor: GLTFAccessor,
  bufferViews: GLTFBufferView[],
  binData: Uint8Array,
): Float32Array | Uint16Array | Uint32Array | Uint8Array {
  const bv = bufferViews[accessor.bufferView]
  const baseOffset = bv.byteOffset ?? 0
  const components = getTypeSize(accessor.type)
  const count = accessor.count
  const bytesPerComponent = getComponentSize(accessor.componentType)
  const stride = bv.byteStride

  // abOffset = the Uint8Array's position in the original ArrayBuffer
  const abOffset = binData.byteOffset

  // Strided layout: elements are interleaved with padding — must read each separately
  if (stride && stride > components * bytesPerComponent) {
    const result = new Float32Array(count * components)
    for (let i = 0; i < count; i++) {
      const offset = baseOffset + i * stride
      for (let c = 0; c < components; c++) {
        result[i * components + c] = new DataView(binData.buffer, abOffset + offset + c * bytesPerComponent, bytesPerComponent).getFloat32(0, true)
      }
    }
    return result
  }

  // Tight layout: contiguous block
  const byteLength = bv.byteLength
  const tightStart = abOffset + baseOffset
  switch (accessor.componentType) {
    case 5126: return new Float32Array(binData.buffer, tightStart, Math.min(byteLength / 4, count * components))
    case 5123: return new Uint16Array(binData.buffer, tightStart, Math.min(byteLength / 2, count * components))
    case 5125: return new Uint32Array(binData.buffer, tightStart, Math.min(byteLength / 4, count * components))
    case 5121: return new Uint8Array(binData.buffer, tightStart, Math.min(byteLength, count * components))
    default:   return new Float32Array(binData.buffer, tightStart, Math.min(byteLength / 4, count * components))
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Load a GLB (glTF 2.0 Binary) file and extract geometry + optional texture.
 *
 * Supports multi-mesh models with node hierarchy (TRS transforms): all meshes
 * reachable from the scene's root nodes are transformed into world space and
 * merged into one triangle list — e.g. Kenney's enemy-flying.glb (torso +
 * antenna + blaster-left + blaster-right) becomes a single mesh.
 */
export async function loadGLB(
  url: string,
  textureUrl?: string,
  sharedTexture?: HTMLImageElement | HTMLCanvasElement,
): Promise<LoadedGLTF> {
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  const view = new DataView(buf)

  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) throw new Error(`Invalid GLB: ${magic.toString(16)}`)
  const version = view.getUint32(4, true)
  if (version !== 2) throw new Error(`Unsupported glTF version: ${version}`)

  let offset = 12

  // JSON chunk
  const jsonLen = view.getUint32(offset, true)
  offset += 8 // skip len + type
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, offset, jsonLen)))
  offset += jsonLen

  // Binary chunk — pass the ORIGINAL buffer + offset to readAccessor
  // (do NOT slice — Uint8Array.slice in Node gives wrong byteOffset)
  let binOffset = 0
  let binLen = 0
  if (offset < buf.byteLength) {
    binLen = view.getUint32(offset, true)
    offset += 8
    binOffset = offset // absolute offset into the original ArrayBuffer
  }

  const binView = new Uint8Array(buf, binOffset, binLen)

  // --- Collect all meshes reachable from the scene root, applying node TRS ---
  const allPos: number[] = []
  const allUV: number[] = []
  const allNorm: number[] = []
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const rootNodes = json.scenes?.[0]?.nodes ?? (json.meshes ? json.meshes.map((_: unknown, i: number) => i) : [])

  const visit = (nodeIdx: number, parent: Mat4x4f) => {
    const node = json.nodes[nodeIdx]
    if (!node) return
    // Local TRS matrix
    let local = Mat4x4f.identity()
    const t = node.translation
    if (t) local = local.multiply(Mat4x4f.translate(t[0], t[1], t[2]))
    const r = node.rotation
    if (r) local = local.multiply(quatToMat4(r as [number, number, number, number]))
    const s = node.scale
    if (s) local = local.multiply(Mat4x4f.scale(s[0], s[1], s[2]))
    const world = parent.multiply(local)

    if (node.mesh !== undefined && json.meshes?.[node.mesh]) {
      const mesh = json.meshes[node.mesh]
      for (const prim of mesh.primitives) {
        extractPrimitive(prim, world)
      }
    }
    for (const c of node.children ?? []) visit(c, world)
  }

  const extractPrimitive = (prim: unknown, world: Mat4x4f) => {
    const p = prim as { attributes: Record<string, number>; indices?: number }
    const posAccessor = json.accessors[p.attributes.POSITION]
    const posData = readAccessor(posAccessor, json.bufferViews, binView) as Float32Array
    const uvData = p.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(json.accessors[p.attributes.TEXCOORD_0], json.bufferViews, binView) as Float32Array
      : null
    const normData = p.attributes.NORMAL !== undefined
      ? readAccessor(json.accessors[p.attributes.NORMAL], json.bufferViews, binView) as Float32Array
      : null

    const m = world.source
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
        // Transform normal by the 3x3 part (rotation+scale), renormalized later.
        const nwx = m[0] * nx + m[4] * ny + m[8] * nz
        const nwy = m[1] * nx + m[5] * ny + m[9] * nz
        const nwz = m[2] * nx + m[6] * ny + m[10] * nz
        const nl = Math.hypot(nwx, nwy, nwz) || 1
        allNorm.push(nwx / nl, nwy / nl, nwz / nl)
      }
    }

    if (p.indices !== undefined) {
      const idxData = readAccessor(json.accessors[p.indices], json.bufferViews, binView)
      for (let i = 0; i < idxData.length; i++) emit(idxData[i])
    } else {
      const count = posData.length / 3
      for (let i = 0; i < count; i++) emit(i)
    }
  }

  for (const n of rootNodes) visit(n, Mat4x4f.identity())

  if (allPos.length === 0) throw new Error('No meshes in GLB')

  const vertices = new Float32Array(allPos)
  const uvs = allUV.length ? new Float32Array(allUV) : undefined
  const normals = allNorm.length ? new Float32Array(allNorm) : undefined

  // --- Texture ---
  let texture: HTMLImageElement | HTMLCanvasElement | undefined
  if (sharedTexture) {
    // Use the caller-provided shared texture (same Image object for all
    // models) so the batch renderer groups them into ONE draw call — this
    // keeps depth ordering correct between models sharing a texture.
    texture = sharedTexture
  } else if (textureUrl) {
    texture = await loadImage(textureUrl).catch(() => undefined)
  } else {
    const mat = json.materials?.[0]
    const texIdx = mat?.pbrMetallicRoughness?.baseColorTexture?.index
    if (texIdx !== undefined) {
      const imgInfo = json.images?.[json.textures?.[texIdx]?.source]
      if (imgInfo?.uri) {
        const base = url.substring(0, url.lastIndexOf('/') + 1)
        texture = await loadImage(base + imgInfo.uri).catch(() => undefined)
      }
    }
  }

  return {
    vertices,
    uv: uvs,
    normals,
    texture,
    bounds: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
  }
}

/** Convert a glTF quaternion [x,y,z,w] to a 4x4 rotation matrix. */
function quatToMat4(q: [number, number, number, number]): Mat4x4f {
  const [x, y, z, w] = q
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return new Mat4x4f([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  ])
}

/**
 * Batch-load multiple GLB files.
 */
export async function loadGLBAssets(
  assets: Array<{ name: string; url: string; textureUrl?: string }>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, LoadedGLTF>> {
  const result = new Map<string, LoadedGLTF>()
  let loaded = 0
  for (const a of assets) {
    result.set(a.name, await loadGLB(a.url, a.textureUrl))
    loaded++
    onProgress?.(loaded, assets.length)
  }
  return result
}
