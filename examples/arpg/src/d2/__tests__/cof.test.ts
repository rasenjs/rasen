import { describe, expect, it } from 'vitest'
import { LAYER_SLOTS, parseCof, type CofFile } from '../cof'
import {
  CLASS_CODES,
  ANIM_MODES,
  WEAPON_CLASSES,
  createCharAnimIndex,
  parseCofFileName,
  parseDccFileName,
  resolveLayers,
} from '../charanim'

/**
 * The COF container, the character animation naming scheme and the index over
 * the animation tree.
 *
 * The layout these tests pin down was derived from the shipped files rather than
 * from documentation, and the small cases here are the ones it has to satisfy: a
 * 29 byte header, 9 byte layer records whose last byte is the layer's slot (with
 * the final record written as a sentinel), and `frames * directions` rows of
 * `layers` slot ids each. `tools/verify-cof.ts` checks the same grammar against
 * all 852 COFs and 16,089 `.dcc` names of an extracted directory, which is where
 * the sentinel rule and the field widths earn their place.
 */

interface RecordSpec {
  name: string
  slot: number
  /** Written as the slot of the last record, which real files leave at 0. */
  lastByte?: number
}

/**
 * Builds a COF whose draw order table sits directly after the layer records and
 * the `frames - 1` byte section, so `parseCof` sees the same arithmetic a real
 * file has.
 */
function buildCof(options: {
  directions: number
  /** One row per frame, each a permutation of the same slot set. */
  orders: number[][]
  /** Layer records in the order they appear in the file. */
  records: RecordSpec[]
}): Uint8Array {
  const layerCount = options.records.length
  const rows = options.orders.length
  const frames = rows / options.directions
  const bytes = new Uint8Array(29 + 9 * layerCount + (frames - 1) + rows * layerCount)
  bytes[0] = layerCount
  bytes[1] = frames
  bytes[2] = options.directions
  bytes[3] = 20
  options.records.forEach((record, k) => {
    const at = 29 + 9 * k
    bytes[at] = 1
    bytes[at + 1] = 1
    for (let i = 0; i < record.name.length && i < 3; i += 1) {
      bytes[at + 4 + i] = record.name.charCodeAt(i)
    }
    bytes[at + 8] = record.lastByte ?? record.slot
  })
  const bodyStart = bytes.length - rows * layerCount
  options.orders.forEach((row, i) => {
    row.forEach((slot, j) => {
      bytes[bodyStart + i * layerCount + j] = slot
    })
  })
  return bytes
}

/** A COF with three layers on slots 0, 1 and 5 and one direction. */
function simpleCof(): CofFile {
  return parseCof(
    buildCof({
      directions: 1,
      orders: [
        [0, 1, 5],
        [1, 0, 5],
      ],
      records: [
        { name: '1hs', slot: 1 },
        { name: 'hth', slot: 5 },
        // The last record's slot byte is a sentinel in real files.
        { name: '1hs', slot: 0, lastByte: 0 },
      ],
    }),
    'baa11hs',
  )
}

describe('parseCof', () => {
  it('reads the header and the layer records', () => {
    const cof = simpleCof()
    expect(cof.framesPerDirection).toBe(2)
    expect(cof.directions).toBe(1)
    expect(cof.version).toBe(20)
    expect(cof.layers).toHaveLength(3)
    expect(cof.layers.map((layer) => layer.name)).toEqual(['1hs', '1hs', 'hth'])
    expect(cof.layers.map((layer) => layer.dir)).toEqual(['hd', 'tr', 'rh'])
  })

  it('reads the per-frame draw order', () => {
    const cof = simpleCof()
    expect(cof.layerOrders).toEqual([
      [0, 1, 5],
      [1, 0, 5],
    ])
  })

  it('takes the missing slot for the final record’s sentinel byte', () => {
    // Real files write 0 in the last record's slot byte and leave the slot it
    // means to be the only drawn slot no other record claims.
    const cof = parseCof(
      buildCof({
        directions: 1,
        orders: [[4, 6, 9]],
        records: [
          { name: 'hth', slot: 4 },
          { name: 'hth', slot: 9 },
          { name: 'hth', slot: 0, lastByte: 0 },
        ],
      }),
      'aiblhth',
    )
    expect(cof.layers.map((layer) => layer.slot)).toEqual([4, 6, 9])
    expect(cof.layers.map((layer) => layer.dir)).toEqual(['la', 'lh', 's2'])
  })

  it('keeps the byte when no slot is missing', () => {
    const cof = parseCof(
      buildCof({
        directions: 1,
        orders: [[0, 1]],
        records: [
          { name: 'hth', slot: 0 },
          { name: 'hth', slot: 1, lastByte: 1 },
        ],
      }),
      'banuhth',
    )
    expect(cof.layers.map((layer) => layer.slot)).toEqual([0, 1])
  })

  it('rejects a file whose layout does not fit', () => {
    const bytes = new Uint8Array(40)
    bytes[0] = 9
    bytes[1] = 16
    bytes[2] = 16
    expect(() => parseCof(bytes)).toThrow(/do not fit/)
  })

  it('rejects a draw order that repeats a layer', () => {
    const bytes = buildCof({
      directions: 1,
      orders: [[0, 0]],
      records: [
        { name: 'hth', slot: 0 },
        { name: 'hth', slot: 1, lastByte: 1 },
      ],
    })
    expect(() => parseCof(bytes)).toThrow(/repeats a layer/)
  })

  it('rejects a draw order that draws a different set of layers', () => {
    const bytes = buildCof({
      directions: 1,
      orders: [
        [0, 1],
        [0, 2],
      ],
      records: [
        { name: 'hth', slot: 0 },
        { name: 'hth', slot: 1, lastByte: 1 },
      ],
    })
    expect(() => parseCof(bytes)).toThrow(/different set/)
  })
})

