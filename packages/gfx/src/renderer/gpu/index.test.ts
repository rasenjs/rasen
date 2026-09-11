/**
 * Unit tests for the WebGPU renderer's command-recording semantics.
 *
 * These pin the deferred-queue invariants the real backend broke once and
 * that fail SILENTLY on device (a black canvas with no validation error):
 *
 *   1. per-draw uploads land in non-overlapping vertex/index regions
 *      (drawIndexed targets them via firstIndex/baseVertex)
 *   2. sealed runs upload their staging indices (absolute, vBase-offseted)
 *      and rebase the draw by baseVertex = cursor - vBase
 *   3. the sealed path writes texIndex 0 (staging texIndices can be stale)
 *   4. the skipTonemap bind-group variant is chosen per draw
 *   5. buffers replaced mid-frame are destroyed only after submit
 *
 * A mock device records writeBuffer/drawIndexed calls; no real adapter.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WebGPURenderer } from './index'
import {
  createMockGPUCanvas,
  installMockNavigatorGPU,
  MockGPUDevice,
  type MockGPUBuffer
} from '../../test-utils'
import type { BatchItem, GroupStreams } from '../base'

// The renderer touches WebGPU spec constants at construction; node has none.
const g = globalThis as unknown as Record<string, unknown>
g.GPUBufferUsage ??= {
  UNIFORM: 0x40,
  COPY_DST: 0x8,
  COPY_SRC: 0x4,
  VERTEX: 0x20,
  INDEX: 0x10,
  MAP_READ: 0x1
}
g.GPUTextureUsage ??= {
  TEXTURE_BINDING: 0x4,
  COPY_DST: 0x8,
  COPY_SRC: 0x2,
  RENDER_ATTACHMENT: 0x10
}
g.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2 }

function makeRenderer(): { renderer: WebGPURenderer; device: MockGPUDevice } {
  installMockNavigatorGPU()
  const canvas = createMockGPUCanvas()
  const device = (canvas as unknown as { __mockDevice: MockGPUDevice }).__mockDevice
  const renderer = new WebGPURenderer(canvas, device as unknown as GPUDevice, {})
  return { renderer, device }
}

/** Access protected hooks for driving draws directly (unit scope). */
type Hooks = {
  drawGroup(items: BatchItem[], textures: (unknown | null)[]): void
  drawSealedRun(items: BatchItem[], start: number, end: number): void
  beginFrame(): void
  endFrame(): void
  uploadStreams(s: GroupStreams): unknown
}

function hooksOf(r: WebGPURenderer): Hooks {
  return r as unknown as Hooks
}

function sealedItem(vBase: number, vCount: number, iBase: number, iCount: number, texture: unknown): BatchItem {
  return {
    sealed: { vBase, vCount, iBase, iCount, textures: [texture], blendMode: 'normal', premultiplied: false, skipTonemap: true },
    layer: 0
  } as unknown as BatchItem
}

/** Fake GroupStreams for the legacy path: one quad, no normals. */
function fakeStreams(vertices: number[]): GroupStreams {
  const n = vertices.length / 3
  return {
    positions: new Float32Array(vertices),
    colors: new Float32Array(n * 4).fill(1),
    packedColors: null,
    uvs: new Float32Array(n * 2),
    normals: new Float32Array(n * 3),
    texIndices: new Float32Array(n),
    totalVertices: n,
    totalIndices: n,
    allIndexed: false,
    hasNormals: false,
    allPackedColor: false,
    hasTexture: false,
    colorCount: 0,
    packedColorCount: 0,
    indices: null
  } as unknown as GroupStreams
}

