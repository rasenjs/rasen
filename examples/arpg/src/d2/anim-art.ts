/**
 * The actor art the game plays: real animations, in the shape the renderer wants.
 *
 * `anim.ts` composes one animation into one uniform sheet. An actor needs several
 * at once — it walks, attacks and dies — so this composes the modes a unit plays
 * and hands them over as the `SpriteSheet` the actor pool already uses, with the
 * anchor that places it.
 *
 * ## Which animation is which
 *
 * The keys are the game's own, and they do not follow from the display names:
 *
 * - **Characters** are keyed by a two-letter code from the animation files, and
 *   four of the eight do not match the class name (`Assassin` → `ai`, `Druid` →
 *   `dz`, `Warlock` → `wk`, and `Necromancer`/`Sorceress` match only by accident).
 *   The table below is the game's, not a prefix rule.
 * - **Monsters** are keyed by `monstats.txt`'s `Code`, lower-cased: the act 5
 *   barbarians have `Code` `0A` and their art lives under `monsters/0a/`. This is
 *   checked by looking the token up in the manifest and reporting what is missing
 *   rather than inventing a key.
 *
 * ## Modes
 *
 * Eight modes ship for every class: `nu` neutral, `wl` walk, `rn` run, `a1`/`a2`
 * attack, `sc` cast, `gh` get-hit, `dd` death. The game's own mode tokens are in
 * `plrmode.txt` and `monmode.txt`, which the app already reads for exactly this
 * purpose.
 */

import type { SpriteSheet } from '../sprites'
import { composeAnimation, loadAnimIndex, type AnimIndex, type ComposedAnimation } from './anim'

/**
 * The animation tree's two-letter code for each class, under every name the
 * tables use for it.
 *
 * Two vocabularies, and neither is derivable from the other. `charstats.txt`
 * spells the class out (`Amazon`, `Barbarian`), while `skills.txt` uses a
 * three-letter code (`ama`, `bar`) — that is what `Game.heroClass` reads, and it
 * is what the class skill icons are filed under (`amaskillicon`). The animation
 * files use a third, two-letter set in which only some of the eight agree with the
 * class name: `Assassin` is `ai`, `Druid` is `dz`, `Warlock` is `wk`, and the
 * sorceress's `so` collides with nothing but is not `sor`. So all three spellings
 * are listed rather than guessed at.
 */
export const CLASS_ANIM_CODE: Readonly<Record<string, string>> = {
  // Full names, as `charstats.txt` writes them.
  amazon: 'am',
  assassin: 'ai',
  barbarian: 'ba',
  druid: 'dz',
  necromancer: 'ne',
  paladin: 'pa',
  sorceress: 'so',
  warlock: 'wk',
  // Three-letter codes, as `skills.txt` writes them.
  ama: 'am',
  ass: 'ai',
  bar: 'ba',
  dru: 'dz',
  nec: 'ne',
  pal: 'pa',
  sor: 'so',
  war: 'wk',
  // The two abbreviations the tables also use.
  wiz: 'wk',
  necro: 'ne',
}

/** The codes the animation tree files classes under, for validation. */
export const ANIM_CLASS_CODES: readonly string[] = ['ai', 'am', 'ba', 'dz', 'ne', 'pa', 'so', 'wk']

/**
 * The code the animation tree files a class under.
 *
 * Case-insensitive. A class already given as its two-letter animation code is
 * returned unchanged, so a caller holding one from anywhere else does not have to
 * know which vocabulary it came from. Returns null for anything else, so a caller
 * can say so rather than asking for art that cannot exist.
 */
export function classAnimCode(className: string): string | null {
  const key = className.trim().toLowerCase()
  if (key === '') return null
  if (ANIM_CLASS_CODES.includes(key)) return key
  const direct = CLASS_ANIM_CODE[key]
  if (direct !== undefined) return direct
  // A longer spelling that starts with a known name (`Amazonian`), which costs
  // nothing and only fires when the exact lookup missed.
  for (const [name, code] of Object.entries(CLASS_ANIM_CODE)) {
    if (name.length >= 3 && key.startsWith(name)) return code
  }
  return null
}

