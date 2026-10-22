import { describe, expect, it } from 'vitest'
import { idleFrames, parseObjectModes, parseObjectTable, type ObjectTable } from '../objects'
import {
  isPlaceDirective,
  monPresetAct,
  parseMonPreset,
  placeAt,
  resolvePlacements,
  summarisePlacements,
  type PlaceTable,
} from '../places'
import { parseSuperUniques } from '../superuniques'
import { DIALOGUE_ALIASES, parseDialogue, splitDialogueValue } from '../dialogue'
import { parseMonsterTables, type MonsterTables, type TableRow } from '../monsters'

/**
 * Areas, their objects, the NPCs they place and what those NPCs say.
 *
 * Every fixture here is built to mirror a fact that was measured against the
 * real tables, and the measured numbers are quoted in the assertions' comments:
 * `tools/verify-world.ts` resolves 15,107 of 15,107 object placements and 1,247
 * of 1,247 monster placements across all 2,277 `.ds1` files in the package. The
 * cases below are the small versions of the rules that make that work.
 */

function row(values: Record<string, string | null>): TableRow {
  return values
}

function objectTable(): ObjectTable {
  return parseObjectTable(
    [
      // A separator row exactly as `objects.txt` stores one: no `*ID`, and the
      // ids continue after it.
      row({ Class: 'Expansion', Name: null, '*ID': null }),
      row({
        Class: 'Null',
        Name: 'Dummy',
        '*ID': '0',
        Token: 'NU0',
        SizeX: '0',
        SizeY: '0',
        FrameCnt0: '0',
      }),
      row({
        Class: 'Casket5',
        Name: 'Casket',
        '*ID': '1',
        Token: 'C5',
        SizeX: '5',
        SizeY: '3',
        FrameCnt0: '1',
        FrameCnt1: '7',
        FrameDelta1: '120',
        Selectable0: '1',
        Mode0: '1',
        IsDoor: '0',
      }),
      row({
        Class: 'DoorGateLeft',
        Name: 'Door',
        '*ID': '13',
        Token: 'D1',
        SizeX: '1',
        SizeY: '3',
        FrameCnt0: '1',
        FrameCnt1: '1',
        IsDoor: '1',
        Lockable: '1',
      }),
      // A second separator, so an id after it proves the shift.
      row({ Class: 'Expansion', '*ID': null }),
      row({
        Class: 'SiegeControlEr',
        Name: 'Siege Control',
        '*ID': '410',
        Token: 'zq',
        SizeX: '2',
        SizeY: '2',
        FrameCnt0: '1',
      }),
    ],
    ['NU', 'OP', 'ON', 'S1', 'S2', 'S3', 'S4', 'S5'],
  )
}

function places(): PlaceTable {
  return parseMonPreset([
    row({ Act: '1', Place: 'gheed' }),
    row({ Act: '1', Place: 'cain1' }),
    row({ Act: '1', Place: 'akara' }),
    row({ Act: '1', Place: 'place_fallen' }),
    row({ Act: '5', Place: 'malah' }),
  ])
}

function monsters(): MonsterTables {
  const stats: Array<Record<string, string | null>> = [
    { Id: 'gheed', AI: 'Npc', npc: '1', NameStr: 'Gheed', enabled: '1' },
    { Id: 'cain1', AI: 'Npc', npc: '1', NameStr: 'DeckardCain', enabled: '1' },
    { Id: 'cr_archer1', AI: 'Skeleton', NameStr: 'RogueArcher', enabled: '1' },
  ]
  return parseMonsterTables({ monstats: stats, monlvl: [row({ Level: '1' })] })
}

