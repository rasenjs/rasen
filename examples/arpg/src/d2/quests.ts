/**
 * The quests: what they are called, what their log steps say, and which dialogue
 * belongs to each one.
 *
 * Three of the retail exports describe the same five acts, and none of them is
 * complete on its own:
 *
 * - `gamedata_quests.json` lists the act's quests with their index and name
 *   ("Den of Evil", "Sisters to the Slaughter") and nothing else;
 * - `strings_quests.json` carries the quest log: the same names again, plus one
 *   row per log step ("Kill all the monsters in the Den."), keyed by act and
 *   quest;
 * - `strings_vo.json` carries the spoken lines, keyed by act, quest, phase and
 *   speaker (`A1Q1SuccessfulAkara`), which is what says *whose* quest a line is.
 *
 * ## The quest-string grammar
 *
 * ```
 * qstsa <act 1-5> q <quest 0-9> [ <step 0-9> [ <variant> ] ]
 * ```
 *
 * 153 of the table's 159 keys match it (96.226%). A key with no step is the row
 * that **names** the quest (`qstsa1q1` = "Den of Evil", `qstsa2q0` = "Act 2
 * Prologue"); a key with a step is one line of that quest's log. The step is a
 * *single* digit and the variant is a single trailing character, which is what
 * makes `qstsa1q140` step 4 variant `0` rather than step 140 — and the text
 * proves it: step 4 is "Monsters remaining: %d" and variant `0` of the same step
 * is "One monster left.", the singular form of the same counter, while step 3 of
 * that quest is an empty string, which is how the table hides a step. Reading the
 * digits as a run instead would make act 2's log steps 11, 12, 13, 21…, i.e. it
 * would leave a quest's own steps out of order.
 *
 * The six keys that do not match are listed, not hidden:
 *
 * - `qstsa1qt` / `qstsa1qt0` are act 1's "The Townspeople" block, the act's
 *   non-quest section: the quest slot is the letter `t`, so there is no quest
 *   for them to belong to;
 * - `qsta5q11` … `qsta5q14` are act 5 quest 1 ("Siege on Harrogath")'s four log
 *   steps spelt without the `s` in `qstsa`. The four texts are the quest's log in
 *   order, so the keys are a typo in the shipped table rather than a different
 *   scheme; they are recovered under an explicitly named exception so the quest
 *   keeps its steps.
 *
 * ## The voice grammar, and the phases it actually uses
 *
 * ```
 * A <act> Q <quest> <phase> [ <qualifier> ] <speaker>
 * ```
 *
 * All 529 quest-addressed lines split under it. The phases are not invented:
 * {@link VOICE_PHASES} is every head that occurs in the table, with its count.
 * Note that they are not all one word — `QuestSuccessful` (the spelling act 1
 * quest 4 uses for what every other quest calls `Successful`), `FoundAnya`,
 * `RescuedByHero`, `TragedyOfTristram` and `ExpansionSuccess` are the state the
 * key's author wrote, and they are kept as written rather than folded into a
 * shorter phase, because folding them would be this file's opinion rather than
 * the table's data. A speaker's spelling can carry a `VA` suffix (an alternate
 * take: `A3Q5AfterInitNatalyaVA`), which is part of the speaker token.
 *
 * ## The state a key glues in front of the name
 *
 * 32 of the 529 keys put a qualifier between the phase and the speaker, because
 * the phase alone does not say enough: `A3Q4Init1CainAct3` is step 1 of act 3
 * quest 4's opening, `A2Q2EarlyReturnCapCain` is Cain's line for the moment the
 * player holds the *Cap* of the Horadric Staff, `A4Q3InitHasStoneCain` his line
 * for having Mephisto's Soulstone and `A4Q3InitNoStoneCain` for not having it.
 * The words are the quest's own items — `Cap`, `Stave`, `Cube`, `Staff`,
 * `Heart`, `Eye`, `Brain`, `Flail`, `Scroll` — which is what confirms the shape
 * rather than a guess about it.
 *
 * A leading run of digits is split off by {@link parseVoiceQuestKey} itself, as
 * digits cannot begin a name. A word qualifier can only be told from a name by
 * the table's own vocabulary of speaker tokens, so it is split in
 * {@link parseQuests}, which has the whole table: the speaker is the longest
 * proper suffix of a key's remainder that occurs as a whole remainder somewhere
 * in the same table. Every line keeps the qualifier it was split from, so a
 * consumer can see which keys are qualified and by what.
 *
 * ## What is not here
 *
 * The conditions. `vo.json` says who says what and `quests.txt` says what the
 * quests are called, but no export says "kill Andariel to finish this quest":
 * that lives in the game's compiled quest scripts. So the log's *state* is an
 * approximation built from the four things a simulation can observe, and
 * {@link questRequirement} documents each number it uses as a stand-in.
 */

