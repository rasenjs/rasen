/**
 * NIKKE c010 on Perry — rendered by @rasenjs/gfx's own spine component.
 *
 * The point of this example: **no rendering code of its own**. Spine parsing,
 * pose solving and geometry extraction come from `@rasenjs/assets`; batching,
 * pipelines, texture upload and the single-draw-call spine mesh come from
 * `@rasenjs/gfx` — the same component the browser builds use. This file loads
 * assets, frames the rig, opens a window and drives the clock.
 *
 * The only Perry-specific code is `gfx-host.ts` (presentation target + raw-pixel
 * upload) and `platform.ts` (fs + PNG decode); both plug into seams gfx already
 * exposes.
 *
 * The numbers printed at startup double as a regression gate — they match the
 * Node run exactly, so any divergence in the shared library shows up here.
 */
import { App, VStack, BloomView, bloomViewGetNativeHandle, onFrame } from "perry/ui";
import {
  requestAdapter,
  adapterRequestDeviceSync,
  deviceGetQueueSync,
  surfaceFromNativeView,
  surfaceGetPreferredFormat,
  type GPUAdapter,
  type GPUDevice,
  type GPUSurface,
} from "@perryts/webgpu";
import * as fs from "fs";
import { setReactiveRuntime } from "@rasenjs/core";
import { createReactiveRuntime } from "@rasenjs/reactive-alien-signals";
import { createRootNode, spine, type GfxNode } from "@rasenjs/gfx";
import {
  parseSpineBinary,
  parseSpineAtlas,
  computeAttachmentWorldVertices,
  Skeleton,
  AnimationState,
  getAnimationDuration,
  type SkeletonData,
  type SpineAtlas,
} from "@rasenjs/assets";
import { loadPng, readBytes, readText, installImageAdapter } from "./platform";
import { createPerryRenderer, createPerrySurface, swapchainFormat } from "./gfx-host";
import type { PerrySurface } from "./gfx-host";

// Install the reactive runtime BEFORE anything from gfx runs: `com()` wraps
// every component in an effect scope obtained from `@rasenjs/core`, and the
// adapters are what supply it. The benchmarks use this same adapter
// (`benchmark/rasen-alien`), so it is the verified choice for a native host;
// the docs' default is `@rasenjs/reactive-signals`.
setReactiveRuntime(createReactiveRuntime());

/** Asset root. Overridable so the same binary runs from any cwd. */
const ASSET_DIR = process.env.SPINE_ASSET_DIR
  ? String(process.env.SPINE_ASSET_DIR)
  : "/Users/wuhaofeng/Projects/@rasen/examples/perry-spine/assets/c010";

const CLIP = process.env.SPINE_ANIM ? String(process.env.SPINE_ANIM) : "action";

/**
 * Retina backing scale. The swapchain is sized in PHYSICAL pixels (that is what
 * feeds wgpu's `set_drawable_size`) while `BloomView` and the camera use
 * points, so the boundary multiplies here. Perry exposes no
 * `devicePixelRatio`, so knowing it is the host's job.
 */
const SCALE = 2;

// ── load ──────────────────────────────────────────────────────────────
const t0 = Date.now();
installImageAdapter((url: string) => ASSET_DIR + "/" + url);
const skelBytes = readBytes(ASSET_DIR + "/c010_03_00.skel");
const atlasText = readText(ASSET_DIR + "/c010_03_00.atlas");
console.log("[load] skeleton bytes =", skelBytes.byteLength,
  " atlas chars =", atlasText.length, " in", Date.now() - t0, "ms");

// ── parse (shared library) ────────────────────────────────────────────
const t1 = Date.now();
const data: SkeletonData = parseSpineBinary(skelBytes);
const atlas: SpineAtlas = parseSpineAtlas(atlasText);
console.log("[parse] bones", data.bones.length,
  " slots", data.slots.length,
  " skins", data.skins.length,
  " in", Date.now() - t1, "ms");

// ── atlas page (host decoder) ─────────────────────────────────────────
const t2 = Date.now();
const page = atlas.pages[0];
const image = loadPng(ASSET_DIR + "/" + page.name);
console.log("[image] " + page.name + " = " + image.width + "x" + image.height,
  " rgba bytes", image.rgba.byteLength, " in", Date.now() - t2, "ms");

