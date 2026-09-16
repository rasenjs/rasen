/**
 * Nikke-db catalogue: what models exist, and how to classify them.
 *
 * The browser viewer reads the same sources; the differences here are all
 * consequences of being a native host:
 *
 *   * No `localStorage`, so the last good listing is cached to a file. The cache
 *     is what keeps the viewer usable when api.github.com is rate-limited, which
 *     happens often enough to matter.
 *   * No `AbortSignal.timeout`, so a request that hangs would hang the boot.
 *     Every fetch is wrapped in a race against a timer instead.
 *   * No CORS constraint, so the same-origin `/gh/l2d` proxy the web build needs
 *     is unnecessary.
 */
import * as fs from "fs";

// ── sources ───────────────────────────────────────────────────────────────

/** Directory listing of every level-2D model. */
const GITHUB_API =
  "https://api.github.com/repos/Nikke-db/Nikke-db.github.io/contents/l2d?ref=main";
/** Display names, keyed by model id. CORS-friendly on the web, plain JSON here. */
const L2D_NAMES_URL = "https://nikke-db.github.io/js/json/l2d.json";
/** Raw asset root for `<id>/<id>.skel` and friends. */
export const RAW_BASE =
  "https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d";
/** Sprite thumbnails, used for list rows. */
export const SPRITE_BASE = "https://nikke-db.github.io/images/sprite";

/** Cache location. Overridable so a run can be forced fresh. */
const CACHE_PATH = process.env.NIKKE_CACHE
  ? String(process.env.NIKKE_CACHE)
  : "/tmp/.perry-nikke-viewer-cache.json";

/** Shown when even the cache is empty. Enough to prove the pipeline works. */
const FALLBACK_IDS = ["777", "c016", "c810", "c310"];

// ── types ─────────────────────────────────────────────────────────────────

export type Tab = "characters" | "scenes" | "chibi" | "story";

export interface L2dEntry {
  id: string;
  name: string;
}

/** A sidebar row: a character with its costume variants, or a plain entry. */
export type Row =
  | { kind: "group"; id: string; name: string; variants: L2dEntry[] }
  | { kind: "entry"; id: string; name: string };

export const TABS: Array<{ tab: Tab; label: string }> = [
  { tab: "characters", label: "Characters" },
  { tab: "scenes", label: "Scenes" },
  { tab: "chibi", label: "Chibi" },
  { tab: "story", label: "Story" },
];

export interface Catalogue {
  entries: L2dEntry[];
  /** True when the listing came from the on-disk cache rather than the network. */
  offline: boolean;
}

// ── classification ────────────────────────────────────────────────────────

/**
 * Which sidebar tab a model id belongs to.
 *
 * The reference site classifies by id shape, not by metadata, so this mirrors it
 * exactly — the patterns are the whole contract.
 */
export function classify(id: string): Tab {
  if (/^c\d+(_\d+)?$/.test(id)) return "characters";
  if (/^smol_/.test(id)) return "chibi";
  if (/^story/.test(id)) return "story";
  return "scenes";
}

/** Thumbnail URL for a model id. */
export function spriteUrl(id: string): string {
  return SPRITE_BASE + "/si_" + id + "_00_s.png";
}

/** Title-cased id, for ids that have no display name in l2d.json. */
export function fallbackName(id: string): string {
  if (/^c\d+(_\d+)?$/.test(id)) return id;
  return id
    .split("_")
    .map(function (w: string): string {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    })
    .join(" ");
}

/**
 * Strip the base name from a variant's display name.
 *
 * "2B" + "2B Metamorphic Damage" → "Metamorphic Damage". Falls back to the id
 * when nothing is left, so a row is never blank.
 */
export function variantLabel(baseName: string, v: L2dEntry): string {
  let label = v.name;
  if (label.indexOf(baseName) === 0) label = label.slice(baseName.length);
  while (label.length > 0 && (label.charAt(0) === " " || label.charAt(0) === "-"
    || label.charAt(0) === "_")) {
    label = label.slice(1);
  }
  return label.length > 0 ? label : v.id;
}