import { DEFAULT_LANGUAGE, splitDialogueValue, type DialogueEntry, type DialogueIndex } from './dialogue'
import { tableString, type TableRow } from './monsters'

/** One act's quests, the shape `gamedata_quests.json` has. */
export interface ActQuestList {
  readonly act: number
  readonly quests: readonly ActQuestRow[]
}

export interface ActQuestRow {
  readonly index: number
  readonly name: string
  readonly nameZh?: string
}

/** How a key matched {@link QUEST_STRING_PATTERN}. */
export type QuestKeyMatch = 'grammar' | 'act5-typo' | 'townspeople'

/** The strict quest-string grammar: `qstsa<act>q<quest>[<step>[<variant>]]`. */
export const QUEST_STRING_PATTERN = /^qstsa(\d)q(\d)(\d)?([a-z0-9])?$/

/**
 * The grammar act 5 quest 1 is misspelt under: the same key with the `s` of
 * `qstsa` missing. Named rather than folded into {@link QUEST_STRING_PATTERN} so
 * the four keys stay visible as exceptions.
 */
export const QUEST_STRING_TYPO_PATTERN = /^qsta(\d)q(\d)(\d)?([a-z0-9])?$/

/** The act's non-quest block: `qstsa1qt`, `qstsa1qt0`. */
export const QUEST_STRING_TOWNSPEOPLE_PATTERN = /^qstsa(\d)qt(\d)?$/

/** One row of `strings_quests.json`, read. */
export interface QuestStringEntry {
  readonly key: string
  readonly act: number
  /** The quest index the key addresses; `-1` for the act's townspeople block. */
  readonly quest: number
  /** The log step, or null for the row that names the quest. */
  readonly step: number | null
  /** The single-character variant on a step row, or null. */
  readonly variant: string | null
  readonly match: QuestKeyMatch
  readonly text: string
}

/** A key that names no quest, kept so callers can report it. */
export interface UnmatchedKey {
  /** The export the key came from, e.g. `strings_quests`. */
  readonly table: string
  readonly key: string
  readonly why: string
}

/**
 * The phases the voice keys use, longest first so the longest spelling wins when
 * two of them start alike. The counts are over the 529 quest-addressed lines.
 */
export const VOICE_PHASES: readonly string[] = [
  'AfterInit', // 155
  'EarlyReturn', // 163
  'QuestSuccessful', // 6
  'ExpansionSuccess', // 2
  'RescuedByHero', // 1
  'RescuedByRogues', // 1
  'TragedyOfTristram', // 1
  'Instructions', // 2
  'FoundAnya', // 5
  'Successful', // 161
  'Reward', // 1
  'Init' // 31
]

/** The voice grammar: `A<act>Q<quest><phase><speaker>`. */
export const VOICE_KEY_PATTERN = /^A(\d)Q(\d)(.+)$/

/** One quest-addressed voice key, read. */
export interface VoiceQuestKey {
  readonly key: string
  readonly act: number
  readonly quest: number
  readonly phase: string
  /**
   * The state glued between the phase and the name: the digits of
   * `A3Q4Init1CainAct3`, or — once the table's vocabulary has been applied in
   * {@link parseQuests} — a word like the `Cap` of `A2Q2EarlyReturnCapCain`.
   */
  readonly qualifier: string | null
  /** The spelling the key uses for the speaker, e.g. `CainAct3`. */
  readonly speaker: string
}

