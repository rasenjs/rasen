/**
 * Spec-shaped WebGPU facade over Perry's flat FFI.
 *
 * `@perryts/webgpu` exposes the API the way a C binding does: every object is a
 * numeric handle and every operation is a free function taking that handle
 * (`deviceCreateBuffer(device, …)`, `queueWriteBuffer(queue, …)`,
 * `textureCreateView(tex)`). `@rasenjs/gfx`'s WebGPU backend is written against
 * the **spec** — `device.createBuffer()`, `queue.writeBuffer()`,
 * `texture.createView()` — because that is what a browser gives it.
 *
 * This module bridges the two without touching gfx: it wraps each handle in a
 * thin object that carries the spec method set, and "unwraps" back to handles
 * whenever a descriptor has to be JSON-serialised for the native side (Perry's
 * FFI marshals nested descriptors as JSON with `i64` handles).
 *
 * Only the surface gfx actually uses is implemented — see the call inventory at
 * the bottom of this file.
 */
import * as fs from "fs";

function require_fs(): typeof fs { return fs; }

import {
  deviceCreateBuffer,
  deviceCreateTexture,
  deviceCreateSampler,
  deviceCreateBindGroupLayout,
  deviceCreatePipelineLayout,
  deviceCreateBindGroup,
  deviceCreateShaderModule,
  deviceCreateRenderPipeline,
  deviceCreateCommandEncoder,
  devicePushErrorScope,
  devicePopErrorScope,
  bufferDestroy,
  bufferGetMappedRange,
  bufferMapAsync,
  bufferUnmap,
  textureCreateView,
  textureDestroy,
  textureViewDestroy,
  commandEncoderBeginRenderPass,
  commandEncoderFinish,
  commandEncoderCopyTextureToBuffer,
  commandEncoderCopyBufferToTexture,
  renderPassEnd,
  renderPassSetPipeline,
  renderPassSetBindGroup,
  renderPassSetVertexBuffer,
  renderPassSetIndexBuffer,
  renderPassDraw,
  renderPassDrawIndexed,
  renderPassSetViewport,
  renderPassSetScissorRect,
  queueSubmit,
  queueWriteBuffer,
  queueWriteTexture,
  type GPUDevice,
  type GPUQueue,
  type GPUBuffer,
  type GPUTexture,
  type GPUCommandEncoder,
  type GPURenderPassEncoder,
  type GPURenderPipeline,
  type GPUBindGroup,
} from "@perryts/webgpu";

/**
 * Handle casts.
 *
 * `@perryts/webgpu` brands its handle types (`GPUDevice = number & { … }`) so
 * they cannot be mixed up with arbitrary numbers, but a facade works in plain
 * numbers by definition. These are the only places the two views meet.
 */
function dev(handle: number): GPUDevice { return handle as unknown as GPUDevice }
function q(handle: number): GPUQueue { return handle as unknown as GPUQueue }
function buf(handle: number): GPUBuffer { return handle as unknown as GPUBuffer }
function tex(handle: number): GPUTexture { return handle as unknown as GPUTexture }
function enc(handle: number): GPUCommandEncoder { return handle as unknown as GPUCommandEncoder }
function pass(handle: number): GPURenderPassEncoder { return handle as unknown as GPURenderPassEncoder }

/** Unbuffered trace, active when SPINE_TRACE_FILE is set. */
function t(line: string): void {
  const path = process.env.SPINE_TRACE_FILE;
  if (!path) return;
  try {
    const fs = require_fs();
    fs.appendFileSync(String(path), "[api] " + line + "\n");
  } catch (_e) {
    // never fatal
  }
}

/** A wrapped GPU object: the native handle plus the spec-shaped methods. */
interface Wrapped {
  /** Native handle. Named with a prefix so it cannot collide with API fields. */
  __h: number;
  /**
   * What kind of object this wraps.
   *
   * Needed because a bind-group `resource` is written in the browser as a bare
   * object — `resource: view` or `resource: { buffer }` — while the FFI expects
   * it tagged (`{ textureView: n }`, `{ sampler: n }`, `{ buffer: n, … }`).
   * Without the tag a view and a sampler are indistinguishable.
   */
  __kind: string;
}

/** Unwrap a wrapper back to the raw handle the FFI needs. */
function h(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const w = value as Wrapped;
    if (typeof w.__h === "number") return w.__h;
  }
  return 0;
}