/**
 * The modes an actor plays. Each is one animation key under its tree.
 *
 * The town stances `plrmode.txt` numbers 5 and 6 (`tn`, `tw`) are not among them: the
 * export has no `chars/<class>/tn` or `/tw` art, because `HERO_MODES` in
 * `tools/export-anim.ts` does not export any. Both lists carry the seven the package
 * has art for, and adding a mode here alone would only ask for a sheet that cannot
 * exist.
 */
export const ACTOR_MODES = ['nu', 'wl', 'rn', 'a1', 'sc', 'gh', 'dd'] as const
export type ActorMode = (typeof ACTOR_MODES)[number]

/** One composed animation, ready to draw. */
export interface ActorAnimation extends ComposedAnimation {
  readonly key: string
  readonly mode: ActorMode
}

/** The animations an actor was able to load, and the ones it could not. */
export interface ActorArt {
  /** The mode the actor is drawn in by default. */
  readonly idle: ActorAnimation
  readonly byMode: ReadonlyMap<ActorMode, ActorAnimation>
  /** The animation keys the manifest does not have, for the startup report. */
  readonly missing: readonly string[]
  /** The sheet for a mode, falling back to `nu` rather than drawing nothing. */
  sheetFor(mode: ActorMode): ActorAnimation
}

/**
 * The animation key for one mode of one actor.
 *
 * `chars/ba/nu/hth` for a character — the weapon class matters because the
 * character's arm art differs with what it holds — and `monsters/0a/nu/1hs` for a
 * monster, whose weapon class comes from `monstats2.BaseW`. `hth` is the unarmed
 * set and is what a character with nothing in hand uses.
 */
export function animKeyFor(
  kind: 'char' | 'monster',
  code: string,
  mode: string,
  weapon = 'hth',
): string {
  return `${kind === 'char' ? 'chars' : 'monsters'}/${code}/${mode}/${weapon}`
}

/**
 * Composes the modes one actor plays.
 *
 * `weapon` picks the arm set for a character. A mode whose key is absent from the
 * manifest is reported, not substituted: the exported set for a class is the modes
 * the game plays, and quietly drawing `nu` for a missing `dd` would hide a real
 * gap in the export.
 */
export async function loadActorArt(
  base: string,
  index: AnimIndex,
  kind: 'char' | 'monster',
  code: string,
  weapon = 'hth',
  modes: readonly ActorMode[] = ACTOR_MODES,
): Promise<ActorArt | null> {
  const loaded = new Map<ActorMode, ActorAnimation>()
  const missing: string[] = []
  await Promise.all(
    modes.map(async (mode) => {
      const key = animKeyFor(kind, code, mode, weapon)
      const entry = index.animations[key]
      if (entry === undefined) {
        missing.push(key)
        return
      }
      const composed = await composeAnimation(base, entry)
      if (composed === null) {
        missing.push(`${key} (compose failed)`)
        return
      }
      loaded.set(mode, { ...composed, key, mode })
    }),
  )

  const idle = loaded.get('nu') ?? loaded.get('wl') ?? [...loaded.values()][0]
  if (idle === undefined) return null
  return {
    idle,
    byMode: loaded,
    missing,
    sheetFor: (mode: ActorMode): ActorAnimation => loaded.get(mode) ?? idle,
  }
}

/** Loads the manifest and the hero's art in one step. */
export async function loadHeroArt(
  base: string,
  className: string,
  weapon = 'hth',
): Promise<{ art: ActorArt; code: string } | null> {
  const code = classAnimCode(className)
  if (code === null) return null
  const index = await loadAnimIndex(base)
  if (index === null) return null
  const art = await loadActorArt(base, index, 'char', code, weapon)
  return art === null ? null : { art, code }
}

/**
 * Composes a monster's modes from its `monstats` row.
 *
 * The key is the row's `Code` lower-cased — `monsters/0a/nu/1hs` — and the weapon
 * class comes from `monstats2.BaseW`, which is what the monster is holding: a
 * Skeleton is `1hs`, a Fallen is `hth`. A token the export does not have is
 * reported rather than substituted, because the monsters the game ships are keyed
 * by `Code` and a wrong key draws the wrong creature.
 */
