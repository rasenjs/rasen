import { describe, expect, it } from 'vitest'
import { parseDialogue, type DialogueEntry } from '../dialogue'
import type { TableRow } from '../monsters'
import {
  KILLS_PER_QUEST,
  orderSpeakerLines,
  parseQuests,
  parseQuestStringKey,
  parseVoiceQuestKey,
  questRequirement,
  questState,
  type ActQuestList,
  type Quest,
  type QuestIndex,
} from '../quests'

/**
 * The quest tables: the two key grammars, the phases the voice keys use, and the
 * stand-in conditions the app applies.
 *
 * Every fixture is a small copy of a fact measured against the real export, and
 * the measured numbers are quoted in the comments: `tools/verify-quests.ts`
 * parses 153 of `strings_quests.json`'s 159 keys under the grammar, recovers the
 * other 6 as two named exceptions, and splits all 529 quest-addressed voice keys
 * into act, quest, phase and speaker. The cases below are the small versions of
 * the rules that make that work.
 */

function row(values: Record<string, string | null>): TableRow {
  return values
}

// The shape `strings_quests.json` has, with the rows act 1 quest 1 and quest 2
// are written with — including the empty step 3 and the `%d` step 4 with its
// singular variant, which is what proves the step is one digit and not a run.
const QUEST_STRINGS: TableRow[] = [
  row({ Key: 'qstsa1q0', enUS: 'Act 1 Prologue' }),
  row({ Key: 'qstsa1q1', enUS: 'Den of Evil' }),
  row({ Key: 'qstsa1q11', enUS: "Look for the Den in the wilderness outside the Rogues' Camp." }),
  row({ Key: 'qstsa1q12', enUS: 'Kill all the monsters in the Den.' }),
  row({ Key: 'qstsa1q13', enUS: '' }),
  row({ Key: 'qstsa1q14', enUS: 'Monsters remaining: %d' }),
  row({ Key: 'qstsa1q140', enUS: 'One monster left.' }),
  row({ Key: 'qstsa1q2', enUS: "Sisters' Burial Grounds" }),
  row({ Key: 'qstsa1q21', enUS: 'Look for Blood Raven in the Burial Grounds.' }),
  // The act's non-quest block: `t` is not a quest index.
  row({ Key: 'qstsa1qt', enUS: 'The Townspeople' }),
  row({ Key: 'qstsa1qt0', enUS: 'introduction' }),
]

// The shape `strings_vo.json` has. `AfterInitCharsiAlt` is the key the real
// table uses for Charsi's alternate take, and the last two rows are the act 5
// quest 1 typo and a key whose phase is not in the vocabulary.
const VOICE: TableRow[] = [
  row({ Key: 'AkaraGossip1', enUS: '42The Sisterhood of the Sightless Eye.' }),
  row({ Key: 'A1Q1InitAkara', enUS: '20There is a place of great evil in the wilderness.' }),
  row({ Key: 'A1Q1AfterInitAkara', enUS: '21The evil has taken root.' }),
  row({ Key: 'A1Q1SuccessfulAkara', enUS: '22You have cleansed the Den of Evil.' }),
  row({ Key: 'A1Q1AfterInitCharsiAlt', enUS: '23You seem like a sturdy sort.' }),
  row({ Key: 'A1Q1SuccessfulKashya', enUS: '24Well done.' }),
]

const ACT_QUESTS: ActQuestList[] = [
  {
    act: 1,
    quests: [
      { index: 0, name: 'Act 1 Prologue', nameZh: '第一幕序章' },
      { index: 1, name: 'Den of Evil', nameZh: '邪恶洞穴' },
      { index: 2, name: "Sisters' Burial Grounds", nameZh: '修女的埋骨地' },
    ],
  },
]

function build(sources: Parameters<typeof parseQuests>[0] = {}): QuestIndex {
  return parseQuests({
    questStrings: QUEST_STRINGS,
    voice: VOICE,
    actQuests: ACT_QUESTS,
    ...sources,
  })
}

function questAt(index: QuestIndex, act: number, number_: number): Quest {
  const quest = index.quest(act, number_)
  if (quest === null) throw new Error(`no quest A${act}Q${number_}`)
  return quest
}

