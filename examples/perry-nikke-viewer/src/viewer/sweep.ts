/**
 * Stability sweep: load many models back to back and report what happened.
 *
 * This exercises the paths most likely to leak or crash — the spine component
 * unmount/remount, the gfx texture and buffer caches keyed by source object, and
 * the swapchain's per-frame view release — and it does so at a rate no human
 * clicking reaches. A leak shows up as a rising RSS; a missing release shows up
 * as `surfaceGetCurrentTexture` stalling once the drawable pool runs out.
 *
 * Run it after a change to the stage, the host adapters, or the asset loader.
 * It is not part of the shipped app: `src/main.ts` does not import it.
 */
import { onFrame } from "perry/ui";
import * as fs from "fs";
import {
  TABS,
  buildRows,
  classify,
  defaultSelection,
  loadCatalogue,
  type L2dEntry,
} from "../data/catalogue";
import { loadSpine, type PoseKind } from "../data/spine-assets";
import { mountApp, stack, text } from "../perry-ui";
import { Stage } from "./stage";

const TRACE = process.env.SPINE_TRACE_FILE ? String(process.env.SPINE_TRACE_FILE) : "";
const lines: string[] = [];
function log(line: string): void {
  lines.push(line);
  console.log(line);
  if (TRACE) {
    try { fs.appendFileSync(TRACE, line + "\n"); } catch (_e) { /* never fatal */ }
  }
}

/** How many models to cycle through. Overridable for a longer soak. */
const SWEEP = process.env.NIKKE_SWEEP ? Number(process.env.NIKKE_SWEEP) : 12;
/** Frames to hold each model for. */
const HOLD_FRAMES = 45;

const stage = new Stage({ widthPt: 640, heightPt: 780, clearColor: "#0b1020" });

const statusText = [
  "stability sweep", "", "",
];

const root = stack({
  direction: "column",
  spacing: 6,
  padding: 10,
  backgroundColor: "#0b1020",
  children: [
    text({ content: "stability sweep", fontSize: 16, color: "#fff" }),
    text({
      content: function (): string { return statusText[2]; },
      fontSize: 11,
      color: "#8ee",
    }),
  ],
});

/** Model ids worth trying: one from each tab, so both pose shapes are covered. */
function pickSweepTargets(entries: L2dEntry[]): Array<{ id: string; pose: PoseKind }> {
  const out: Array<{ id: string; pose: PoseKind }> = [];

  // Characters, so the two-level grouping and the crouch poses are exercised.
  const chars = buildRows(entries, "characters", "");
  for (let i = 0; i < chars.length && out.length < SWEEP - 4; i++) {
    const row = chars[i];
    if (row.kind !== "group") continue;
    // Every third character also tries its cover pose, which loads from a
    // subdirectory and is a different skeleton from the full-body one.
    out.push({ id: row.id, pose: out.length % 3 === 0 ? "cover" : "fb" });
  }
  // One of each non-character tab, to cover the flat (ungrouped) code path.
  const others = ["scenes", "chibi", "story"] as const;
  for (let i = 0; i < others.length; i++) {
    const rows = buildRows(entries, others[i], "");
    // Scenes and story are scene rigs rather than characters, so give them a
    // moment; chibi rigs are small and fast.
    for (let j = 0; j < rows.length && j < 2; j++) {
      out.push({ id: rows[j].id, pose: "fb" });
    }
  }
  return out;
}

function rssKb(): number {
  try {
    const mem = (process as unknown as { memoryUsage?: () => { rss: number } })
      .memoryUsage;
    if (typeof mem !== "function") return 0;
    return Math.round(mem().rss / 1024);
  } catch (_e) {
    return 0;
  }
}

async function sweep(): Promise<void> {
  const catalogue = await loadCatalogue(function (m): void {
    statusText[0] = m;
    log("[sweep] " + m);
  });
  const targets = pickSweepTargets(catalogue.entries);
  log("[sweep] " + targets.length + " targets; rss start = " + rssKb() + " KB");

  const failures: string[] = [];
  let ok = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const label = t.id + " (" + t.pose + ")";
    statusText[2] = "[" + (i + 1) + "/" + targets.length + "] " + label;
    log("[sweep] " + (i + 1) + "/" + targets.length + " " + label
      + " rss=" + rssKb() + " KB");
    try {
      const loaded = await loadSpine(t.id, t.pose, function (_m): void {
        /* quiet during a sweep */
      });
      const names = Object.keys(loaded.data.animations);
      stage.setModel({ spine: loaded, animation: names.length ? names[0] : "" });
      ok = ok + 1;
      // Let it draw for a while so the frame path runs with this model, and so a
      // swapchain problem would have time to appear.
      await holdFrames(HOLD_FRAMES);
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = label + ": " + (err && err.message ? err.message : String(e));
      failures.push(msg);
      log("[sweep] FAIL " + msg);
    }
  }

  log("[sweep] done: " + ok + " ok, " + failures.length + " failed; rss end = "
    + rssKb() + " KB");
  for (let i = 0; i < failures.length; i++) log("[sweep]   " + failures[i]);
  statusText[2] = "done: " + ok + " ok / " + failures.length + " failed";
}

/**
 * Frames presented so far.
 *
 * The sweep waits on this instead of registering its own frame callbacks: one
 * loop owns the frame chain, so there is no way for a hold to leave the chain
 * half-armed if it throws.
 */
let frames = 0;

/** Resolve once `n` further frames have been presented. */
function holdFrames(n: number): Promise<void> {
  const target = frames + n;
  return new Promise<void>(function (resolve): void {
    waiters.push({ at: target, resolve: resolve });
  });
}

const waiters: Array<{ at: number; resolve: () => void }> = [];

let lastMs = Date.now();
let frameFailed = false;

function tick(): void {
  const now = Date.now();
  let dt = (now - lastMs) / 1000;
  lastMs = now;
  if (dt > 0.05) dt = 0.05;

  if (!frameFailed) {
    try {
      stage.tick(dt);
      frames = frames + 1;
    } catch (e: unknown) {
      // Latch: a frame path that throws every tick would flood the log and spin
      // without ever drawing.
      frameFailed = true;
      log("[sweep] FRAME ERROR: " + String(e));
    }
  }

  // Release every waiter whose frame has arrived.
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].at <= frames) {
      const w = waiters[i];
      waiters.splice(i, 1);
      w.resolve();
    }
  }

  onFrame(tick);
}

onFrame(tick);

// START the sweep BEFORE mounting.
//
// `mountApp` calls `App()`, which blocks on the native run loop for the life of
// the program — so anything placed after it never runs. The async work is
// started here and continues on the microtask queue the frame pump drains.
void sweep().then(
  function (): void {
    log("[sweep] finished cleanly");
  },
  function (e: unknown): void {
    const err = e as { message?: string; stack?: string };
    log("[sweep] SWEEP FAILED: " + (err && err.message ? err.message : String(e)));
    if (err && err.stack) log("  " + err.stack);
  },
);

mountApp({ title: "stability sweep", width: 700, height: 900 }, root);
