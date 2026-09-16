/**
 * Load a Spine model from Nikke-db over HTTP.
 *
 * A native host cannot hand the renderer an `<img>`, so every atlas page is
 * fetched as bytes and decoded to RGBA here, then passed to gfx as
 * `{ width, height, bytes }` — the `RawPixelSource` shape its WebGPU backend
 * accepts. That is the only structural difference from the browser viewer; the
 * parsing and pose solving come from `@rasenjs/assets` unchanged.
 *
 * Nikke-db's naming is inconsistent (some characters prefix their skeleton with
 * `EventScene_`, suffixes vary from `_00` to `_03`), so a model is located by
 * trying a candidate list, exactly as the browser viewer does. The candidates
 * are ordered by how often they hit.
 */
import {
  parseSpineAtlas,
  parseSpineBinary,
  type SkeletonData,
  type SpineAtlas,
} from "@rasenjs/assets";
import { decodePng } from "../host/png";
import { RAW_BASE } from "./catalogue";

export type PoseKind = "fb" | "cover" | "aim";

/** One atlas page as raw pixels. Structurally gfx's `RawPixelSource`. */
export interface SpinePage {
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface LoadedSpine {
  data: SkeletonData;
  atlas: SpineAtlas;
  /** Page name → pixels. Multi-page atlases reference several images. */
  pages: Map<string, SpinePage>;
  /** The first page, which is what `atlasImg` wants. */
  primary: SpinePage;
  /** Directory the assets came from, for diagnostics. */
  dir: string;
}

/** A `.skel` + `.atlas` pair to try. */
interface Candidate {
  base: string;
  dir: string;
}

/**
 * Where a model's skeleton might live.
 *
 * `fb` (full-body idle) sits at the model root; the two crouch poses live in
 * `cover/` and `aim/` subdirectories.
 */
function candidates(id: string, pose: PoseKind): Candidate[] {
  const out: Candidate[] = [];
  if (pose === "fb") {
    const dir = RAW_BASE + "/" + id;
    const prefixes = ["", "EventScene_"];
    const suffixes = ["_00", "_01", "", "_02", "_03"];
    for (let p = 0; p < prefixes.length; p++) {
      for (let s = 0; s < suffixes.length; s++) {
        out.push({ base: dir + "/" + prefixes[p] + id + suffixes[s], dir: dir });
      }
    }
    return out;
  }
  const dir = RAW_BASE + "/" + id + "/" + pose;
  const suffixes = ["_00", "", "_01", "_02"];
  for (let s = 0; s < suffixes.length; s++) {
    out.push({ base: dir + "/" + id + "_" + pose + suffixes[s], dir: dir });
  }
  return out;
}

/**
 * `fetch` with a deadline.
 *
 * `AbortSignal.timeout` is unavailable here, and an unanswered request would
 * otherwise stall the load with no recovery. The losing promise is abandoned to
 * settle on its own.
 */
async function get(url: string, ms: number, method?: string): Promise<Response> {
  const timer = new Promise<never>(function (_resolve, reject): void {
    setTimeout(function (): void {
      reject(new Error("timeout after " + ms + "ms: " + url));
    }, ms);
  });
  const req = method ? fetch(url, { method: method }) : fetch(url);
  return await Promise.race([req, timer]) as Response;
}

/** Does a skeleton exist at this path? Used for the optional poses. */
export async function poseExists(id: string, pose: PoseKind): Promise<boolean> {
  const list = candidates(id, pose);
  for (let i = 0; i < list.length; i++) {
    try {
      const resp = await get(list[i].base + ".skel", 6000, "HEAD");
      if (resp.ok) return true;
    } catch (_e) {
      // Try the next candidate.
    }
  }
  return false;
}

/**
 * Page names listed in an atlas file: non-empty lines ending in an image
 * extension. Spine writes the page name on its own line, so this is a line scan
 * rather than a parse.
 */
function pageNamesOf(atlasText: string): string[] {
  const out: string[] = [];
  const lines = atlasText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const lower = line.toLowerCase();
    if (lower.indexOf(".png") >= 0 || lower.indexOf(".webp") >= 0
      || lower.indexOf(".jpg") >= 0 || lower.indexOf(".jpeg") >= 0) {
      out.push(line);
    }
  }
  return out;
}

/**
 * Fetch and decode one atlas page.
 *
 * `arrayBuffer()` gives what `decodePng` wants directly — no file system
 * involved, which is the point of loading remotely.
 */
async function fetchPage(url: string): Promise<SpinePage> {
  const resp = await get(url, 30000);
  if (!resp.ok) {
    throw new Error("atlas page " + resp.status + ": " + url);
  }
  const buf = await resp.arrayBuffer();
  const decoded = decodePng(new Uint8Array(buf));
  return { width: decoded.width, height: decoded.height, bytes: decoded.rgba };
}

/**
 * Load a model, or throw with a message that says which candidates were tried.
 *
 * `report` receives human-readable progress; the caller routes it to the status
 * line.
 */
export async function loadSpine(
  id: string,
  pose: PoseKind,
  report: (message: string) => void,
): Promise<LoadedSpine> {
  const list = candidates(id, pose);

  let skelBytes: Uint8Array | null = null;
  let atlasText: string | null = null;
  let dir = "";

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    report("Fetching " + id + " (" + pose + ")…");
    let skel: Response;
    let atlas: Response;
    try {
      const both = await Promise.all([
        get(c.base + ".skel", 30000),
        get(c.base + ".atlas", 30000),
      ]);
      skel = both[0];
      atlas = both[1];
    } catch (_e) {
      // A network error on one candidate is not fatal — try the next.
      continue;
    }
    if (skel.ok && atlas.ok) {
      skelBytes = new Uint8Array(await skel.arrayBuffer());
      atlasText = await atlas.text();
      dir = c.dir;
      break;
    }
  }

  if (!skelBytes || !atlasText) {
    throw new Error("no .skel/.atlas found for " + id + " (" + pose + "); tried "
      + list.length + " candidate paths");
  }

  report("Parsing " + id + "…");
  const data: SkeletonData = parseSpineBinary(skelBytes);
  const atlas: SpineAtlas = parseSpineAtlas(atlasText);

  // Every page, not just the first: a multi-page atlas references several PNGs,
  // and loading only page 0 leaves effects on later pages sampling the wrong
  // texture.
  const names = pageNamesOf(atlasText);
  const wanted = names.length ? names : [id + ".png"];
  const pages = new Map<string, SpinePage>();
  let primary: SpinePage | null = null;
  for (let i = 0; i < wanted.length; i++) {
    const name = wanted[i];
    report("Decoding " + name + "…");
    const page = await fetchPage(dir + "/" + name);
    pages.set(name, page);
    if (!primary) primary = page;
  }
  if (!primary) throw new Error("atlas listed no pages for " + id);

  report("Loaded " + id + " — " + data.bones.length + " bones, "
    + atlas.regions.length + " regions, " + pages.size + " page(s)");
  return { data: data, atlas: atlas, pages: pages, primary: primary, dir: dir };
}