describe('parseQuestStringKey', () => {
  it('reads the act, the quest and the step of a log row', () => {
    expect(parseQuestStringKey('qstsa1q12')).toMatchObject({
      act: 1,
      quest: 1,
      step: 2,
      variant: null,
      match: 'grammar',
    })
    expect(parseQuestStringKey('qstsa3q25', 'Transmute')).toMatchObject({
      act: 3,
      quest: 2,
      step: 5,
      text: 'Transmute',
    })
  })

  it('reads the row with no step as the one that names the quest', () => {
    // `qstsa2q0` is "Act 2 Prologue": the act's prologue is quest 0, so it has a
    // name row and no log steps.
    expect(parseQuestStringKey('qstsa2q0', 'Act 2 Prologue')).toMatchObject({
      act: 2,
      quest: 0,
      step: null,
      variant: null,
    })
    expect(parseQuestStringKey('qstsa5q6', 'Eve of Destruction')?.step).toBeNull()
  })

  it('reads the step as one digit and the rest as the variant', () => {
    // Step 4 of "Den of Evil" is the live counter and variant `0` of the same
    // step is its singular form, so `qstsa1q140` is not step 140.
    expect(parseQuestStringKey('qstsa1q14', 'Monsters remaining: %d')).toMatchObject({
      quest: 1,
      step: 4,
      variant: null,
    })
    expect(parseQuestStringKey('qstsa1q140', 'One monster left.')).toMatchObject({
      quest: 1,
      step: 4,
      variant: '0',
    })
    expect(parseQuestStringKey('qstsa2q31a')).toMatchObject({ quest: 3, step: 1, variant: 'a' })
    expect(parseQuestStringKey('qstsa2q63f')).toMatchObject({ quest: 6, step: 3, variant: 'f' })
  })

  it('names the two exceptions rather than folding them into the grammar', () => {
    // Act 5 quest 1's four log steps are spelt without the `s` of `qstsa`.
    expect(parseQuestStringKey('qsta5q11')).toMatchObject({
      act: 5,
      quest: 1,
      step: 1,
      match: 'act5-typo',
    })
    expect(parseQuestStringKey('qsta5q14')).toMatchObject({ quest: 1, step: 4, match: 'act5-typo' })
    // The act's non-quest block has no quest slot at all.
    expect(parseQuestStringKey('qstsa1qt')).toMatchObject({ act: 1, quest: -1, match: 'townspeople' })
    expect(parseQuestStringKey('qstsa1qt0')).toMatchObject({
      quest: -1,
      step: 0,
      match: 'townspeople',
    })
  })

  it('rejects a key that is not a quest string', () => {
    for (const key of [
      'qsts1q1',
      'qstsa1q',
      'qstsa1q1z9',
      'qstsa1q1aa',
      'qstsaAq1',
      'A1Q1InitAkara',
      'WarrivGossip1',
      'qstsa1qtq',
    ]) {
      expect(parseQuestStringKey(key), key).toBeNull()
    }
  })
})

describe('parseVoiceQuestKey', () => {
  it('reads the act, quest, phase and speaker of a quest line', () => {
    expect(parseVoiceQuestKey('A1Q1InitAkara')).toEqual({
      key: 'A1Q1InitAkara',
      act: 1,
      quest: 1,
      phase: 'Init',
      qualifier: null,
      speaker: 'Akara',
    })
    // The speaker sits last, so a variant suffix stays part of the name.
    expect(parseVoiceQuestKey('A1Q1AfterInitCharsiAlt')).toMatchObject({
      phase: 'AfterInit',
      speaker: 'CharsiAlt',
    })
    expect(parseVoiceQuestKey('A3Q5AfterInitNatalyaVA')).toMatchObject({
      quest: 5,
      phase: 'AfterInit',
      speaker: 'NatalyaVA',
    })
  })

  it('prefers the longest phase the key starts with', () => {
    // `QuestSuccessful` is act 1 quest 4's spelling of what other quests call
    // `Successful`, and `FoundAnya` is act 5 quest 3's state.
    expect(parseVoiceQuestKey('A1Q4QuestSuccessfulAkara')?.phase).toBe('QuestSuccessful')
    expect(parseVoiceQuestKey('A5Q3FoundAnyaAnya')).toMatchObject({
      phase: 'FoundAnya',
      speaker: 'Anya',
    })
    expect(parseVoiceQuestKey('A1Q4RescuedByHeroCain')).toMatchObject({
      phase: 'RescuedByHero',
      speaker: 'Cain',
    })
    expect(parseVoiceQuestKey('A1Q4TragedyOfTristramCain')?.phase).toBe('TragedyOfTristram')
    expect(parseVoiceQuestKey('A4Q2ExpansionSuccessTyrael')?.phase).toBe('ExpansionSuccess')
    expect(parseVoiceQuestKey('A3Q3RewardOrmus')).toMatchObject({
      phase: 'Reward',
      speaker: 'Ormus',
    })
  })

  it('splits a leading digit off as the state qualifier', () => {
    expect(parseVoiceQuestKey('A3Q4Init1CainAct3')).toMatchObject({
      phase: 'Init',
      qualifier: '1',
      speaker: 'CainAct3',
    })
    expect(parseVoiceQuestKey('A1Q6EarlyReturn2Kashya')).toMatchObject({
      phase: 'EarlyReturn',
      qualifier: '2',
      speaker: 'Kashya',
    })
    // A digit-only remainder would leave no name, so it is not a quest line.
    expect(parseVoiceQuestKey('A1Q1Init1')).toBeNull()
  })

  it('rejects a key that addresses no quest or carries no phase', () => {
    for (const key of [
      'WarrivGossip1',
      'AkaraGossip1',
      'A1Q1Akara',
      'A1Q1CharsiMain',
      'A1Q1Init',
      'ama_act1_entry_wilderness',
      'Playersubtitles00',
    ]) {
      expect(parseVoiceQuestKey(key), key).toBeNull()
    }
  })
})

