/**
 * The character animation tree — `global/chars/<class>/cof/<name>.cof` plus one
 * directory per layer, `global/chars/<class>/<layer>/<name>.dcc`.
 *
 * This module decodes the naming scheme, indexes a directory listing, and
 * answers the question the renderer actually needs: which `.dcc` files satisfy
 * each layer of a COF.
 *
 * ## The naming scheme
 *
 * Every name in the tree is a fixed-width concatenation of codes:
 *
 * ```
 * COF  <class:2><mode:2><weapon:3>                        baa11hs
 * DCC  <class:2><layer:2><variant:3><mode:2><weapon:3>    bas1hvya11hs
 * ```
 *
 * The widths are not a guess. Across `global/chars` all 16,089 `.dcc` names are
 * exactly 12 characters, and 852 of the 854 `.cof` names are exactly 7, so the
 * split between the fields is forced by the length alone. Splitting them that
 * way yields 8 class codes, 19 mode codes, 11 layer codes, 14 weapon class
 * codes and 93 distinct variations, every variation exactly 3 characters long;
 * `tools/verify-cof.ts` re-derives all of them from a directory listing and
 * fails when an entry does not decompose into known codes.
 *
 * The two exceptions are worth naming because they are also the two files that
 * break the container format: `am/cof/amwk1hs.cof` uses the mode `wk`, which no
 * DCC in the package uses, and `am/cof/amblxbow.cof` is 12 bytes longer than a
 * COF should be, carries high entropy data, and spells its weapon `xbow` where
 * every DCC spells it `xbw`.
 *
 * The `variant` is the equipment token: helmet types for `hd` (`bhm`, `cap`,
 * `crn`, `fhl`, `ghm`, `hlm`, `msk`, `skp`, ...), armour weights for the torso
 * and limbs (`lit`, `med`, `hvy`), shield types for `sh` (`bsh`, `buc`, `kit`,
 * `lrg`, `spk`, `tow`) and weapon types for the hands (`axe`, `bsd`, `clw`,
 * `ktr`, ...). It is chosen at run time from the hero's equipment, which is why
 * one COF layer usually has several candidate files and why this module returns
 * candidates in a preference order instead of a single answer.
 *
 * A COF's `<mode><weapon>` tail is repeated verbatim at the end of every DCC
 * name of that animation, so a COF name is a key into the listing: the layer
 * files of `bas1hvya11hs.dcc` are exactly the files whose name ends in `a11hs`.
 *
 * ## Verification
 *
 * `tools/verify-cof.ts` re-runs the reading above against an extracted directory
 * — 8 classes, 16,089 `.dcc` names and 853 COFs holding 7,227 layers:
 *
 * - every `.dcc` name decomposes, and the layer code in the name is the
 *   directory the file lives in (16,089 of 16,089, no exceptions),
 * - 7,209 of the 7,227 layers (99.751%) resolve to a file that exists. The 18
 *   exceptions are 9 layers of `ba/bas21ht.cof`, whose mode `s2` has no sprites
 *   for the barbarian at all, and the `s3` overlay of nine necromancer and
 *   warlock block animations, which the `s3` directory never rendered,
 * - the weapon class token is a *preference*, not a requirement: 5,397 layers
 *   (74.6%) find their own token, 1,140 more fall back to `hth`, 340 to the
 *   animation's weapon and 332 only find a file under some other token. The
 *   sprites in this build were re-rendered with a different class split than
 *   the COFs record, which is exactly why resolution has to walk a list.
 *
 * ## The layer directories
 *
 * A COF layer does not store its directory. The records carry a slot id, and the
 * slot ids enumerate {@link LAYER_SLOTS} in the order the game walks the body:
 * `hd, tr, lg, ra, la, rh, lh, sh, s1, s2, s3`. Two facts in the data pin that
 * reading down.
 *
 * Slots 0-4, 8 and 9 are drawn by 837 of the 853 COFs — the 16 exceptions are
 * the one layer death animations, which draw the torso (slot 1) alone, and slot
 * 1 is the one slot every COF draws. Slots 5, 6, 7 and 10 come and go: those are
 * the equipment layers, the ones an animation may skip. And those four line up
 * with the four equipment directories under the one assignment that makes the
 * most of them real —
 *
 * ```
 * slot 5 -> rh  slot 6 -> lh  slot 7 -> sh  slot 10 -> s3
 * ```
 *
 * Drawing a slot whose directory has no sprites for that animation happens 13
 * times with that assignment and 21 times with the next best of the 24
 * permutations, so it is the unique minimum. Per directory: `lh` backs all 280
 * animations that draw slot 6, `sh` backs 332 of the 333 that draw slot 7 and
 * `s3` backs 68 of the 77 that draw slot 10.
 */

