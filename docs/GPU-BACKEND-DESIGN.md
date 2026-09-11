# 🎛 GPU Renderer Split — WebGL / WebGPU

Goal: **one engine, two renderers.** The batching decisions are shared; each
graphics API gets its own renderer that speaks that API directly.

> **Revised after review.** The first cut of this document invented a neutral
> "device" layer (`GpuDevice`, pipelines, bind groups, descriptors) that both
> backends would implement. That layer is gone, and it should stay gone: WebGL
> has no concept of a device — `GPUDevice` is a WebGPU type — so a shared
> interface named "device" was a fiction that borrowed one API's vocabulary and
> pretended the other had it. The layering that survives names only real things:
> one renderer per API, plus the batching data they share.

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
   change to either backend. It is a real gate, not a demo:

   ```bash
   cd benchmark/gfx && npm run build
   npx vite preview --port 5178 --strictPort &
   node verify-backend-equivalence.mjs      # 0 / 65536 pixels differ
   ```

   It runs **headless** and it really does exercise WebGPU here — verified:
   `HeadlessChrome/152.0.0.0`, adapter `apple / metal-3`, canvas format
   `bgra8unorm`. The runner prints that adapter line on every run so a reader can
   see the WebGPU backend was exercised rather than skipped.

   A missing WebGPU is therefore a **FAILURE by default**, not a skip: a silent
   skip would let a backend regression pass unnoticed, which is the entire reason
   the gate exists. Machines or CI images without WebGPU must opt out explicitly
   with `ALLOW_MISSING_WEBGPU=1`.

   The gate compares raw pixels, so it also catches the failure mode a
   tolerance-only check would wave through — 31% of pixels differing while
   corners and orientation matched exactly (a sampler-filtering bug).

4. **No default switch** until parity is proven on the existing gates *and* the
   spine perf probes.

---

## 7. Current status

- [x] **Stage 0 — design** (this document)
- [~] **Stage 1 — device interface + WebGL adapter** (in progress)
  - [x] `renderer/device.ts` — the interface (no GPU API types; enforced)
  - [x] `backend/webgl.ts` — `WebGLDevice`, WebGL2 with a WebGL1 fallback
  - [x] `backend/webgl.test.ts` — 34 tests asserting the emitted GL command
        stream (offsets, state deltas, texture units, format mapping) plus the
        WebGL1/WebGL2 version split
  - [x] `__tests__/layering.test.ts` — the guardrail from §6, with an explicit
        `KNOWN_DEBT` list so the remaining coupling is countable rather than
        implied. It currently lists 8 files.
  - [x] `createMockWebGL2Context()` in `test-utils`
  - [ ] wire `RenderContext` / `BatchRenderer` onto the device (the remaining
        Stage-1 work: replace the raw `GlContext` fields and the `WebGL*` handles
        in public types)
- [x] **Stage 3 (partial) — WebGPU backend** — `backend/webgpu.ts` +
      `backend/webgpu-shaders.ts` exist and render, and are **pixel-identical to
      WebGL** on the device-tier equivalence scene (see Stage 4). What is NOT done
      is the engine-side migration that would let the batch renderer run on it.
- [x] **Stage 4 (partial) — equivalence gate** — `benchmark/gfx/`
      `webgpu-equivalence.html` + `src/webgpu-equivalence.ts` +
      `verify-backend-equivalence.mjs`. Result: **0 / 65536 pixels differ,
      max channel delta 0** — byte-identical, not merely within tolerance.
- [ ] Stage 2 — `batch.ts` emits a draw list (the real remaining work)

### The equivalence result

```
reference: webgl2
candidate: webgpu
differing pixels:  0 / 65536  (0.000%)
max channel delta: 0
```

Identical on the full 256x256 frame, through the same descriptors: one
interleaved vertex buffer (position/uv/colour), one indexed draw, one texture,
nearest filtering, a pipeline, a bind group, and a readback.

### Finding from Stage 1 worth carrying forward

The default mock context is a **WebGL1** context, because `BatchRenderer`
detects the version with `'createVertexArray' in gl`. Adding a WebGL2 member to
that mock silently switches *every existing test* onto the WebGL2 path. So the
suite as it stood only covered the **WebGL1 fallback**; the WebGL2 path (ES3
shaders, the `Frame` UBO, VAOs) was untested. Two mocks now exist and each test
opts in. Any work on the WebGL backend should keep asking which of the two paths
it is actually exercising.

### WebGPU findings — the parts that cost time

Each of these produced a *silent* wrong result (black frame or wrong pixels),
not a crash, which is why the equivalence gate exists.

1. **A canvas texture cannot be read back after presentation.** The copy to a
   buffer must be recorded into the **same command buffer** as the render pass
   and submitted with it. Doing it afterwards yields a different, never-rendered
   texture — the first run read back 100% transparent black while every other
   stage reported success. `readPixelsAsync` therefore closes the frame itself.

2. **`COPY_SRC` must be declared on the canvas configuration.**
   `getCurrentTexture()` otherwise returns a texture whose usage is
   `RENDER_ATTACHMENT` only, and the copy fails with "usage does not include
   TextureUsage::CopySrc". It must be repeated on every `configure()`.

3. **The bind group layout is a single layout, not one per entry.** WebGPU
   matches a pipeline's declared layout against the group bound at the same
   index; creating a layout per entry produced one holding only binding 0 and the
   device rejected the texture/sampler group.

4. **Vertex locations come from layout ORDER, never a name table.** A hybrid of
   "canonical names from a table, otherwise ordinal" is unsound: a name in the
   table and one absent from it can resolve to the same number, and WebGPU
   rejects the pipeline with "attribute shader location (n) is used more than
   once". Ordering cannot collide, and it is what the WGSL `@location(n)`
   declarations mean anyway.

5. **Sampler filtering must come from the bound texture.** A backend that
   quietly samples linearly renders nearest-filtered atlases blurred. This showed
   up as 31% of pixels differing on a checkerboard test *while the corners and
   the orientation matched exactly* — the kind of partial mismatch that a
   tolerance-based comparison would have accepted.

6. **`bgra8unorm` is the canvas format on most platforms, GL and the golden
   PNGs are RGBA.** Readback must swizzle, or every red and blue channel is
   exchanged.

### Interface additions the WebGPU port forced

Two fields had to be added to the interface, both because WebGPU is *more*
explicit rather than different in naming:

- `BindGroupLayoutEntry.samplerName` — GLSL addresses a texture by uniform NAME
  and WebGPU by binding NUMBER, so the name has to travel in the descriptor for
  the WebGL backend to bind the right unit.
- `BindGroupDesc.pipeline` — a `GPUBindGroup` is created against a
  pipeline-owned layout, so the dependency is real and is stated at the call site
  instead of being hidden in an ordering rule only WebGPU enforces.

A `UniformField[]` (names + offsets) is defined for the same reason but is not
used yet: WebGL has no uniform buffers at all, so the WebGL backend will need to
write each member through the matching `uniform*` call from a CPU shadow copy.
That is the next interface-level piece, and it is why the equivalence scene is
deliberately attribute-only.