// ── fetch with a deadline ─────────────────────────────────────────────────

/**
 * `fetch` that gives up after `ms`.
 *
 * `AbortSignal.timeout` is not available on this runtime, and a stalled request
 * would otherwise block the whole boot with no way out. The abandoned promise is
 * left to settle on its own; only the race matters here.
 */
async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: { method?: string },
): Promise<Response> {
  let timedOut = false;
  const timer = new Promise<never>(function (_resolve, reject): void {
    setTimeout(function (): void {
      timedOut = true;
      reject(new Error("timeout after " + ms + "ms: " + url));
    }, ms);
  });
  try {
    return await Promise.race([
      init ? fetch(url, init) : fetch(url),
      timer,
    ]) as Response;
  } catch (e) {
    if (timedOut) throw e;
    throw e;
  }
}

// ── cache ─────────────────────────────────────────────────────────────────

interface CacheShape {
  dirs?: string[];
  names?: Record<string, string>;
}

function readCache(): { dirs: string[]; names: Map<string, string> } | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8") as unknown as string) as CacheShape;
    if (!parsed || !parsed.dirs || !parsed.dirs.length) return null;
    const map = new Map<string, string>();
    const raw = parsed.names ? parsed.names : {};
    const keys = Object.keys(raw);
    for (let i = 0; i < keys.length; i++) map.set(keys[i], raw[keys[i]]);
    return { dirs: parsed.dirs, names: map };
  } catch (_e) {
    return null;
  }
}

function writeCache(dirs: string[], names: Map<string, string>): void {
  try {
    const obj: Record<string, string> = {};
    names.forEach(function (v: string, k: string): void {
      obj[k] = v;
    });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ dirs: dirs, names: obj }));
  } catch (_e) {
    // A cache that cannot be written is not an error worth surfacing.
  }
}

// ── loading ───────────────────────────────────────────────────────────────

/** Fetch `l2d.json` into an id → name map. Names are optional. */
async function loadNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const resp = await fetchWithTimeout(L2D_NAMES_URL, 10000);
    if (!resp.ok) return map;
    const list = await resp.json() as Array<{ id?: string; name?: string }>;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.id && item.name) map.set(item.id, item.name);
    }
  } catch (_e) {
    // Names are cosmetic; ids alone are enough to load a model.
  }
  return map;
}

/**
 * Resolve the catalogue, trying each source in order of freshness.
 *
 * 1. the GitHub directory listing (authoritative, but rate-limited)
 * 2. `l2d.json` (usually reachable when the API is not; its ids are the list)
 * 3. the last successful result on disk
 * 4. a built-in handful
 */
export async function loadCatalogue(
  onStatus?: (message: string) => void,
): Promise<Catalogue> {
  const report = onStatus ? onStatus : function (_m: string): void { /* none */ };

  report("Fetching model list…");
  try {
    const resp = await fetchWithTimeout(GITHUB_API, 15000);
    if (resp.ok) {
      const list = await resp.json() as Array<{ name: string; type: string }>;
      const dirs: string[] = [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].type === "dir") dirs.push(list[i].name);
      }
      if (dirs.length) {
        const names = await loadNames();
        writeCache(dirs, names);
        return { entries: toEntries(dirs, names), offline: false };
      }
    }
  } catch (_e) {
    // Fall through to the next source.
  }

  report("GitHub API unavailable — trying l2d.json…");
  try {
    const resp = await fetchWithTimeout(L2D_NAMES_URL, 10000);
    if (resp.ok) {
      const list = await resp.json() as Array<{ id?: string; name?: string }>;
      const ids: string[] = [];
      const names = new Map<string, string>();
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.id) continue;
        ids.push(item.id);
        if (item.name) names.set(item.id, item.name);
      }
      if (ids.length) {
        writeCache(ids, names);
        return { entries: toEntries(ids, names), offline: false };
      }
    }
  } catch (_e) {
    // Fall through to the cache.
  }

  const cached = readCache();
  if (cached) {
    report("Offline — using the cached model list");
    return { entries: toEntries(cached.dirs, cached.names), offline: true };
  }

  report("Offline — using the built-in model list");
  return {
    entries: FALLBACK_IDS.map(function (id: string): L2dEntry {
      return { id: id, name: fallbackName(id) };
    }),
    offline: true,
  };
}