export async function loadMonsterArt(
  base: string,
  index: AnimIndex,
  code: string,
  weapon = 'hth',
): Promise<ActorArt | null> {
  const token = code.trim().toLowerCase()
  if (token === '') return null
  return loadActorArt(base, index, 'monster', token, weapon)
}

/**
 * Composes every monster token the export has, once, for a caller that spawns from
 * a pool.
 *
 * Done in one pass because a level spawns dozens of monsters across a few tokens,
 * and composing per spawn would re-read the same sheets. A token that fails is
 * absent from the map rather than an error, so one missing creature does not cost
 * the rest.
 */
export async function loadMonsterArtMap(
  base: string,
  index: AnimIndex,
  tokens: readonly { code: string; weapon: string }[],
  modes: readonly ActorMode[] = ACTOR_MODES,
): Promise<Map<string, ActorArt>> {
  const byToken = new Map<string, ActorArt>()
  const unique = new Map<string, string>()
  for (const token of tokens) {
    const key = token.code.trim().toLowerCase()
    if (key !== '' && !unique.has(key)) unique.set(key, token.weapon)
  }
  await Promise.all(
    [...unique].map(async ([token, weapon]) => {
      const art = await loadActorArt(base, index, 'monster', token, weapon, modes)
      if (art !== null) byToken.set(token, art)
    }),
  )
  return byToken
}

/** A sheet that draws nothing, for a caller that has no art for a unit. */
export function emptySheet(): SpriteSheet {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return { image: canvas, frameWidth: 1, frameHeight: 1, columns: 1, rows: 1 }
}

// ---------------------------------------------------------------------------
// Flat keys — missiles and overlays
// ---------------------------------------------------------------------------

/**
 * ## Why missiles and overlays are addressed by a flat key
 *
 * A character's animation is a **four-token** key — tree, class code, mode and
 * weapon class — because the art depends on all four: `chars/ba/nu/hth` is the
 * barbarian standing unarmed, `chars/ba/a1/2hs` the same barbarian swinging a
 * two-handed sword, and `chars/am/sc/bow` the amazon casting with a bow in hand.
 * `animKeyFor` builds that key. A monster's is three tokens, the last being what
 * `monstats2.BaseW` says it holds (`monsters/0a/nu/1hs`).
 *
 * The export files **missiles and overlays flat — one node per animation**, and
 * gives them neither a mode nor a weapon class:
 *
 * ```
 * missiles/safearrow                         missiles/firearrow
 * missiles/teethexplode                      missiles/expansion/firetraumamissile
 * overlays/overlayh                          overlays/amazonhealspell
 * overlays/extra/shockhitsm                  overlays/expansion/assassin dragon flight
 * ```
 *
 * There is no `missiles/arrow/nu` to ask for and no weapon class to choose: a
 * missile has no neutral/walk/attack/gethit modes and nothing in its hand to pick
 * an arm set for. The whole animation *is* the key. `tools/export-anim.ts` keys
 * them by their path under the tree with the extension dropped and the case
 * lowered, and the two columns that spell those names are `missiles.txt`'s
 * `CelFile` (`SafeArrow`, `FireArrow`, `Expansion\FireTraumaMissile`) and
 * `overlays.txt`'s `Filename` (`OverlayH`, `ShockHitSm`, `Expansion\PsyHammerHit`).
 *
 * So this path **takes** a finished key instead of building one, and the two
 * helpers below are its whole vocabulary: how a table's file name becomes a
 * manifest key, and how to compose the animation that key names.
 */

/** The two trees the export keys flat, with no mode and no weapon class. */
export type FlatTree = 'missiles' | 'overlays'

/**
 * A table's file name as a manifest key, without the tree: lower-cased,
 * backslashes turned into separators, extension dropped.
 *
 * The tables write DOS-style mixed-case paths (`Expansion\PsyHammerHit`) and the
 * manifest writes lower-cased ones (`expansion/psyhammerhit`), so the two
 * spellings of the same file are reconciled here rather than at each call site.
 */
export function flatArtName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
}

/** `missiles/safearrow` for `CelFile` `SafeArrow` under the missile tree. */
export function flatArtKey(tree: FlatTree, fileName: string): string {
  const name = flatArtName(fileName)
  return name === '' ? '' : `${tree}/${name}`
}