describe('parseQuests', () => {
  it('lists the act quests with their names, log steps and lines', () => {
    const index = build()
    expect(index.acts).toEqual([1])
    const den = questAt(index, 1, 1)
    expect(den.name).toBe('Den of Evil')
    expect(den.nameZh).toBe('邪恶洞穴')
    expect(den.nameKey).toBe('qstsa1q1')
    expect(den.objectives.map((objective) => objective.step)).toEqual([1, 2, 3, 4, 4])
    // The variant of step 4 is kept, and its text is the counter's singular form.
    expect(den.objectives[4]).toMatchObject({ variant: '0', text: 'One monster left.' })
    expect(den.objectives[2].text).toBe('')
  })

  it('groups the lines of a quest by the phase its keys declare', () => {
    const den = questAt(build(), 1, 1)
    expect(den.phases.map((phase) => phase.name)).toEqual(['Init', 'AfterInit', 'Successful'])
    expect(den.phases.map((phase) => phase.lines.length)).toEqual([1, 2, 2])
    // The empty text is the table's, not the parser's: the voice row has text.
    expect(den.phases[0].lines[0].text).toBe('There is a place of great evil in the wilderness.')
    expect(den.lines.map((line) => line.key)).toEqual([
      'A1Q1InitAkara',
      'A1Q1AfterInitAkara',
      'A1Q1SuccessfulAkara',
      'A1Q1AfterInitCharsiAlt',
      'A1Q1SuccessfulKashya',
    ])
  })

  it('reports the speakers a quest has lines for', () => {
    const den = questAt(build(), 1, 1)
    // Read from the rows there is no roster to resolve against, so the keys'
    // own spellings are what a quest reports.
    expect(den.speakers).toEqual([])
    expect(den.speakerNames).toEqual(['Akara', 'CharsiAlt', 'Kashya'])
  })

  it('resolves speakers to monster ids when given the parsed dialogue index', () => {
    const dialogue = parseDialogue(VOICE, ['akara', 'kashya', 'charsi'])
    const den = questAt(build({ voice: dialogue }), 1, 1)
    expect(den.speakers).toEqual(['akara', 'charsi', 'kashya'])
    expect(den.phases[0].lines[0].speakerId).toBe('akara')
    // The qualifier of a word-qualified name is split with the table's own
    // vocabulary of speaker tokens, which `parseDialogue` does not need.
    expect(den.lines.find((line) => line.key === 'A1Q1SuccessfulAkara')?.speakerId).toBe('akara')
  })

  it('counts what it read, exceptions included', () => {
    const stats = build().stats
    expect(stats.quests).toBe(3)
    expect(stats.questStringKeys).toBe(11)
    expect(stats.questStringMatched).toBe(9)
    expect(stats.questStringExceptions).toBe(2)
    expect(stats.questStringUnmatched).toBe(0)
    expect(stats.voiceLines).toBe(6)
    expect(stats.voiceQuestKeys).toBe(5)
    expect(stats.voiceQuestKeysMatched).toBe(5)
    expect(stats.questsWithLines).toBe(1)
    expect(stats.questsWithoutLines).toEqual([
      'A1Q0 Act 1 Prologue',
      "A1Q2 Sisters' Burial Grounds",
    ])
    expect(stats.phasesPerQuest).toBeCloseTo(1)
    expect(stats.speakers).toBe(3)
    expect(stats.nameDisagreements).toEqual([])
  })

  it('keeps the act townspeople rows as exceptions, not as quests', () => {
    const index = build()
    expect(index.quests.some((quest) => quest.index < 0)).toBe(false)
    const exceptions = index.questStrings.filter((entry) => entry.match === 'townspeople')
    expect(exceptions.map((entry) => entry.key)).toEqual(['qstsa1qt', 'qstsa1qt0'])
    expect(index.unmatched).toEqual([])
  })

  it('recovers the act 5 typo into the quest it belongs to', () => {
    // The four misspelt keys are the whole of act 5 quest 1's log.
    const index = parseQuests({
      questStrings: [
        row({ Key: 'qstsa5q1', enUS: 'Siege on Harrogath' }),
        row({ Key: 'qsta5q11', enUS: 'Stop the Siege by killing Shenk the Overseer.' }),
        row({ Key: 'qsta5q12', enUS: 'Kill Shenk the Overseer.' }),
      ],
      actQuests: [{ act: 5, quests: [{ index: 1, name: 'Siege on Harrogath' }] }],
    })
    const siege = questAt(index, 5, 1)
    expect(siege.objectives.map((objective) => objective.key)).toEqual(['qsta5q11', 'qsta5q12'])
    expect(index.stats.questStringExceptions).toBe(2)
  })

  it('reports a key that names no act the tables list', () => {
    const index = build({
      voice: [row({ Key: 'A9Q1SuccessfulAkara', enUS: 'You have cleansed the Den.' })],
    })
    expect(index.unmatched).toEqual([
      {
        table: 'strings_vo',
        key: 'A9Q1SuccessfulAkara',
        why: 'names act 9 quest 1, which the act tables do not list',
      },
    ])
  })

  it('reports a voice key whose phase is not in the vocabulary', () => {
    const index = build({ voice: [row({ Key: 'A1Q1Akara', enUS: 'There is evil.' })] })
    expect(index.unmatched).toEqual([
      {
        table: 'strings_vo',
        key: 'A1Q1Akara',
        why: 'no phase from the phase vocabulary',
      },
    ])
  })

  it('builds the quest list from the string table when the act table is absent', () => {
    const index = build({ actQuests: null })
    expect(index.acts).toEqual([1])
    expect(index.forAct(1).map((quest) => quest.name)).toEqual([
      'Act 1 Prologue',
      'Den of Evil',
      "Sisters' Burial Grounds",
    ])
    // Without `quests.txt` there is no Chinese column to read, so it is empty
    // rather than invented.
    expect(questAt(index, 1, 1).nameZh).toBe('')
  })

  it('reports the two tables disagreeing about a name', () => {
    const index = build({
      actQuests: [{ act: 1, quests: [{ index: 1, name: 'The Den' }] }],
    })
    expect(index.stats.nameDisagreements).toEqual([
      'A1Q1: quests.txt "The Den" vs strings_quests "Den of Evil"',
    ])
  })

  it('reads nothing without sources, rather than failing', () => {
    const index = parseQuests()
    expect(index.quests).toEqual([])
    expect(index.acts).toEqual([])
    expect(index.stats.voiceLines).toBe(0)
  })
})

