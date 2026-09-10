# 🎛 GPU Backend Split — WebGL / WebGPU

Goal: **one engine, two interchangeable GPU backends.** All scene, batching and
geometry logic stays shared; everything that talks to a GPU API moves behind a
device interface, so `@rasenjs/gfx` can run on WebGL2 today and WebGPU tomorrow
with identical output.

Companion docs: [`DESIGN.md`](./DESIGN.md) (engine philosophy),
[`SPINE-PERF.md`](./SPINE-PERF.md) (the spine workload that must not regress).

---

## 1. Why now / what is in the way

`packages/gfx` (~10k lines) is written directly against WebGL2. The coupling is
not spread evenly — it is concentrated in a few places, which is why this split
is feasible at all:

| file | lines | GL coupling |
|---|---|---|
| `render-context.ts` | 854 | **mixed** — orchestrator *and* GL device |
| `renderer/batch.ts` | 1306 | **mixed** — batching *decisions* and GL *execution* |
| `renderer/shader.ts` | 460 | GLSL sources + attribute/uniform binding |
| `renderer/instanced.ts` | 166 | GL instanced path |
| `renderer/shadow.ts` | 152 | GL render target + depth |
| `components/spine.ts` | 891 | GL texture upload + mesh submission |
| `components/2d/*`, `components/3d/*` | ~2k | device-agnostic (build transforms, push geometry) |
| `node.ts`, `camera.ts`, `geometry-pool.ts`, `utils.ts`, `types.ts` | ~750 | device-agnostic |

The WebGL API surface actually used is bounded — roughly 100 distinct calls,
dominated by buffer/attribute/texture/uniform management and a single
`drawElements`/`drawArrays` pair per batch.

### The two concrete leaks

1. **GPU handles appear in public types.** `RenderContext` stores
   `WebGLFramebuffer`, `WebGLTexture`, `WebGLRenderbuffer`, `WebGLBuffer`;
   `BatchRenderer.setShadowMap(shadowMap: WebGLTexture | null, …)`. Under WebGPU
   a framebuffer does not exist as an object, so these must become opaque
   backend-owned handles.

2. **`batch.ts` both decides and draws.** `flush()` / `flushMerged()` decide
   *what* to draw and that logic is pure; `drawGroup()` / `drawSealedRun()` /
   `getVao()` / `ensureBufferCapacity()` / `uploadFrameUniforms()` are ~800 lines
   of GL execution interleaved with it.

---

## 2. Layering

```
components/2d,3d,spine      ─┐
node graph, camera, events   ├─ device-agnostic (unchanged public API)
render-context orchestrator ─┘
        │
        │  DrawList  (what to draw: buffers, pipeline state, uniforms, targets)
        ▼
renderer/batch  (decisions only: group keys, merge, sealed runs, ordering)
        │
        │  Device interface  (how to draw it)
        ▼
┌───────────────────┬────────────────────┐
│ backend/webgl.ts  │  backend/webgpu.ts │
│  WebGL2           │  WebGPU            │
└───────────────────┴────────────────────┘
```

The rule that keeps the layering honest: **nothing above the device line may
name a GPU API type.** Enforced by convention plus a lint-style test that greps
the engine layer for `WebGL*` / `GPU*` identifiers (see §6).

---

## 3. Device interface

The shape is chosen to be the *common denominator* of the two APIs, which means
it is closer to WebGPU's explicit model (WebGL is the adapter that hides its
global state machine):