describe('the naming scheme', () => {
  it('decodes a COF name into class, mode and weapon', () => {
    expect(parseCofFileName('baa11hs')).toEqual({ classCode: 'ba', mode: 'a1', weapon: '1hs' })
    expect(parseCofFileName('barn1hs.cof')).toEqual({ classCode: 'ba', mode: 'rn', weapon: '1hs' })
    expect(parseCofFileName('cof/bas21ht.cof')).toEqual({
      classCode: 'ba',
      mode: 's2',
      weapon: '1ht',
    })
    expect(parseCofFileName('aia1ht1')).toEqual({ classCode: 'ai', mode: 'a1', weapon: 'ht1' })
  })

  it('decodes a DCC name into class, layer, variant, mode and weapon', () => {
    expect(parseDccFileName('bas1hvya11hs')).toEqual({
      classCode: 'ba',
      layer: 's1',
      variant: 'hvy',
      mode: 'a1',
      weapon: '1hs',
    })
    expect(parseDccFileName('s1/bas1hvya11hs.dcc')).toEqual(
      parseDccFileName('bas1hvya11hs'),
    )
    expect(parseDccFileName('bahdba1a11hs')).toEqual({
      classCode: 'ba',
      layer: 'hd',
      variant: 'ba1',
      mode: 'a1',
      weapon: '1hs',
    })
    expect(parseDccFileName('ailhaxfa1ht2')).toEqual({
      classCode: 'ai',
      layer: 'lh',
      variant: 'axf',
      mode: 'a1',
      weapon: 'ht2',
    })
  })

  it('rejects names that are not the scheme', () => {
    // `amwk1hs` and `amblxbow` are the two COF names in the package that no DCC
    // matches: one uses a mode that has no sprites, the other is a 12 byte
    // longer file with a four letter weapon.
    expect(parseCofFileName('amwk1hs')).toBeNull()
    expect(parseCofFileName('amblxbow')).toBeNull()
    expect(parseDccFileName('amblxbow')).toBeNull()
    expect(parseDccFileName('bas1hvya11xz')).toBeNull()
    expect(parseDccFileName('bs1hvya11hs')).toBeNull()
    expect(parseCofFileName('baa11hs')).not.toBeNull()
  })

  it('lists the codes the tree uses', () => {
    expect(CLASS_CODES).toHaveLength(8)
    expect(ANIM_MODES).toHaveLength(18)
    expect(WEAPON_CLASSES).toHaveLength(14)
    expect(LAYER_SLOTS).toHaveLength(11)
  })
})