/**
 * Replace every wrapper inside a descriptor with its handle.
 *
 * Perry's FFI takes descriptors as JSON with numeric handles
 * (`vertex.module: i64`, `layout: i64`, `entries[].resource.buffer: i64`), so a
 * wrapper reaching `JSON.stringify` would serialise as `{"__h":3}` and the
 * native side would reject or silently zero it. This walks the descriptor and
 * substitutes, leaving plain numbers and primitives alone.
 */
function unwrapDeep(value: unknown, depth: number): unknown {
  if (depth > 6) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "string" ||
    typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    const w = value as Wrapped;
    if (typeof w.__h === "number") return w.__h;
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        out.push(unwrapDeep(value[i], depth + 1));
      }
      return out;
    }
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key in src) {
      out[key] = unwrapDeep(src[key], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Tag bind-group entry resources the way the FFI expects.
 *
 * In the browser a `resource` is a bare object (`textureView`, `sampler` or
 * `{ buffer, offset, size }`); the FFI parses a tagged shape and returns 0 if
 * it cannot, which silently produces an empty bind group. Wrappers therefore
 * declare their kind, and a raw number is taken to be a texture view.
 */
function normalizeEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as { binding: number; resource: unknown };
    out.push({ binding: e.binding, resource: normalizeResource(e.resource) });
  }
  return out;
}

function normalizeResource(resource: unknown): unknown {
  if (typeof resource === "number") {
    // A raw handle can only come from a texture view here.
    return { textureView: resource };
  }
  if (resource && typeof resource === "object") {
    const r = resource as Record<string, unknown>;
    if (typeof r.__h === "number") {
      if (r.__kind === "sampler") return { sampler: r.__h };
      if (r.__kind === "buffer") {
        return { buffer: r.__h, offset: 0, size: 0 };
      }
      return { textureView: r.__h };
    }
    if ("buffer" in r) {
      return {
        buffer: h(r.buffer),
        offset: typeof r.offset === "number" ? r.offset : 0,
        size: typeof r.size === "number" ? r.size : 0,
      };
    }
  }
  return resource;
}

/**
 * Coerce an optional numeric argument into a real number.
 *
 * The spec lets several positional arguments be omitted (`offset`, `size`,
 * `instanceCount`, …) and gfx does omit them. The native entry points declare
 * those slots as `f64`, so an omitted argument arrives as `undefined` and Perry
 * throws `TypeError: Expected number for native f64 parameter`. That throw
 * happens *inside the first draw*, so the app dies one frame in with an empty
 * window — which looks exactly like a hang.
 */
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ── buffer ───────────────────────────────────────────────────────────

/**
 * Buffers created with `mappedAtCreation` need a host-side shadow.
 *
 * Perry's `bufferGetMappedRange` COPIES the mapped bytes out
 * (`slice.get_mapped_range().to_vec()` → `alloc_buffer_value`), unlike the spec
 * where it returns a view onto the buffer. Writes into a copy would be lost —
 * gfx's 1x1 white texture is built exactly that way, and every draw without a
 * full set of bound textures samples it. So the facade hands out the shadow and
 * flushes it on `unmap`.
 */
const shadows = new Map<number, Uint8Array>();
/** Buffers created with a MAP_READ usage, for the readback path. */
const mappable = new Map<number, number>();

interface FacadeBuffer extends Wrapped {
  readonly size: number;
  getMappedRange(offset?: number, size?: number): Uint8Array;
  unmap(): void;
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
}

function wrapBuffer(
  handle: number,
  size: number,
  usage: number,
  mappedAtCreation: boolean,
  queue: number,
  GPUBufferUsageMap: { MAP_READ: number },
): FacadeBuffer {
  if (mappedAtCreation) shadows.set(handle, new Uint8Array(size));
  if ((usage & GPUBufferUsageMap.MAP_READ) !== 0) mappable.set(handle, size);

  return {
    __h: handle,
    __kind: "buffer",
    size: size,
    getMappedRange(offset?: number, sz?: number): Uint8Array {
      const shadow = shadows.get(handle);
      // Only the mappedAtCreation path uses offsets meaningfully here; gfx
      // calls this with no arguments, so a whole-shadow view is correct and
      // avoids depending on subarray aliasing.
      if (shadow) return shadow;
      // Readback path: Perry returns a copy of the mapped bytes, which is
      // exactly what a reader wants.
      return bufferGetMappedRange(buf(handle), offset ?? 0, sz ?? 0);
    },
    unmap(): void {
      const shadow = shadows.get(handle);
      if (shadow) {
        // Push the shadow into the real buffer, then drop it: the mapping is
        // over.
        queueWriteBuffer(q(queue), buf(handle), 0, shadow);
        shadows.delete(handle);
      }
      bufferUnmap(buf(handle));
    },
    destroy(): void {
      shadows.delete(handle);
      mappable.delete(handle);
      bufferDestroy(buf(handle));
    },
    mapAsync(mode: number, offset?: number, sz?: number): Promise<void> {
      return bufferMapAsync(buf(handle), mode, offset ?? 0, sz ?? 0);
    },
  };
}

