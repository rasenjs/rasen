/**
 * The rendering stage: a `BloomView` GPU surface with the shared gfx spine
 * component mounted into it.
 *
 * ── Ownership ─────────────────────────────────────────────────────────────
 * The stage owns the swapchain lifecycle: it attaches the surface once the
 * native view reports a handle, builds the gfx renderer, and presents one frame
 * per `tick`. Nothing above this file touches WebGPU.
 *
 * ── Why the attach is deferred ────────────────────────────────────────────
 * `bloomViewGetNativeHandle` returns 0 until `App()` has mounted the view, so
 * the first few ticks legitimately have no surface. `tick` reports progress to
 * the caller rather than blocking, and the app keeps its UI responsive during
 * that window.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 * This is the same plumbing as `examples/perry-spine/src/gfx-host.ts` (which it
 * imports) plus the frame loop. The example-level difference is that this
 * version swaps models at runtime, so it can unmount and remount the spine
 * component.
 */
import { BloomView, bloomViewGetNativeHandle, type Widget } from "perry/ui";
import {
  requestAdapter,
  adapterRequestDeviceSync,
  deviceGetQueueSync,
  surfaceFromNativeView,
  surfaceGetPreferredFormat,
  type GPUAdapter,
  type GPUSurface,
} from "@perryts/webgpu";
import { createRootNode, spine, type GfxNode } from "@rasenjs/gfx";
import {
  Skeleton,
  AnimationState,
  computeAttachmentWorldVertices,
  type SkeletonData,
  type SpineAtlas,
} from "@rasenjs/assets";
import {
  createPerryRenderer,
  createPerrySurface,
  swapchainFormat,
  type PerryRendererOptions,
  type PerrySurface,
} from "../host/gfx-host";
import type { LoadedSpine } from "../data/spine-assets";

/**
 * Retina backing scale.
 *
 * The swapchain is sized in PHYSICAL pixels (`set_drawable_size`) while the
 * view and camera work in points, so the boundary multiplies here. Perry exposes
 * no `devicePixelRatio`, so the host has to know it.
 */
const SCALE = 2;

const NO_SURFACE = 0 as unknown as GPUSurface;

/** What the stage reports back so the UI can show real state. */
export interface StageStatus {
  attached: boolean;
  fps: number;
  poseMs: number;
  drawMs: number;
  error: string;
}

/** A model to draw, plus the animation to start on. */
export interface StageModel {
  spine: LoadedSpine;
  animation: string;
}

/**
 * Camera that frames a rig.
 *
 * Fit on the SETUP pose, not the live one: a per-frame fit would make the
 * character breathe in and out as the animation changes its silhouette.
 *
 * Both axes are constrained. The window is not shaped to the rig the way the
 * perry-spine example is — a fixed stage has to hold wide rigs and tall ones — so
 * the tighter of the two scales wins.
 */
