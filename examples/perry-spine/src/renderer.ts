/**
 * Spine → WebGPU renderer for Perry's native runtime.
 *
 * This is the example's GPU half. It is deliberately thin: every piece of
 * Spine maths (pose solving, world transforms, deform application, vertex and
 * UV extraction) comes from `@rasenjs/assets`, so this file only does what a
 * host renderer must do — pack the extracted geometry into vertex/index
 * buffers and issue one draw call.
 *
 * Design notes:
 *
 *   * **One draw call per frame.** Every attachment in c010 uses the same
 *     atlas page and the same premultiplied-alpha blend, so the whole
 *     character collapses into a single `drawIndexed`. Draw order (painter's
 *     algorithm) is preserved because the triangles are written into the index
 *     buffer in `drawOrder` sequence and there is no depth test.
 *
 *   * **CPU-side projection.** Positions arrive in skeleton space (Y up,
 *     pixel-ish units). They are mapped to clip space while being written, so
 *     the shader needs no uniform buffer — one less descriptor to keep in sync
 *     with Perry's FFI surface.
 *
 *   * **Premultiplied alpha end to end.** NIKKE atlases store premultiplied
 *     RGB. Slot tints are straight alpha, so their RGB is multiplied by their
 *     own alpha before upload, and the pipeline blends with
 *     `ONE, ONE_MINUS_SRC_ALPHA`. Without the tint premultiply, alpha-faded
 *     parts render too bright.
 *
 * Perry-specific hazards this file avoids on purpose (all verified defects in
 * 0.5.1537 — see `packages/assets/src/spine/runtime/perry-compat.ts`):
 *   - no `expr?.prop` on a receiver with side effects (double evaluation),
 *   - no `.length` on typed arrays (reports 0) — counts are tracked explicitly,
 *   - no compound-index stores through a union-typed parameter.
 */
import {
  deviceCreateBuffer,
  deviceCreateTexture,
  deviceCreateSampler,
  deviceCreateBindGroupLayout,
  deviceCreatePipelineLayout,
  deviceCreateBindGroup,
  deviceCreateRenderPipeline,
  deviceCreateShaderModule,
  deviceCreateCommandEncoder,
  commandEncoderBeginRenderPass,
  renderPassEnd,
  commandEncoderFinish,
  renderPassSetPipeline,
  renderPassSetBindGroup,
  renderPassSetVertexBuffer,
  renderPassSetIndexBuffer,
  renderPassDrawIndexed,
  queueSubmit,
  queueWriteBuffer,
  queueWriteTexture,
  surfaceConfigure,
  surfaceGetCurrentTexture,
  surfacePresent,
  textureCreateView,
  textureViewDestroy,
  textureDestroy,
  GPUBufferUsage,
  GPUTextureUsage,
  GPUShaderStage,
  type GPUBuffer,
  type GPUBindGroup,
  type GPUDevice,
  type GPUPipelineLayout,
  type GPUQueue,
  type GPURenderPipeline,
  type GPUSampler,
  type GPUSurface,
  type GPUTexture,
  type GPUTextureFormat,
} from "@perryts/webgpu";
import {
  computeAttachmentWorld,
  computeAttachmentWorldVertices,
  type Skeleton,
  type Slot,
  type SpineAtlas,
  type AttachmentData,
} from "@rasenjs/assets";

/** An atlas page already decoded to tightly packed RGBA8. */
export interface RendererImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Skeleton-space rectangle the camera should frame. */
export interface FitBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RendererOptions {
  surface: GPUSurface;
  device: GPUDevice;
  queue: GPUQueue;
  /** Swapchain format from `surfaceGetPreferredFormat`. */
  format: GPUTextureFormat;
  /** Backing-store size in PHYSICAL pixels (points x display scale). */
  widthPx: number;
  heightPx: number;
  skeleton: Skeleton;
  atlas: SpineAtlas;
  image: RendererImage;
  fit: FitBox;
}

/** Per-frame counters, for logging and for tests to assert on. */
export interface RendererStats {
  frames: number;
  /** Frames where the swapchain had no image ready (skipped). */
  skipped: number;
  drawCalls: number;
  vertices: number;
  triangles: number;
  /** Slots that resolved to geometry this frame. */
  attachments: number;
}

export interface SpineRenderer {
  readonly stats: RendererStats;
  frame(): void;
  destroy(): void;
}

