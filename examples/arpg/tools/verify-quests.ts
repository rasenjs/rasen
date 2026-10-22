/**
 * Checks the quest tables against each other and against the dialogue.
 *
 * The claims are countable, and every one of them is counted over the whole
 * export rather than a sample:
 *
 * 1. the quest-string keys parse into the `<act>q<quest>[<step>[<variant>]]`
 *    grammar, and the percentage says how much of the table does;
 * 2. every quest-addressed voice key (`A1Q1InitAkara`) splits into act, quest,
 *    phase and speaker under the phase vocabulary from the table itself;
 * 3. the quests each get their own lines, and a quest with none is either a
 *    prologue or a failure;
 * 4. the dialogue preference the app applies changes which line a speaker opens
 *    with, for how many speakers and how many quests.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-quests.ts
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseDialogue } from '../src/d2/dialogue'
import { parseMonsterTables } from '../src/d2/monsters'
import {
  parseQuests,
  parseVoiceQuestKey,
  orderSpeakerLines,
  questRequirement,
  type QuestState
} from '../src/d2/quests'

const data = resolve(import.meta.dirname, '../public/original')

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(data, name), 'utf8')) as T
}

const percent = (good: number, total: number): string =>
  total === 0 ? 'n/a' : `${((100 * good) / total).toFixed(3)}%`

function main(): void {
  const questStringRows = readJson<Array<Record<string, string | null>>>('strings_quests.json')
  const voRows = readJson<Array<Record<string, string | null>>>('strings_vo.json')
  const actQuests = readJson<Array<{ act: number; quests: Array<{ index: number; name: string; nameZh: string }> }>>(
    'gamedata_quests.json',
  )
  const monsters = parseMonsterTables({
    monstats: readJson('table_monstats.json'),
    monstats2: readJson('table_monstats2.json'),
    monlvl: readJson('table_monlvl.json'),
    monai: readJson('table_monai.json'),
    monseq: readJson('table_monseq.json'),
    levels: readJson('table_levels.json')
  })

  // The same attribution the app builds: `monstats` ids and nothing else, so a
  // quest line's speaker is the id an area would place.
  const candidates = [...monsters.byId.values()].filter((m) => m.flags.npc).map((m) => m.id)
  const dialogue = parseDialogue(voRows, candidates)

  const index = parseQuests({
    questStrings: questStringRows,
    voice: dialogue,
    actQuests
  })
  const stats = index.stats

  console.log(`quests: ${stats.quests} quests across ${index.acts.length} acts`)
  for (const act of index.acts) {
    const quests = index.forAct(act)
    const withLines = quests.filter((quest) => quest.lines.length > 0).length
    const objectives = quests.reduce((sum, quest) => sum + quest.objectives.length, 0)
    console.log(
      `  act ${act}: ${quests.length} quests, ${withLines} with lines, ${objectives} log steps`,
    )
  }

  const grammarPct = percent(stats.questStringMatched, stats.questStringKeys)
  console.log(
    `quests: strings_quests ${stats.questStringMatched}/${stats.questStringKeys} keys match the ` +
      `grammar (${grammarPct}), ${stats.questStringExceptions} are named exceptions, ` +
      `${stats.questStringUnmatched} do not match`,
  )
  console.log(
    `quests: strings_vo ${stats.voiceQuestKeysMatched}/${stats.voiceQuestKeys} quest-addressed ` +
      `keys split into act/quest/phase/speaker (${percent(stats.voiceQuestKeysMatched, stats.voiceQuestKeys)}) ` +
      `of ${stats.voiceLines} lines`,
  )

  console.log(
    `quests: phases per quest ${stats.phasesPerQuest.toFixed(3)}, lines per quest ` +
      `${stats.linesPerQuest.toFixed(3)}, ${stats.speakers} speakers have a quest line`,
  )
  console.log('quests: phase vocabulary as the keys use it')
  for (const phase of stats.phaseCounts) {
    console.log(`  ${phase.name}: ${phase.count}`)
  }
  console.log(
    `quests: ${stats.qualifiedLines} keys glue a state qualifier in front of the name: ` +
      stats.qualifiers.map((qualifier) => `${qualifier.name}×${qualifier.count}`).join(' '),
  )

  console.log(
    `quests: ${stats.questsWithLines}/${stats.quests} quests have at least one line; ` +
      `${stats.questsWithoutLines.length} have none`,
  )
  for (const quest of stats.questsWithoutLines) console.log(`  no lines: ${quest}`)

  // Every requirement the app will apply, so the stand-ins are inspectable.
  for (const act of index.acts) {
    const quests = index.forAct(act)
    for (const quest of quests) {
      const requirement = questRequirement(quest, quests.length)
      console.log(
        `  A${act}Q${quest.index} ${quest.name}: giver ${requirement.giverName ?? 'none'}` +
          `${requirement.giver === null ? '' : ` (${requirement.giver})`}, level ${requirement.level}, ` +
          `kills ${requirement.kills}, boss ${requirement.boss ? 'yes' : 'no'}`,
      )
    }
  }

  // What the quest-first dialogue order changes: for every speaker with a line
  // for a quest, the line they open with under each state, against table order.
  const states: QuestState[] = ['unstarted', 'active', 'done']
  const changedSpeakers = new Set<string>()
  const changedQuests = new Set<string>()
  for (const quest of index.quests) {
    for (const phase of quest.phases) {
      for (const line of phase.lines) {
        const speaker = line.speakerId
        if (speaker === null) continue
        const bucket = dialogue.forSpeaker(speaker)
        for (const state of states) {
          const ordered = orderSpeakerLines(bucket, quest, state)
          if (ordered.length === 0 || ordered[0] === bucket[0]) continue
          changedSpeakers.add(speaker)
          changedQuests.add(`A${quest.act}Q${quest.index}`)
        }
      }
    }
  }
  console.log(
    `quests: the quest-first dialogue order changes the opening line for ` +
      `${changedSpeakers.size} speakers across ${changedQuests.size} quests`,
  )

  // A quest addressed by a line must exist, and a line must not be counted twice.
  let unknownAddress = 0
  const keys = new Set<string>()
  let duplicates = 0
  for (const line of index.quests.flatMap((quest) => quest.lines)) {
    if (keys.has(line.key)) duplicates += 1
    keys.add(line.key)
    const parsed = parseVoiceQuestKey(line.key)
    if (parsed === null) unknownAddress += 1
  }
  console.log(`quests: ${keys.size} distinct keys carry quest lines, ${duplicates} duplicated`)

  if (stats.nameDisagreements.length > 0) {
    console.log('quests: names the two tables spell differently')
    for (const disagreement of stats.nameDisagreements) console.log(`  ${disagreement}`)
  }

  const problems: string[] = []
  if (stats.questStringKeys === 0) problems.push('no quest strings were read')
  if (stats.voiceQuestKeys === 0) problems.push('no quest-addressed voice lines were read')
  if (stats.questStringUnmatched > 0) {
    problems.push(`${stats.questStringUnmatched} quest-string keys do not match the grammar`)
  }
  if (stats.voiceQuestKeysUnmatched > 0) {
    problems.push(`${stats.voiceQuestKeysUnmatched} quest-addressed voice keys do not split into phases`)
  }
  if (unknownAddress > 0) problems.push(`${unknownAddress} quest lines have an unreadable key`)
  if (duplicates > 0) problems.push(`${duplicates} quest lines are counted twice`)
  if (stats.speakers === 0) problems.push('no speaker was resolved for any quest line')

  // A quest with no lines is expected only for the act prologues, which the game
  // announces rather than speaks. Anything else means the voices were lost.
  const unexpected = index.quests.filter((quest) => quest.lines.length === 0 && quest.index !== 0)
  if (unexpected.length > 0) {
    problems.push(
      `${unexpected.length} quests are neither a prologue nor have lines: ` +
        unexpected.map((quest) => `A${quest.act}Q${quest.index}`).join(' '),
    )
  }

  if (index.unmatched.length > 0) {
    console.log('quests: keys that did not match')
    for (const key of index.unmatched) console.log(`  ${key.table}: ${key.key} — ${key.why}`)
    problems.push(`${index.unmatched.length} keys did not match`)
  }

  // The exceptions are keys that do not match the strict grammar, so they are
  // listed rather than only counted.
  const exceptions = index.questStrings.filter((entry) => entry.match !== 'grammar')
  if (exceptions.length > 0) {
    console.log(
      `quests: ${exceptions.length} keys do not match the strict grammar; each is listed here ` +
        `as a named exception`,
    )
    for (const entry of exceptions) {
      console.log(
        `  ${entry.match}: ${entry.key} = act ${entry.act}, ` +
          `${entry.quest < 0 ? 'no quest' : `quest ${entry.quest}`}, ` +
          `step ${entry.step ?? 'none'}${entry.variant === null ? '' : `, variant ${entry.variant}`}`,
      )
    }
  }

  if (problems.length > 0) {
    console.error(`verify-quests: FAILED — ${problems.join('; ')}`)
    process.exitCode = 1
    return
  }
  console.log('verify-quests: OK')
}

main()