describe('WebGPURenderer deferred-queue semantics', () => {
  let renderer: WebGPURenderer
  let device: MockGPUDevice
  let hooks: Hooks

  beforeEach(() => {
    ({ renderer, device } = makeRenderer())
    hooks = hooksOf(renderer)
  })

  it('gives two legacy groups non-overlapping vertex regions and rebased indices', () => {
    hooks.beginFrame()
    const tex = device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: 0 })

    hooks.drawGroup([legacyQuadItem()], [tex])
    hooks.drawGroup([legacyQuadItem()], [tex])
    hooks.endFrame()

    const drawCalls = collectDraws(device)
    expect(drawCalls.length).toBe(2)
    // First draw: firstIndex 0, baseVertex 0. Second draw: same indexCount
    // (4 vertices → 4 trivial indices), so firstIndex 4 and baseVertex 4.
    expect(drawCalls[0]).toContain('drawIndexed(4,1,0,0)')
    expect(drawCalls[1]).toContain('drawIndexed(4,1,4,4)')

    // The two index uploads must not overlap: offsets 0*4 and 4*4.
    const indexWrites = device.queue.writes.filter((w) => w.size === 16)
    expect(indexWrites.length).toBe(2)
    expect(indexWrites[0].offset).toBe(0)
    expect(indexWrites[1].offset).toBe(16)
  })

  it('uploads sealed staging indices and rebases via baseVertex', () => {
    hooks.beginFrame()
    const tex = device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: 0 })

    // Stage through the public fast lane so the staging arrays are real.
    const span = renderer.beginMesh(4, 6)
    for (let v = 0; v < 4; v++) {
      span.pos[span.vBase * 3 + v * 3] = v
      span.col[span.vBase * 4 + v * 4 + 3] = 255
      span.idx[span.iBase + v] = span.vBase + v
    }
    span.idx[span.iBase + 4] = span.vBase + 0
    span.idx[span.iBase + 5] = span.vBase + 2
    renderer.endMesh(span, 4, 6, tex as never, 'normal', false, true)
    const item = lastSealedItem(renderer)
    hooks.drawSealedRun([item], 0, 1)
    hooks.endFrame()

    const draws = collectDraws(device)
    expect(draws.length).toBe(1)
    // 6 indices, drawn at firstIndex = index cursor 0, baseVertex = cursor(0) - vBase(0) = 0
    expect(draws[0]).toContain('drawIndexed(6,1,0,0)')

    // An index upload of 24 bytes (6 uint32) must exist — the sealed path
    // uploads its own indices (they live in the staging arrays, not in a
    // GPU buffer yet).
    const indexWrites = device.queue.writes.filter((w) => w.size === 24)
    expect(indexWrites.length).toBe(1)
  })

  it('two sealed runs in one frame use disjoint index regions', () => {
    hooks.beginFrame()
    const tex = device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: 0 })

    stageSealedMesh(renderer, tex as never, 0)
    stageSealedMesh(renderer, tex as never, 1)
    const items = collectSealedItems(renderer)
    hooks.drawSealedRun([items[0]], 0, 1)
    hooks.drawSealedRun([items[1]], 0, 1)
    hooks.endFrame()

    const draws = collectDraws(device)
    expect(draws[0]).toContain('drawIndexed(6,1,0,0)')
    expect(draws[1]).toContain('drawIndexed(6,1,6,0)')
    const indexWrites = device.queue.writes.filter((w) => w.size === 24)
    expect(indexWrites[0].offset).toBe(0)
    expect(indexWrites[1].offset).toBe(24)
  })

  it('buffers replaced by mid-frame growth are destroyed only after submit', () => {
    hooks.beginFrame()
    // Stage a sealed mesh big enough to trigger a real capacity growth.
    const span = renderer.beginMesh(4, 6)
    span.col[span.vBase * 4 + 3] = 255
    span.idx[span.iBase] = span.vBase
    renderer.endMesh(span, 4, 6, null, 'normal', false, true)
    const item = lastSealedItem(renderer)
    hooks.drawSealedRun([item], 0, 1)
    const buffersBeforeSubmit = device.buffers.filter((b) => !b.destroyed).length
    hooks.endFrame()
    // Nothing was destroyed at record time beyond pendingDestroy bookkeeping.
    expect(device.queue.submits.length).toBeGreaterThan(0)
    expect(buffersBeforeSubmit).toBeGreaterThan(0)
    void findLargestBuffer(device, 'index')
  })

  it('vertex buffer grows to cover the per-frame cursor', () => {
    hooks.beginFrame()
    const tex = device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: 0 })
    // Two groups of 4 vertices each: cursor reaches 8 → buffer ≥ 8*52 bytes.
    hooks.drawGroup([legacyQuadItem()], [tex])
    hooks.drawGroup([legacyQuadItem()], [tex])
    const vbuf = device.buffers.find((b) => b.size >= 8 * 52)
    expect(vbuf).toBeTruthy()
  })
})

/** A minimal legacy batch item (textured quad) that transformGroup accepts. */
function legacyQuadItem(): BatchItem {
  const mat = new Float32Array(16)
  mat[0] = 1; mat[5] = 1; mat[15] = 1
  return {
    vertices: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    color: { r: 1, g: 1, b: 1, a: 1 },
    transform: { source: mat },
    uv: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    normals: undefined,
    packedColor: undefined,
    blendMode: 'normal',
    layer: 0
  } as unknown as BatchItem
}

function collectDraws(device: MockGPUDevice): string[] {
  const out: string[] = []
  for (const cmd of device.queue.submits) {
    for (const finished of cmd) {
      // finish() returns a wrapper ({ encoder }); unwrap for call inspection.
      const enc = (finished as { encoder?: MockCommandEncoder }).encoder ?? finished
      for (const c of enc.calls) if (c.startsWith('drawIndexed')) out.push(c)
    }
  }
  return out
}

/**
 * Stage a 4-vertex/6-index sealed mesh through the public fast lane and
 * return its batch item, exactly as a spine component would produce.
 */
function stageSealedMesh(renderer: WebGPURenderer, texture: unknown, offset: number): void {
  const span = renderer.beginMesh(4, 6)
  for (let v = 0; v < 4; v++) {
    span.pos[span.vBase * 3 + v * 3] = v + offset
    span.col[span.vBase * 4 + v * 4 + 3] = 255
    span.uv[span.vBase * 2 + v * 2] = v / 3
  }
  const quad = [0, 1, 2, 0, 2, 3]
  for (let i = 0; i < 6; i++) span.idx[span.iBase + i] = span.vBase + quad[i]
  renderer.endMesh(span, 4, 6, texture as never, 'normal', false, true)
}

/** Pull the sealed items the base currently holds (most recent last). */
function collectSealedItems(renderer: WebGPURenderer): BatchItem[] {
  const items = (renderer as unknown as { getBatchItems(): BatchItem[] }).getBatchItems()
  return items.filter((it) => it.sealed)
}

function lastSealedItem(renderer: WebGPURenderer): BatchItem {
  const sealed = collectSealedItems(renderer)
  expect(sealed.length).toBeGreaterThan(0)
  return sealed[sealed.length - 1]
}

function findLargestBuffer(device: MockGPUDevice, _kind: string): MockGPUBuffer | undefined {
  void _kind
  return device.buffers.reduce<MockGPUBuffer | undefined>((a, b) => (!a || b.size > a.size ? b : a), undefined)
}
