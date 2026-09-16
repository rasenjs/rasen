/**
 * Perry host adapter for gfx.
 *
 * Hands `@rasenjs/gfx` a presentation target and a spec-shaped device, then
 * steps out of the way: batching, pipelines and the single-draw-call spine mesh
 * are all gfx's own code — the same code the browser runs. Two seams make that
 * possible:
 *
 *  - `GpuCanvasContext` (gfx's `node.ts`): the WebGPU backend is typed against
 *    `Omit<GPUCanvasContext, 'canvas'> & { canvas: CanvasSurface }` — the same
 *    shape gfx's WebGL backend already uses for `GlContext`. Given one of these
 *    the backend never touches a real `<canvas>` or `navigator.gpu`, and the
 *    host owns acquire/present. A browser passes the genuine context straight
 *    through; a native host passes its own object here.
 *  - `createGfxDevice` (./gfx-webgpu): Perry's FFI is flat (numeric handles +
 *    free functions) while gfx is written against the spec API, so that module
 *    wraps the handles in spec-shaped objects.
 *
 * The atlas is handed over as raw RGBA8 (`RawPixelSource`) and uploaded with
 * `writeTexture` — a native host has no `<img>` to give the backend.
 */
import {
  surfaceConfigure,
  surfaceGetCurrentTexture,
  surfacePresent,
  GPUBufferUsage,
  GPUTextureUsage,
  GPUShaderStage,
  GPUMapMode,
  type GPUDevice,
  type GPUSurface,
  type GPUTextureFormat,
} from "@perryts/webgpu";
import * as fs from "fs";

/** Unbuffered trace, active only when SPINE_TRACE_FILE is set. */
function t(line: string): void {
  const path = process.env.SPINE_TRACE_FILE;
  if (!path) return;
  try {
    fs.appendFileSync(String(path), line + "\n");
  } catch (_e) {
    // never fatal
  }
}
import { WebGPURenderer, type CameraConfig, type GpuCanvasContext } from "@rasenjs/gfx";
import { createGfxDevice, wrapHostTexture } from "./gfx-webgpu";
import { textureViewDestroy } from "@perryts/webgpu";

/**
 * Install the WebGPU enum tables as globals.
 *
 * gfx refers to them as bare globals (`GPUBufferUsage.VERTEX`) because that is
 * how a browser exposes them, and Perry provides no such globals. Assigning to
 * `globalThis` makes the bare identifiers resolve inside the compiled gfx
 * modules; it must run before any gfx code does.
 */
export function installWebGpuGlobals(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUBufferUsage = GPUBufferUsage;
  g.GPUTextureUsage = GPUTextureUsage;
  g.GPUShaderStage = GPUShaderStage;
  g.GPUMapMode = GPUMapMode;
}

export interface PerryRendererOptions {
  surface: GPUSurface;
  /** Numeric device handle (gfx is handed a wrapped facade, not this). */
  deviceHandle: number;
  /** Numeric queue handle from `deviceGetQueueSync`. */
  queueHandle: number;
  /** Backing-store size in PHYSICAL pixels (points x display scale). */
  widthPx: number;
  heightPx: number;
  /** Point size — the camera math works in logical pixels. */
  logicalWidth: number;
  logicalHeight: number;
  /** Swapchain format as the adapter prefers it; may carry a `-srgb` suffix. */
  preferredFormat: string;
  camera?: CameraConfig;
}

/**
 * Swapchain format to actually configure.
 *
 * Strips the `-srgb` suffix deliberately. The browser path configures its canvas
 * with `navigator.gpu.getPreferredCanvasFormat()`, which is the **non-SRGB**
 * `bgra8unorm`; Perry's `surfaceGetPreferredFormat` reports
 * `bgra8unorm-srgb`. With an sRGB swapchain the GPU encodes linear→sRGB on every
 * write, but gfx's fragment shader — in the `skipTonemap` mode Spine uses —
 * already outputs sRGB-encoded values, so the frame gets gamma-encoded twice.
 * Being multiplicative, that reads as washed-out colour plus seams wherever a
 * texel is only partly transparent (the anti-aliased edge of every sprite).
 * Matching the browser's format removes it without touching shaders.
 */
export function swapchainFormat(preferred: string): GPUTextureFormat {
  const base = preferred.endsWith("-srgb")
    ? preferred.substring(0, preferred.length - 5)
    : preferred;
  return base as unknown as GPUTextureFormat;
}

/**
 * A Perry surface adapted to gfx, plus its presentation and frame bookkeeping.
 *
 * `context` is what gfx's renderer takes (see `GpuCanvasContext`); `present` is
 * what the host calls once per frame after the renderer has submitted.
 */
export interface PerrySurface {
  context: GpuCanvasContext
  /** Hand the finished frame to the compositor and start the next frame. */
  present(): void
}

