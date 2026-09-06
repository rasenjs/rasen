/**
 * NIKKE asset audit — compares OUR Spine parser (@rasenjs/spine) against the
 * OFFICIAL spine-webgl runtime for every character asset, to surface edge-case
 * differences (bone/slot/attachment/animation/skin counts, atlas regions).
 *
 * Only .skel + .atlas are fetched (the multi-MB page PNG is not needed for a
 * structural comparison), so this can run across the whole asset set.
 *
 * Results are written to #out and to window.__audit for programmatic reading.
 */

import { parseSpineBinary, parseSpineAtlas } from '@rasenjs/spine'

const RAW_BASE = 'https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d'
const SUFFIXES = ['_00', '_01', '', '_02', '_03']

const out = document.getElementById('out')!
const log: string[] = []
function print(s: string, cls?: string): void {
  log.push(s)
  const div = document.createElement('div')
  if (cls) div.className = cls
  div.textContent = s
  out.appendChild(div)
}

type Summary = {
  version: string
  bones: number
  slots: number
  animations: number
  animNames: string[]
  skins: number
  attachments: number
  atlasRegions: number
  atlasPages: number
}

async function fetchAssets(char: string) {
  const base = `${RAW_BASE}/${char}`
  for (const sfx of SUFFIXES) {
    let skelResp: Response
    let atlasResp: Response
    try {
      ;[skelResp, atlasResp] = await Promise.all([
        fetch(`${base}/${char}${sfx}.skel`),
        fetch(`${base}/${char}${sfx}.atlas`)
      ])
    } catch {
      continue
    }
    if (skelResp.ok && atlasResp.ok) {
      return {
        skel: new Uint8Array(await skelResp.arrayBuffer()),
        atlas: await atlasResp.text(),
        suffix: sfx
      }
    }
  }
  return null
}

function countMineAttachments(data: any): number {
  let n = 0
  for (const skin of data.skins ?? []) {
    for (const _slotName of Object.keys(skin.attachments ?? {})) {
      n += Object.keys(skin.attachments[_slotName] ?? {}).length
    }
  }
  return n
}

function countOfficialAttachments(data: any): number {
  let n = 0
  for (const skin of data.skins ?? []) {
    for (const _slotName of Object.keys(skin.attachments ?? {})) {
      n += Object.keys(skin.attachments[_slotName] ?? {}).length
    }
  }
  return n
}

function summarizeMine(skel: Uint8Array, atlasText: string): Summary {
  const atlas: any = parseSpineAtlas(atlasText)
  const data: any = parseSpineBinary(skel)
  // NOTE: our SkeletonData exposes `animations` as a Record<string, AnimationData>
  // (keyed by name), unlike the official runtime's array. Normalise to names.
  const anims = data.animations ?? {}
  return {
    version: data.version ?? 'unknown',
    bones: data.bones?.length ?? 0,
    slots: data.slots?.length ?? 0,
    animations: Object.keys(anims).length,
    animNames: Object.keys(anims).sort(),
    skins: (data.skins ?? []).length,
    attachments: countMineAttachments(data),
    atlasRegions: Object.keys(atlas.regions ?? {}).length,
    atlasPages: atlas.pages?.length ?? 0
  }
}

function summarizeOfficial(skel: Uint8Array, atlasText: string): Summary {
  const spine = (window as any).spine
  // Parse the atlas (so atlas-level errors surface) but attach a STUB attachment
  // loader, so the comparison isolates BINARY parsing. A missing atlas region is
  // an asset/atlas mismatch, not a parser divergence, and would otherwise mask
  // whether the two binary readers agree.
  const atlas = new spine.TextureAtlas(atlasText)
  const col = () => ({ r: 0, g: 0, b: 0, a: 0 })
  const stub = {
    newRegionAttachment: (_s: unknown, n: string, p: string) => ({ name: n, path: p, color: col(), updateRegion() {}, computeWorldVertices() {} }),
    newMeshAttachment: (_s: unknown, n: string, p: string) => ({ name: n, path: p, color: col(), region: null, updateRegion() {}, setParentMesh() {}, computeWorldVertices() {} }),
    newBoundingBoxAttachment: (_s: unknown, n: string) => ({ name: n, color: col() }),
    newPathAttachment: (_s: unknown, n: string) => ({ name: n, color: col() }),
    newPointAttachment: (_s: unknown, n: string) => ({ name: n, color: col() }),
    newClippingAttachment: (_s: unknown, n: string) => ({ name: n, color: col() })
  }
  const binary = new spine.SkeletonBinary(stub)
  const data = binary.readSkeletonData(skel)
  return {
    version: data.version ?? 'unknown',
    bones: data.bones.length,
    slots: data.slots.length,
    animations: data.animations.length,
    animNames: data.animations.map((a: any) => a.name).sort(),
    skins: data.skins.length,
    attachments: countOfficialAttachments(data),
    atlasRegions: atlas.regions.length,
    atlasPages: atlas.pages.length
  }
}

