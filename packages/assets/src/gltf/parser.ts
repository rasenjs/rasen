/**
 * GLTF 2.0 / GLB loader — parses the binary container and extracts
 * mesh geometry + texture references, ready for rasen's `mesh` component.
 *
 * Adapted from `@rasenjs/gfx/utils/gltf.ts` — decoupled from rendering
 * by outputting generic `GLTFMesh` instead of webgl-specific types.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single mesh extracted from a GLTF/GLB file. */
export interface GLTFMesh {
  /** Triangulated positions as `[x0,y0,z0, x1,y1,z1, ...]`. */
  positions: Float32Array
  /** UVs as `[u0,v0, u1,v1, ...]`. Same length as positions / 3 * 2. */
  uvs: Float32Array
  /** Triangle indices (into the position/uv arrays). */
  indices: Uint16Array | Uint32Array
  /** Optional texture URL (resolved from the GLTF material). */
  textureUrl?: string
  /** Bounding box. */
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

/** Result of loading a GLTF/GLB file. */
export interface GLTFLoadResult {
  /** All meshes in the file. */
  meshes: GLTFMesh[]
  /** The default scene's root node index. */
  scene?: number
}

// ---------------------------------------------------------------------------
// Internal GLTF types
// ---------------------------------------------------------------------------

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
  byteOffset?: number
  byteLength: number
  byteStride?: number
}

interface GLTFPrimitive {
  attributes: Record<string, number>
  indices?: number
  material?: number
}

interface GLTFMeshDef {
  primitives: GLTFPrimitive[]
  name?: string
}

interface GLTFMaterialDef {
  name?: string
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number }
  }
}

interface GLTFTextureDef {
  source: number
}

interface GLTFImageDef {
  uri?: string
  mimeType?: string
  bufferView?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeSize(type: string): number {
  switch (type) {
    case 'SCALAR': return 1
    case 'VEC2': return 2
    case 'VEC3': return 3
    case 'VEC4': return 4
    default: return 1
  }
}

function componentSize(componentType: number): number {
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
  const baseByteOffset = bv.byteOffset ?? 0
  const elemStride = bv.byteStride ?? componentSize(accessor.componentType) * typeSize(accessor.type)
  const compSize = componentSize(accessor.componentType)
  const n = typeSize(accessor.type)
  const elemCount = accessor.count
  const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength)