```ts
// renderer/device.ts — no WebGL* / GPU* types may appear in this file.
export interface GpuBuffer { destroy(): void }          // opaque handle
export interface GpuTexture { destroy(): void; width: number; height: number }
export interface GpuPipeline { destroy(): void }
export interface GpuBindGroup { destroy(): void }
export interface GpuRenderTarget { /* opaque */ }

export interface GpuDevice {
  readonly api: 'webgl2' | 'webgpu'
  readonly canvas: HTMLCanvasElement

  createBuffer(desc: BufferDesc): GpuBuffer
  writeBuffer(buf: GpuBuffer, data: ArrayBufferView, byteOffset?: number): void

  createTexture(desc: TextureDesc): GpuTexture
  writeTexture(tex: GpuTexture, source: TexImageSource): void

  createPipeline(desc: PipelineDesc): GpuPipeline
  createBindGroup(desc: BindGroupDesc): GpuBindGroup

  createRenderTarget(desc: RenderTargetDesc): GpuRenderTarget

  /** Begins the frame's command recording for a target (null = canvas). */
  beginFrame(target: GpuRenderTarget | null, clear: ClearState): void
  setPipeline(p: GpuPipeline): void
  setBindGroup(index: number, g: GpuBindGroup): void
  setVertexBuffers(buffers: GpuBuffer[], offsets?: number[]): void
  setIndexBuffer(buf: GpuBuffer, format: 'u16' | 'u32'): void
  drawIndexed(indexCount: number, indexOffset: number, instanceCount?: number): void
  drawArrays(vertexCount: number, firstVertex: number, instanceCount?: number): void
  endFrame(): void

  /** Advanced blend/depth/scissor state that WebGPU needs explicitly. */
  setScissor(rect: Rect | null): void
  resize(width: number, height: number): void
  destroy(): void
}
```

Why `beginFrame`/`endFrame` rather than exposing render passes: the engine draws
exactly one pass per target per frame today, and the batch renderer already
controls ordering. WebGPU's encoder is created in `beginFrame` and submitted in
`endFrame`; WebGL ignores the framing.

### Pipelines and shaders

`shader.ts` currently holds GLSL with attribute locations and per-uniform
`gl.getUniformLocation` lookups. The split introduces
`Renderer/ShaderSource` as a **pair** of implementations:

```ts
export interface ShaderSources { vertex: string; fragment: string; lang: 'glsl' | 'wgsl' }
```

- `backend/webgl-shaders.ts` — the existing GLSL, unchanged
- `backend/webgpu-shaders.ts` — hand-written WGSL equivalents

WGSL is not transpilable from GLSL reliably, so the WGSL side is a genuine
rewrite. Keep the two in one folder, and add a test that asserts every uniform
declared in GLSL has a WGSL counterpart (a missing binding is otherwise a silent
black screen).

---

## 4. Staged plan

Each stage must keep **all existing gates green** and is independently
verifiable.

### Stage 0 — this document
Design + interface agreed.

### Stage 1 — extract the interface, WebGL only
- add `renderer/device.ts` (interface) and `backend/webgl.ts` (adapter over the
  existing code paths, not a rewrite)
- `BatchRenderer` / `InstancedRenderer` / `ShadowRenderer` / `RenderContext`
  take a `GpuDevice` instead of a raw `WebGL2RenderingContext`
- replace `WebGLTexture`/`WebGLFramebuffer`/… in public types with the opaque
  handles
- **zero behaviour change**: tree output identical, all gates green, bench
  numbers within noise

This is the "整理 / 分离" half, and it is verifiable on its own.

### Stage 2 — make `batch.ts` device-agnostic
- move the ~800 execution lines of `drawGroup`/`drawSealedRun`/`getVao`/
  `ensureBufferCapacity`/`uploadFrameUniforms` into the WebGL backend
- `batch.ts` keeps `mergedGroupKey`, `flush`, `flushMerged`, `addShape`,
  `beginMesh`/`endMesh`, pooling, and emits a **draw list**
- add the layering test from §6

### Stage 3 — WebGPU backend
- device init (`navigator.gpu.requestAdapter/device`), canvas context
  configuration
- buffers via `GPUBuffer` (+ a frame-scoped uniform ring, see §5)
- textures via `copyExternalImageToTexture` (atlas/spine images are
  `HTMLImageElement`)
- pipelines with explicit vertex layouts replacing VAOs/`vertexAttribPointer`
- bind groups replacing per-uniform `uniformMatrix4fv`
- render targets replacing FBOs; the overlay/blit path becomes a full-screen
  quad pass
- WGSL shaders (§3)