/** Floats per vertex: position.xy, uv.xy, colour.rgba. */
const FLOATS_PER_VERTEX = 8;
/** Byte stride of one vertex — 2 + 2 + 4 floats. */
const VERTEX_STRIDE = FLOATS_PER_VERTEX * 4;

/** Initial vertex capacity. c010 `action` peaks near 2.4k vertices. */
const INITIAL_VERTEX_CAPACITY = 16384;
/** Initial index capacity (6 indices per quad-ish; generous headroom). */
const INITIAL_INDEX_CAPACITY = 49152;

/**
 * Static per-attachment geometry: atlas UVs and the triangle list.
 *
 * Positions are NOT cached — they change every frame (bones, and for c010 the
 * 76 deform timelines reshape the meshes themselves). UVs and topology are
 * properties of the attachment, so they are computed once and reused.
 *
 * This is why the example is fast enough to keep at 60 fps: without the cache
 * each frame pays `computeAttachmentWorld` (which solves world vertices) twice.
 */
interface AttachmentGeom {
  /** Atlas-space UVs, `[u0,v0,u1,v1,...]`, normalized 0..1. */
  uvs: Float32Array;
  /** Triangle indices into the attachment's own vertices. */
  triangles: number[];
  vertexCount: number;
}

const SHADER = `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};

@group(0) @binding(0) var u_tex: texture_2d<f32>;
@group(0) @binding(1) var u_samp: sampler;

@vertex
fn vs_main(
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
) -> VSOut {
  var out: VSOut;
  out.pos = vec4f(pos, 0.0, 1.0);
  out.uv = uv;
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  // The atlas is premultiplied and so is the tint, so a plain product keeps
  // the fragment premultiplied.
  return textureSample(u_tex, u_samp, in.uv) * in.color;
}
`;

/** Whether an attachment type produces drawable triangles. */
function isDrawableType(type: string): boolean {
  return type !== "clipping" && type !== "boundingbox" && type !== "path" &&
    type !== "point";
}

/**
 * Decode a slot tint to straight-alpha RGBA in 0..1.
 *
 * `slot.colorN` is the authoritative numeric form (kept in lockstep with
 * `slot.color` by the runtime), so the hex string is only a fallback.
 */
