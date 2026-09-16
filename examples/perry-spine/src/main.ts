/**
 * NIKKE c010 on Perry — Spine skeleton rendered through WebGPU, natively.
 *
 * Everything Spine-related comes from `@rasenjs/assets` (Perry compiles the
 * package's `src/` through `perry.compilePackages`): the 4.1 binary skeleton
 * parser, the atlas parser, the pose solver with IK/transform constraints, the
 * deform timelines, and the vertex/UV extractors. The atlas PNG is decoded by
 * the host layer in `platform.ts`. `renderer.ts` turns the extracted geometry
 * into a draw call.
 *
 * This file is the application: load the assets, frame the rig, open a window,
 * and drive the `action` clip from the frame pump.
 *
 * The headless numbers printed at startup double as a regression gate — they
 * are the same values the Node run produces, so any divergence in the shared
 * library shows up immediately.
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
  type GPUQueue,
  type GPUSurface,
} from "@perryts/webgpu";
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
import { createSpineRenderer, type FitBox, type SpineRenderer } from "./renderer";

/** Asset root. Overridable so the same binary runs from any cwd. */
const ASSET_DIR = process.env.SPINE_ASSET_DIR
  ? String(process.env.SPINE_ASSET_DIR)
  : "/Users/wuhaofeng/Projects/@rasen/examples/perry-spine/assets/c010";

const CLIP = process.env.SPINE_ANIM ? String(process.env.SPINE_ANIM) : "action";

/**
 * Retina backing scale. `@perryts/webgpu`'s `surfaceConfigure` takes PHYSICAL
 * pixels (it feeds wgpu's `set_drawable_size` directly), while `BloomView` is
 * sized in points — so everything crossing that boundary gets multiplied here.
 * Perry has no `devicePixelRatio`, so knowing it is the host's job.
 */
const SCALE = 2;

// ── load ──────────────────────────────────────────────────────────────
const t0 = Date.now();
installImageAdapter((url: string) => ASSET_DIR + "/" + url);
const skelBytes = readBytes(ASSET_DIR + "/c010_03_00.skel");
const atlasText = readText(ASSET_DIR + "/c010_03_00.atlas");
console.log("[load] skeleton bytes =", skelBytes.byteLength,
  " atlas chars =", atlasText.length, " in", Date.now() - t0, "ms");

// ── parse ─────────────────────────────────────────────────────────────
const t1 = Date.now();
const data: SkeletonData = parseSpineBinary(skelBytes);
const atlas: SpineAtlas = parseSpineAtlas(atlasText);
console.log("[parse] bones", data.bones.length,
  " slots", data.slots.length,
  " skins", data.skins.length,
  " in", Date.now() - t1, "ms");

// ── atlas page ────────────────────────────────────────────────────────
const t2 = Date.now();
const page = atlas.pages[0];
const image = loadPng(ASSET_DIR + "/" + page.name);
console.log("[image] " + page.name + " = " + image.width + "x" + image.height,
  " rgba bytes", image.rgba.byteLength, " in", Date.now() - t2, "ms");

// ── pose + geometry (shared runtime) ──────────────────────────────────
const sk = new Skeleton(data, "default");
sk.setToSetupPose();
sk.updateWorldTransform();
sk.updateCache();

const state = new AnimationState(sk);
state.setAnimation(CLIP, true);
const duration = getAnimationDuration(sk.data.animations[CLIP]);
console.log("[anim] " + CLIP + " duration =", duration.toFixed(3) + "s");

/**
 * Measure the rig's extent at the SETUP pose, once.
 *
 * Framing off the setup pose rather than the live pose keeps the camera fixed:
 * a per-frame fit would make the whole character breathe in and out as the
 * animation changes its silhouette.
 */
function measureFit(): FitBox {
  const scratch = new Float32Array(1 << 16);
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let count = 0;
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
    const n = computeAttachmentWorldVertices(
      att, slot, sk, atlas, name, scratch, 2, 0,
    );
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
}

const fit = measureFit();

// ── window ────────────────────────────────────────────────────────────
// Size the window to the rig's aspect so the model fills it.
const PAD = 24;
const fitW = fit.maxX - fit.minX;
const fitH = fit.maxY - fit.minY;
const aspect = fitW / fitH;
const HEIGHT_PT = 680;
const WIDTH_PT = Math.round(HEIGHT_PT * aspect) + PAD;
console.log("[window] " + WIDTH_PT + "x" + HEIGHT_PT + " pt (aspect " +
  aspect.toFixed(3) + ")");