function computeFit(
  sc: Skeleton,
  atlas: SpineAtlas,
  widthPt: number,
  heightPt: number,
): { x: number; y: number; zoom: number } {
  const scratch = new Float32Array(1 << 16);
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;

  const order = sc.drawOrder;
  for (let i = 0; i < order.length; i++) {
    const slot = order[i];
    const name = slot.attachment;
    if (!name) continue;
    const att = sc.findAttachment(slot.data.name, name);
    if (!att) continue;
    const type = att.type ? att.type : "region";
    // Non-drawable attachment kinds contribute no pixels to frame.
    if (type === "clipping" || type === "boundingbox" || type === "path"
      || type === "point") {
      continue;
    }
    const n = computeAttachmentWorldVertices(
      att, slot, sc, atlas, name, scratch, 2, 0,
    );
    if (n <= 0) continue;
    for (let v = 0; v < n; v++) {
      const x = scratch[v * 2];
      const y = scratch[v * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // No geometry at all (a broken or empty skin): show the rig origin at 1:1
  // rather than producing an infinite zoom.
  if (minX > maxX || minY > maxY) return { x: 0, y: 0, zoom: 1 };

  const fitW = maxX - minX;
  const fitH = maxY - minY;
  // A little breathing room so the silhouette never touches the edges.
  const MARGIN = 1.06;
  const zoomX = fitW > 0 ? widthPt / (fitW * MARGIN) : 1e9;
  const zoomY = fitH > 0 ? heightPt / (fitH * MARGIN) : 1e9;
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    zoom: Math.min(zoomX, zoomY),
  };
}

export interface StageOptions {
  widthPt: number;
  heightPt: number;
  clearColor: string;
  onStatus?: (status: StageStatus) => void;
}

/**
 * The stage.
 *
 * Construct it before `App()` so the `BloomView` widget exists to be placed in
 * the UI tree; call `tick(dt)` from the frame loop.
 */
export class Stage {
  readonly widget: Widget;

  private readonly opts: StageOptions;
  private readonly widthPt: number;
  private readonly heightPt: number;

  private surface: GPUSurface = NO_SURFACE;
  private perrySurface: PerrySurface | null = null;
  private renderer: ReturnType<typeof createPerryRenderer> | null = null;
  private root: GfxNode | null = null;
  private nodeOpts: PerryRendererOptions | null = null;

  /** Unmount for the currently mounted spine component, if any. */
  private unmountSpine: (() => void) | null = null;

  private skeleton: Skeleton | null = null;
  private state: AnimationState | null = null;
  private current: StageModel | null = null;
  private needsMount = false;
  private camera: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 };
  private clearColor: string;

  private frameCount = 0;
  private poseAccMs = 0;
  private drawAccMs = 0;
  private measured = 0;
  private lastReportMs = 0;
  private lastReportFrame = 0;
  private fps = 0;

  /** Latched once setup throws, so the UI shows the reason instead of a blank. */
  private error = "";

  constructor(opts: StageOptions) {
    this.opts = opts;
    this.widthPt = opts.widthPt;
    this.heightPt = opts.heightPt;
    this.clearColor = opts.clearColor;
    this.widget = BloomView(opts.widthPt, opts.heightPt);
    this.lastReportMs = Date.now();
  }

  /** True once the swapchain is live and frames are being presented. */
  get attached(): boolean {
    return this.renderer !== null;
  }

  get failure(): string {
    return this.error;
  }

  /**
   * The model currently being drawn, or null.
   *
   * Available before the surface attaches, so the caller can load assets while
   * the window is still coming up.
   */
  get model(): StageModel | null {
    return this.current;
  }

  /**
   * Change what is drawn, and re-frame the camera on it.
   *
   * The spine component reads its skeleton at mount time, so a model change is a
   * remount. Before the surface exists the model is only recorded; the attach
   * path mounts it.
   */
  setModel(model: StageModel): void {
    this.current = model;
    this.skeleton = new Skeleton(model.spine.data, "default");
    // Nikke models keep accessory parts (wingman pods and the like) in separate
    // skins that must be combined with the default one, or those attachments are
    // invisible.
    const extras: string[] = [];
    for (let i = 0; i < model.spine.data.skins.length; i++) {
      const name = model.spine.data.skins[i].name;
      if (name !== "default") extras.push(name);
    }
    this.skeleton.extraSkins = extras;
    this.skeleton.setToSetupPose();
    this.skeleton.updateWorldTransform();
    // Setup-time contract: builds the per-bone cache. Calling it per frame would
    // both allocate and (on this runtime) risk the sort crash the example notes.
    this.skeleton.updateCache();

    this.state = new AnimationState(this.skeleton);
    const names = this.state.animationNames;
    const wanted = names.indexOf(model.animation) >= 0
      ? model.animation
      : (names.length ? names[0] : "");
    if (wanted) this.state.setAnimation(wanted, true);
    model.animation = wanted;

    const camera = computeFit(
      this.skeleton,
      model.spine.atlas,
      this.widthPt,
      this.heightPt,
    );
    this.camera = camera;
    if (this.nodeOpts) this.nodeOpts.camera = camera;
    if (this.renderer) this.renderer.setCamera(camera);

    this.needsMount = true;
    // A model set before the surface existed is mounted by the attach path.
    if (this.renderer) this.mountSpine();
  }

  /** Switch animation without a remount — `AnimationState` reads it live. */
  setAnimation(name: string): void {
    if (!this.state || !this.current) return;
    this.state.setAnimation(name, true);
    this.current.animation = name;
  }

  /** Names of every animation in the current model. */
  animationNames(): string[] {
    return this.state ? this.state.animationNames : [];
  }

  /**
   * Advance one frame: attach if needed, pose, draw, present.
   *
   * `dtSeconds` is wall-clock time since the previous tick, already clamped by
   * the caller.
   */
  tick(dtSeconds: number): void {
    if (this.error) return;

    if (this.surface === NO_SURFACE) {
      this.tryAttach();
      return;
    }
    if (!this.renderer || !this.perrySurface) return;

    if (this.needsMount) this.mountSpine();

    const tPose = Date.now();
    if (this.state) {
      this.state.update(dtSeconds);
      this.state.apply();
    }
    const tDraw = Date.now();
    this.frameCount = this.frameCount + 1;
    // `requestRedraw()` marks the frame dirty and draws synchronously; a second
    // `draw()` would early-return.
    this.renderer.requestRedraw();
    // The renderer draws into the surface texture but deliberately does not
    // present — presentation belongs to the host so it can also skip it.
    this.perrySurface.present();
    const tEnd = Date.now();

    this.poseAccMs = this.poseAccMs + (tDraw - tPose);
    this.drawAccMs = this.drawAccMs + (tEnd - tDraw);
    this.measured = this.measured + 1;
    this.report();
  }

  /** Push a status snapshot if a report is due. */
  private report(): void {
    if (this.frameCount - this.lastReportFrame < 120) return;
    const now = Date.now();
    const elapsed = now - this.lastReportMs;
    const n = this.measured > 0 ? this.measured : 1;
    this.fps = elapsed > 0 ? n * 1000 / elapsed : 0;
    this.lastReportMs = now;
    this.lastReportFrame = this.frameCount;
    const pose = this.poseAccMs / n;
    const draw = this.drawAccMs / n;
    this.poseAccMs = 0;
    this.drawAccMs = 0;
    this.measured = 0;
    if (this.opts.onStatus) {
      this.opts.onStatus({
        attached: true,
        fps: this.fps,
        poseMs: pose,
        drawMs: draw,
        error: "",
      });
    }
  }

  /** Bind the surface on the first tick where the native view has a handle. */
  private tryAttach(): void {
    const handle = bloomViewGetNativeHandle(this.widget);
    if (handle === 0) return;

    const surface = surfaceFromNativeView(handle);
    this.surface = surface;

    requestAdapter(surface).then((adapter: GPUAdapter): void => {
      try {
        const device = adapterRequestDeviceSync(adapter);
        const queue = deviceGetQueueSync(device);
        const preferred = String(surfaceGetPreferredFormat(surface, adapter));

        const opts: PerryRendererOptions = {
          surface: surface,
          deviceHandle: device,
          queueHandle: queue,
          // Physical pixels for the swapchain, points for the camera.
          widthPx: this.widthPt * SCALE,
          heightPx: this.heightPt * SCALE,
          logicalWidth: this.widthPt,
          logicalHeight: this.heightPt,
          preferredFormat: preferred,
          camera: this.camera,
          clearColor: this.clearColor,
        };
        this.nodeOpts = opts;
        // The host adapts the surface first (it owns the swapchain and the
        // per-frame acquire cache), then hands gfx the context half.
        this.perrySurface = createPerrySurface(opts, swapchainFormat(preferred));
        this.renderer = createPerryRenderer(opts, this.perrySurface);
        // Apply a background chosen while the window was still coming up.
        this.renderer.setClearColor(this.clearColor);
        this.root = createRootNode(this.renderer, surface);
        // A model may already have been loaded while the window was coming up.
        if (this.current) this.mountSpine();
      } catch (e: unknown) {
        const err = e as { message?: string; stack?: string };
        this.error = "GPU setup failed: " + String(e);
        console.error("[stage] " + this.error);
        if (err && err.stack) console.error(err.stack);
        if (this.opts.onStatus) {
          this.opts.onStatus({
            attached: false,
            fps: 0,
            poseMs: 0,
            drawMs: 0,
            error: this.error,
          });
        }
      }
    });
  }

  /** Mount the spine component for `this.current`. */
  private mountSpine(): void {
    if (!this.root || !this.current || !this.skeleton || !this.state) return;
    this.needsMount = false;

    if (this.unmountSpine) {
      this.unmountSpine();
      this.unmountSpine = null;
    }

    const model = this.current;
    const spineProps: Record<string, unknown> = {
      skeleton: this.skeleton,
      atlas: model.spine.atlas,
      // Raw RGBA8 — a DOM-less host has no <img>, so the backend uploads bytes.
      atlasImg: {
        width: model.spine.primary.width,
        height: model.spine.primary.height,
        bytes: model.spine.primary.bytes,
      },
      state: this.state,
      animation: model.animation,
      loop: true,
      // Read once per draw so the component re-poses every frame.
      frame: () => this.frameCount,
      width: this.widthPt,
      height: this.heightPt,
      x: 0,
      y: 0,
      // Match the flat reference renderers: no ACES tonemap on spine art.
      skipTonemap: true,
    };

    // The atlas map is only built when there is more than one page, so the
    // single-page case keeps the cheaper path.
    if (model.spine.pages.size > 1) {
      const imgs = new Map<string, unknown>();
      model.spine.pages.forEach(function (page, name): void {
        imgs.set(name, { width: page.width, height: page.height, bytes: page.bytes });
      });
      spineProps.atlasImgs = imgs;
    }

    const mount = (spine as unknown as (p: Record<string, unknown>) => (
      node: unknown,
      hooks: unknown,
    ) => (() => void) | undefined)(spineProps);
    const unmount = mount(this.root, undefined);
    this.unmountSpine = unmount ? unmount : null;
  }

  /**
   * Re-frame the camera without reloading.
   *
   * The renderer reads its camera from options at construction and from
   * `setCamera` afterwards, so both are updated — `nodeOpts` is what a renderer
   * created later would pick up.
   */
  setCamera(camera: { x: number; y: number; zoom: number }): void {
    this.camera = camera;
    if (this.nodeOpts) this.nodeOpts.camera = camera;
    if (this.renderer) this.renderer.setCamera(camera);
  }

  /** World-space framing currently applied. */
  getCamera(): { x: number; y: number; zoom: number } {
    return this.camera;
  }

  /**
   * Change the background.
   *
   * Recorded even before the renderer exists so the first frame after attaching
   * already uses it.
   */
  setClearColor(color: string): void {
    this.clearColor = color;
    if (this.renderer) this.renderer.setClearColor(color);
  }
}