describe('parseObjectTable', () => {
  it('indexes by *ID and skips the separator rows', () => {
    // Row 410 is a section header whose `*ID` is empty; the entry after it is
    // id 410. Indexing by row would give an expansion chest the row above it.
    const table = objectTable()
    expect(table.objects).toHaveLength(4)
    expect(table.byId.get(1)?.className).toBe('Casket5')
    expect(table.byId.get(13)?.className).toBe('DoorGateLeft')
    expect(table.byId.get(410)?.className).toBe('SiegeControlEr')
    expect(table.byId.has(4)).toBe(false)
  })

  it('reads the per-mode columns by slot', () => {
    const casket = objectTable().byId.get(1)!
    expect(casket.modes).toHaveLength(8)
    expect(casket.modes[0].name).toBe('NU')
    expect(casket.modes[1].name).toBe('OP')
    expect(casket.modes[1].frames).toBe(7)
    expect(casket.modes[1].frameDelta).toBe(120)
    expect(casket.modes[0].operable).toBe(true)
    expect(casket.modes[0].selectable).toBe(true)
    // An unused slot defaults rather than going undefined.
    expect(casket.modes[7].frames).toBe(0)
  })

  it('names modes from objmode and falls back when it is missing', () => {
    expect(parseObjectModes([row({ Token: 'NU' }), row({ Token: 'OP' })])).toEqual(['NU', 'OP'])
    const unnamed = parseObjectTable([row({ Class: 'X', '*ID': '0', FrameCnt0: '1' })])
    expect(unnamed.modes).toEqual([])
    expect(unnamed.objects[0].modes[0].name).toBe('M0')
  })

  it('keeps the flags the tables set', () => {
    const table = objectTable()
    expect(table.byId.get(13)?.isDoor).toBe(true)
    expect(table.byId.get(13)?.lockable).toBe(true)
    expect(table.byId.get(1)?.isDoor).toBe(false)
  })

  it('reports a dummy as having no frames', () => {
    // `Null` is a real row with no art, which is how the maps mark a placeholder.
    expect(idleFrames(objectTable().byId.get(0)!)).toBe(0)
    expect(idleFrames(objectTable().byId.get(1)!)).toBe(1)
  })

  it('groups objects by token', () => {
    expect(objectTable().byToken.get('C5')).toHaveLength(1)
  })
})

describe('monpreset', () => {
  it('groups places by act and indexes them by the ds1 id', () => {
    const table = places()
    expect(placeAt(table, 1, 0)).toBe('gheed')
    expect(placeAt(table, 1, 2)).toBe('akara')
    expect(placeAt(table, 5, 0)).toBe('malah')
    expect(placeAt(table, 2, 0)).toBeNull()
    expect(placeAt(table, 1, 99)).toBeNull()
  })

  it('translates the stored act, which is zero-based, and clamps it', () => {
    // `Ds1File.act` is 0-based while `monpreset.Act` is 1-based; 51 retail files
    // store 5 for act 5 and rely on the clamp, which is why 4 is the ceiling.
    expect(monPresetAct(0)).toBe(1)
    expect(monPresetAct(1)).toBe(2)
    expect(monPresetAct(4)).toBe(5)
    expect(monPresetAct(5)).toBe(5)
  })

  it('recognises the spawn directives that name no monster', () => {
    expect(isPlaceDirective('place_fallen')).toBe(true)
    expect(isPlaceDirective('place_nothing')).toBe(true)
    expect(isPlaceDirective('place_unique_pack')).toBe(true)
    expect(isPlaceDirective('gheed')).toBe(false)
  })
})