// ── texture / sampler / layouts ──────────────────────────────────────

interface FacadeTexture extends Wrapped {
  createView(descriptor?: unknown): Wrapped;
  destroy(): void;
}

function wrapTexture(handle: number): FacadeTexture {
  return {
    __h: handle,
    __kind: "texture",
    createView(descriptor?: unknown): Wrapped {
      // A view is only ever a descriptor value, but it must still be tagged:
      // the FFI's bind-group parser reads `resource.textureView`.
      const view = textureCreateView(tex(handle), descriptor as never);
      return { __h: view, __kind: "textureView" };
    },
    destroy(): void {
      textureDestroy(tex(handle));
    },
  };
}

/**
 * Wrap a texture handle that the host owns (the swapchain image).
 *
 * The frame target hands gfx this frame's texture; gfx immediately calls
 * `createView()` on it, so a bare handle will not do.
 *
 * `views` collects every view handle created from this texture. A wgpu surface
 * keeps its swapchain image alive until all views derived from it are dropped,
 * and with the default `desired_maximum_frame_latency` the pool holds only
 * about three images — so one un-released view per frame exhausts the pool and
 * the next `surfacePresent` blocks forever. The host passes an array and
 * destroys the recorded views right after presenting (see `createPerrySurface`);
 * a browser would simply collect them.
 */
export function wrapHostTexture(handle: number, views?: number[]): FacadeTexture {
  if (!views) return wrapTexture(handle)
  return {
    __h: handle,
    __kind: "texture",
    createView(descriptor?: unknown): Wrapped {
      const view = textureCreateView(tex(handle), descriptor as never)
      views.push(view)
      return { __h: view, __kind: "textureView" }
    },
    destroy(): void {
      // The swapchain image belongs to the surface, not to us: releasing it
      // here would fight the compositor.
    },
  }
}

function wrapPlain(handle: number, kind: string): Wrapped {
  return { __h: handle, __kind: kind };
}

// ── command encoding ─────────────────────────────────────────────────

interface FacadeRenderPass extends Wrapped {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown, dynamicOffsets?: number[]): void;
  setVertexBuffer(slot: number, buffer: unknown, offset?: number, size?: number): void;
  setIndexBuffer(buffer: unknown, format: unknown, offset?: number, size?: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  setViewport(x: number, y: number, w: number, h: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, w: number, h: number): void;
  end(): void;
}

interface FacadeCommandEncoder extends Wrapped {
  beginRenderPass(descriptor: unknown): FacadeRenderPass;
  finish(): Wrapped;
  copyTextureToBuffer(source: unknown, destination: unknown, size: unknown): void;
  copyBufferToTexture(source: unknown, destination: unknown, size: unknown): void;
}

export interface GfxWebGpuDevice {
  /** Spec-shaped device for gfx. */
  device: Record<string, unknown>;
  /** Spec-shaped queue for gfx. */
  queue: Record<string, unknown>;
}

/**
 * Build the spec-shaped device/queue pair gfx expects.
 *
 * @param perryDevice Numeric device handle from `adapterRequestDeviceSync`.
 * @param perryQueue  Numeric queue handle from `deviceGetQueueSync`.
 * @param constants   The WebGPU enum tables (`GPUBufferUsage`, `GPUTextureUsage`,
 *                    `GPUShaderStage`) — passed in so this file does not depend
 *                    on the caller's import style.
 */