function diffFields(a: Summary, b: Summary): string[] {
  const diffs: string[] = []
  if (a.bones !== b.bones) diffs.push(`bones ${a.bones} vs ${b.bones}`)
  if (a.slots !== b.slots) diffs.push(`slots ${a.slots} vs ${b.slots}`)
  if (a.animations !== b.animations) diffs.push(`animations ${a.animations} vs ${b.animations}`)
  if (a.skins !== b.skins) diffs.push(`skins ${a.skins} vs ${b.skins}`)
  if (a.attachments !== b.attachments) diffs.push(`attachments ${a.attachments} vs ${b.attachments}`)
  if (a.atlasRegions !== b.atlasRegions) diffs.push(`atlasRegions ${a.atlasRegions} vs ${b.atlasRegions}`)
  if (a.atlasPages !== b.atlasPages) diffs.push(`atlasPages ${a.atlasPages} vs ${b.atlasPages}`)
  const an = a.animNames.join('|')
  const bn = b.animNames.join('|')
  if (an !== bn) diffs.push(`animNames differ`)
  return diffs
}

/**
 * Audit one character. The reference runtime depends on the asset's Spine
 * version: nikkeviewer.com ships a 4.0 runtime (spine-player.js) AND a 4.1
 * runtime (spine-player4.1.js) and picks per asset. Our parser branches on the
 * version internally, so:
 *  - Spine < 4.1 assets: OUR parser is the reference (the 4.2 runtime can't
 *    read them — verified identical on samples against the real 4.0 runtime).
 *  - Spine >= 4.1 assets: compare against the official 4.2 runtime.
 */
async function auditOne(char: string): Promise<{ char: string; status: string; diffs?: string[] }> {
  const assets = await fetchAssets(char)
  if (!assets) return { char, status: 'NO_ASSET' }

  let mine: Summary | null = null
  let mineErr = ''
  try {
    mine = summarizeMine(assets.skel, assets.atlas)
  } catch (e) {
    mineErr = (e as Error).message
  }
  if (!mine) return { char, status: `DIVERGE_MINE_ONLY_FAIL: ${mineErr.slice(0, 60)}` }

  // Spine < 4.1 -> our parser is the reference (4.0 runtime agrees on samples).
  const is40 = /^4\.0\./.test(mine.version)
  if (is40) return { char, status: 'OK_40' }

  // Spine >= 4.1 -> compare against the official 4.2 runtime.
  let official: Summary | null = null
  let officialErr = ''
  try {
    official = summarizeOfficial(assets.skel, assets.atlas)
  } catch (e) {
    officialErr = (e as Error).message
  }
  if (!official) return { char, status: `DIVERGE_OFFICIAL_ONLY_FAIL: ${officialErr.slice(0, 60)}` }

  const diffs = diffFields(mine, official)
  return { char, status: diffs.length ? 'DIFF' : 'AGREE_OK', diffs }
}

async function run(chars: string[], concurrency: number) {
  const results: Array<{ char: string; status: string; diffs?: string[] }> = []
  let idx = 0
  let agreeOk = 0
  let ok40 = 0
  let noAsset = 0
  let diff = 0
  let diverge = 0

  async function worker() {
    while (idx < chars.length) {
      const i = idx++
      const char = chars[i]
      let r: { char: string; status: string; diffs?: string[] }
      try {
        r = await auditOne(char)
      } catch (e) {
        r = { char, status: `THROW: ${(e as Error).message}` }
      }
      results.push(r)
      if (r.status === 'AGREE_OK') agreeOk++
      else if (r.status === 'OK_40') ok40++
      else if (r.status === 'NO_ASSET') noAsset++
      else if (r.status === 'DIFF') {
        diff++
        print(`DIFF ${char}: ${r.diffs!.join('; ')}`, 'bad')
      } else {
        diverge++
        print(`${r.status} ${char}`, 'bad')
      }
      if (results.length % 50 === 0) {
        print(`… progress ${results.length}/${chars.length} (agreeOk=${agreeOk} ok40=${ok40} noAsset=${noAsset} diff=${diff} diverge=${diverge})`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  print('', '')
  print(`=== AUDIT COMPLETE ===`)
  print(`total=${chars.length} agreeOk=${agreeOk} ok40=${ok40} noAsset=${noAsset} diff=${diff} diverge=${diverge}`, 'ok')
  ;(window as any).__audit = { results, agreeOk, ok40, noAsset, diff, diverge, total: chars.length }
  ;(window as any).__auditDone = true
}

async function boot() {
  if (!(window as any).spine) {
    print('official spine runtime not loaded (is the compare server on :5199 up?)', 'bad')
    return
  }
  let chars: string[]
  try {
    const resp = await fetch('https://api.github.com/repos/Nikke-db/Nikke-db.github.io/contents/l2d?ref=main')
    const json = await resp.json()
    chars = json.filter((x: any) => x.type === 'dir').map((x: any) => x.name)
  } catch (e) {
    print(`character list fetch failed: ${(e as Error).message}`, 'bad')
    return
  }
  // allow limiting via ?limit=N and offset via ?offset=N
  const params = new URLSearchParams(location.search)
  const limit = params.get('limit') ? parseInt(params.get('limit')!, 10) : chars.length
  const offset = params.get('offset') ? parseInt(params.get('offset')!, 10) : 0
  const subset = chars.slice(offset, offset + limit)
  print(`auditing ${subset.length} characters (offset=${offset}, concurrency=8)…`)
  await run(subset, 8)
}

boot()