function slotTint(slot: Slot): { r: number; g: number; b: number; a: number } {
  const n = slot.colorN;
  if (n) {
    return { r: n[0], g: n[1], b: n[2], a: n[3] };
  }
  const hex = slot.color;
  const h = hex.length === 8 ? hex : hex + "ffff";
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

/**
 * Create the renderer, upload the atlas, and configure the swapchain.
 *
 * The swapchain is configured with `widthPx`/`heightPx` — **physical pixels**.
 * `@perryts/webgpu` documents those fields as the backing-store size and hands
 * them straight to wgpu's `set_drawable_size`; passing logical points on a
 * Retina display makes the image cover only the top-left quarter, because the
 * Metal layer keeps `contentsGravity = topLeft` with `contentsScale = 2`.
 */
export function createSpineRenderer(opts: RendererOptions): SpineRenderer {
  const surface = opts.surface;
  const device = opts.device;
  const queue = opts.queue;
  const skeleton = opts.skeleton;
  const atlas = opts.atlas;

  // ── colour space ────────────────────────────────────────────────────
  //
  // Everything stays in the atlas's own (sRGB-encoded) space: no texture
  // decode, no framebuffer encode. This is what Spine's own runtimes and the
  // browser renderers this example is compared against do.
  //
  // The reason it must NOT be a linear workflow: NIKKE atlases are
  // premultiplied (`pma:true`), so a texel's RGB is `colour * alpha`. An
  // `-srgb` texture decodes with a NONLINEAR curve, which is meaningless on a
  // product and corrupts exactly the partial-alpha texels — the anti-aliased
  // edge of every sprite and every separately-authored highlight. The
  // interior (alpha == 1) is unaffected, so the damage shows up as seams along
  // attachment boundaries rather than as a global colour shift.
  //
  // So: view the swapchain through its non-sRGB counterpart (allowed via
  // `viewFormats`) and sample the atlas as plain `rgba8unorm`. The maths then
  // matches the browser pixel for pixel.
  const swapFormat = String(opts.format);
  const viewFormat: GPUTextureFormat = (swapFormat.endsWith("-srgb")
    ? swapFormat.substring(0, swapFormat.length - 5)
    : swapFormat) as unknown as GPUTextureFormat;

  // ── swapchain ───────────────────────────────────────────────────────
  surfaceConfigure(surface, {
    device: device,
    format: swapFormat as unknown as GPUTextureFormat,
    // Permit a non-sRGB view of the swapchain; the pipeline renders into that.
    viewFormats: [viewFormat],
    width: opts.widthPx,
    height: opts.heightPx,
  });

  // ── atlas texture ───────────────────────────────────────────────────
  //
  // Plain `rgba8unorm`, deliberately: see the colour-space block above. The
  // atlas is premultiplied, so any gamma conversion here would corrupt every
  // partial-alpha texel (sprite edges, authored highlights).
  const image = opts.image;
  const texture: GPUTexture = deviceCreateTexture(device, {
    label: "spine-atlas",
    size: { width: image.width, height: image.height, depthOrArrayLayers: 1 },
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: "2d",
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  queueWriteTexture(
    queue,
    {
      destination: {
        texture: texture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
        aspect: "all",
      },
      dataLayout: {
        offset: 0,
        bytesPerRow: image.width * 4,
        rowsPerImage: image.height,
      },
      size: { width: image.width, height: image.height, depthOrArrayLayers: 1 },
    },
    image.rgba as unknown as Uint8Array,
  );
  const textureView = textureCreateView(texture);

  const sampler: GPUSampler = deviceCreateSampler(device, {
    label: "spine-sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  // ── pipeline ────────────────────────────────────────────────────────
  const bgl = deviceCreateBindGroupLayout(device, {
    label: "spine-bgl",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
    ],
  });
  const pipelineLayout: GPUPipelineLayout = deviceCreatePipelineLayout(device, {
    label: "spine-pl",
    bindGroupLayouts: [bgl],
  });
  const bindGroup: GPUBindGroup = deviceCreateBindGroup(device, {
    label: "spine-bg",
    layout: bgl,
    entries: [
      { binding: 0, resource: { textureView: textureView } },
      { binding: 1, resource: { sampler: sampler } },
    ],
  });

  const shader = deviceCreateShaderModule(device, SHADER);
  const pipeline: GPURenderPipeline = deviceCreateRenderPipeline(device, {
    label: "spine-pipeline",
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: VERTEX_STRIDE,
          stepMode: "vertex",
          attributes: [
            { format: "float32x2", offset: 0, shaderLocation: 0 },
            { format: "float32x2", offset: 8, shaderLocation: 1 },
            { format: "float32x4", offset: 16, shaderLocation: 2 },
          ],
        },
      ],
    },
    fragment: {
      module: shader,
      entryPoint: "fs_main",
      targets: [{
        // Must match the render pass attachment, i.e. the VIEW format.
        format: viewFormat,
        // Premultiplied alpha: the atlas stores RGB already multiplied by A,
        // and the slot tint is premultiplied on the CPU to match.
        blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
        writeMask: 0xf,
      }],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  // ── geometry buffers ────────────────────────────────────────────────
  //
  // The CPU-side staging owns its `ArrayBuffer` and derives both views from it.
  // Do NOT build a byte view from a typed array's own `.buffer`:
  // `new Uint8Array(f32.buffer, 0, n)` returns an EMPTY view under Perry (the
  // 3-argument form over a `.buffer` reads as length 0), so the upload would
  // carry zero bytes, every vertex would land at the origin, and the frame
  // would silently render nothing while still reporting "N vertices drawn".
  // Views over an `ArrayBuffer` we allocated ourselves are correct.
  let vertexCapacity = INITIAL_VERTEX_CAPACITY;
  let indexCapacity = INITIAL_INDEX_CAPACITY;
  let vertexBuffer: GPUBuffer = deviceCreateBuffer(device, {
    label: "spine-vertices",
    size: vertexCapacity * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  let indexBuffer: GPUBuffer = deviceCreateBuffer(device, {
    label: "spine-indices",
    size: indexCapacity * 4,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });

  let vertexBytes = new ArrayBuffer(INITIAL_VERTEX_CAPACITY * VERTEX_STRIDE);
  let cpuVerts = new Float32Array(vertexBytes);
  let cpuVertBytes = new Uint8Array(vertexBytes);
  let indexBytes = new ArrayBuffer(INITIAL_INDEX_CAPACITY * 4);
  let cpuIndices = new Uint32Array(indexBytes);
  let cpuIndexBytes = new Uint8Array(indexBytes);

  /** Scratch for one attachment's skeleton-space positions. */
  const scratchPos = new Float32Array(2048);

  /** UV + topology cache, keyed on the attachment object. */
  const geomCache = new Map<unknown, AttachmentGeom>();

  // ── projection: skeleton space -> clip space ────────────────────────
  //
  // NDC is a square, but the viewport maps it onto a W x H rectangle. Scaling
  // both axes by the SAME NDC factor therefore squashes the model by the
  // viewport's aspect ratio — on a portrait window that is a large, obvious
  // horizontal squeeze. The camera is derived from a visible box that has the
  // viewport's aspect, so the per-axis NDC scales come out unequal and the
  // model lands on screen with its true shape.
  const fit = opts.fit;
  const fitW = fit.maxX - fit.minX;
  const fitH = fit.maxY - fit.minY;
  const centreX = (fit.minX + fit.maxX) * 0.5;
  const centreY = (fit.minY + fit.maxY) * 0.5;

  const viewportAspect = opts.heightPx > 0 ? opts.widthPx / opts.heightPx : 1;
  // Start from the model's own box, then widen or heighten it so it matches the
  // viewport's shape — whichever direction leaves margin, absorbing it.
  let visW = fitW > 0 ? fitW : 1;
  let visH = fitH > 0 ? fitH : 1;
  if (visW / visH > viewportAspect) {
    visH = visW / viewportAspect;
  } else {
    visW = visH * viewportAspect;
  }
  // A hair of margin so hair/feet do not touch the edges.
  const MARGIN = 1.02;
  const scaleX = (2 / (visW * MARGIN));
  const scaleY = (2 / (visH * MARGIN));

  const stats: RendererStats = {
    frames: 0,
    skipped: 0,
    drawCalls: 0,
    vertices: 0,
    triangles: 0,
    attachments: 0,
  };

  /** Grow the GPU buffers when the frame needs more room than they hold. */
  function ensureCapacity(verts: number, indices: number): void {
    if (verts > vertexCapacity) {
      let cap = vertexCapacity;
      while (cap < verts) cap = cap * 2;
      vertexBuffer = deviceCreateBuffer(device, {
        label: "spine-vertices",
        size: cap * VERTEX_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      vertexCapacity = cap;
      // Rebuild the staging trio from one fresh ArrayBuffer (see above).
      vertexBytes = new ArrayBuffer(cap * VERTEX_STRIDE);
      cpuVerts = new Float32Array(vertexBytes);
      cpuVertBytes = new Uint8Array(vertexBytes);
    }
    if (indices > indexCapacity) {
      let cap = indexCapacity;
      while (cap < indices) cap = cap * 2;
      indexBuffer = deviceCreateBuffer(device, {
        label: "spine-indices",
        size: cap * 4,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      indexCapacity = cap;
      indexBytes = new ArrayBuffer(cap * 4);
      cpuIndices = new Uint32Array(indexBytes);
      cpuIndexBytes = new Uint8Array(indexBytes);
    }
  }

  /** UVs + triangles for one attachment, memoized. */
  function geometryFor(att: AttachmentData, slot: Slot, name: string):
    AttachmentGeom | null {
    const cached = geomCache.get(att);
    if (cached) return cached;
    const geo = computeAttachmentWorld(att, slot, skeleton, atlas, name);
    if (!geo) return null;
    const uvs = new Float32Array(geo.uvs.length);
    for (let i = 0; i < geo.uvs.length; i++) uvs[i] = geo.uvs[i];
    const entry: AttachmentGeom = {
      uvs: uvs,
      triangles: geo.triangles,
      vertexCount: uvs.length / 2,
    };
    geomCache.set(att, entry);
    return entry;
  }

  function frame(): void {

    let vCount = 0;      // vertices written
    let iCount = 0;      // indices written
    let attachments = 0;
    let triangles = 0;

    const order = skeleton.drawOrder;
    for (let s = 0; s < order.length; s++) {
      const slot = order[s];
      const name = slot.attachment;
      if (!name) continue;
      const att = skeleton.findAttachment(slot.data.name, name);
      if (!att) continue;
      const type = att.type ? att.type : "region";
      if (!isDrawableType(type)) continue;

      const geom = geometryFor(att, slot, name);
      if (!geom) continue;

      // Positions for this attachment, in skeleton space.
      const n = computeAttachmentWorldVertices(
        att, slot, skeleton, atlas, name, scratchPos, 2, 0,
      );
      if (n <= 0) continue;

      const needVerts = vCount + n;
      const needIndices = iCount + geom.triangles.length;
      ensureCapacity(needVerts, needIndices);
      const verts = cpuVerts;
      const indices = cpuIndices;

      // Premultiplied tint. The atlas is premultiplied, so the tint must be
      // too — that is what the `ONE, ONE_MINUS_SRC_ALPHA` pipeline expects.
      // Without it, alpha-faded parts blend too bright. No gamma conversion:
      // the whole pipeline stays in the atlas's sRGB-encoded space.
      const tint = slotTint(slot);
      const cr = tint.r * tint.a;
      const cg = tint.g * tint.a;
      const cb = tint.b * tint.a;
      const ca = tint.a;

      const uvs = geom.uvs;
      const vertexBase = vCount;
      let w = vertexBase * FLOATS_PER_VERTEX;
      for (let v = 0; v < n; v++) {
        const x = scratchPos[v * 2];
        const y = scratchPos[v * 2 + 1];
        // Skeleton space -> clip space. Separate per-axis scales (see the
        // projection block) because the viewport is not square. No Y flip:
        // skeleton space has Y up and so does WebGPU's NDC — the framebuffer's
        // downward Y is already handled by the viewport.
        verts[w] = (x - centreX) * scaleX;
        verts[w + 1] = (y - centreY) * scaleY;
        verts[w + 2] = uvs[v * 2];
        verts[w + 3] = uvs[v * 2 + 1];
        verts[w + 4] = cr;
        verts[w + 5] = cg;
        verts[w + 6] = cb;
        verts[w + 7] = ca;
        w = w + FLOATS_PER_VERTEX;
      }

      // Indices, rebased onto the shared vertex buffer so the whole frame is
      // one draw call.
      const tris = geom.triangles;
      for (let t = 0; t < tris.length; t++) {
        indices[iCount] = tris[t] + vertexBase;
        iCount = iCount + 1;
      }

      vCount = needVerts;
      attachments = attachments + 1;
      triangles = triangles + tris.length / 3;
    }

    stats.vertices = vCount;
    stats.triangles = triangles;
    stats.attachments = attachments;

    if (vCount === 0 || iCount === 0) {
      stats.skipped = stats.skipped + 1;
      return;
    }

    // Upload the frame's geometry, truncated to what we actually wrote.
    // `subarray` (not a 3-arg Uint8Array over `.buffer`) — see the staging
    // comment above.
    queueWriteBuffer(
      queue, vertexBuffer, 0,
      cpuVertBytes.subarray(0, vCount * VERTEX_STRIDE),
    );
    queueWriteBuffer(
      queue, indexBuffer, 0,
      cpuIndexBytes.subarray(0, iCount * 4),
    );

    const acquired = surfaceGetCurrentTexture(surface);
    if (acquired === 0) {
      stats.skipped = stats.skipped + 1;
      return;
    }
    // Non-sRGB view, so the GPU does not encode linear -> sRGB on write.
    const target = textureCreateView(acquired, { format: viewFormat });
    const enc = deviceCreateCommandEncoder(device);
    const pass = commandEncoderBeginRenderPass(enc, {
      colorAttachments: [{
        view: target,
        loadOp: "clear",
        storeOp: "store",
        // Mid slate so a missing model is obvious rather than looking like
        // a rendering failure.
        clearValue: { r: 0.055, g: 0.06, b: 0.09, a: 1 },
      }],
    });
    renderPassSetPipeline(pass, pipeline);
    renderPassSetBindGroup(pass, 0, bindGroup);
    renderPassSetVertexBuffer(pass, 0, vertexBuffer);
    renderPassSetIndexBuffer(pass, indexBuffer, "uint32");
    renderPassDrawIndexed(pass, iCount, 1, 0, 0, 0);
    renderPassEnd(pass);
    queueSubmit(queue, JSON.stringify([commandEncoderFinish(enc)]));
    surfacePresent(surface);
    // Release this frame's view. Native handles are not garbage collected:
    // leaving it alive keeps the swapchain texture — and therefore the Metal
    // drawable — checked out, so the drawable pool drains and the next
    // surfaceGetCurrentTexture() blocks the thread forever.
    textureViewDestroy(target);

    stats.frames = stats.frames + 1;
    stats.drawCalls = attachments > 0 ? 1 : 0;
  }

  function destroy(): void {
    if (texture !== 0) textureDestroy(texture);
  }

  return { stats: stats, frame: frame, destroy: destroy };
}