/**
 * The manifest keys one table file name can mean, best first.
 *
 * The export files an animation under the tree its source path sits in —
 * `global/missiles/...` becomes `missiles/...`, `global/overlays/...` becomes
 * `overlays/...`, and a deeper source directory becomes a segment
 * (`overlays/expansion/poisonhit`) — while a *table* may name that same file from
 * the other tree. Two real cases: `missiles.txt`'s `FireExplode` row names the cel
 * `FireExplode`, which the export filed under the overlay tree
 * (`overlays/fireexplode`), and the Teeth Explode missile's cel is in both
 * (`missiles/teethexplode` and `overlays/extra/teethexplode`). So the search tries
 * the table's own tree first, with and without an `extra`/`expansion` segment,
 * then the other tree the same way. No key is offered twice.
 */
export function flatArtCandidates(tree: FlatTree, fileName: string): readonly string[] {
  const name = flatArtName(fileName)
  if (name === '') return []
  const trees: readonly FlatTree[] = [tree, tree === 'missiles' ? 'overlays' : 'missiles']
  const candidates: string[] = []
  for (const candidateTree of trees) {
    candidates.push(`${candidateTree}/${name}`)
    // A name that already carries a directory is already specific.
    if (!name.includes('/')) {
      candidates.push(`${candidateTree}/extra/${name}`, `${candidateTree}/expansion/${name}`)
    }
  }
  return [...new Set(candidates)]
}

/** The first key {@link flatArtCandidates} offers that the manifest actually has. */
export function resolveFlatArtKey(
  index: AnimIndex,
  tree: FlatTree,
  fileName: string,
): string | null {
  for (const key of flatArtCandidates(tree, fileName)) {
    if (index.animations[key] !== undefined) return key
  }
  return null
}

/** One composed flat animation: the sheet and the key it came from. */
export interface FlatAnimation extends ComposedAnimation {
  readonly key: string
}

/**
 * Composes one animation addressed by its full flat key.
 *
 * `composeAnimation` does all the work — the key is not a different kind of
 * animation, only a different way of naming one — so this hands back the key
 * beside the composed sheet, which is what a caller needs to know *what* it is
 * holding (`missiles/safearrow` rather than an anonymous sheet). Null when the
 * manifest has no such key or the first sheet will not load.
 */
export async function loadFlatArt(
  base: string,
  index: AnimIndex,
  key: string,
): Promise<FlatAnimation | null> {
  const entry = index.animations[key]
  if (entry === undefined) return null
  const composed = await composeAnimation(base, entry)
  return composed === null ? null : { ...composed, key }
}

/**
 * The flat animations a run asks for, composed once each.
 *
 * The export holds 799 of them (392 missiles, 407 overlays) and a run plays a
 * handful: the missile of each skill on the bar, the missile that plays where one
 * lands, and the overlay a drawn effect stands in for. So they are composed on
 * demand rather than up front, and the answer is kept — the same sheet must not be
 * composed again for the thousandth arrow — including the answer "the manifest
 * does not have this", so asking twice does not re-scan the manifest.
 */
export class FlatArtCache {
  private readonly base: string
  private readonly index: AnimIndex
  private readonly pending = new Map<string, Promise<FlatAnimation | null>>()
  private readonly composed = new Map<string, FlatAnimation>()
  private readonly absent = new Set<string>()

  constructor(base: string, index: AnimIndex) {
    this.base = base
    this.index = index
  }

  /** The manifest key a table file name means, or null when it names nothing. */
  keyForFile(tree: FlatTree, fileName: string): string | null {
    return resolveFlatArtKey(this.index, tree, fileName)
  }

  /**
   * Composes a key on first use.
   *
   * Null for a key the manifest does not have and for one whose sheets fail to
   * load; both are remembered, so this is safe to call per frame.
   */
  get(key: string): Promise<FlatAnimation | null> {
    const known = this.pending.get(key)
    if (known !== undefined) return known
    if (this.index.animations[key] === undefined) {
      this.absent.add(key)
      return Promise.resolve(null)
    }
    const loading = loadFlatArt(this.base, this.index, key).then((art) => {
      if (art === null) this.absent.add(key)
      else this.composed.set(key, art)
      return art
    })
    this.pending.set(key, loading)
    return loading
  }