const view = BloomView(WIDTH_PT, HEIGHT_PT);

// ── renderer wiring (deferred until the view is on screen) ─────────────
// Opaque numeric handles. The WebGPU declarations brand them, so the "not yet
// created" sentinel is a cast rather than a plain 0.
const NO_SURFACE = 0 as unknown as GPUSurface;
let surface: GPUSurface = NO_SURFACE;
let device: GPUDevice = 0 as unknown as GPUDevice;
let queue: GPUQueue = 0 as unknown as GPUQueue;
let renderer: SpineRenderer | null = null;

let ticks = 0;
let accMs = 0;
let lastReport = 0;
let lastReportMs = Date.now();
/** Rolling cost of the two halves of a frame, for the periodic report. */
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

function tick(_timestampMs: number, deltaMs: number): void {
  ticks = ticks + 1;

  // First tick with a live handle: `App()` has mounted the BloomView and it is
  // on screen, so the surface can bind to a real drawable-backed NSView.
  // Configuring before that yields a 0x0 layer.
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
      device = adapterRequestDeviceSync(adapter);
      queue = deviceGetQueueSync(device);
      const format = surfaceGetPreferredFormat(surface, adapter);
      console.log("[gpu] device", device, "queue", queue, "format", format);
      renderer = createSpineRenderer({
        surface: surface,
        device: device,
        queue: queue,
        format: format,
        widthPx: WIDTH_PT * SCALE,
        heightPx: HEIGHT_PT * SCALE,
        skeleton: sk,
        atlas: atlas,
        image: image,
        fit: fit,
      });
      console.log("[gpu] configured " + (WIDTH_PT * SCALE) + "x" +
        (HEIGHT_PT * SCALE) + " px");
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
  // present only once ~16.6 ms of wall clock has accumulated.
  //
  // The remainder is CARRIED, not discarded: resetting to zero each frame
  // quantises the period up to a whole number of pump ticks, which silently
  // costs a third of the framerate. The clamp stops a long stall (window drag,
  // debugger) from being repaid as a burst of catch-up frames.
  accMs = accMs + deltaMs;
  if (accMs < 16.6) {
    onFrame(tick);
    return;
  }
  const dt = accMs / 1000;
  accMs = accMs - 16.6;
  if (accMs > 50) accMs = 0;

  // Pose, then draw.
  const tPose = Date.now();
  state.update(dt);
  state.apply();
  // Setup-time only — see the note in main-gfx.ts: `Skeleton`'s constructor
  // already built the cache, and calling this per frame churned a tagged array
  // per bone plus a constraint sort every frame.
  const tDraw = Date.now();
  renderer.frame();
  const tEnd = Date.now();
  poseMsAcc = poseMsAcc + (tDraw - tPose);
  drawMsAcc = drawMsAcc + (tEnd - tDraw);
  measured = measured + 1;

  const stats = renderer.stats;
  if (stats.frames - lastReport >= 120) {
    const n = measured > 0 ? measured : 1;
    const now = Date.now();
    const elapsed = now - lastReportMs;
    lastReportMs = now;
    lastReport = stats.frames;
    console.log("[frame] " + stats.frames +
      " " + (elapsed > 0 ? (n * 1000 / elapsed).toFixed(1) : "?") + "fps" +
      " v=" + stats.vertices +
      " tri=" + stats.triangles +
      " slots=" + stats.attachments +
      " skipped=" + stats.skipped +
      " pose=" + (poseMsAcc / n).toFixed(1) + "ms" +
      " draw=" + (drawMsAcc / n).toFixed(1) + "ms");
    poseMsAcc = 0;
    drawMsAcc = 0;
    measured = 0;
  }

  onFrame(tick);
}

// Register BEFORE App(): App() blocks the main thread, so the pump is what
// drives the loop.
onFrame(tick);
console.log("[app] entering App()");
App({
  title: "NIKKE c010 - Perry - WebGPU",
  width: WIDTH_PT,
  height: HEIGHT_PT,
  body: VStack([view]),
});
console.log("[app] App() returned (unexpected)");