describe('createCharAnimIndex', () => {
  const listing = [
    'cof/baa11hs.cof',
    'cof/banuhth.cof',
    'cof/bagh1hs.cof',
    'cof/bas21ht.cof',
    's1/bas1hvya11hs.dcc',
    's1/bas1litnuhth.dcc',
    's1/bas1mednuhth.dcc',
    's1/bas1hvyrnhth.dcc',
    'hd/bahdbhma11hs.dcc',
    'rh/barhaxea11hs.dcc',
    'rh/barhaxfbl1hs.dcc',
    'la/balahvya11hs.dcc',
    'la/balahvybl1hs.dcc',
    's3/bas3hvybl1hs.dcc',
  ]

  it('lists the COFs, modes and weapon classes of a class', () => {
    const index = createCharAnimIndex('ba', listing)
    expect(index.classCode).toBe('ba')
    expect(index.cofNames).toEqual(['baa11hs', 'bagh1hs', 'banuhth', 'bas21ht'])
    expect(index.modes).toEqual(['a1', 'bl', 'nu', 'rn'])
    expect(index.weapons).toEqual(['1hs', 'hth'])
    expect(index.layers).toEqual(['hd', 'la', 'rh', 's1', 's3'])
    expect(index.variants).toEqual(['axe', 'axf', 'bhm', 'hvy', 'lit', 'med'])
  })

  it('answers what a mode and weapon have', () => {
    const index = createCharAnimIndex('ba', listing)
    expect(index.cofNamesFor('a1', '1hs')).toEqual(['baa11hs'])
    expect(index.weaponsForMode('a1')).toEqual(['1hs'])
    expect(index.weaponsForMode('bl')).toEqual(['1hs'])
    expect(index.modesForWeapon('hth')).toEqual(['nu', 'rn'])
    expect(index.modesForWeapon('1hs')).toEqual(['a1', 'bl'])
    expect(index.filesFor('nu', 'hth')).toEqual(['s1/bas1litnuhth.dcc', 's1/bas1mednuhth.dcc'])
    expect(index.filesFor('dd', 'hth')).toEqual([])
  })

  it('drops files of other classes and other extensions', () => {
    const index = createCharAnimIndex('ba', [...listing, 's1/ais1litnuhth.dcc', 'notes.txt'])
    expect(index.dccFiles).not.toContain('s1/ais1litnuhth.dcc')
    expect(index.dccFiles).not.toContain('notes.txt')
  })

  it('answers which files satisfy one COF layer, own class first', () => {
    const index = createCharAnimIndex('ba', listing)
    const cof = simpleCof()
    const bodyLayer = cof.layers.find((layer) => layer.dir === 'hd')
    const handLayer = cof.layers.find((layer) => layer.dir === 'rh')
    expect(bodyLayer).toBeDefined()
    expect(handLayer).toBeDefined()
    // The head layer asks for 1hs, and the head only has the helmet variants.
    expect(index.filesForLayer(bodyLayer!, 'a1', '1hs')).toEqual(['hd/bahdbhma11hs.dcc'])
    // The right hand's own class comes before the `hth` fallback.
    expect(index.filesForLayer({ ...handLayer!, name: 'axe' }, 'a1', '1hs')).toEqual([
      'rh/barhaxea11hs.dcc',
    ])
  })

  it('falls back to hth of the same mode when the layer class is missing', () => {
    const index = createCharAnimIndex('ba', listing)
    // The run animation stores its layers under `hth`, so a record asking for
    // 1hs still finds the sprite that exists.
    expect(
      index.filesForLayer({ offsetX: 0, offsetY: 0, name: '1hs', slot: 8, dir: 's1' }, 'rn', '1hs'),
    ).toEqual(['s1/bas1hvyrnhth.dcc'])
  })

  it('refuses to resolve a COF against another class tree', () => {
    const index = createCharAnimIndex('ba', listing)
    const cof = parseCof(
      buildCof({
        directions: 1,
        orders: [[0]],
        records: [{ name: 'hth', slot: 0 }],
      }),
      'ainuhth',
    )
    expect(() => index.resolveLayers(cof)).toThrow(/not ba/)
  })

  it('falls back through hth, the animation weapon and then any class', () => {
    const index = createCharAnimIndex('ba', listing)
    const layer = (name: string, dir: 'la' | 'hd') => ({ offsetX: 0, offsetY: 0, name, slot: 0, dir })
    // 1ht has no left arm file, so the animation weapon (1hs) is not the answer
    // either; `hth` is.
    expect(index.filesForLayer(layer('1ht', 'la'), 'bl', '1hs')).toEqual(['la/balahvybl1hs.dcc'])
    // A class nothing carries falls through to every file of that layer and mode.
    expect(index.filesForLayer(layer('stf', 'hd'), 'a1', '1hs')).toEqual(['hd/bahdbhma11hs.dcc'])
  })
})

describe('resolveLayers', () => {
  const listing = [
    's1/bas1hvya11hs.dcc',
    'hd/bahdbhma11hs.dcc',
    'rh/barhaxea11hs.dcc',
    'rh/barhaxftr1hs.dcc',
  ]

  it('resolves every layer in draw order', () => {
    const resolved = resolveLayers(simpleCof(), listing)
    expect(resolved.map((entry) => entry.layer.dir)).toEqual(['hd', 'tr', 'rh'])
    expect(resolved.map((entry) => entry.file)).toEqual([
      'hd/bahdbhma11hs.dcc',
      null,
      'rh/barhaxea11hs.dcc',
    ])
  })

  it('needs the COF name to know the animation', () => {
    const cof = parseCof(
      buildCof({
        directions: 1,
        orders: [[0]],
        records: [{ name: 'hth', slot: 0 }],
      }),
    )
    expect(() => resolveLayers(cof, listing)).toThrow(/file name/)
  })

  it('rejects a COF name that is not the scheme', () => {
    const cof = parseCof(
      buildCof({
        directions: 1,
        orders: [[0]],
        records: [{ name: 'hth', slot: 0 }],
      }),
      'amblxbow',
    )
    expect(() => resolveLayers(cof, listing)).toThrow(/not <class><mode><weapon>/)
  })
})
