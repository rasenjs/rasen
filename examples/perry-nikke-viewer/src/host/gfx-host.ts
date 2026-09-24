/**
 * Perry host adapter for gfx.
 *
 * Hands `@rasenjs/gfx` a presentation target and a device, then steps out of
 * the way: batching, pipelines and the spine mesh are all gfx's own code — the
 * same code the browser runs. The two seams that make that possible:
 *
 *  - **The context.** gfx's WebGPU backend is typed against `GpuCanvasContext`
 *    (`Omit<GPUCanvasContext, 'canvas'> & { canvas: CanvasSurface }`) — the same
 *    shape its WebGL backend uses for `GlContext`. Given one of these the
 *    backend never reaches for a real `<canvas>` or `navigator.gpu`, and the
 *    host owns acquire/present. A browser passes the genuine context through;
 *    a native host passes the one `@rasenjs/perry-wgpu` builds.
 *  - **The device.** gfx calls `device.createBuffer`, `queue.writeBuffer`,
 *    `buffer.unmap()`. Those are the package's facade — Perry's flat FFI stays
 *    inside it. Nothing in this file knows a handle is a number.
 *
 * What remains here is genuinely host-specific: which adapter is compatible
 * with the view, when to attach, and where frames come from.
 */
import {
  installGlobals,
  configureCanvas,
  fromNativeView,
  preferredCanvasFormat,
  requestAdapter,
  viewBackingSize,
  type AdapterHandle,
  type CanvasContext,
  type DeviceHandle,
} from "@rasenjs/perry-wgpu";
import { WebGPURenderer, type CameraConfig, type GpuCanvasContext } from "@rasenjs/gfx";

export interface PerryRendererOptions {
  /** The native view (NSView*) to render into. */
  viewPtr: number;
  /** Backing-store size in PHYSICAL pixels (points x display scale). */
  widthPx: number;
  heightPx: number;
  /** Point size — the camera math works in logical pixels. */
  logicalWidth: number;
  logicalHeight: number;
  /** Swapchain format; from `preferredCanvasFormat` unless overridden. */
  format: string;
  camera?: CameraConfig;
  /** Window background. `#rgb` / `#rrggbb` / `#rrggbbaa`. */
  clearColor?: string;
}

/** A bound surface, with the frame hand-off the host drives. */
export interface PerrySurface {
  /** What gfx's renderer takes (see `GpuCanvasContext`). */
  context: GpuCanvasContext;
  /** Hand the finished frame to the compositor and start the next frame. */
  present(): void;
}

/** Everything `attach()` returns: the browser-shaped objects gfx consumes. */
export interface GpuSetup {
  adapter: AdapterHandle;
  device: DeviceHandle;
  surface: PerrySurface;
  format: string;
  /** Physical drawing-buffer size — what gfx reports as `canvas.width/height`. */
  widthPx: number;
  heightPx: number;
}

/**
 * Bring up an adapter/device for a native view.
 *
 * Mirrors the browser's order exactly, with one native substitution: the device
 * comes from `requestDeviceSync()` because Perry's promise-object channel drops
 * the object the async form resolves. Everything else — which adapter, what
 * format, when the context is configured — matches what a browser page would do.
 */
export async function attach(viewPtr: number): Promise<GpuSetup> {
  // gfx references the enum tables as bare globals, the way the web exposes
  // them; this must run before any gfx module body executes.
  installGlobals();

  const surfaceHandle = fromNativeView(viewPtr);
  const adapter = await requestAdapter(surfaceHandle);
  const device = adapter.requestDeviceSync();
  // Ask the adapter what this surface prefers, then use the non-SRGB form —
  // see `preferredCanvasFormat` for why the `-srgb` variant double-encodes.
  const format = preferredCanvasFormat(surfaceHandle, adapter);

  // Size the swapchain from the VIEW, not from the size the widget was
  // constructed with. `surfaceConfigure` takes physical pixels and wgpu-hal
  // gives the CAMetalLayer a drawable of exactly that size with
  // `kCAGravityTopLeft` and no stretching; perry-ui lays the widget out to fill
  // its container, which is larger than the `BloomView(w, h)` it was built
  // with — measured 1440x932 points actual against the 852x814 assumed.
  // Configuring from the assumption produced a 1704x1628 drawable inside a
  // 2880x1864 backing store, so CoreAnimation scaled the frame to fit
  // non-uniformly (1.69x horizontally, 1.15x vertically): the picture came out
  // squashed while every call reported success.
  const backing = viewBackingSize(viewPtr);
  const widthPx = backing ? backing.pw : 0;
  const heightPx = backing ? backing.ph : 0;

  const canvas: CanvasContext = configureCanvas(surfaceHandle, {
    width: widthPx > 0 ? widthPx : 1,
    height: heightPx > 0 ? heightPx : 1,
  });

  return {
    adapter: adapter,
    device: device,
    surface: {
      context: canvas as unknown as GpuCanvasContext,
      present(): void {
        canvas.present();
      },
    },
    format: format,
    widthPx: widthPx,
    heightPx: heightPx,
  };
}

/**
 * Build the gfx renderer on a bound surface.
 *
 * `device` and `format` come from `attach()`; the renderer configures the
 * context itself at construction, exactly as it does in a browser.
 */
export function makeRenderer(
  setup: GpuSetup,
  opts: {
    logicalWidth: number;
    logicalHeight: number;
    camera?: CameraConfig;
    clearColor?: string;
  },
): WebGPURenderer {
  return new WebGPURenderer(setup.surface.context, setup.device as never, {
    format: setup.format,
    clearColor: opts.clearColor !== undefined ? opts.clearColor : "#0e0f17",
    // Frames are driven explicitly by the host's pump loop, so the renderer's
    // own scheduler is disabled. Its default would reach for
    // `requestAnimationFrame` (undefined here) and fall back to
    // `queueMicrotask`, which is not a frame clock.
    schedule: function (): () => void {
      return function (): void {};
    },
    logicalWidth: opts.logicalWidth,
    logicalHeight: opts.logicalHeight,
    camera: opts.camera,
  });
}