/** One spoken line of a quest. */
export interface QuestLine {
  readonly key: string
  readonly text: string
  readonly phase: string
  /** The state glued in front of the name, or null when the key has none. */
  readonly qualifier: string | null
  /** The speaker spelling from the key. */
  readonly speaker: string
  /**
   * The `monstats` id the line was attributed to, when the caller passed a
   * parsed dialogue index. Null for a build that read the rows raw.
   */
  readonly speakerId: string | null
}

/** A quest's lines for one phase, in table order. */
export interface QuestPhase {
  readonly name: string
  readonly lines: readonly QuestLine[]
}

/** One line of the quest log, from `strings_quests.json`. */
export interface QuestObjective {
  readonly key: string
  readonly step: number
  readonly variant: string | null
  readonly text: string
}

export interface Quest {
  readonly act: number
  readonly index: number
  readonly name: string
  readonly nameZh: string
  /** The string-table key that names the quest, when the table has one. */
  readonly nameKey: string | null
  readonly objectives: readonly QuestObjective[]
  /** The phases the quest has lines for, in first-appearance order. */
  readonly phases: readonly QuestPhase[]
  /** Every line of the quest, in table order. */
  readonly lines: readonly QuestLine[]
  /** `monstats` ids with a line for this quest, in first-line order. */
  readonly speakers: readonly string[]
  /** Key spellings of the speakers, when no id could be resolved. */
  readonly speakerNames: readonly string[]
}

/** Phase name → how many keys declare it. */
export interface PhaseCount {
  readonly name: string
  readonly count: number
}

export interface QuestStats {
  readonly quests: number
  readonly questStringKeys: number
  readonly questStringMatched: number
  readonly questStringExceptions: number
  readonly questStringUnmatched: number
  readonly voiceLines: number
  /** Keys that address an act and a quest, i.e. match `^A<digit>Q<digit>`. */
  readonly voiceQuestKeys: number
  readonly voiceQuestKeysMatched: number
  readonly voiceQuestKeysUnmatched: number
  readonly phaseCounts: readonly PhaseCount[]
  /** Qualifier the key glued before the name → how many keys use it. */
  readonly qualifiers: readonly PhaseCount[]
  readonly qualifiedLines: number
  readonly questsWithLines: number
  /** `A<act>Q<quest> <name>` for every quest with no line at all. */
  readonly questsWithoutLines: readonly string[]
  /** Mean phases per quest, over every quest. */
  readonly phasesPerQuest: number
  /** Mean lines per quest, over every quest. */
  readonly linesPerQuest: number
  /** Distinct speakers (ids, or spellings when none resolved) with quest lines. */
  readonly speakers: number
  /** Quests whose name row and `gamedata_quests.json` row disagree. */
  readonly nameDisagreements: readonly string[]
}

export interface QuestIndex {
  readonly quests: readonly Quest[]
  readonly acts: readonly number[]
  /** Every quest-string key that was read, exceptions included. */
  readonly questStrings: readonly QuestStringEntry[]
  readonly unmatched: readonly UnmatchedKey[]
  readonly stats: QuestStats
  forAct(act: number): readonly Quest[]
  quest(act: number, index: number): Quest | null
}

/** Where the quests are read from. Each source is independent and optional. */
export interface QuestSources {
  /** Rows from `strings_quests.json`: the log steps, and the names again. */
  readonly questStrings?: readonly TableRow[] | null
  /** Rows from `strings_vo.json`, or the index already parsed from them. */
  readonly voice?: readonly TableRow[] | DialogueIndex | null
  /** Rows from `gamedata_quests.json`: the act's quest list. */
  readonly actQuests?: readonly ActQuestList[] | null
  /** Language column for the quest strings. */
  readonly language?: string
}

/**
 * Reads one quest-string key.
 *
 * Returns null for a key that names no quest, which is what the callers report;
 * {@link QuestStringEntry.match} says which of the three spellings matched.
 */