describe('resolvePlacements', () => {
  const record = (type: number, id: number, x = 10, y = 20) => ({ type, id, x, y, flags: 0 })

  it('resolves a type-2 record through objects.txt', () => {
    const [placement] = resolvePlacements([record(2, 1)], 1, places(), objectTable(), null)
    expect(placement.kind).toBe('object')
    expect(placement.name).toBe('Casket5')
    expect(placement.object?.sizeX).toBe(5)
    // Sub-tiles are five per tile, so x=10 is tile 2.
    expect(placement.tileX).toBe(2)
    expect(placement.tileY).toBe(4)
  })

  it('resolves a type-1 record through monpreset and monstats', () => {
    const [placement] = resolvePlacements([record(1, 0)], 1, places(), objectTable(), monsters())
    expect(placement.kind).toBe('monster')
    expect(placement.name).toBe('gheed')
    expect(placement.npc).toBe(true)
    expect(placement.known).toBe(true)
  })

  it('marks a directive as unresolved rather than inventing a monster', () => {
    const [placement] = resolvePlacements([record(1, 3)], 1, places(), objectTable(), monsters())
    expect(placement.kind).toBe('unresolved')
    expect(placement.directive).toBe('place_fallen')
  })

  it('resolves a superunique name that monstats does not have', () => {
    const superUniques = parseSuperUniques([
      row({ Superunique: 'Coldcrow', Name: 'Coldcrow', Class: 'cr_archer1', hcIdx: '2', Mod1: '18', TC: 'Act 1 Super A' }),
    ])
    const table = parseMonPreset([row({ Act: '1', Place: 'Coldcrow' })])
    const [placement] = resolvePlacements([record(1, 0)], 1, table, objectTable(), monsters(), superUniques)
    expect(placement.kind).toBe('monster')
    expect(placement.name).toBe('cr_archer1')
    expect(placement.superUnique?.name).toBe('Coldcrow')
    expect(placement.superUnique?.treasureClass).toBe('Act 1 Super A')
    expect(placement.npc).toBe(false)
  })

  it('keeps an unknown id visible instead of dropping it', () => {
    const [placement] = resolvePlacements([record(2, 999)], 1, places(), objectTable(), null)
    expect(placement.kind).toBe('unresolved')
    expect(placement.name).toBe('objects id 999')
  })

  it('summarises what it placed', () => {
    const placements = resolvePlacements(
      [record(1, 0), record(1, 1), record(1, 3), record(2, 1), record(2, 13)],
      1,
      places(),
      objectTable(),
      monsters(),
    )
    const summary = summarisePlacements(placements)
    expect(summary.monsters).toBe(2)
    expect(summary.npcs).toBe(2)
    expect(summary.objects).toBe(2)
    expect(summary.unresolved).toBe(1)
    expect(summary.monsterIds).toEqual(['gheed', 'cain1'])
  })
})

describe('parseSuperUniques', () => {
  it('reads the modifiers and skips the zero slots', () => {
    const table = parseSuperUniques([
      row({ Superunique: 'Bishibosh', Name: 'Bishibosh', Class: 'fallenshaman1', hcIdx: '0', Mod1: '8', Mod2: '9', Mod3: '0', MinGrp: '2', MaxGrp: '2', AutoPos: '1', TC: 'Act 1 Super A' }),
    ])
    const def = table.byName.get('Bishibosh')!
    expect(def.monsterId).toBe('fallenshaman1')
    // Mod3 is 0, which means "no modifier" rather than modifier id 0.
    expect(def.modifierIds).toEqual([8, 9])
    expect(def.autoPosition).toBe(true)
    expect(def.minGroup).toBe(2)
  })
})

describe('splitDialogueValue', () => {
  it('splits the leading formatting field off the text', () => {
    // The classic table stores this as `<key>\0 5 1 \n <text>`, so the digits are
    // a separate field and not part of what the speaker says.
    expect(splitDialogueValue('51I\u0027ve been leading')).toEqual({
      text: "I've been leading",
      firstLineLength: 51,
    })
  })

  it('leaves text alone when there is no field or nothing after it', () => {
    expect(splitDialogueValue("Impossible.")).toEqual({
      text: 'Impossible.',
      firstLineLength: null,
    })
    expect(splitDialogueValue('45')).toEqual({ text: '45', firstLineLength: null })
  })
})