export function createGfxDevice(
  perryDevice: number,
  perryQueue: number,
  constants: {
    GPUBufferUsage: { MAP_READ: number };
  },
): GfxWebGpuDevice {
  const queue: Record<string, unknown> = {
    writeBuffer(
      buffer: unknown,
      bufferOffset: number,
      data: unknown,
      dataOffset?: number,
      size?: number,
    ): void {
      // The FFI takes the whole byte view; gfx's one 5-argument call (an index
      // upload with an offset) is sliced to match.
      let bytes = data as Uint8Array;
      if (dataOffset !== undefined || size !== undefined) {
        const start = dataOffset ?? 0;
        const len = size !== undefined ? size : bytes.byteLength - start;
        bytes = bytes.subarray(start, start + len);
      }
      queueWriteBuffer(q(perryQueue), buf(h(buffer)), num(bufferOffset), bytes);
    },

    writeTexture(
      descriptor: unknown,
      data: unknown,
      dataLayout: unknown,
      size: unknown,
    ): void {
      // `destination`, `dataLayout` and `size` all carry handles inside them,
      // so they go through `unwrapDeep` like every other descriptor here.
      //
      // This one used to pass `descriptor.texture` straight through as the
      // wrapper object. The FFI deserializes the descriptor into
      // `WriteTextureCall { destination: ImageCopyTextureDesc { texture: i64 } }`
      // and a field it cannot parse turns the whole call into a silent no-op
      // (`Err(_) => return`). The atlas texture therefore stayed all zeros, every
      // sprite sampled alpha 0, and the premultiplied blend drew nothing — the
      // window showed only the clear colour while the app reported a steady
      // 60fps with a full triangle count.
      queueWriteTexture(
        q(perryQueue),
        unwrapDeep({
          destination: descriptor,
          dataLayout: dataLayout,
          size: size,
        }, 0) as never,
        data as unknown as Uint8Array,
      );
    },

    submit(commandBuffers: unknown[]): void {
      // Perry takes the list as a JSON array of handles.
      const handles: number[] = [];
      for (let i = 0; i < commandBuffers.length; i++) {
        handles.push(h(commandBuffers[i]));
      }
      queueSubmit(q(perryQueue), JSON.stringify(handles));
    },

    copyExternalImageToTexture(): void {
      throw new Error(
        "gfx-webgpu: copyExternalImageToTexture is not available on this host " +
        "(there is no platform bitmap type). Pass raw RGBA pixels instead — " +
        "`createTexture` accepts { width, height, bytes } and uploads them " +
        "with writeTexture.",
      );
    },
  };

  const device: Record<string, unknown> = {
    queue: queue,

    createBuffer(descriptor: Record<string, unknown>): FacadeBuffer {
      const handle = deviceCreateBuffer(dev(perryDevice), {
        label: descriptor.label,
        size: descriptor.size,
        usage: descriptor.usage,
        mappedAtCreation: descriptor.mappedAtCreation === true,
      } as never);
      return wrapBuffer(
        handle,
        descriptor.size as number,
        descriptor.usage as number,
        descriptor.mappedAtCreation === true,
        perryQueue,
        constants.GPUBufferUsage,
      );
    },

    createTexture(descriptor: Record<string, unknown>): FacadeTexture {
      const handle = deviceCreateTexture(dev(perryDevice), {
        label: descriptor.label,
        size: descriptor.size,
        format: descriptor.format,
        usage: descriptor.usage,
        mipLevelCount: descriptor.mipLevelCount,
        sampleCount: descriptor.sampleCount,
        dimension: descriptor.dimension,
        viewFormats: descriptor.viewFormats,
      } as never);
      return wrapTexture(handle);
    },

    createSampler(descriptor: Record<string, unknown> | undefined): Wrapped {
      const handle = deviceCreateSampler(dev(perryDevice), (descriptor ?? {}) as never);
      return wrapPlain(handle, "sampler");
    },

    createBindGroupLayout(descriptor: unknown): Wrapped {
      const handle = deviceCreateBindGroupLayout(dev(perryDevice), unwrapDeep(descriptor, 0) as never);
      return wrapPlain(handle, "bindGroupLayout");
    },

    createPipelineLayout(descriptor: unknown): Wrapped {
      return wrapPlain(
        deviceCreatePipelineLayout(dev(perryDevice), unwrapDeep(descriptor, 0) as never), "pipelineLayout",
      );
    },

    createBindGroup(descriptor: Record<string, unknown>): Wrapped {
      const handle = deviceCreateBindGroup(dev(perryDevice), {
        label: descriptor.label,
        layout: h(descriptor.layout),
        entries: normalizeEntries(descriptor.entries),
      } as never);
      return wrapPlain(handle, "bindGroup");
    },

    createShaderModule(descriptor: Record<string, unknown>): Wrapped {
      // The FFI takes the WGSL source directly rather than a descriptor.
      return wrapPlain(
        deviceCreateShaderModule(dev(perryDevice), (descriptor.code as string) ?? ""), "shaderModule",
      );
    },

    createRenderPipeline(descriptor: Record<string, unknown>): Wrapped {
      const p = wrapPlain(
        deviceCreateRenderPipeline(dev(perryDevice), unwrapDeep(descriptor, 0) as never), "renderPipeline",
      );
      return p;
    },

    createCommandEncoder(_descriptor?: unknown): FacadeCommandEncoder {
      const encoderHandle = deviceCreateCommandEncoder(dev(perryDevice));
      return {
        __h: encoderHandle,
        __kind: "commandEncoder",

        beginRenderPass(descriptor: unknown): FacadeRenderPass {
          const passHandle = commandEncoderBeginRenderPass(
            enc(encoderHandle),
            unwrapDeep(descriptor, 0) as never,
          );
          return {
            __h: passHandle,
            __kind: "renderPass",
            setPipeline(pipeline: unknown): void {
              renderPassSetPipeline(pass(passHandle), h(pipeline) as unknown as GPURenderPipeline);
            },
            setBindGroup(index: number, bindGroup: unknown): void {
              renderPassSetBindGroup(pass(passHandle), index, h(bindGroup) as unknown as GPUBindGroup);
            },
            setVertexBuffer(slot: number, buffer: unknown, offset?: number, size?: number): void {
              renderPassSetVertexBuffer(
                pass(passHandle), slot, buf(h(buffer)), num(offset), num(size),
              );
            },
            setIndexBuffer(buffer: unknown, format: unknown, offset?: number, size?: number): void {
              renderPassSetIndexBuffer(
                pass(passHandle), buf(h(buffer)), format as never, num(offset), num(size),
              );
            },
            draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void {
              renderPassDraw(
                pass(passHandle), vertexCount, num(instanceCount), num(firstVertex),
                num(firstInstance),
              );
            },
            drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void {
              renderPassDrawIndexed(
                pass(passHandle), indexCount, num(instanceCount), num(firstIndex),
                num(baseVertex), num(firstInstance),
              );
            },
            setViewport(x: number, y: number, w: number, hh: number, minDepth: number, maxDepth: number): void {
              renderPassSetViewport(
                pass(passHandle), x, y, w, hh, num(minDepth), num(maxDepth),
              );
            },
            setScissorRect(x: number, y: number, w: number, hh: number): void {
              renderPassSetScissorRect(pass(passHandle), num(x), num(y), num(w), num(hh));
            },
            end(): void {
              renderPassEnd(pass(passHandle));
            },
          };
        },

        finish(): Wrapped {
          const cb = wrapPlain(commandEncoderFinish(enc(encoderHandle)), "commandBuffer");
          return cb;
        },

        copyTextureToBuffer(source: unknown, destination: unknown, size: unknown): void {
          commandEncoderCopyTextureToBuffer(enc(encoderHandle), {
            source: unwrapDeep(source, 0),
            destination: unwrapDeep(destination, 0),
            size: size,
          } as never);
        },

        copyBufferToTexture(source: unknown, destination: unknown, size: unknown): void {
          commandEncoderCopyBufferToTexture(enc(encoderHandle), {
            source: unwrapDeep(source, 0),
            destination: unwrapDeep(destination, 0),
            size: size,
          } as never);
        },
      };
    },

    pushErrorScope(filter: unknown): void {
      devicePushErrorScope(dev(perryDevice), filter as never);
    },

    popErrorScope(): Promise<{ message: string } | null> {
      // The FFI resolves with a JSON-encoded error (or an empty payload);
      // gfx reads `err.message`, so normalise to an object.
      return devicePopErrorScope(dev(perryDevice)).then((raw: string): { message: string } | null => {
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as { message?: string } | null;
          if (!parsed) return null;
          return { message: parsed.message ? parsed.message : "webgpu validation error" };
        } catch (_e) {
          return { message: raw };
        }
      });
    },

    destroy(): void {
      // Left to the host: the device is shared with the surface setup.
    },
  };

  return { device: device, queue: queue };
}

/**
 * WebGPU API surface this facade covers (gfx's `renderer/gpu/index.ts`):
 *
 *   device.createBuffer / createTexture / createSampler / createBindGroupLayout
 *          / createPipelineLayout / createBindGroup / createShaderModule
 *          / createRenderPipeline / createCommandEncoder
 *          / pushErrorScope / popErrorScope
 *   device.queue.writeBuffer / writeTexture / submit
 *   texture.createView / destroy
 *   buffer.getMappedRange / unmap / destroy / mapAsync
 *   encoder.beginRenderPass / finish / copyTextureToBuffer / copyBufferToTexture
 *   pass.setPipeline / setBindGroup / setVertexBuffer / setIndexBuffer
 *        / draw / drawIndexed / setViewport / setScissorRect / end
 */