### Stage 4 — verification
- `benchmark/spine/rasen-webgpu.html` mirroring `rasen-webgl.html`
- **pixel-equivalence gate**: same pose, same camera, WebGL vs WebGPU screenshots
  diffed like `verify-render.mjs` (t0 and anim frames)
- run the existing gates and the perf probes on both backends; the backend must
  not regress the spine numbers in `SPINE-PERF.md`

---

## 5. Backend differences that will bite

| concern | WebGL2 | WebGPU | mitigation |
|---|---|---|---|
| state | implicit global; bind then draw | explicit pipeline + bind groups | `setPipeline` folds all state; the engine already sets blend/depth per group |
| uniforms | `uniformMatrix4fv` per uniform | uniform buffer + `@binding` layout, 256-byte alignment | one frame UBO + per-draw dynamic offsets |
| vertex input | VAO + `vertexAttribPointer` | `GPUVertexBufferLayout` in the pipeline | describe once per pipeline variant (a handful) |
| render targets | FBO + attachments | `GPUTextureView` in a render pass | one pass per target per frame (matches today) |
| readback | `readPixels` | async `mapAsync` — **cannot be sync** | golden tests must await; do not expose `readPixels`-style sync APIs |
| canvas sizing | implicit | `configure({ device, format, alphaMode })` | re-configure on resize |
| availability | everywhere | not in all browsers/headless configs | backend selectable; WebGL2 stays the default fallback |

The readback difference is the one that changes the *test* strategy: the golden
gates currently read pixels synchronously. The WebGPU equivalence test should
therefore compare **screenshots** (as `verify-render.mjs` already does) rather
than raw `readPixels` from inside the page.

---

## 6. Guardrails

1. **Layering test**: a vitest that greps `packages/gfx/src/{components,node.ts,
   render-context.ts,camera.ts,renderer/batch.ts}` for `/\b(WebGL|GPUBuffer|
   GPUTexture|GPURenderPass)/` and fails on a hit. Without it, GL types creep back
   in within a few commits.
2. **Shader parity test**: every WGSL module has a GLSL sibling; assert the
   uniform/binding names match (see §3).
3. **Backend parity gate**: the Stage-4 pixel-equivalence test, run on every
   change to either backend.
4. **No default switch** until parity is proven on the existing gates *and* the
   spine perf probes.

---

## 7. Current status

- [x] **Stage 0 — design** (this document)
- [~] **Stage 1 — device interface + WebGL adapter** (in progress)
  - [x] `renderer/device.ts` — the interface (no GPU API types; enforced)
  - [x] `backend/webgl.ts` — `WebGLDevice`, WebGL2 with a WebGL1 fallback
  - [x] `backend/webgl.test.ts` — 30 tests asserting the emitted GL command
        stream (offsets, state deltas, texture units, format mapping) plus the
        WebGL1/WebGL2 version split
  - [x] `__tests__/layering.test.ts` — the guardrail from §6, with an explicit
        `KNOWN_DEBT` list so the remaining coupling is countable rather than
        implied. It currently lists 8 files.
  - [x] `createMockWebGL2Context()` in `test-utils`
  - [ ] wire `RenderContext` / `BatchRenderer` onto the device (the remaining
        Stage-1 work: replace the raw `GlContext` fields and the `WebGL*` handles
        in public types)
- [ ] Stage 2 — `batch.ts` emits a draw list
- [ ] Stage 3 — WebGPU backend
- [ ] Stage 4 — WebGPU bench page + pixel-equivalence gate

### Finding from Stage 1 worth carrying forward

The default mock context is a **WebGL1** context, because `BatchRenderer`
detects the version with `'createVertexArray' in gl`. Adding a WebGL2 member to
that mock silently switches *every existing test* onto the WebGL2 path. So the
suite as it stood only covered the **WebGL1 fallback**; the WebGL2 path (ES3
shaders, the `Frame` UBO, VAOs) was untested. Two mocks now exist and each test
opts in. Any work on the WebGL backend should keep asking which of the two paths
it is actually exercising.