describe('questRequirement and questState', () => {
  const dialogue = parseDialogue(VOICE, ['akara', 'kashya', 'charsi'])

  it('takes the giver from the Init line of the quest itself', () => {
    const index = build({ voice: dialogue })
    const den = questAt(index, 1, 1)
    const requirement = questRequirement(den, index.forAct(1).length)
    // `A1Q1InitAkara` says Akara opens it, which is data rather than a guess.
    expect(requirement.giver).toBe('akara')
    expect(requirement.giverName).toBe('Akara')
    expect(requirement.level).toBe(2)
    expect(requirement.kills).toBe(KILLS_PER_QUEST)
    // Act 1 quest 1 is not the act's last quest, so it does not want the boss.
    expect(requirement.boss).toBe(false)
  })

  it('wants the area boss only from the last quest of the act', () => {
    const index = build({ voice: dialogue })
    const quests = index.forAct(1)
    const last = quests[quests.length - 1]
    expect(questRequirement(last, quests.length).boss).toBe(true)
    expect(questRequirement(last, quests.length + 1).boss).toBe(false)
  })

  it('has no giver for a quest whose first phase is not Init', () => {
    const index = parseQuests({
      questStrings: [row({ Key: 'qstsa2q2', enUS: 'The Horadric Staff' })],
      voice: [row({ Key: 'A2Q2SuccessfulCain', enUS: 'Excellent!' })],
      actQuests: [{ act: 2, quests: [{ index: 2, name: 'The Horadric Staff' }] }],
    })
    const staff = questAt(index, 2, 2)
    expect(questRequirement(staff, 7).giver).toBeNull()
    expect(questRequirement(staff, 7).giverName).toBeNull()
  })

  it('walks a quest from unstarted to active to done', () => {
    const index = build({ voice: dialogue })
    const den = questAt(index, 1, 1)
    const requirement = questRequirement(den, index.forAct(1).length)
    const placed = new Set(['akara'])
    expect(
      questState(requirement, { talkedTo: new Set(), level: 9, kills: 99, bossSlain: true, placedSpeakers: placed }),
    ).toBe('unstarted')
    expect(
      questState(requirement, { talkedTo: new Set(['akara']), level: 1, kills: 0, bossSlain: false, placedSpeakers: placed }),
    ).toBe('active')
    expect(
      questState(requirement, { talkedTo: new Set(['akara']), level: 2, kills: 3, bossSlain: false, placedSpeakers: placed }),
    ).toBe('active')
    expect(
      questState(requirement, { talkedTo: new Set(['akara']), level: 2, kills: KILLS_PER_QUEST, bossSlain: false, placedSpeakers: placed }),
    ).toBe('done')
  })

  it('does not stall on a giver the area does not place', () => {
    const index = build({ voice: dialogue })
    const den = questAt(index, 1, 1)
    const requirement = questRequirement(den, index.forAct(1).length)
    const state = questState(requirement, {
      talkedTo: new Set(),
      level: 2,
      kills: KILLS_PER_QUEST,
      bossSlain: false,
      placedSpeakers: new Set(['charsi']),
    })
    expect(state).toBe('done')
  })

  it('wants the boss dead for the last quest of the act', () => {
    const index = build({ voice: dialogue })
    const quests = index.forAct(1)
    const last = quests[quests.length - 1]
    const requirement = questRequirement(last, quests.length)
    const progress = {
      talkedTo: new Set<string>(),
      level: 99,
      kills: 999,
      bossSlain: false,
      placedSpeakers: undefined,
    }
    expect(questState(requirement, progress)).toBe('active')
    expect(questState(requirement, { ...progress, bossSlain: true })).toBe('done')
  })
})