export function parseQuestStringKey(
  key: string,
  text = '',
): QuestStringEntry | null {
  const strict = QUEST_STRING_PATTERN.exec(key)
  if (strict) {
    return {
      key,
      act: Number(strict[1]),
      quest: Number(strict[2]),
      step: strict[3] === undefined ? null : Number(strict[3]),
      variant: strict[4] ?? null,
      match: 'grammar',
      text,
    }
  }
  const typo = QUEST_STRING_TYPO_PATTERN.exec(key)
  if (typo) {
    return {
      key,
      act: Number(typo[1]),
      quest: Number(typo[2]),
      step: typo[3] === undefined ? null : Number(typo[3]),
      variant: typo[4] ?? null,
      match: 'act5-typo',
      text,
    }
  }
  const townspeople = QUEST_STRING_TOWNSPEOPLE_PATTERN.exec(key)
  if (townspeople) {
    return {
      key,
      act: Number(townspeople[1]),
      // The act's non-quest block has no quest slot to address: `t` is not a
      // quest index, so it is marked rather than guessed at.
      quest: -1,
      step: townspeople[2] === undefined ? null : Number(townspeople[2]),
      variant: null,
      match: 'townspeople',
      text,
    }
  }
  return null
}

/**
 * Reads one voice key: `A<act>Q<quest><phase><qualifier><speaker>`.
 *
 * The phase is the longest head from {@link VOICE_PHASES} the key starts with
 * after the act and quest; everything after it is the name, less a leading run
 * of digits, which cannot begin a name and is therefore a state qualifier
 * (`A3Q4Init1CainAct3`). A word qualifier needs the table's vocabulary and is
 * split by {@link parseQuests} instead.
 *
 * Returns null when the key addresses no act and quest, carries no phase, or has
 * no name left.
 */
export function parseVoiceQuestKey(key: string): VoiceQuestKey | null {
  const addressed = VOICE_KEY_PATTERN.exec(key)
  if (addressed === null) return null
  const rest = addressed[3]
  let phase: string | null = null
  for (const candidate of VOICE_PHASES) {
    if (rest.startsWith(candidate)) {
      phase = candidate
      break
    }
  }
  if (phase === null) return null
  let speaker = rest.slice(phase.length)
  let qualifier: string | null = null
  const digits = /^\d+/.exec(speaker)
  if (digits !== null) {
    // A remainder that is nothing but digits has no name in it, so the key
    // addresses no speaker.
    if (digits[0].length === speaker.length) return null
    qualifier = digits[0]
    speaker = speaker.slice(digits[0].length)
  }
  if (speaker === '') return null
  return {
    key,
    act: Number(addressed[1]),
    quest: Number(addressed[2]),
    phase,
    qualifier,
    speaker
  }
}

/**
 * Splits a word qualifier off a name using the rest of the table.
 *
 * The speaker is the longest proper suffix of the key's remainder that occurs as
 * a whole remainder elsewhere in the same table. Only proper suffixes are tried,
 * so a name that is itself a whole remainder elsewhere — `Anya` in
 * `A5Q3FoundAnyaAnya` — keeps all of itself.
 */
function splitQualifier(
  remainder: string,
  vocabulary: ReadonlySet<string>,
): { qualifier: string | null; speaker: string } {
  for (let i = 1; i < remainder.length; i += 1) {
    const suffix = remainder.slice(i)
    if (vocabulary.has(suffix)) return { qualifier: remainder.slice(0, i), speaker: suffix }
  }
  return { qualifier: null, speaker: remainder }
}

/** A voice line reduced to what a quest needs from it. */
interface VoiceLine {
  readonly key: string
  readonly text: string
  readonly speakerId: string | null
}

/**
 * True when the caller passed the rows rather than the index built from them.
 *
 * Both shapes are accepted because the app already holds the index the voice
 * table was parsed into (which carries the speaker id each line was attributed
 * to) while the verifier and the tests start from the rows.
 */