import { LAYER_SLOTS, parseCof, type CofFile, type CofLayer, type LayerSlot } from './cof'

/** The playable classes, as they appear at the front of every file name. */
export const CLASS_CODES = ['ai', 'am', 'ba', 'dz', 'ne', 'pa', 'so', 'wk'] as const

/**
 * The animation modes. Derived from the DCC names, so `wk` — which only
 * `am/cof/amwk1hs.cof` uses — is deliberately absent.
 */
export const ANIM_MODES = [
  'a1',
  'a2',
  'bl',
  'dd',
  'dt',
  'gh',
  'kk',
  'nu',
  'rn',
  's1',
  's2',
  's3',
  's4',
  'sc',
  'th',
  'tn',
  'tw',
  'wl',
] as const

/** The weapon classes. `xbow` is absent for the same reason `wk` is a mode. */
export const WEAPON_CLASSES = [
  'hth',
  '1hs',
  '1ht',
  '2hs',
  '2ht',
  '1js',
  '1jt',
  '1ss',
  '1st',
  'bow',
  'xbw',
  'stf',
  'ht1',
  'ht2',
] as const

const COF_NAME_LENGTH = 7
const DCC_NAME_LENGTH = 12

export interface CofName {
  classCode: string
  mode: string
  weapon: string
}

export interface DccName {
  classCode: string
  layer: LayerSlot
  variant: string
  mode: string
  weapon: string
}

function baseName(path: string): string {
  const slash = path.lastIndexOf('/')
  const file = slash < 0 ? path : path.slice(slash + 1)
  const dot = file.lastIndexOf('.')
  return dot < 0 ? file : file.slice(0, dot)
}

/** Decodes `baa11hs` into its three codes, or null when the name is not one. */
export function parseCofFileName(name: string): CofName | null {
  const file = baseName(name)
  if (file.length !== COF_NAME_LENGTH) return null
  const classCode = file.slice(0, 2)
  const mode = file.slice(2, 4)
  const weapon = file.slice(4, 7)
  if (!(CLASS_CODES as readonly string[]).includes(classCode)) return null
  if (!(ANIM_MODES as readonly string[]).includes(mode)) return null
  if (!(WEAPON_CLASSES as readonly string[]).includes(weapon)) return null
  return { classCode, mode, weapon }
}

/** Decodes `bas1hvya11hs` into its five codes, or null when the name is not one. */
export function parseDccFileName(name: string): DccName | null {
  const file = baseName(name)
  if (file.length !== DCC_NAME_LENGTH) return null
  const classCode = file.slice(0, 2)
  const layer = file.slice(2, 4)
  const variant = file.slice(4, 7)
  const mode = file.slice(7, 9)
  const weapon = file.slice(9, 12)
  if (!(CLASS_CODES as readonly string[]).includes(classCode)) return null
  if (!(LAYER_SLOTS as readonly string[]).includes(layer)) return null
  if (!(ANIM_MODES as readonly string[]).includes(mode)) return null
  if (!(WEAPON_CLASSES as readonly string[]).includes(weapon)) return null
  return { classCode, layer: layer as LayerSlot, variant, mode, weapon }
}

export interface ResolvedLayer {
  layer: CofLayer
  /** The `.dcc` that draws it, or null when the tree carries none. */
  file: string | null
}