/**
 * Adapt a Perry surface to gfx's `GpuCanvasContext`.
 *
 * Only the three members gfx uses are implemented, backed by the FFI's free
 * functions: `canvas` reports the physical drawing-buffer size (the same
 * physical values a browser `<canvas>` reports), `configure` forwards the
 * renderer's own configuration down to the surface, and `getCurrentTexture`
 * wraps the acquired texture so `createView()` is available to the renderer.
 *
 * `format` is captured for the `configure` call because the renderer passes the
 * same value it was constructed with.
 */
export function createPerrySurface(
  opts: PerryRendererOptions,
  format: GPUTextureFormat,
): PerrySurface {
  // This frame's acquired image, or null before the first acquire / after
  // present. See `getCurrentTexture` for why the cache is required.
  let acquired: unknown = null;
  // Views gfx created from this frame's image. The surface keeps the swapchain
  // image alive until they are dropped, so they are released right after
  // present (see `wrapHostTexture`).
  let frameViews: number[] = [];

  const context = {
    canvas: { width: opts.widthPx, height: opts.heightPx },
    configure: function (cfg: { usage: number }): void {
      // COPY_SRC arrives in `cfg.usage` from the renderer, and is what lets
      // gfx's `flushAndRead` copy a frame out (note 1 in its class doc).
      surfaceConfigure(opts.surface, {
        device: opts.deviceHandle as unknown as GPUDevice,
        format: format,
        usage: cfg.usage,
        width: opts.widthPx,
        height: opts.heightPx,
      });
      // Reconfiguring drops any acquired image, so a cache must not survive it
      // (the next acquire would otherwise hand out a dead texture).
      acquired = null;
    },
    getCurrentTexture: function (): unknown {
      // Browser semantics: `getCurrentTexture()` is IDEMPOTENT within a frame —
      // every call returns the SAME image, which is why gfx may call it from
      // both `beginFrame` and the bare-`flush` pass opener. wgpu's surface does
      // the opposite: each call ACQUIRES, and a second acquire for the same
      // frame fails with "Surface image is already acquired". Caching the
      // acquired image for the frame is what makes the host honour the browser
      // contract; `present` drops it so the next frame acquires afresh.
      if (acquired) return acquired;
      // gfx calls `createView()` on this immediately, so it must be a
      // spec-shaped texture rather than the bare handle the FFI returns. The
      // view handles it creates are recorded so `present` can release them.
      acquired = wrapHostTexture(surfaceGetCurrentTexture(opts.surface), frameViews);
      return acquired;
    },
  };

  return {
    context: context as unknown as GpuCanvasContext,
    present: function (): void {
      // The browser path presents implicitly at the end of a task; a
      // host-owned surface presents explicitly, once per frame.
      surfacePresent(opts.surface);
      // Release this frame's views. A wgpu surface holds its swapchain image
      // until every view derived from it is dropped, and the pool holds only
      // about three images — leaving them to accumulate makes the next
      // `surfacePresent` block once the pool is exhausted.
      for (let i = 0; i < frameViews.length; i++) {
        // The manifest declares this FFI as `(i64) -> void`: it takes the raw
        // handle. The package's TS signature says `GPUTextureView`, so passing
        // a wrapper object compiles but fails at the boundary with
        // "Expected safe integer for native i64 parameter".
        textureViewDestroy(frameViews[i] as never);
      }
      frameViews = [];
      // Drop the acquired image so the next frame acquires a fresh one.
      acquired = null;
    },
  };
}

/**
 * Build a gfx `WebGPURenderer` on an already-bound Perry surface.
 *
 * Synchronous by design — the caller has already acquired the device. Perry
 * drops object pointers carried through its native-async completion channel, so
 * the promise-returning entry points hand back a device the JS side cannot use;
 * `adapterRequestDeviceSync` / `deviceGetQueueSync` exist for that.
 *
 * `surface` is the caller's adapted surface; the renderer draws into its
 * context and the caller presents via `surface.present()` each frame.
 */
export function createPerryRenderer(
  opts: PerryRendererOptions,
  surface: PerrySurface,
): WebGPURenderer {
  installWebGpuGlobals();

  const format = swapchainFormat(opts.preferredFormat);

  // The surface is configured BY THE RENDERER (its `context.configure` call
  // below), mirroring the browser, so nothing is configured here.
  const context = surface.context;

  // gfx receives the facade, never the raw handles.
  const gfx = createGfxDevice(opts.deviceHandle, opts.queueHandle, {
    GPUBufferUsage: GPUBufferUsage,
  });

  const renderer = new WebGPURenderer(context, gfx.device as never, {
    // gfx configures the context from this; a host states its surface format
    // because there is no `navigator.gpu` to ask.
    format: format,
    clearColor: "#0e0f17",
    // Frames are driven explicitly by the host's pump loop, so the renderer's
    // own scheduler is disabled. Its default would reach for
    // `requestAnimationFrame` (undefined here) and fall back to
    // `queueMicrotask`, which is not a frame clock — an explicit no-op keeps
    // the timing under the host's control.
    schedule: function (): () => void {
      return function (): void {};
    },
    logicalWidth: opts.logicalWidth,
    logicalHeight: opts.logicalHeight,
    camera: opts.camera,
  });
  return renderer;
}