  if (accessor.componentType === 5126) {
    const arr = new Float32Array(elemCount * n)
    for (let i = 0; i < elemCount; i++) {
      for (let j = 0; j < n; j++) {
        arr[i * n + j] = dv.getFloat32(baseByteOffset + i * elemStride + j * compSize, true)
      }
    }
    return arr
  }
  if (accessor.componentType === 5123) {
    const arr = new Uint16Array(elemCount * n)
    for (let i = 0; i < elemCount; i++) {
      for (let j = 0; j < n; j++) {
        arr[i * n + j] = dv.getUint16(baseByteOffset + i * elemStride + j * compSize, true)
      }
    }
    return arr
  }
  if (accessor.componentType === 5125) {
    const arr = new Uint32Array(elemCount * n)
    for (let i = 0; i < elemCount; i++) {
      for (let j = 0; j < n; j++) {
        arr[i * n + j] = dv.getUint32(baseByteOffset + i * elemStride + j * compSize, true)
      }
    }
    return arr
  }
  // UNSIGNED_BYTE fallback
  const arr = new Uint8Array(elemCount * n)
  for (let i = 0; i < elemCount; i++) {
    for (let j = 0; j < n; j++) {
      arr[i * n + j] = binData[baseByteOffset + i * elemStride + j * compSize]
    }
  }
  return arr
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GLB (binary GLTF) file from a Uint8Array.
 *
 * @returns A `GLTFLoadResult` containing all meshes with geometry data.
 */
export function parseGLB(bytes: Uint8Array): GLTFLoadResult {
  // GLB header: magic(4) + version(4) + length(4)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546C67) throw new Error('Not a GLB file (bad magic)')
  const version = view.getUint32(4, true)
  if (version !== 2) throw new Error(`Unsupported GLTF version: ${version}`)

  // Chunks
  let jsonChunk: Uint8Array | null = null
  let binChunk: Uint8Array | null = null
  let offset = 12
  while (offset < bytes.byteLength) {
    const chunkLen = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const chunkData = bytes.slice(offset + 8, offset + 8 + chunkLen)
    if (chunkType === 0x4E4F534A) jsonChunk = chunkData
    else if (chunkType === 0x004E4942) binChunk = chunkData
    offset += 8 + chunkLen
  }
  if (!jsonChunk) throw new Error('GLB missing JSON chunk')

  const gltf = JSON.parse(new TextDecoder().decode(jsonChunk))
  const binData = binChunk ?? new Uint8Array(0)
  const bufferViews: GLTFBufferView[] = gltf.bufferViews ?? []
  const accessors: GLTFAccessor[] = gltf.accessors ?? []
  const meshes: GLTFMeshDef[] = gltf.meshes ?? []
  const materials: GLTFMaterialDef[] = gltf.materials ?? []
  const textures: GLTFTextureDef[] = gltf.textures ?? []
  const images: GLTFImageDef[] = gltf.images ?? []

  const result: GLTFLoadResult = { meshes: [] }

  for (const meshDef of meshes) {
    for (const prim of meshDef.primitives) {
      const posAccIdx = prim.attributes.POSITION
      const uvAccIdx = prim.attributes.TEXCOORD_0
      const idxAccIdx = prim.indices

      if (posAccIdx === undefined) continue

      const positions = readAccessor(accessors[posAccIdx], bufferViews, binData) as Float32Array
      const uvs = uvAccIdx !== undefined
        ? readAccessor(accessors[uvAccIdx], bufferViews, binData) as Float32Array
        : new Float32Array(positions.length / 3 * 2)

      let indices: Uint16Array | Uint32Array
      if (idxAccIdx !== undefined) {
        const raw = readAccessor(accessors[idxAccIdx], bufferViews, binData)
        indices = raw instanceof Uint32Array ? raw : new Uint16Array(raw)
      } else {
        indices = new Uint16Array(positions.length / 3)
        for (let i = 0; i < indices.length; i++) indices[i] = i
      }

      // Compute bounds.
      const min: [number, number, number] = [Infinity, Infinity, Infinity]
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < positions.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          min[j] = Math.min(min[j], positions[i + j])
          max[j] = Math.max(max[j], positions[i + j])
        }
      }

      // Resolve texture URL from material → texture → image.
      let textureUrl: string | undefined
      const matIdx = prim.material
      if (matIdx !== undefined && materials[matIdx]) {
        const texIdx = materials[matIdx].pbrMetallicRoughness?.baseColorTexture?.index
        if (texIdx !== undefined && textures[texIdx]) {
          const imgIdx = textures[texIdx].source
          if (images[imgIdx]?.uri) textureUrl = images[imgIdx].uri
        }
      }

      result.meshes.push({ positions, uvs, indices, textureUrl, bounds: { min, max } })
    }
  }

  return result
}

/**
 * Load a GLTF/GLB file from a URL.
 *
 * Detects whether the response is JSON (gltf) or binary (glb) by checking
 * the first bytes, then delegates to `parseGLB` for binary or `parseGLTF`
 * for JSON.
 *
 * fetch is a cross-platform standard (browsers / Node 18+ / Deno / Bun) —
 * called directly, no injection knob.
 */
export async function loadGLTF(url: string): Promise<GLTFLoadResult> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to fetch GLTF: ${url} (${resp.status})`)
  const buf = new Uint8Array(await resp.arrayBuffer())

  // GLB starts with magic 0x46546C67 ('glTF')
  const magic = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true)
  if (magic === 0x46546C67) return parseGLB(buf)

  // Otherwise treat as JSON GLTF (resolve relative URIs against base URL).
  // TODO: implement JSON GLTF with buffer/URI resolution.
  throw new Error('JSON GLTF not yet implemented — use GLB format')
}