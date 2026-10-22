import { describe, expect, it, vi } from 'vitest'
import { WebGPURenderer } from '../index'
import { createMockGPUContext, installMockNavigatorGPU, type MockGPUDevice } from '../../../test-utils'

/**
 * The shader pass has to satisfy two properties at once, exactly like the
 * material pass, and here both are structural:
 *
 *   1. what the caller declares is what reaches WebGPU — the bind group layouts,
 *      the visibility mask, the vertex layout and the targets are passed through
 *      rather than derived, because a shader extracted from a shipped game
 *      carries its own reflection and there is nothing safe to infer;
 *   2. when no shader pass is used, nothing about the existing path changes —
 *      which is what makes the feature free for every scene that ignores it.
 */

// The renderer touches WebGPU spec constants at construction; node has none.
// Kept to the flag values this file asserts on.
const globals = globalThis as unknown as Record<string, unknown>
globals.GPUBufferUsage ??= {
  UNIFORM: 0x40,
  STORAGE: 0x80,
  COPY_DST: 0x8,
  COPY_SRC: 0x4,
  VERTEX: 0x20,
  INDEX: 0x10,
  MAP_READ: 0x1,
}
globals.GPUTextureUsage ??= {
  TEXTURE_BINDING: 0x4,
  STORAGE_BINDING: 0x8,
  COPY_DST: 0x8,
  COPY_SRC: 0x2,
  RENDER_ATTACHMENT: 0x10,
}
globals.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 }

const WGSL_VERTEX = `@vertex
fn main(@builtin(vertex_index) index : u32) -> @builtin(position) vec4<f32> {
  return vec4<f32>(f32(index), 0.0, 0.0, 1.0);
}`

const WGSL_FRAGMENT = `
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0);
}`

function rendererWithDevice(): { renderer: WebGPURenderer; device: MockGPUDevice } {
  installMockNavigatorGPU()
  const context = createMockGPUContext()
  const device = (context as unknown as { __mockDevice: MockGPUDevice }).__mockDevice
  const renderer = new WebGPURenderer(context, device as unknown as GPUDevice, {
    format: 'rgba8unorm',
  })
  return { renderer, device }
}

type PipelineOptions = Parameters<WebGPURenderer['createShaderPipeline']>[0]

function trianglePipeline(overrides: Record<string, unknown> = {}): PipelineOptions {
  return {
    label: 'test',
    vertex: { module: WGSL_VERTEX, entryPoint: 'main' },
    fragment: { module: WGSL_FRAGMENT, entryPoint: 'main', targets: [{ format: 'rgba8unorm' }] },
    bindGroups: [
      {
        group: 0,
        entries: [
          { binding: 0, kind: 'uniform' },
          { binding: 1, kind: 'texture', viewDimension: '2d-array' },
          { binding: 2, kind: 'sampler' },
        ],
      },
    ],
    ...overrides,
  } as PipelineOptions
}

