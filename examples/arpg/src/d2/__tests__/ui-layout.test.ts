import { describe, expect, it } from 'vitest'
import { parseJsonc, toStrictJson } from '../ui/jsonc'
import {
  effectiveScale,
  flatten,
  parseLayout,
  parseProfile,
  rectOf,
  resolveLayout,
  uiBoxOf,
  unitOf,
  UNITS_PER_SCREEN_HEIGHT,
} from '../ui/layout'
import { fieldNumber, fieldString, findByType, widgetFilename, type UiWidget } from '../ui/widget'

/**
 * The layout engine.
 *
 * The unit system is not guesswork: the reference project measured it on the
 * running original and wrote the inverse mapping as
 *
 * ```
 * X = (px - W/2) / U ; Y = (py - H) / U     U = H / 2160
 * ```
 *
 * (`dm/ios/tools/gen_hud_v4.py`, "Widget coordinates anchored at the midpoint of
 * the bottom edge"). This file pins that convention: a widget's rect is an
 * offset in units from its parent's anchor point, `unit = height / 2160`, and
 * `scale` is applied rounded to a tenth, as the same script measured ("0.8182
 * acts as 0.8").
 */

function widget(
  name: string,
  type: string,
  fields: Record<string, unknown> = {},
  children: UiWidget[] = [],
): UiWidget {
  return { type, name, fields, children }
}