describe('parseDialogue', () => {
  const vo: TableRow[] = [
    row({ Key: 'WarrivAct1IntroGossip1', enUS: '45Greetings, stranger.' }),
    row({ Key: 'WarrivGossip6', enUS: '55Gheed is a wandering merchant.' }),
    row({ Key: 'AkaraGossip1', enUS: '42The Sisterhood.' }),
    row({ Key: 'CainGossip1', enUS: '10Stay a while.' }),
    row({ Key: 'Playersubtitles00', enUS: 'Impossible.' }),
    row({ Key: 'A1Q1AfterInitCharsiAlt', enUS: '95You seem like a sturdy sort.' }),
  ]

  it('attributes a line to the speaker its key names, anywhere in the key', () => {
    // `warriv1` is the `monstats` id; the key spells the base name, which the
    // variant-suffix rule bridges.
    const index = parseDialogue(vo, ['warriv1', 'akara', 'charsi'])
    expect(index.byKey.get('WarrivGossip6')?.speaker).toBe('warriv1')
    expect(index.byKey.get('AkaraGossip1')?.speaker).toBe('akara')
    // The speaker can sit elsewhere: quest keys put it last.
    expect(index.byKey.get('A1Q1AfterInitCharsiAlt')?.speaker).toBe('charsi')
  })

  it('uses the declared aliases for speakers no other table names', () => {
    // `monstats` ids are cain1..cain6, so `CainGossip1` needs the alias list.
    const index = parseDialogue(vo, ['warriv1'])
    expect(DIALOGUE_ALIASES.map((alias) => alias.name)).toContain('Cain')
    expect(index.byKey.get('CainGossip1')?.speaker).toBe('cain1')
  })

  it('gives an alias its lines under every monstats variant it names', () => {
    // Cain ships a row per act, and the same lines belong to all of them, so an
    // area that placed cain6 still finds them.
    const alias = DIALOGUE_ALIASES.find((entry) => entry.name === 'Cain')!
    expect(alias.speakers).toContain('cain6')
    const index = parseDialogue(vo, [])
    expect(index.forSpeaker('cain6').map((line) => line.key)).toEqual(['CainGossip1'])
    expect(index.forSpeaker('cain1').map((line) => line.key)).toEqual(['CainGossip1'])
  })

  it('keeps a line for a speaker with no monster at all', () => {
    // The signposts are objects, not monsters, but their lines still group.
    const alias = DIALOGUE_ALIASES.find((entry) => entry.name === 'RogueSignpost')!
    const rows: TableRow[] = [row({ Key: 'RogueSignpostGossip1', enUS: '3Beware!' })]
    const index = parseDialogue(rows, [])
    expect(index.byKey.get('RogueSignpostGossip1')?.speaker).toBe(alias.speakers[0])
    expect(index.forSpeaker(alias.speakers[0])).toHaveLength(1)
  })

  it('prefers the longer alias so act-specific lines stay separate', () => {
    const rows: TableRow[] = [
      row({ Key: 'CainGossip1', enUS: '1Shared.' }),
      row({ Key: 'CainAct3Gossip1', enUS: '2Act three.' }),
    ]
    const index = parseDialogue(rows, [])
    expect(index.byKey.get('CainGossip1')?.speaker).toBe('cain1')
    expect(index.byKey.get('CainAct3Gossip1')?.speaker).toBe('cain3')
  })

  it('leaves a line with no speaker unattributed', () => {
    // The player's own barks are in the same table and belong to nobody.
    const index = parseDialogue(vo, ['warriv1'])
    expect(index.byKey.get('Playersubtitles00')?.speaker).toBeNull()
  })

  it('prefers the longest match so a short name cannot steal a longer one', () => {
    const rows: TableRow[] = [row({ Key: 'JerhynGossip1', enUS: '1Line.' })]
    const index = parseDialogue(rows, ['Jerhyn', 'jerhyn'])
    expect(index.byKey.get('JerhynGossip1')?.speaker).toBe('Jerhyn')
  })

  it('groups lines by speaker in table order', () => {
    const index = parseDialogue(vo, ['warriv1', 'charsi'])
    const lines = index.forSpeaker('warriv1')
    expect(lines.map((line) => line.key)).toEqual(['WarrivAct1IntroGossip1', 'WarrivGossip6'])
    expect(index.forSpeaker('nobody')).toEqual([])
  })

  it('matches the base name a monster id is a variant of', () => {
    // `monstats` has warriv1 and warriv2 and no plain `warriv`; the trailing
    // digit is the variant, not part of the name.
    const rows: TableRow[] = [row({ Key: 'WarrivGossip1', enUS: '51I have led.' })]
    const index = parseDialogue(rows, ['warriv2'])
    expect(index.byKey.get('WarrivGossip1')?.speaker).toBe('warriv2')
    expect(index.forSpeaker('warriv2')).toHaveLength(1)
  })

  it('honours the requested language and falls back to English', () => {
    const rows: TableRow[] = [
      row({ Key: 'AkaraGossip1', enUS: '42The Sisterhood.', zhCN: '姐妹会' }),
      row({ Key: 'AkaraGossip2', enUS: '43Only English.' }),
    ]
    const chinese = parseDialogue(rows, ['akara'], 'zhCN')
    expect(chinese.byKey.get('AkaraGossip1')?.text).toBe('姐妹会')
    // No Chinese column on the second row, so the English one is used.
    expect(chinese.byKey.get('AkaraGossip2')?.text).toBe('Only English.')
  })
})