function toEntries(ids: string[], names: Map<string, string>): L2dEntry[] {
  return ids.map(function (id: string): L2dEntry {
    const named = names.get(id);
    return { id: id, name: named ? named : fallbackName(id) };
  });
}

// ── sidebar rows ──────────────────────────────────────────────────────────

/**
 * Build the rows for one tab.
 *
 * Characters get two levels: a base id (`c810`) owns its costume variants
 * (`c810_01`). A variant whose base id is missing from the listing still gets a
 * row — the reference site does the same, and dropping it would hide loadable
 * models.
 */
export function buildRows(
  entries: L2dEntry[],
  tab: Tab,
  query: string,
): Row[] {
  const q = query.trim().toLowerCase();

  if (tab !== "characters") {
    const items = entries
      .filter(function (e: L2dEntry): boolean {
        return classify(e.id) === tab;
      })
      .filter(function (e: L2dEntry): boolean {
        return !q || e.name.toLowerCase().indexOf(q) >= 0
          || e.id.toLowerCase().indexOf(q) >= 0;
      })
      .sort(function (a: L2dEntry, b: L2dEntry): number {
        return a.name.localeCompare(b.name);
      });
    return items.map(function (e: L2dEntry): Row {
      return { kind: "entry", id: e.id, name: e.name };
    });
  }

  const all = entries.filter(function (e: L2dEntry): boolean {
    return classify(e.id) === "characters";
  });
  const bases = all.filter(function (e: L2dEntry): boolean {
    return /^c\d+$/.test(e.id);
  });
  const variants = new Map<string, L2dEntry[]>();
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!/^c\d+_\d+$/.test(e.id)) continue;
    const baseId = e.id.replace(/_\d+$/, "");
    const bucket = variants.get(baseId);
    if (bucket) bucket.push(e);
    else variants.set(baseId, [e]);
  }
  // Virtual bases: a variant exists but its base directory does not.
  variants.forEach(function (_v: L2dEntry[], baseId: string): void {
    let found = false;
    for (let i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) { found = true; break; }
    }
    if (!found) bases.push({ id: baseId, name: fallbackName(baseId) });
  });
  bases.sort(function (a: L2dEntry, b: L2dEntry): number {
    return a.name.localeCompare(b.name);
  });

  const rows: Row[] = [];
  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const own = variants.get(base.id);
    const list: L2dEntry[] = [base];
    if (own) for (let j = 0; j < own.length; j++) list.push(own[j]);

    if (q) {
      const hitBase = base.name.toLowerCase().indexOf(q) >= 0
        || base.id.toLowerCase().indexOf(q) >= 0;
      let hit = hitBase;
      if (!hit) {
        for (let j = 0; j < list.length; j++) {
          if (list[j].name.toLowerCase().indexOf(q) >= 0
            || list[j].id.toLowerCase().indexOf(q) >= 0) { hit = true; break; }
        }
      }
      if (!hit) continue;
    }
    rows.push({ kind: "group", id: base.id, name: base.name, variants: list });
  }
  return rows;
}

/** First entry worth loading by default: a character, else anything. */
export function defaultSelection(entries: L2dEntry[]): string {
  for (let i = 0; i < entries.length; i++) {
    if (/^c\d+$/.test(entries[i].id)) return entries[i].id;
  }
  return entries.length ? entries[0].id : "";
}