describe('toStrictJson', () => {
  it('removes line comments', () => {
    expect(toStrictJson('{\n  "a": 1, // why\n  "b": 2\n}')).toBe('{\n  "a": 1, \n  "b": 2\n}')
  })

  it('removes block comments', () => {
    expect(toStrictJson('{ /* note */ "a": 1 }')).toBe('{  "a": 1 }')
  })

  it('keeps a slash inside a string', () => {
    // The naive `sub(r'//.*', '')` fix mangles every asset name, which are full
    // of forward slashes.
    const text = '{"filename": "PANEL/HUD_02/front_panel"}'
    expect(toStrictJson(text)).toBe(text)
    expect(parseJsonc(text)).toEqual({ filename: 'PANEL/HUD_02/front_panel' })
  })

  it('keeps a comment marker inside a string', () => {
    expect(parseJsonc('{"note": "a // b"}')).toEqual({ note: 'a // b' })
  })

  it('drops trailing commas in objects and arrays', () => {
    expect(parseJsonc('{"a": [1, 2,], "b": 3,}')).toEqual({ a: [1, 2], b: 3 })
  })

  it('keeps a comma that separates values', () => {
    expect(parseJsonc('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 })
  })

  it('escapes a raw control character inside a string', () => {
    // Three retail layouts carry a literal newline inside a string.
    expect(parseJsonc('{"text": "one\ntwo"}')).toEqual({ text: 'one\ntwo' })
    expect(parseJsonc('{"text": "a\tb"}')).toEqual({ text: 'a\tb' })
  })

  it('accepts a byte order mark', () => {
    expect(parseJsonc('\uFEFF{"a": 1}')).toEqual({ a: 1 })
  })

  it('reports where it failed rather than throwing a bare SyntaxError', () => {
    expect(() => parseJsonc('{"a": }')).toThrow(/jsonc:/)
  })

  it('does not let an escaped quote end a string', () => {
    expect(parseJsonc('{"a": "he said \\"hi\\"", "b": 1}')).toEqual({ a: 'he said "hi"', b: 1 })
  })
})

describe('parseProfile', () => {
  it('reads named globals and follows references between them', () => {
    const profile = parseProfile(
      '{"FontColorGoldYellow": {"r": 199}, "FontColorGold": "$FontColorGoldYellow"}',
    )
    expect(profile.get('FontColorGoldYellow')).toEqual({ r: 199 })
    expect(profile.get('FontColorGold')).toEqual({ r: 199 })
  })

  it('leaves a cycle as the literal rather than looping', () => {
    const profile = parseProfile('{"a": "$b", "b": "$a"}')
    expect(typeof profile.get('a')).not.toBe('undefined')
  })

  it('rejects a profile that is not an object', () => {
    expect(() => parseProfile('[1]')).toThrow(/must be an object/)
  })
})

describe('parseLayout', () => {
  it('builds the widget tree and resolves $references in fields', () => {
    const root = parseLayout(
      '{"type": "Panel", "name": "p", "fields": {"color": "$Gold"}, "children": [{"type": "ImageWidget", "name": "i", "fields": {"filename": "PANEL/x"}}]}',
      new Map([['Gold', { r: 199 }]]),
    )
    expect(root.type).toBe('Panel')
    expect(root.fields.color).toEqual({ r: 199 })
    expect(root.children).toHaveLength(1)
    expect(widgetFilename(root.children[0])).toBe('PANEL/x')
  })

  it('leaves an unknown $name as the string it was', () => {
    const root = parseLayout('{"type": "Panel", "fields": {"x": "$Missing"}}', new Map())
    expect(root.fields.x).toBe('$Missing')
  })

  it('only treats a whole string as a reference', () => {
    const root = parseLayout('{"type": "Panel", "fields": {"x": "3$Gold"}}', new Map([['Gold', 1]]))
    expect(root.fields.x).toBe('3$Gold')
  })

  it('defaults a missing type, name and children', () => {
    const root = parseLayout('{}')
    expect(root.type).toBe('Widget')
    expect(root.name).toBe('')
    expect(root.children).toEqual([])
  })
})

describe('unit and scale', () => {
  it('is one screen height divided by 2160', () => {
    expect(UNITS_PER_SCREEN_HEIGHT).toBe(2160)
    expect(unitOf({ width: 1280, height: 720 })).toBeCloseTo(1 / 3, 10)
    expect(unitOf({ width: 3840, height: 2160 })).toBe(1)
  })

  it('rounds scale to a tenth, as the original does', () => {
    expect(effectiveScale({ scale: 0.8182 })).toBe(0.8)
    expect(effectiveScale({ scale: 1.449 })).toBe(1.4)
    expect(effectiveScale({})).toBe(1)
    expect(effectiveScale({ scale: 2 })).toBe(2)
  })
})

describe('resolveBox', () => {
  const viewport = { width: 1280, height: 720 }
  const unit = unitOf(viewport)

  it('places a widget at its parent anchor plus its rect offset', () => {
    // The reference's own mapping, inverted: pixel = anchor + units * unit.
    const root = widget('root', 'HUDPanelHD', {
      anchor: { x: 0.5, y: 1 },
      rect: { x: -1454, y: -412, width: 2952, height: 764 },
    })
    const view = resolveLayout(root, viewport)
    expect(view.box.x).toBeCloseTo(viewport.width / 2 - 1454 * unit, 6)
    expect(view.box.y).toBeCloseTo(viewport.height - 412 * unit, 6)
    expect(view.box.width).toBeCloseTo(2952 * unit, 6)
    expect(view.box.height).toBeCloseTo(764 * unit, 6)
  })

  it('lays the interface out in a 16:9 block, not in the viewport', () => {
    // The rule and where it comes from are in `layout.ts`'s header: the interface's
    // scale is derived from the height alone and its placement rectangle from width and
    // height, so a screen that is not 16:9 gives the interface a block of its own.
    const portrait = { width: 1080, height: 1920 }
    expect(uiBoxOf(portrait)).toEqual({ width: 1080, height: 607.5 })
    expect(unitOf(portrait)).toBeCloseTo(607.5 / 2160, 9)

    // Wider than 16:9 but inside the 19:9 cap: the whole width is used.
    const laptop = { width: 1440, height: 900 }
    expect(uiBoxOf(laptop)).toEqual({ width: 1440, height: 810 })
    expect(unitOf(laptop)).toBeCloseTo(810 / 2160, 9)

    // Past the cap the block stops growing sideways, which is the engine's own
    // `2160 * 19/9 = 4560` unit ceiling on its UI canvas.
    const ultrawide = { width: 3440, height: 1440 }
    expect(uiBoxOf(ultrawide)).toEqual({ width: 3040, height: 1440 })

    // A 16:9 screen is the block, so nothing measured at 16:9 moves.
    const hd = { width: 1280, height: 720 }
    expect(uiBoxOf(hd)).toEqual(hd)
    expect(unitOf(hd)).toBeCloseTo(720 / 2160, 9)
  })

  it('anchors the root against the interface block, not the viewport', () => {
    // A widget anchored to the bottom centre has its *origin* at the bottom centre of
    // the block — that is the convention the reference's own worked case shows, a bottom
    // bar written `anchor {0.5, 1}` with `rect.x = -1403` and `rect.y = -222` for a
    // 2774-wide, 250-tall bar, so the negative offsets are what keep it inside the
    // parent rather than hanging below it. On a portrait screen the block is 607 pixels
    // tall inside a 1920-pixel one, so anchoring to the viewport instead would put the
    // bar 1300 pixels lower than the game does.
    const portrait = { width: 1080, height: 1920 }
    const root = widget('root', 'Panel', {
      anchor: { x: 0.5, y: 1 },
      rect: { x: -200, y: -100, width: 400, height: 100 },
    })
    const view = resolveLayout(root, portrait)
    expect(view.box.y).toBeCloseTo(uiBoxOf(portrait).height - 100 * unitOf(portrait), 6)
    expect(view.box.x + view.box.width / 2).toBeCloseTo(portrait.width / 2, 6)
    expect(view.box.y + view.box.height).toBeCloseTo(uiBoxOf(portrait).height, 6)
  })

  it('fills the screen for a widget that states fitToScreen', () => {
    // `titlescreenpanelhd`'s `Background` is a `RectangleWidget` with `fitToScreen`
    // and no rect at all, and `mainmenuloadingpanelhd`'s is the same. Read as "no
    // size" it collapsed to a point and drew nothing.
    const root = widget('root', 'Panel', { fitToParent: true }, [
      widget('bg', 'RectangleWidget', { fitToScreen: true }),
    ])
    const view = resolveLayout(root, viewport)
    expect(view.box.width).toBe(viewport.width)
    expect(view.box.height).toBe(viewport.height)
    const background = view.children[0]
    expect(background.box.width).toBe(viewport.width)
    expect(background.box.height).toBe(viewport.height)
    expect(background.box.x).toBe(0)
    expect(background.box.y).toBe(0)
  })

  it('fills its parent for a widget that states fitToParent', () => {
    // Every screen's root states it, which is how a layout says "I am the viewport"
    // without repeating the size.
    const root = widget('root', 'Panel', { fitToParent: true }, [
      widget('inner', 'Panel', { rect: { x: 100, y: 50, width: 400, height: 200 } }, [
        widget('fill', 'Widget', { fitToParent: true }),
      ]),
    ])
    const view = resolveLayout(root, viewport)
    const inner = view.children[0]
    const fill = inner.children[0]
    expect(fill.box.width).toBeCloseTo(400 * unit, 6)
    expect(fill.box.height).toBeCloseTo(200 * unit, 6)
    expect(fill.box.x).toBeCloseTo(inner.box.x, 6)
  })

  it('measures a child from its parent box, not the viewport', () => {
    const root = widget(
      'root',
      'Panel',
      { anchor: { x: 0, y: 0 }, rect: { x: 100, y: 200, width: 600, height: 300 } },
      [widget('child', 'ImageWidget', { rect: { x: 10, y: 20 } })],
    )
    const view = resolveLayout(root, viewport)
    const child = view.children[0]
    expect(child.box.x).toBeCloseTo(view.box.x + 10 * unit, 6)
    expect(child.box.y).toBeCloseTo(view.box.y + 20 * unit, 6)
  })

  it('uses the anchor to move a child within its parent', () => {
    const root = widget(
      'root',
      'Panel',
      { rect: { x: 0, y: 0, width: 600, height: 300 } },
      [widget('centred', 'TextBoxWidget', { anchor: { x: 0.5, y: 0.5 }, rect: { y: -30 } })],
    )
    const view = resolveLayout(root, viewport)
    const child = view.children[0]
    expect(child.box.x).toBeCloseTo(view.box.x + 0.5 * view.box.width, 6)
    expect(child.box.y).toBeCloseTo(view.box.y + 0.5 * view.box.height - 30 * unit, 6)
  })

  it('multiplies the drawn size by the rounded scale', () => {
    const root = widget('root', 'Panel', { rect: { width: 348, height: 350, scale: 1.6 } })
    const view = resolveLayout(root, viewport)
    expect(view.box.scale).toBe(1.6)
    expect(view.box.width).toBeCloseTo(348 * unit * 1.6, 6)
    expect(view.box.height).toBeCloseTo(350 * unit * 1.6, 6)
  })

  it('falls back to the art size when the rect gives none', () => {
    const root = widget('root', 'ImageWidget', { filename: 'PANEL/x' })
    const view = resolveLayout(root, viewport, () => ({ width: 100, height: 50 }))
    expect(view.box.width).toBeCloseTo(100 * unit, 6)
    expect(view.box.height).toBeCloseTo(50 * unit, 6)
  })

  it('gives a widget with neither rect nor art a zero box rather than a guess', () => {
    const view = resolveLayout(widget('root', 'Widget'), viewport)
    expect(view.box.width).toBe(0)
    expect(view.box.height).toBe(0)
  })
})

describe('widget helpers', () => {
  it('reads typed fields', () => {
    const w = widget('x', 'ImageWidget', { frames: 4, filename: 'A/b', flag: 1 })
    expect(fieldNumber(w.fields, 'frames')).toBe(4)
    expect(fieldNumber(w.fields, 'missing')).toBeUndefined()
    expect(fieldString(w.fields, 'filename')).toBe('A/b')
    expect(fieldString(w.fields, 'empty')).toBeUndefined()
  })

  it('finds widgets by type and by name, depth first', () => {
    const tree = widget('root', 'Panel', {}, [
      widget('a', 'ImageWidget', {}),
      widget('group', 'Widget', {}, [widget('b', 'ImageWidget', {})]),
    ])
    expect(findByType(tree, 'ImageWidget').map((w) => w.name).sort()).toEqual(['a', 'b'])
    expect(findByType(tree, 'Nothing')).toEqual([])
  })

  it('reads a rect without inventing the fields it lacks', () => {
    expect(rectOf(widget('x', 'W', { rect: { x: 1, scale: 2 } }))).toEqual({
      x: 1,
      y: undefined,
      width: undefined,
      height: undefined,
      scale: 2,
    })
    expect(rectOf(widget('x', 'W'))).toEqual({
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
      scale: undefined,
    })
  })
})

describe('flatten', () => {
  it('visits every widget', () => {
    const view = resolveLayout(
      widget('root', 'Panel', {}, [widget('a', 'W', {}, [widget('b', 'W')]), widget('c', 'W')]),
      { width: 100, height: 100 },
    )
    expect(flatten(view).map((w) => w.widget.name).sort()).toEqual(['a', 'b', 'c', 'root'])
  })
})

describe('a real HUD layout, parsed as text', () => {
  // Written the way the retail file is: comments, trailing commas, slashes in
  // asset names, and a widget inside a widget.
  const text = `{
    "type": "HUDPanelHD", "name": "HUDPanel",
    "fields": {
        "priority": 100,
        "anchor": { "x": 0.5, "y": 1 },
        "rect": { "x": -1454, "y": -412, "width": 2952, "height": 764 },
    },
    "children": [
        {
            "type": "AttributeBallWidget", "name": "HealthBall",
            "fields": {
                "rect": { "x": 294, "y": 65, "width": 348, "height": 350 },
                "attribute": "health",
            },
            "children": [
                {
                    "type": "AnimatedImageWidget", "name": "BallImage",
                    "fields": {
                        "filename": "PANEL/HUD_02/HealthManaAnimation/HealthIdle/4k/globe_health_man_idle",
                        "fps": 24, // To not be in sync with mana.
                    },
                },
            ],
        },
    ],
}`

  it('survives the dialect and resolves against the measured units', () => {
    const root = parseLayout(text)
    expect(root.type).toBe('HUDPanelHD')
    const view = resolveLayout(root, { width: 1280, height: 720 })
    expect(view.children).toHaveLength(1)

    const ball = view.children[0]
    expect(ball.widget.name).toBe('HealthBall')
    expect(ball.box.x).toBeCloseTo(view.box.x + 294 * (720 / 2160), 6)
    expect(ball.box.y).toBeCloseTo(view.box.y + 65 * (720 / 2160), 6)

    const image = ball.children[0]
    expect(widgetFilename(image.widget)).toBe(
      'PANEL/HUD_02/HealthManaAnimation/HealthIdle/4k/globe_health_man_idle',
    )
    expect(fieldNumber(image.widget.fields, 'fps')).toBe(24)
  })
})
