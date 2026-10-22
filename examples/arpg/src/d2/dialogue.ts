/**
 * The NPC dialogue tables.
 *
 * `local/lng/strings/vo.json` carries 1,802 lines keyed by where the game says
 * them, and the keys encode the speaker: `WarrivGossip1`, `AkaraGossip1`,
 * `KashyaGossip4`, `A1Q1AfterInitCharsiAlt`, `RogueSignpostGossip3`.
 *
 * ## The numeric field
 *
 * 866 of the lines carry a run of digits glued to the front of the text, and the
 * digits are not prose. In the classic table they are a separate field:
 *
 * ```
 * ...\0WarrivGossip1\0 5 1 \n I ' v e   b e e n   l e a d i n g ...
 * ```
 *
 * The field terminates with a newline, so what the JSON export wrote as
 * `"51I've been leading…"` is really `<field>51</field><text>I've been…`. The
 * numeric field only appears in the Latin localisations — none of the Chinese,
 * Korean or Japanese values have one — and it cuts mid-word ("…caravan across
 * the easte"), so it is a display hint about where the first line broke, not
 * text. It is parsed out and kept as {@link DialogueEntry.firstLineLength}.
 */

import { tableString, type TableRow } from './monsters'

export interface DialogueEntry {
  /** The table's key, e.g. `WarrivGossip6`. */
  key: string
  /** The line, with the leading formatting field removed. */
  text: string
  /**
   * The value of the leading formatting field, i.e. where the game broke the
   * first displayed line. Null when the line has no such field.
   */
  firstLineLength: number | null
  /** The speaker this line was attributed to, when one matched. */
  speaker: string | null
}

export interface DialogueIndex {
  entries: readonly DialogueEntry[]
  byKey: ReadonlyMap<string, DialogueEntry>
  /** Speakers the table has lines for, in the order they were supplied. */
  speakers: readonly string[]
  /** Lines attributed to a speaker, in table order. */
  forSpeaker(key: string): readonly DialogueEntry[]
}

/** The default language column when the caller does not name one. */
export const DEFAULT_LANGUAGE = 'enUS'

/**
 * A name the dialogue keys use that the roster does not spell the same way.
 *
 * These are not a guess. `tools/verify-world.ts` attributes every line and
 * reports what it cannot, and each entry below is one of those names. The counts
 * quoted are how many of the 865 NPC-addressed lines the entry recovers,
 * measured by removing it and re-running, so every entry is load-bearing.
 *
 * `speakers` lists the `monstats` ids the lines belong to. It is a list rather
 * than one id because the game ships a separate row per act for the same
 * character — Cain is `cain1` through `cain6` — and he says the same thing in
 * each. Every id gets the lines, so `forSpeaker` works for whichever variant an
 * area actually placed; the first is the one the line reports as its speaker.
 */
export interface DialogueAlias {
  /** The spelling a key uses. */
  readonly name: string
  /** The `monstats` ids these lines belong to; the first is reported. */
  readonly speakers: readonly string[]
  /** Why the roster does not already cover it. */
  readonly note: string
}

export const DIALOGUE_ALIASES: readonly DialogueAlias[] = [
  // `monstats` has cain1..cain6 and the npcs table has DeckardCain, so no roster
  // entry spells the name the keys use.
  { name: 'Cain', speakers: ['cain1', 'cain2', 'cain3', 'cain4', 'cain5', 'cain6'], note: '70 lines' },
  { name: 'CainAct2', speakers: ['cain2'], note: '5 lines; the act 2 variant' },
  { name: 'CainAct3', speakers: ['cain3'], note: '25 lines; the act 3 variant' },
  { name: 'CainAct4', speakers: ['cain4'], note: '2 lines; the act 4 variant' },
  { name: 'CainAct5', speakers: ['cain5'], note: '11 lines; the act 5 variant' },
  // The tables spell it "Qual-Kehk", which the keys do not contain.
  { name: 'QualKehk', speakers: ['qual-kehk'], note: '33 lines; the tables use a hyphen' },
  // Act 5's rescued NPC, absent from every table.
  { name: 'Anya', speakers: ['anya'], note: '31 lines; no monstats row' },
  // The tables spell it "Greiz".
  { name: 'Griez', speakers: ['greiz'], note: '14 lines; the tables use a z' },
  { name: 'PalaceGuard', speakers: ['act2guard1', 'act2guard2', 'act2guard4', 'act2guard5'], note: '5 lines' },
  { name: 'RogueSignpost', speakers: ['rogue1'], note: '5 lines; said by a signpost, not a monster' },
  { name: 'Ancients', speakers: ['ancientbarb1', 'ancientbarb2', 'ancientbarb3'], note: '2 lines' },
  { name: 'HellsAngel', speakers: ['hratli'], note: '2 lines; Hratli under his act 3 alias' },
  { name: 'Izual', speakers: ['izualghost'], note: '1 line; said by the ghost, not the boss' },
  { name: 'Narrator', speakers: [], note: '1 line; quest narration with no entity' },
  { name: 'QuestTome', speakers: ['tower-tome'], note: '1 line; said by the tower tome object' },
  // The remaining aliases carry a single line each; counting lines that only
  // that entry can catch (a key with no longer alias name in it) is what the
  // numbers above measure.
]

export interface DialogueEntry {
  /** The table's key, e.g. `WarrivGossip6`. */
  key: string
  /** The line, with the leading formatting field removed. */
  text: string
  /**
   * The value of the leading formatting field, i.e. where the game broke the
   * first displayed line. Null when the line has no such field.
   */
  firstLineLength: number | null
  /** The speaker this line was attributed to, when one matched. */
  speaker: string | null
}

