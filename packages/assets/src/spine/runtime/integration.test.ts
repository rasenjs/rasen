import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseSpineJsonString } from '../parsers/spine-json'
import { Skeleton } from './skeleton'

const here = dirname(fileURLToPath(import.meta.url))
const RAW = readFileSync(join(here, '__fixtures__', 'spineboy-pro.json'), 'utf8')

describe('real Spine export (spineboy-pro, 4.2.22)', () => {
  const data = parseSpineJsonString(RAW)

  it('parses the skeleton header', () => {
    expect(data.format).toBe('spine')
    expect(data.version).toBe('4.2.22')
    expect(data.hash).toBe('dr3Kr/vMgPA')
    expect(data.width).toBeCloseTo(418.45)
    expect(data.height).toBeCloseTo(686.2)
    expect(data.images).toBe('./images/')
  })

  it('parses all bones, slots, skins and animations', () => {
    expect(data.bones.length).toBe(67)
    expect(data.slots.length).toBe(52)
    expect(data.skins.length).toBeGreaterThanOrEqual(1)
    // 11 animations: aim, death, hoverboard, idle, idle-turn, jump, portal,
    // portal-recharge, run, run-to-idle, shoot
    expect(Object.keys(data.animations).length).toBe(11)
  })

  it('captures attachment variety (region, mesh, boundingbox)', () => {
    const defaultSkin = data.skins.find((s) => s.name === 'default') ?? data.skins[0]
    const types = new Set<string>()
    for (const slot of Object.keys(defaultSkin.attachments)) {
      for (const att of Object.values(defaultSkin.attachments[slot])) {
        if (att.type) types.add(att.type)
      }
    }
    expect(types.has('mesh')).toBe(true)
    expect(types.has('region')).toBe(true)
    expect(types.has('boundingbox')).toBe(true)
  })

  it('builds a skeleton and evaluates a finite world transform for every bone', () => {
    const skel = new Skeleton(data)
    for (const bone of skel.bones) {
      expect(Number.isFinite(bone.worldX)).toBe(true)
      expect(Number.isFinite(bone.worldY)).toBe(true)
      expect(Number.isFinite(bone.a)).toBe(true)
      expect(Number.isFinite(bone.d)).toBe(true)
    }
    // Root bone sits at the skeleton origin (no parent -> tx,ty = local x,y).
    const root = skel.boneMap.get('root')!
    expect(root.parent).toBeNull()
    expect(root.worldX).toBeCloseTo(0)
    expect(root.worldY).toBeCloseTo(0)
  })

  it('composes parent->child world transform correctly', () => {
    const skel = new Skeleton(data)
    const hip = skel.boneMap.get('hip')!
    const crosshair = skel.boneMap.get('crosshair')!
    // crosshair is a child of root, hip is a child of root; both must be
    // reachable and have finite, distinct world positions.
    expect(hip.parent?.data.name).toBe('root')
    expect(crosshair.parent?.data.name).toBe('root')
    expect(hip.worldX).not.toBeCloseTo(crosshair.worldX)
    // hip has y=247.27 in local space under root(rotation 0.05deg) -> worldY ~247
    expect(hip.worldY).toBeGreaterThan(200)
  })

  it('resolves slot attachments through the active skin', () => {
    const skel = new Skeleton(data)
    const torsoSlot = skel.slotMap.get('torso')!
    expect(torsoSlot.attachment).toBe('torso')
    const att = skel.findAttachment('torso', 'torso')
    expect(att).toBeDefined()
    // spineboy's torso is a mesh attachment, not a plain region.
    expect(att?.type).toBe('mesh')
  })
})