// ── pose + framing ────────────────────────────────────────────────────
const sk = new Skeleton(data, "default");
sk.setToSetupPose();
sk.updateWorldTransform();
sk.updateCache();

const state = new AnimationState(sk);
state.setAnimation(CLIP, true);
const duration = getAnimationDuration(sk.data.animations[CLIP]);
console.log("[anim] " + CLIP + " duration =", duration.toFixed(3) + "s");

/**
 * Bounds of the rig at the SETUP pose, in skeleton units.
 *
 * Measured from the setup pose rather than the live one on purpose: a per-frame
 * fit would make the character breathe in and out as the animation changes its
 * silhouette.
 */
const fit = (() => {
  const scratch = new Float32Array(1 << 16);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, count = 0;
  for (const slot of sk.drawOrder) {
    const name = slot.attachment;
    if (!name) continue;
    const att = sk.findAttachment(slot.data.name, name);
    if (!att) continue;
    const type = att.type ? att.type : "region";
    if (type === "clipping" || type === "boundingbox" || type === "path" ||
      type === "point") {
      continue;
    }
    const n = computeAttachmentWorldVertices(att, slot, sk, atlas, name,
      scratch, 2, 0);
    if (n <= 0) continue;
    count = count + n;
    for (let v = 0; v < n; v++) {
      const x = scratch[v * 2];
      const y = scratch[v * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  console.log("[fit] setup-pose vertices =", count,
    " bounds x[" + minX.toFixed(1) + "," + maxX.toFixed(1) + "] y[" +
    minY.toFixed(1) + "," + maxY.toFixed(1) + "]");
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
})();

// ── window ────────────────────────────────────────────────────────────
const PAD = 24;
const fitW = fit.maxX - fit.minX;
const fitH = fit.maxY - fit.minY;
const aspect = fitW / fitH;
const HEIGHT_PT = 680;
const WIDTH_PT = Math.round(HEIGHT_PT * aspect) + PAD;
console.log("[window] " + WIDTH_PT + "x" + HEIGHT_PT + " pt (aspect " +
  aspect.toFixed(3) + ")");

/**
 * Orthographic camera that frames the rig.
 *
 * gfx's 2D ortho spans `size / zoom` world units, so the zoom that shows
 * `worldHeight` is `logicalHeight / worldHeight`. The window was sized to the
 * rig's aspect, so one zoom fits both axes.
 */
const MARGIN = 1.02;
const camera = {
  x: (fit.minX + fit.maxX) * 0.5,
  y: (fit.minY + fit.maxY) * 0.5,
  zoom: HEIGHT_PT / (fitH * MARGIN),
};

const view = BloomView(WIDTH_PT, HEIGHT_PT);

// ── wiring ────────────────────────────────────────────────────────────
const NO_SURFACE = 0 as unknown as GPUSurface;
let surface: GPUSurface = NO_SURFACE;
let perrySurface: PerrySurface | null = null;
let renderer: ReturnType<typeof createPerryRenderer> | null = null;
let root: GfxNode | null = null;

/**
 * Unbuffered progress trace.
 *
 * stdout redirected to a file is block-buffered, so a process that is killed
 * (rather than exiting cleanly) loses its final lines — which makes a hang
 * indistinguishable from a lost log. `fs.appendFileSync` is unbuffered, so set
 * `SPINE_TRACE_FILE` when investigating a stall.
 */
const TRACE = process.env.SPINE_TRACE_FILE
  ? String(process.env.SPINE_TRACE_FILE)
  : "";
function trace(line: string): void {
  if (!TRACE) return;
  try {
    fs.appendFileSync(TRACE, line + "\n");
  } catch (_e) {
    // Tracing must never take the app down.
  }
}

let ticks = 0;
let accMs = 0;
let frameCount = 0;
let lastReport = 0;
let lastReportMs = Date.now();
let poseMsAcc = 0;
let drawMsAcc = 0;
let measured = 0;


/**
 * Frame-loop safety.
 *
 * A frame callback that re-arms itself unconditionally must never run in a
 * state it cannot leave. If setup fails and the loop keeps calling `onFrame`
 * from an early-return branch, it becomes an unpaced spin: the pump fires
 * ~120x/s and drains frame callbacks twice per tick, and every registration
 * allocates (`js_on_frame_callback` builds a handle scope + async-context
 * snapshot), so the process grows without bound until the OS kills it.
 *
 * `failed` therefore latches: once setup has thrown, the loop stops
 * re-arming instead of spinning, and the error stays visible in the log.
 * `WAIT_LIMIT` bounds the "waiting for the view to mount" state for the same
 * reason.
 */
const WAIT_LIMIT = 600;

/** Set once setup has failed; the loop then stops re-arming. */
let failed = false;
let waited = 0;

let tickErrors = 0;

function tick(_timestampMs: number, deltaMs: number): void {
  try {
    tickBody(_timestampMs, deltaMs);
  } catch (e) {
    // A throw before onFrame(tick) would end the pump with no output at all,
    // which reads as a hang. Surface it, and keep the loop alive a few times
    // so the failure is visible rather than silent.
    tickErrors = tickErrors + 1;
    const err = e as { message?: string; stack?: string };
    trace("TICK ERROR #" + tickErrors + ": " + String(e));
    // The stack is the only thing that says WHICH call saw the bad value; the
    // message alone ("Expected safe integer for native i64 parameter") is
    // raised by the marshaller, not by the caller.
    if (err && err.stack) trace("  stack: " + err.stack);
    console.log("[tick] error", tickErrors, String(e));
    if (err && err.stack) console.log("  stack:", err.stack);
    if (tickErrors <= 3) onFrame(tick);
  }
}

function tickBody(_timestampMs: number, deltaMs: number): void {
  ticks = ticks + 1;
  // Heartbeat keeps the pump observable even before the first frame. The atlas
  // integrity reading lives on the interval probe below instead, because that
  // one keeps firing after the frame pump has stopped.
  if (ticks <= 40) trace("tick " + ticks + " dt=" + deltaMs + " acc=" + accMs);

  // First tick with a live handle: `App()` has mounted the BloomView and it is
  // on screen, so the surface can bind to a drawable-backed NSView.
  if (surface === NO_SURFACE) {
    const handle = bloomViewGetNativeHandle(view);
    if (handle === 0) {
      waited = waited + 1;
      // Bounded: an unbounded wait here would spin for the life of the process
      // if the view never reports a handle.
      if (waited > WAIT_LIMIT) {
        failed = true;
        console.log("[gpu] FATAL: no native handle after", waited, "ticks");
        return;
      }
      onFrame(tick);
      return;
    }
    surface = surfaceFromNativeView(handle);
    console.log("[gpu] attach on tick", ticks, " -> surface", surface);
    requestAdapter(surface).then((adapter: GPUAdapter): void => {
      try {
      const device: GPUDevice = adapterRequestDeviceSync(adapter);
      const queue = deviceGetQueueSync(device);
      const preferred = String(surfaceGetPreferredFormat(surface, adapter));
      console.log("[gpu] device", device, "queue", queue, "preferred", preferred);

      trace("createPerryRenderer start");
      const opts = {
        surface: surface,
        deviceHandle: device,
        queueHandle: queue,
        widthPx: WIDTH_PT * SCALE,
        heightPx: HEIGHT_PT * SCALE,
        logicalWidth: WIDTH_PT,
        logicalHeight: HEIGHT_PT,
        preferredFormat: preferred,
        camera: camera,
      };
      // The host adapts the surface FIRST (it owns the swapchain lifecycle and
      // the per-frame acquire cache), then hands gfx the context half.
      perrySurface = createPerrySurface(opts, swapchainFormat(preferred));
      renderer = createPerryRenderer(opts, perrySurface);

      // Mount the SHARED spine component. Every dynamic prop is passed as a
      // getter so the component re-reads it at draw time.
      root = createRootNode(renderer, surface);
      spine({
        skeleton: sk,
        atlas: atlas,
        // Raw RGBA8 — a DOM-less host has no <img>; the backend uploads it with
        // writeTexture. Structurally an ImageData.
        atlasImg: { width: image.width, height: image.height, bytes: image.rgba },
        state: state,
        animation: CLIP,
        loop: true,
        frame: () => frameCount,
        width: WIDTH_PT,
        height: HEIGHT_PT,
        x: 0,
        y: 0,
        // Match the flat reference renderers: no ACES tonemap on spine art.
        skipTonemap: true,
        // `Mountable` is (host, hooks); hooks carry host capabilities and are
        // passed explicitly (there is no ambient stack). The element component
        // needs none, and a native host has no dom bridge to supply.
      })(root, undefined);
      console.log("[gfx] spine component mounted");
      } catch (e: unknown) {
        // Latch: without this the loop below would keep re-arming with no
        // renderer and spin until the process is killed (see the note above).
        failed = true;
        // The trace file is written unbuffered, so it survives a SIGKILL —
        // stdout does not, and this failure is exactly the kind that ends with
        // the process being killed while it looks idle.
        const err = e as { message?: string; stack?: string };
        trace("SETUP FAILED: " + String(e));
        if (err && err.message) trace("  message: " + err.message);
        if (err && err.stack) trace("  stack: " + err.stack);
        console.log("[gfx] SETUP FAILED:", e);
        if (err && err.message) console.log("  message:", err.message);
        if (err && err.stack) console.log("  stack:", err.stack);
        return;
      }
      onFrame(tick);
    });
    onFrame(tick);
    return;
  }

  if (!renderer) {
    // Setup failed and the error was already reported — stop rather than spin.
    if (failed) return;
    onFrame(tick);
    return;
  }

  // Pace to the display. The pump fires far faster than the refresh rate, so
  // present once ~16.6 ms of wall clock has accumulated. The remainder is
  // CARRIED, not reset: discarding it quantises the period up to a whole number
  // of pump ticks, which costs a third of the framerate.
  accMs = accMs + deltaMs;
  if (accMs < 16.6) {
    onFrame(tick);
    return;
  }
  const dt = accMs / 1000;
  accMs = accMs - 16.6;
  if (accMs > 50) accMs = 0;

  // Pose (the component only flattens the already-applied pose), then draw.
  const tPose = Date.now();
  state.update(dt);
  state.apply();
  // NOTE: no `sk.updateCache()` here. Its contract is setup-time — "call it if
  // the skin is modified or removed, or if a bone or constraint is added or
  // removed" — and `Skeleton`'s constructor already builds the cache. Calling
  // it per frame allocated a fresh tagged array for all 243 bones plus an
  // `Array#sort` of the constraints 60 times a second, which is both GC churn
  // and (on Perry) a crash: that sort intermittently died inside the runtime's
  // `publish_sorted_values`. The draw order does not depend on it either — the
  // `draworder` timeline writes `skeleton.drawOrder` itself.
  const tDraw = Date.now();
  frameCount = frameCount + 1;
  // `requestRedraw()` marks the frame dirty and draws synchronously; calling
  // `draw()` again would be a no-op (it early-returns unless dirty).
  renderer.requestRedraw();
  // gfx renders into the surface texture but deliberately does not present
  // (see GpuCanvasContext: presentation belongs to the host, so it can also
  // choose to skip it). Hand the frame over after the submit.
  if (perrySurface) perrySurface.present();
  const tEnd = Date.now();
  poseMsAcc = poseMsAcc + (tDraw - tPose);
  drawMsAcc = drawMsAcc + (tEnd - tDraw);
  measured = measured + 1;

  if (frameCount - lastReport >= 120) {
    const n = measured > 0 ? measured : 1;
    const now = Date.now();
    const elapsed = now - lastReportMs;
    lastReportMs = now;
    lastReport = frameCount;
    console.log("[frame] " + frameCount +
      " " + (elapsed > 0 ? (n * 1000 / elapsed).toFixed(1) : "?") + "fps" +
      " pose=" + (poseMsAcc / n).toFixed(1) + "ms" +
      " draw=" + (drawMsAcc / n).toFixed(1) + "ms");
    poseMsAcc = 0;
    drawMsAcc = 0;
    measured = 0;
  }

  onFrame(tick);
}

// Register BEFORE App(): App() blocks the main thread, so the pump drives the
// loop.
onFrame(tick);
console.log("[app] entering App()");
App({
  title: "NIKKE c010 - Perry - gfx WebGPU",
  width: WIDTH_PT,
  height: HEIGHT_PT,
  body: VStack([view]),
});
console.log("[app] App() returned (unexpected)");