export interface ClassVocabulary {
  classCode: string
  /** Animation modes that have at least one `.dcc`. */
  modes: readonly string[]
  /** Weapon classes that have at least one `.dcc`. */
  weapons: readonly string[]
  /** Layer directories that exist under the class. */
  layers: readonly string[]
  /** Equipment tokens seen in the class's `.dcc` names, sorted. */
  variants: readonly string[]
  /** COF names (without directory or extension) that parse. */
  cofNames: readonly string[]
}

export interface CharAnimIndex extends ClassVocabulary {
  /** Every `.dcc` in the listing, as the relative path it was given as. */
  dccFiles: readonly string[]
  /** COF names available for one animation. */
  cofNamesFor(mode: string, weapon: string): readonly string[]
  /** Every `.dcc` that belongs to one animation, sorted. */
  filesFor(mode: string, weapon: string): readonly string[]
  /** Modes that have sprites for a weapon class. */
  modesForWeapon(weapon: string): readonly string[]
  /** Weapon classes that have sprites for a mode. */
  weaponsForMode(mode: string): readonly string[]
  /**
   * The `.dcc` files that can satisfy one COF layer, best first: the layer's own
   * weapon class, then `hth`, then the animation's weapon class, then any file
   * that matches the layer's directory and mode.
   */
  filesForLayer(layer: CofLayer, mode: string, weapon: string): readonly string[]
  /** Resolves every layer of a COF against this listing. */
  resolveLayers(cof: CofFile): readonly ResolvedLayer[]
}