describe('shader pass', () => {
  it('creates no shader state until a pipeline is asked for', () => {
    const { renderer, device } = rendererWithDevice()
    expect(renderer.shaderPassesActive).toBe(false)

    renderer.draw()

    expect(renderer.shaderPassesActive).toBe(false)
    expect(device.bindGroupLayouts).toHaveLength(0)
    expect(device.renderPipelines).toHaveLength(0)
  })

  it('passes the declared bindings to WebGPU verbatim', () => {
    const { renderer, device } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(trianglePipeline())

    expect(pipeline).not.toBeNull()
    expect(device.bindGroupLayouts).toHaveLength(1)
    expect(device.bindGroupLayouts[0].entries).toEqual([
      // The visibility mask is filled in from the stages the pipeline declares;
      // every other field is the caller's, or WebGPU's default for the kind.
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: undefined, minBindingSize: undefined },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array', multisampled: false },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ])
  })

  it('shares one layout between pipelines that declare the same group', () => {
    const { renderer, device } = rendererWithDevice()
    renderer.createShaderPipeline(trianglePipeline({ label: 'a' }))
    renderer.createShaderPipeline(trianglePipeline({ label: 'b' }))

    // Two pipelines, one layout: that is what lets a caller reuse a bind group.
    expect(device.renderPipelines).toHaveLength(2)
    expect(device.bindGroupLayouts).toHaveLength(1)
    expect(device.renderPipelines[0].layouts[0]).toBe(device.renderPipelines[1].layouts[0])
  })

  it('does not claim vertex visibility for a read-write storage buffer', () => {
    // WebGPU forbids it outright, so a default that included the vertex stage
    // would produce a layout the API rejects — and a shader that really reads one
    // in its vertex stage then fails on its own usage instead.
    const { renderer, device } = rendererWithDevice()
    renderer.createShaderPipeline({
      label: 'storage',
      vertex: { module: WGSL_VERTEX, entryPoint: 'main' },
      fragment: { module: WGSL_FRAGMENT, entryPoint: 'main', targets: [{ format: 'rgba8unorm' }] },
      bindGroups: [
        {
          group: 0,
          entries: [
            { binding: 0, kind: 'storage' },
            { binding: 1, kind: 'read-only-storage' },
          ],
        },
      ],
    })

    const entries = device.bindGroupLayouts[0].entries as {
      binding: number
      visibility: number
      buffer: { type: string }
    }[]
    expect(entries[0].visibility).toBe(GPUShaderStage.FRAGMENT)
    // Read-only storage is allowed in the vertex stage, so it keeps both.
    expect(entries[1].visibility).toBe(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)
  })

  it('lets the caller state visibility explicitly, overriding the default', () => {
    const { renderer, device } = rendererWithDevice()
    renderer.createShaderPipeline(
      trianglePipeline({
        bindGroups: [
          { group: 0, entries: [{ binding: 0, kind: 'uniform', visibility: ['fragment'] }] },
        ],
      }),
    )
    const entries = device.bindGroupLayouts[0].entries as { visibility: number }[]
    expect(entries[0].visibility).toBe(GPUShaderStage.FRAGMENT)
  })

  it('reports a WGSL compile error instead of handing back a broken pipeline', async () => {
    const { renderer, device } = rendererWithDevice()
    device.compilationMessages = [
      { type: 'error', message: 'expected expression', lineNum: 7, linePos: 3 },
    ]

    const result = await renderer.compileShaderPipeline(trianglePipeline())

    expect(result.pipeline).toBeNull()
    expect(result.error).toContain('expected expression')
    // The rejected pipeline was released rather than left behind.
    expect(renderer.shaderPassesActive).toBe(false)
  })

  it('builds a bind group from the resources the caller supplies', () => {
    const { renderer, device } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(trianglePipeline())!
    const buffersBefore = device.buffers.length
    const texture = { __view: true } as unknown as GPUTextureView
    const sampler = { __sampler: true } as unknown as GPUSampler

    const group = renderer.createShaderBindGroup(pipeline, {
      group: 0,
      entries: [
        // Bytes, not a GPUBuffer: this renderer owns the upload and the lifetime.
        { binding: 0, buffer: new Float32Array([1, 2, 3, 4]) },
        { binding: 1, texture },
        { binding: 2, sampler },
      ],
    })

    expect(group).not.toBeNull()
    expect(group!.group).toBe(0)
    const created = device.bindGroups[0]
    expect(created.entries.map((entry: { binding: number }) => entry.binding)).toEqual([0, 1, 2])
    expect(created.entries[1].resource).toBe(texture)
    expect(created.entries[2].resource).toBe(sampler)
    // Exactly one buffer was created for the bind group, and it is the upload.
    expect(device.buffers).toHaveLength(buffersBefore + 1)
    const owned = device.buffers[device.buffers.length - 1]
    expect(owned.size).toBe(16)
    expect(device.queue.writes).toHaveLength(1)

    // Releasing the group releases the buffer it created — the leak a caller
    // would otherwise have to remember not to make.
    renderer.destroyShaderBindGroup(group!)
    expect(owned.destroyed).toBe(true)
  })

  it('reports an uncapturable binding instead of throwing', () => {
    const { renderer } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(trianglePipeline())!
    const onError = vi.fn()

    // Binding 1 is a texture; handing over a sampler is the caller's mistake and
    // must not take the frame down.
    const group = renderer.createShaderBindGroup(pipeline, {
      group: 0,
      entries: [{ binding: 1, sampler: {} as GPUSampler }],
      onError,
    })

    expect(group).toBeNull()
    expect(onError).toHaveBeenCalled()
  })

  it('draws a queued shader pass and drains the queue', () => {
    const { renderer, device } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(trianglePipeline())!
    const group = renderer.createShaderBindGroup(pipeline, {
      group: 0,
      entries: [{ binding: 0, buffer: new Float32Array([1, 2, 3, 4]) }],
    })!

    renderer.drawShaderPass({ pass: pipeline, bindGroups: [group], vertexCount: 3 })
    expect(renderer.shaderPassesActive).toBe(true)

    renderer.draw()
    const pass = device.lastCommandEncoder!.passes[0]
    expect(pass.pipelines).toHaveLength(1)
    expect(pass.draws).toEqual([{ count: 3, instances: 1 }])
    expect(pass.bindGroups[0].index).toBe(0)

    // The queue is drained: a frame cannot draw stale geometry twice.
    const drawCount = pass.draws.length
    renderer.draw()
    expect(pass.draws).toHaveLength(drawCount)
  })

  it('uploads interleaved vertices and derives the vertex count from the layout', () => {
    const { renderer, device } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(
      trianglePipeline({
        vertex: {
          module: WGSL_VERTEX,
          entryPoint: 'main',
          buffers: [
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
            },
          ],
        },
      }),
    )!

    renderer.drawShaderPass({ pass: pipeline, bindGroups: [], vertices: new Float32Array(9) })
    renderer.draw()

    const pass = device.lastCommandEncoder!.passes[0]
    expect(pass.vertexBuffers).toHaveLength(1)
    expect(pass.vertexBuffers[0].slot).toBe(0)
    // 9 floats at a 12-byte stride = 3 vertices.
    expect(pass.draws).toEqual([{ count: 3, instances: 1 }])
  })

  it('runs compute dispatches before the frame that consumes them', () => {
    const { renderer, device } = rendererWithDevice()
    const compute = renderer.createShaderPipeline({
      label: 'compute',
      compute: { module: '@compute @workgroup_size(8) fn main() {}', entryPoint: 'main' },
      bindGroups: [{ group: 0, entries: [{ binding: 0, kind: 'storage' }] }],
    })!
    const group = renderer.createShaderBindGroup(compute, {
      group: 0,
      entries: [{ binding: 0, buffer: new Uint32Array([0]) }],
    })!

    renderer.dispatchShaderPass({ pass: compute, bindGroups: [group], workgroups: [4, 2, 1] })
    renderer.draw()

    // Two encoders: the dispatch's, then the frame's.
    expect(device.encoders).toHaveLength(2)
    const dispatchEncoder = device.encoders[0]
    expect(dispatchEncoder.computePasses).toHaveLength(1)
    expect(dispatchEncoder.computePasses[0].workgroups).toEqual([[4, 2, 1]])
    expect(dispatchEncoder.computePasses[0].ended).toBe(true)
    expect(device.encoders[1].calls).toEqual(['beginRenderPass', 'end'])
    // Submitted before the frame's own command buffer, so the frame reads the
    // dispatch's output.
    expect(device.queue.submits).toHaveLength(2)
    // `finish()` wraps the encoder in the mock, as WebGPU's command buffer does.
    const submitted = device.queue.submits[0][0] as unknown as { encoder: unknown }
    expect(submitted.encoder).toBe(dispatchEncoder)
  })

  it('leaks nothing when destroy() is the only release a caller ever does', () => {
    const { renderer, device } = rendererWithDevice()
    const pipeline = renderer.createShaderPipeline(trianglePipeline())!
    renderer.createShaderBindGroup(pipeline, {
      group: 0,
      entries: [{ binding: 0, buffer: new Float32Array([1, 2, 3, 4]) }],
    })
    const owned = device.buffers[0]

    renderer.destroy()

    expect(owned.destroyed).toBe(true)
  })
})