  /** The art a table's file name means, composed on first use. */
  getForFile(tree: FlatTree, fileName: string): Promise<FlatAnimation | null> {
    const key = this.keyForFile(tree, fileName)
    if (key === null) {
      this.absent.add(flatArtKey(tree, fileName))
      return Promise.resolve(null)
    }
    return this.get(key)
  }

  /**
   * The art for a table's file name that has *already* been composed, without
   * awaiting — for a caller whose own path is synchronous and cannot wait.
   */
  peekForFile(tree: FlatTree, fileName: string): FlatAnimation | null {
    const key = this.keyForFile(tree, fileName)
    return key === null ? null : this.composed.get(key) ?? null
  }

  /** Composes several table file names in parallel, for a caller's warm-up pass. */
  async loadForFiles(files: readonly { tree: FlatTree; fileName: string }[]): Promise<void> {
    await Promise.all(files.map((file) => this.getForFile(file.tree, file.fileName)))
  }

  /** How many animations have been composed. */
  get loaded(): number {
    return this.composed.size
  }

  /** The keys and file names neither the manifest nor this cache could answer. */
  get missing(): readonly string[] {
    return [...this.absent]
  }
}

// ---------------------------------------------------------------------------
// Which overlay a drawn effect stands in for
// ---------------------------------------------------------------------------

/**
 * The effect kinds the simulation draws, named after what each one is *for*.
 *
 * A list rather than a free string so the mapping below cannot silently lose an
 * effect: every kind the game spawns is here, and each one's art is either one
 * fixed overlay or none at all.
 */
export type EffectArtKind =
  | 'heal'
  | 'meleeHit'
  | 'heroHurt'
  | 'monsterDeath'
  | 'missileImpact'
  | 'missileBlocked'
  | 'nova'
  | 'levelUp'

/** A file name in one of the two flat trees, as the tables spell it. */
export interface FlatArtFile {
  readonly tree: FlatTree
  readonly fileName: string
}

/**
 * The effect kinds whose art is **one fixed overlay**, and the file that holds it.
 *
 * Read from `overlays.txt` rather than chosen by name: the row named `healing`
 * (`Filename` `OverlayH`, 17 frames) is what the five healing skills —
 * `ZakarumHeal`, `Resurrect`, `Bestow`, `Resurrect2`, `UberAncientsHeal` — put in
 * their `castoverlay` column, so it is the game's own heal visual and the honest
 * stand-in for this app's potion burst.
 *
 * ### The kinds that are *not* here, and why
 *
 * - `missileImpact` and `missileBlocked` are **not** a fixed file: what plays where
 *   a missile lands is the art of the missile that `missiles.txt` names in its
 *   `ExplosionMissile` column — `teethexplode` for the Amazon's Magic Arrow,
 *   `fireexplode` for her Fire Arrow — so the caller composes that per missile and
 *   passes it in rather than looking a name up here.
 * - `meleeHit` and `heroHurt` have no overlay to point at: a physical hit is drawn
 *   by the victim's own `gh` gethit animation plus the palette flash, which this app
 *   already plays (`hitFlash`), and `states.txt`'s `justhit` — the state a hit puts
 *   on the victim — names no overlay in any of its four `overlayN` columns.
 * - `monsterDeath` likewise: `monstats.txt` has no overlay column at all, and a
 *   monster's death *is* its `dd` animation.
 * - `nova` is this app's own ring for the skill in its second slot; that skill is
 *   the Amazon's Fire Arrow, whose `castoverlay`, `prgoverlay` and `srvoverlay`
 *   columns are all empty in `skills.txt`, so there is nothing to draw from.
 * - `levelUp` has no row anywhere in the tables: the game's level-up is a sound and
 *   the character's own animation.
 *
 * Those five stay drawn — an effect with no art here keeps the ring it has always
 * had rather than being given an animation that belongs to something else.
 */
export const EFFECT_ART_FILE: Readonly<Partial<Record<EffectArtKind, FlatArtFile>>> = {
  heal: { tree: 'overlays', fileName: 'OverlayH' },
}