interface DccEntry extends DccName {
  path: string
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

/**
 * Indexes one class's animation tree.
 *
 * `listing` holds paths relative to `global/chars/<classCode>/`, e.g.
 * `cof/baa11hs.cof` and `s1/bas1hvya11hs.dcc`, which is what a build step or a
 * fetch manifest produces and what a test can write by hand.
 */
export function createCharAnimIndex(
  classCode: string,
  listing: readonly string[],
): CharAnimIndex {
  const cofNames: string[] = []
  const dccs: DccEntry[] = []
  for (const entry of listing) {
    const lower = entry.toLowerCase()
    if (lower.endsWith('.cof')) {
      const name = parseCofFileName(entry)
      if (name && name.classCode === classCode) cofNames.push(baseName(entry))
      continue
    }
    if (!lower.endsWith('.dcc')) continue
    const name = parseDccFileName(entry)
    if (!name || name.classCode !== classCode) continue
    dccs.push({ ...name, path: entry })
  }

  // Two indexes: an animation is a mode plus a weapon class, but a layer may
  // legitimately be stored under a different class than the animation's, so the
  // per layer one has to span every class of that mode.
  const byAnimation = new Map<string, DccEntry[]>()
  const byLayerMode = new Map<string, DccEntry[]>()
  for (const dcc of dccs) {
    const animation = animationKey(dcc.mode, dcc.weapon)
    const animationBucket = byAnimation.get(animation)
    if (animationBucket) animationBucket.push(dcc)
    else byAnimation.set(animation, [dcc])
    const layerMode = `${dcc.layer}\u0000${dcc.mode}`
    const layerBucket = byLayerMode.get(layerMode)
    if (layerBucket) layerBucket.push(dcc)
    else byLayerMode.set(layerMode, [dcc])
  }
  for (const bucket of byAnimation.values()) bucket.sort((a, b) => compare(a.path, b.path))
  for (const bucket of byLayerMode.values()) bucket.sort((a, b) => compare(a.path, b.path))

  const vocabulary = {
    classCode,
    modes: sorted(dccs.map((dcc) => dcc.mode)),
    weapons: sorted(dccs.map((dcc) => dcc.weapon)),
    layers: sorted(dccs.map((dcc) => dcc.layer)),
    variants: sorted(dccs.map((dcc) => dcc.variant)),
    cofNames: sorted(cofNames),
  }

  const filesForLayer = (
    layer: CofLayer,
    mode: string,
    weapon: string,
  ): readonly string[] => {
    const bucket = byLayerMode.get(`${layer.dir}\u0000${mode}`) ?? []
    const rank = (dcc: DccEntry): number => {
      if (dcc.weapon === layer.name) return 0
      if (dcc.weapon === 'hth') return 1
      if (dcc.weapon === weapon) return 2
      return 3
    }
    return bucket
      .map((dcc, index) => ({ dcc, index }))
      .sort((a, b) => rank(a.dcc) - rank(b.dcc) || a.index - b.index)
      .map((entry) => entry.dcc.path)
  }

  return {
    ...vocabulary,
    dccFiles: dccs.map((dcc) => dcc.path).sort(compare),
    cofNamesFor: (mode, weapon) =>
      vocabulary.cofNames.filter((name) => {
        const parsed = parseCofFileName(name)
        return parsed !== null && parsed.mode === mode && parsed.weapon === weapon
      }),
    filesFor: (mode, weapon) =>
      (byAnimation.get(animationKey(mode, weapon)) ?? []).map((dcc) => dcc.path),
    modesForWeapon: (weapon) =>
      sorted(dccs.filter((dcc) => dcc.weapon === weapon).map((dcc) => dcc.mode)),
    weaponsForMode: (mode) =>
      sorted(dccs.filter((dcc) => dcc.mode === mode).map((dcc) => dcc.weapon)),
    filesForLayer,
    resolveLayers: (cof) => resolveWith(cof, filesForLayer, classCode),
  }
}

function animationKey(mode: string, weapon: string): string {
  return `${mode}${weapon}`
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Resolves the layers of a COF against a class's `.dcc` listing.
 *
 * The returned array is in draw order — the order of the animation's first
 * frame, which every frame of a COF is a permutation of. The COF must know its
 * own file name (`parseCof(bytes, 'baa11hs')`) because the animation's mode and
 * weapon class live in that name, not in the bytes.
 */
export function resolveLayers(cof: CofFile, layerFiles: readonly string[]): ResolvedLayer[] {
  if (cof.name === undefined) {
    throw new Error("resolveLayers: the COF needs its file name, e.g. parseCof(bytes, 'baa11hs')")
  }
  const parsed = parseCofFileName(cof.name)
  if (parsed === null) {
    throw new Error(`resolveLayers: ${cof.name} is not <class><mode><weapon>`)
  }
  const index = createCharAnimIndex(parsed.classCode, layerFiles)
  return resolveWith(cof, index.filesForLayer, parsed.classCode)
}

type LayerFileFinder = (layer: CofLayer, mode: string, weapon: string) => readonly string[]

function resolveWith(
  cof: CofFile,
  find: LayerFileFinder,
  classCode: string,
): ResolvedLayer[] {
  const parsed = cof.name === undefined ? null : parseCofFileName(cof.name)
  if (parsed === null) {
    throw new Error(
      cof.name === undefined
        ? 'resolveLayers: the COF needs its file name'
        : `resolveLayers: ${cof.name} is not <class><mode><weapon>`,
    )
  }
  if (parsed.classCode !== classCode) {
    throw new Error(`resolveLayers: ${cof.name} is a ${parsed.classCode} animation, not ${classCode}`)
  }
  const order = cof.layerOrders[0] ?? cof.layers.map((layer) => layer.slot)
  const resolved: ResolvedLayer[] = []
  for (const slot of order) {
    const layer = cof.layers.find((candidate) => candidate.slot === slot)
    if (layer === undefined) continue
    const candidates = find(layer, parsed.mode, parsed.weapon)
    resolved.push({ layer, file: candidates[0] ?? null })
  }
  return resolved
}

/** Reads a COF from bytes and resolves it in one step. */
export function parseAndResolve(
  bytes: Uint8Array,
  name: string,
  layerFiles: readonly string[],
): readonly ResolvedLayer[] {
  return resolveLayers(parseCof(bytes, name), layerFiles)
}