export interface DialogueIndex {
  entries: readonly DialogueEntry[]
  byKey: ReadonlyMap<string, DialogueEntry>
  /** Speakers the table has lines for, in the order they were supplied. */
  speakers: readonly string[]
  /** Lines attributed to a speaker, in table order. */
  forSpeaker(key: string): readonly DialogueEntry[]
}

/**
 * Splits `<digits><text>` into the formatting field and the text.
 *
 * The field is only taken when digits are followed by something, so a line that
 * is nothing but a number keeps its text intact.
 */
export function splitDialogueValue(value: string): { text: string; firstLineLength: number | null } {
  let end = 0
  while (end < value.length && value[end] >= '0' && value[end] <= '9') end += 1
  if (end === 0 || end === value.length) return { text: value, firstLineLength: null }
  return { text: value.slice(end), firstLineLength: Number(value.slice(0, end)) }
}

/** A name to look for, and the roster entries it should be reported as. */
interface SpeakerForm {
  form: string
  /** The id the line reports as its speaker. */
  reported: string
  /** Every id whose bucket the line belongs in. */
  owners: readonly string[]
  /** Trimmed variants lose a tie, so a full name always beats an abbreviation. */
  trimmed: boolean
}

/**
 * Every spelling a speaker can be recognised by.
 *
 * `monstats` ids carry a variant suffix — `warriv1`, `cain1`..`cain6` — while
 * the dialogue keys use the base name (`WarrivGossip1`, `CainGossip1`). So each
 * roster id is also offered with its trailing digits removed, which is what
 * bridges the two spellings without needing the alias table for the plain cases.
 */
function speakerForms(candidates: readonly string[]): readonly SpeakerForm[] {
  const forms: SpeakerForm[] = []
  for (const candidate of candidates) {
    if (candidate === '') continue
    forms.push({ form: candidate, reported: candidate, owners: [candidate], trimmed: false })
    const trimmed = candidate.replace(/\d+$/, '')
    if (trimmed !== '' && trimmed !== candidate) {
      forms.push({ form: trimmed, reported: candidate, owners: [candidate], trimmed: true })
    }
  }
  for (const alias of DIALOGUE_ALIASES) {
    if (alias.name === '') continue
    const reported = alias.speakers[0] ?? alias.name
    // An alias with no monster behind it still needs a bucket of its own, so the
    // line is grouped and countable rather than dropped.
    const owners = alias.speakers.length > 0 ? alias.speakers : [alias.name]
    forms.push({ form: alias.name, reported, owners, trimmed: false })
  }
  return forms
}

interface Attribution {
  reported: string
  owners: readonly string[]
}

/**
 * Attributes a line to a speaker by the longest name that appears in its key,
 * case-insensitively.
 *
 * Longest rather than first, because the roster contains both `Warriv` and
 * `Wariv`, `Jerhyn` and `jerhyn`, and `Cain` and `CainAct3`: a shorter match
 * would steal lines from the longer name. A tie goes to the untrimmed spelling,
 * so `CainAct3Gossip1` is act 3's Cain rather than the shared `Cain` lines. The
 * match may sit anywhere, because quest lines put the speaker in the middle
 * (`A1Q1AfterInitCharsiAlt`).
 */
function attribute(key: string, forms: readonly SpeakerForm[]): Attribution | null {
  const lowered = key.toLowerCase()
  let best: SpeakerForm | null = null
  for (const form of forms) {
    if (!lowered.includes(form.form.toLowerCase())) continue
    if (
      best === null ||
      form.form.length > best.form.length ||
      (form.form.length === best.form.length && best.trimmed && !form.trimmed)
    ) {
      best = form
    }
  }
  return best === null ? null : { reported: best.reported, owners: best.owners }
}

/**
 * Builds the index.
 *
 * `candidates` are the `monstats` ids a line may be attributed to, and
 * {@link DIALOGUE_ALIASES} is always added to them. They must be ids: the caller
 * asks `forSpeaker` about an NPC an area actually placed, so a bucket keyed by
 * anything else cannot be reached. The string tables are not usable as
 * candidates for that reason — their keys are names which, being longer matches
 * than an id with its act suffix trimmed, would take the lines with them.
 *
 * A line that matches nothing keeps `speaker === null`, which is right: 880 of
 * the 1,802 lines are the player's and the mercenaries' own barks
 * (`Playersubtitles00`, `ama_act1_entry_wilderness`) and quest narration with no
 * speaker at all.
 */
export function parseDialogue(
  rows: readonly TableRow[],
  candidates: readonly string[],
  language: string = DEFAULT_LANGUAGE,
): DialogueIndex {
  const entries: DialogueEntry[] = []
  const byKey = new Map<string, DialogueEntry>()
  const speakers: string[] = []
  const bySpeaker = new Map<string, DialogueEntry[]>()
  const names = speakerForms(candidates)

  for (const row of rows) {
    const key = tableString(row.Key)
    if (key === null) continue
    const raw = tableString(row[language]) ?? tableString(row[DEFAULT_LANGUAGE])
    if (raw === null) continue
    const { text, firstLineLength } = splitDialogueValue(raw)
    const attribution = attribute(key, names)
    const entry: DialogueEntry = { key, text, firstLineLength, speaker: attribution?.reported ?? null }
    entries.push(entry)
    byKey.set(key, entry)
    for (const owner of attribution?.owners ?? []) {
      const bucket = bySpeaker.get(owner)
      if (bucket) bucket.push(entry)
      else {
        bySpeaker.set(owner, [entry])
        speakers.push(owner)
      }
    }
  }

  return {
    entries,
    byKey,
    speakers,
    forSpeaker: (key: string): readonly DialogueEntry[] => bySpeaker.get(key) ?? [],
  }
}