describe('orderSpeakerLines', () => {
  const dialogue = parseDialogue(VOICE, ['akara', 'kashya', 'charsi'])
  const akara = dialogue.forSpeaker('akara')
  const index = build({ voice: dialogue })
  const den = questAt(index, 1, 1)

  it('puts the own line of the quest for the state first', () => {
    // Before the quest is taken the Init line is the one to hear, even though
    // Akara's gossip and her thanks come earlier in the table.
    const keys = orderSpeakerLines(akara, den, 'unstarted').map((line) => line.key)
    expect(keys[0]).toBe('A1Q1InitAkara')
    expect(keys[keys.length - 1]).toBe('AkaraGossip1')
  })

  it('moves the phase the state asks for to the front', () => {
    // Once the quest is done Akara's thanks is the line that matters, and it is
    // the third row of the table, not the first.
    const keys = orderSpeakerLines(akara, den, 'done').map((line) => line.key)
    expect(keys).toEqual([
      'A1Q1SuccessfulAkara',
      'A1Q1InitAkara',
      'A1Q1AfterInitAkara',
      'AkaraGossip1',
    ])
  })

  it('keeps table order inside a group and for a speaker with no quest line', () => {
    const keys = orderSpeakerLines(akara, den, 'active').map((line) => line.key)
    expect(keys).toEqual([
      'A1Q1AfterInitAkara',
      'A1Q1InitAkara',
      'A1Q1SuccessfulAkara',
      'AkaraGossip1',
    ])
    const kashya = dialogue.forSpeaker('kashya')
    expect(orderSpeakerLines(kashya, den, 'active').map((line) => line.key)).toEqual(
      kashya.map((line) => line.key),
    )
  })

  it('leaves the lines of another quest where they are', () => {
    const lines: DialogueEntry[] = [
      { key: 'AkaraGossip1', text: 'The Sisterhood.', firstLineLength: null, speaker: 'akara' },
      { key: 'A1Q9InitAkara', text: 'Not in the tables.', firstLineLength: null, speaker: 'akara' },
      { key: 'A1Q1InitAkara', text: 'Evil in the wilderness.', firstLineLength: null, speaker: 'akara' },
    ]
    expect(orderSpeakerLines(lines, den, 'unstarted').map((line) => line.key)).toEqual([
      'A1Q1InitAkara',
      'AkaraGossip1',
      'A1Q9InitAkara',
    ])
  })

  it('does nothing without a quest', () => {
    expect(orderSpeakerLines(akara, null, 'active')).toEqual(akara)
    expect(orderSpeakerLines([], den, 'active')).toEqual([])
  })
})
