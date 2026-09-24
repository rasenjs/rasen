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
 * This is the same plumbing as `examples/perry-spine/src/gfx-host.ts` plus the
 * frame loop. The example-level difference is that this version swaps models at
 * runtime, so it can unmount and remount the spine component.
 */
import { BloomView, bloomViewGetNativeHandle, type Widget } from "perry/ui";
import * as fs from "fs";

/**
 * Unbuffered trace, active when SPINE_TRACE_FILE is set.
 *
 * Local to this module on purpose: reaching for the host module's trace would
 * pull the host in before the stage is ready to build a renderer. An earlier
 * revision used an undefined `t` and the resulting `ReferenceError` was
 * swallowed by the attach `try/catch`, leaving the renderer unconstructed and
 * the viewport empty while every log line still looked plausible.
 */
/** How many trace writes have failed. A dead channel must be visible. */
let traceFailures = 0;

function trace(line: string): void {
  const path = process.env.SPINE_TRACE_FILE;
  if (!path) return;
  try {
    fs.appendFileSync(String(path), "[stage] " + line + "\n");
  } catch (e) {
    // Never fatal to rendering — but never silent either.
    //
    // This used to swallow the error, which made a dead logging channel
    // indistinguishable from a frozen application: both show a trace that stops
    // mid-line while the process keeps burning CPU. Reporting the first failure
    // and every 1000th after that keeps the diagnosis unambiguous without
    // letting a broken channel flood the output.
    traceFailures = traceFailures + 1;
    if (traceFailures === 1 || traceFailures % 1000 === 0) {
      console.log("[stage] TRACE WRITE FAILED x" + traceFailures + ": " + String(e));
    }
  }
}

/**
 * Route the renderer's optional per-frame internals into this module's trace.
 *
 * `@rasenjs/gfx` emits nothing unless a host installs `globalThis.__gfxTrace`,
 * so this is the only place the hook is set and removing the assignment
 * silences the whole channel. Installed once, lazily, from `tick()` — module
 * scope runs before Perry has necessarily exposed `globalThis`.
 *
 * The hook is installed ONLY when the trace file is configured. Installing it
 * unconditionally would make `gfxTraced()` true in every run, and the renderer
 * guards its heavier diagnostics (per-vertex checksums over the staging ranges)
 * on exactly that — so an untraced run would pay for instrumentation it never
 * prints.
 */
let gfxHookChecked = false;
function installGfxHook(): void {
  if (gfxHookChecked) return;
  gfxHookChecked = true;
  if (!process.env.SPINE_TRACE_FILE) return;
  (globalThis as unknown as { __gfxTrace?: (l: string) => void }).__gfxTrace = (l: string) => {
    trace("gfx " + l);
  };
}

import { createRootNode, spine, type GfxNode } from "@rasenjs/gfx";
import {
  Skeleton,
  AnimationState,
  computeAttachmentWorldVertices,
  type SkeletonData,
  type SpineAtlas,
} from "@rasenjs/assets";
import {
  attach,
  makeRenderer,
  type GpuSetup,
  type PerrySurface,
} from "../host/gfx-host";
import type { LoadedSpine } from "../data/spine-assets";

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

  /** Non-zero once the GPU is up. */
  private viewPtr = 0;
  private perrySurface: PerrySurface | null = null;
  private renderer: ReturnType<typeof makeRenderer> | null = null;
  private root: GfxNode | null = null;
  private setup: GpuSetup | null = null;

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
    installGfxHook();
    if (this.error) return;

    if (this.viewPtr === 0) {
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
    this.viewPtr = handle;

    // The host owns the GPU bring-up (see host/gfx-host.ts); the stage only
    // decides WHEN it happens. Perry's promise channel drops object pointers,
    // so this resolves the device synchronously inside `attach` and the work
    // is driven by the tick loop from here on.
    attach(handle).then((setup: GpuSetup): void => {
      try {
        const widthPt = this.widthPt;
        const heightPt = this.heightPt;
        trace(
          "attach: view backing = " + setup.widthPx + "x" + setup.heightPx +
          "px, format = " + setup.format +
          "  constructed with " + widthPt + "x" + heightPt + "pt"
        );

        this.setup = setup;
        this.perrySurface = setup.surface;
        this.renderer = makeRenderer(setup, {
          logicalWidth: widthPt,
          logicalHeight: heightPt,
          camera: this.camera,
          clearColor: this.clearColor,
        });
        // Apply a background chosen while the window was still coming up.
        this.renderer.setClearColor(this.clearColor);
        this.root = createRootNode(this.renderer, setup.surface.context);
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
      // Getter, not a value. The component re-asserts the animation every
      // frame from this prop (`toValue` calls a function and returns a plain
      // value as-is), so passing `model.animation` would freeze it at whatever
      // the model loaded with: `stage.setAnimation` changed the state, and the
      // next frame's `props.animation !== currentAnimation` check set it right
      // back. The symptom was "clicking an animation does nothing".
      animation: (): string => model.animation,
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