function isDialogueIndex(source: readonly TableRow[] | DialogueIndex): source is DialogueIndex {
  return !Array.isArray(source)
}

function readVoice(source: readonly TableRow[] | DialogueIndex, language: string): readonly VoiceLine[] {
  if (isDialogueIndex(source)) {
    return source.entries.map((entry: DialogueEntry) => ({
      key: entry.key,
      text: entry.text,
      speakerId: entry.speaker
    }))
  }
  const lines: VoiceLine[] = []
  for (const row of source) {
    const key = tableString(row.Key)
    if (key === null) continue
    const raw = tableString(row[language]) ?? tableString(row[DEFAULT_LANGUAGE])
    if (raw === null) continue
    lines.push({ key, text: splitDialogueValue(raw).text, speakerId: null })
  }
  return lines
}

/**
 * The quests of one act, in the order the act tables list them.
 *
 * The names come from `gamedata_quests.json` when it was supplied, because that
 * is the table the rest of the app already reads; a build without it still gets a
 * quest list, built from the string table's own name rows, so the log is never
 * empty just because one of the two exports is missing.
 */
function questNames(sources: QuestSources, questStrings: readonly QuestStringEntry[]): ActQuestList[] {
  if (sources.actQuests && sources.actQuests.length > 0) {
    return sources.actQuests.map((group) => ({ act: group.act, quests: [...group.quests] }))
  }
  const byAct = new Map<number, ActQuestRow[]>()
  for (const entry of questStrings) {
    if (entry.match === 'townspeople' || entry.step !== null) continue
    const rows = byAct.get(entry.act)
    const row: ActQuestRow = { index: entry.quest, name: entry.text }
    if (rows) rows.push(row)
    else byAct.set(entry.act, [row])
  }
  return [...byAct.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([act, quests]) => ({
      act,
      quests: [...quests].sort((a, b) => a.index - b.index)
    }))
}

/**
 * Builds the quest index.
 *
 * Every input is optional and independently useful, which is what lets the app
 * pass the two tables it already has (the dialogue index and the quest list) and
 * the verifier pass all three.
 */
export function parseQuests(sources: QuestSources = {}): QuestIndex {
  const language = sources.language ?? DEFAULT_LANGUAGE
  const unmatched: UnmatchedKey[] = []

  const questStringRows = sources.questStrings ?? []
  const questStrings: QuestStringEntry[] = []
  let questStringMatched = 0
  let questStringExceptions = 0
  for (const row of questStringRows) {
    const key = tableString(row.Key)
    if (key === null) continue
    const raw = tableString(row[language]) ?? tableString(row[DEFAULT_LANGUAGE]) ?? ''
    const entry = parseQuestStringKey(key, raw)
    if (entry === null) {
      unmatched.push({ table: 'strings_quests', key, why: 'not qstsa<act>q<quest>[<step>[<variant>]]' })
      continue
    }
    questStrings.push(entry)
    if (entry.match === 'grammar') questStringMatched += 1
    else questStringExceptions += 1
  }

  const voice = sources.voice ?? null
  const voiceLines: readonly VoiceLine[] = voice === null ? [] : readVoice(voice, language)
  const phaseCounts = new Map<string, number>()
  const qualifierCounts = new Map<string, number>()
  /** act:quest → lines, in table order. */
  const linesByQuest = new Map<string, QuestLine[]>()
  let voiceQuestKeys = 0
  let voiceQuestKeysMatched = 0
  let qualifiedLines = 0
  const seenSpeakers = new Set<string>()

  // The table is read twice: once to collect its own vocabulary of speaker
  // tokens, which is what distinguishes a word qualifier from a name, and once
  // to build the lines with it.
  const addressed: Array<{ line: VoiceLine; parsed: VoiceQuestKey }> = []
  const vocabulary = new Set<string>()
  for (const line of voiceLines) {
    if (!/^A\dQ\d/.test(line.key)) continue
    voiceQuestKeys += 1
    const parsed = parseVoiceQuestKey(line.key)
    if (parsed === null) {
      unmatched.push({ table: 'strings_vo', key: line.key, why: 'no phase from the phase vocabulary' })
      continue
    }
    voiceQuestKeysMatched += 1
    addressed.push({ line, parsed })
    vocabulary.add(parsed.speaker)
  }

  for (const { line, parsed } of addressed) {
    phaseCounts.set(parsed.phase, (phaseCounts.get(parsed.phase) ?? 0) + 1)
    const split =
      parsed.qualifier === null
        ? splitQualifier(parsed.speaker, vocabulary)
        : { qualifier: null, speaker: parsed.speaker }
    const qualifier = parsed.qualifier ?? split.qualifier
    if (qualifier !== null) {
      qualifiedLines += 1
      qualifierCounts.set(qualifier, (qualifierCounts.get(qualifier) ?? 0) + 1)
    }
    const bucket = `${parsed.act}:${parsed.quest}`
    const questLine: QuestLine = {
      key: line.key,
      text: line.text,
      phase: parsed.phase,
      qualifier,
      speaker: split.speaker,
      speakerId: line.speakerId
    }
    const lines = linesByQuest.get(bucket)
    if (lines) lines.push(questLine)
    else linesByQuest.set(bucket, [questLine])
    if (line.speakerId !== null) seenSpeakers.add(line.speakerId)
    else seenSpeakers.add(split.speaker)
  }

  const groups = questNames(sources, questStrings)
  const nameRows = new Map<string, QuestStringEntry>()
  for (const entry of questStrings) {
    if (entry.step !== null || entry.match === 'townspeople') continue
    nameRows.set(`${entry.act}:${entry.quest}`, entry)
  }

  const quests: Quest[] = []
  const nameDisagreements: string[] = []
  for (const group of [...groups].sort((a, b) => a.act - b.act)) {
    for (const row of [...group.quests].sort((a, b) => a.index - b.index)) {
      const bucket = `${group.act}:${row.index}`
      const lines = linesByQuest.get(bucket) ?? []
      const nameKey = nameRows.get(bucket) ?? null
      if (nameKey !== null && nameKey.text !== '' && nameKey.text !== row.name) {
        nameDisagreements.push(
          `A${group.act}Q${row.index}: quests.txt "${row.name}" vs strings_quests "${nameKey.text}"`,
        )
      }
      quests.push({
        act: group.act,
        index: row.index,
        name: row.name,
        nameZh: row.nameZh ?? '',
        nameKey: nameKey?.key ?? null,
        objectives: questStrings
          .filter((entry) => entry.act === group.act && entry.quest === row.index && entry.step !== null)
          .map((entry) => ({
            key: entry.key,
            step: entry.step ?? 0,
            variant: entry.variant,
            text: entry.text
          }))
          .sort((a, b) => a.step - b.step || (a.variant ?? '').localeCompare(b.variant ?? '')),
        phases: groupPhases(lines),
        lines,
        speakers: groupSpeakers(lines, true),
        speakerNames: groupSpeakers(lines, false)
      })
    }
  }

  // A voice key that addresses a quest the act tables do not list would be
  // dropped silently, so it is reported instead.
  for (const [bucket, lines] of linesByQuest) {
    const [act, index] = bucket.split(':').map(Number)
    const known = quests.some((quest) => quest.act === act && quest.index === index)
    if (known) continue
    unmatched.push({
      table: 'strings_vo',
      key: lines[0].key,
      why: `names act ${act} quest ${index}, which the act tables do not list`
    })
  }

  const questsWithoutLines = quests
    .filter((quest) => quest.lines.length === 0)
    .map((quest) => `A${quest.act}Q${quest.index} ${quest.name}`)
  const totalLines = quests.reduce((sum, quest) => sum + quest.lines.length, 0)
  const totalPhases = quests.reduce((sum, quest) => sum + quest.phases.length, 0)
  const stats: QuestStats = {
    quests: quests.length,
    questStringKeys: questStringRows.length,
    questStringMatched,
    questStringExceptions,
    questStringUnmatched: questStringRows.length - questStringMatched - questStringExceptions,
    voiceLines: voiceLines.length,
    voiceQuestKeys,
    voiceQuestKeysMatched,
    voiceQuestKeysUnmatched: voiceQuestKeys - voiceQuestKeysMatched,
    phaseCounts: [...phaseCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    qualifiers: [...qualifierCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    qualifiedLines,
    questsWithLines: quests.length - questsWithoutLines.length,
    questsWithoutLines,
    phasesPerQuest: quests.length === 0 ? 0 : totalPhases / quests.length,
    linesPerQuest: quests.length === 0 ? 0 : totalLines / quests.length,
    speakers: seenSpeakers.size,
    nameDisagreements
  }

  return {
    quests,
    acts: [...new Set(quests.map((quest) => quest.act))].sort((a, b) => a - b),
    questStrings,
    unmatched,
    stats,
    forAct: (act: number): readonly Quest[] => quests.filter((quest) => quest.act === act),
    quest: (act: number, index: number): Quest | null =>
      quests.find((quest) => quest.act === act && quest.index === index) ?? null
  }
}

/** Groups a quest's lines by phase, phases in the order they first appear. */
function groupPhases(lines: readonly QuestLine[]): readonly QuestPhase[] {
  const byPhase = new Map<string, QuestLine[]>()
  for (const line of lines) {
    const bucket = byPhase.get(line.phase)
    if (bucket) bucket.push(line)
    else byPhase.set(line.phase, [line])
  }
  return [...byPhase.entries()].map(([name, phaseLines]) => ({ name, lines: phaseLines }))
}

/** A quest's speakers, either as resolved ids or as the keys' own spellings. */
function groupSpeakers(lines: readonly QuestLine[], resolved: boolean): readonly string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const name = resolved ? line.speakerId : line.speaker
    if (name === null || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

// -- what "complete" can mean ------------------------------------------------

/**
 * The states the app can tell apart for a quest.
 *
 * Three, not the game's own count: the scripts that say "you have the scroll but
 * not the Cairn Stones" are compiled, so all the app can see is whether the quest
 * has been opened, whether its stands-in conditions have been met, and nothing
 * else.
 */
export type QuestState = 'unstarted' | 'active' | 'done'

/**
 * Monsters the hero must have killed for each step of an act's quest ladder.
 *
 * A stand-in. The tables do not say how many monsters a quest needs; the game's
 * scripts spawn their own and count their own.
 */
export const KILLS_PER_QUEST = 4

/**
 * What the app treats as a quest's observable requirements.
 *
 * **These are approximations of the game's own quest scripts, not a
 * reimplementation of them.** No export states a quest's condition — `vo.json`
 * gives the lines and `quests.txt` the names, and the conditions are compiled —
 * so each field below is chosen from what the simulation can actually observe:
 *
 * - `giver` — the speaker of the quest's first `Init` line. This one is real data:
 *   the key says who opens the quest (`A1Q1InitAkara` is Akara's), so the app
 *   makes talking to that NPC the thing that starts it.
 * - `level` — the hero's level, as `1 + index`: the act's quests are an ordered
 *   ladder and the hero climbs it as they level.
 * - `kills` — the monsters killed, as `KILLS_PER_QUEST × index`.
 * - `boss` — the area's superunique, required only by the act's *last* quest,
 *   which is the one the game ends an act with ("Sisters to the Slaughter").
 *
 * A quest with a `giver` that the current area does not place can never be
 * opened by talking, so callers must treat "the giver is not here" as satisfied
 * or the log would stall; {@link questState} does exactly that.
 */
export interface QuestRequirement {
  /** The `monstats` id whose first `Init` line opens the quest, or null. */
  readonly giver: string | null
  /** The key's own spelling for the giver, for a report. */
  readonly giverName: string | null
  readonly level: number
  readonly kills: number
  readonly boss: boolean
}

export function questRequirement(quest: Quest, actQuestCount: number): QuestRequirement {
  const init = quest.phases.find((phase) => phase.name === 'Init')
  const opener = init?.lines[0] ?? null
  return {
    giver: opener?.speakerId ?? null,
    giverName: opener?.speaker ?? null,
    level: 1 + quest.index,
    kills: KILLS_PER_QUEST * quest.index,
    boss: quest.index === actQuestCount - 1
  }
}

/** What the simulation has observed, which is all the state a quest can have. */
export interface QuestProgress {
  readonly talkedTo: ReadonlySet<string>
  readonly level: number
  readonly kills: number
  readonly bossSlain: boolean
  /** The `monstats` ids the current area placed, so an absent giver is skipped. */
  readonly placedSpeakers?: ReadonlySet<string>
}

export function questState(
  requirement: QuestRequirement,
  progress: QuestProgress,
): QuestState {
  const here = progress.placedSpeakers
  // Talking is required only when the quest declares a giver and the area
  // actually placed them: a giver who is not here cannot be spoken to, and a
  // quest that declares no giver has nothing to open it.
  const wantsTalk =
    requirement.giver !== null && (here === undefined || here.has(requirement.giver))
  const started = !wantsTalk || progress.talkedTo.has(requirement.giver ?? '')
  if (!started) return 'unstarted'
  const met =
    progress.level >= requirement.level &&
    progress.kills >= requirement.kills &&
    (!requirement.boss || progress.bossSlain)
  return met ? 'done' : 'active'
}

/**
 * The phases the dialogue box shows first, per state.
 *
 * A display order, not the game's script order: it is the order the keys' own
 * phase names are read in, chosen so the line that matches what the player has
 * just done comes first — `Init` before the quest is taken, the "you have not
 * finished yet" phases while it is open, the thanks afterwards. The one-off
 * phases the table uses once each (`FoundAnya`, `Reward`, `RescuedByHero`) are
 * placed where their keys occur in the game rather than dropped.
 */
const STATE_PHASES: Record<QuestState, readonly string[]> = {
  unstarted: ['Init', 'Instructions', 'AfterInit', 'EarlyReturn'],
  active: ['AfterInit', 'EarlyReturn', 'FoundAnya', 'Instructions', 'Init'],
  done: [
    'Successful',
    'QuestSuccessful',
    'ExpansionSuccess',
    'Reward',
    'RescuedByHero',
    'RescuedByRogues',
    'TragedyOfTristram'
  ]
}

/**
 * Reorders a speaker's lines for the quest the player is on.
 *
 * The game talks about the quest in hand, which is why the voice keys carry the
 * quest at all: Akara has an `A1Q1Init` line, an `A1Q1Successful` line and her
 * ordinary gossip, and which of them she opens with depends on the quest. So the
 * lines whose key names the current quest come first — the ones for the state the
 * quest is in ahead of the rest of its phases — and the speaker's other lines
 * follow in table order, because a build with no quest cannot tell them apart.
 *
 * A line whose key names no quest keeps its place at the end: 1,273 of the
 * table's lines are gossip, class barks or quest narration and belong to no quest
 * at all.
 */
export function orderSpeakerLines(
  lines: readonly DialogueEntry[],
  quest: Quest | null,
  state: QuestState,
): readonly DialogueEntry[] {
  if (quest === null || lines.length === 0) return lines
  const ladder = STATE_PHASES[state]
  /** The rank a line of the quest's own, but not of a phase in the ladder, takes. */
  const otherPhase = ladder.length
  /** The rank every line that belongs to no quest, or to another one, takes. */
  const foreign = otherPhase + 1
  const buckets = new Map<number, DialogueEntry[]>()
  const push = (rank: number, line: DialogueEntry): void => {
    const bucket = buckets.get(rank)
    if (bucket) bucket.push(line)
    else buckets.set(rank, [line])
  }
  for (const line of lines) {
    const key = parseVoiceQuestKey(line.key)
    if (key !== null && key.act === quest.act && key.quest === quest.index) {
      const rank = ladder.indexOf(key.phase)
      push(rank >= 0 ? rank : otherPhase, line)
    } else {
      push(foreign, line)
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, bucket]) => bucket)
}
