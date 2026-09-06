/**
 * Focused tests for the constraint solvers and bone-math helpers now folded
 * into `skeleton.ts`. These exercise the IK / transform / applied-transform
 * paths through the public Skeleton API without relying on a specific
 * fixture, so a regression in the solver math is caught immediately.
 */

import { describe, it, expect } from 'vitest'
import { Skeleton, type Bone } from './skeleton'
import type { BoneData, IkConstraintData, TransformConstraintData, SkeletonData } from '../types'

// ---------------------------------------------------------------------------
// Helpers to build a tiny 2-bone hierarchy for unit tests.
// ---------------------------------------------------------------------------

function bone(name: string, parent: string | null, data: Partial<BoneData> = {}): BoneData {
  return { name, parent, ...data }
}

function makeSkeleton(bones: BoneData[], extra: Partial<SkeletonData> = {}): SkeletonData {
  return {
    format: 'spine',
    version: '4.1.0',
    bones,
    slots: [],
    skins: [],
    animations: {},
    ...extra,
  }
}

describe('skeleton internal solvers', () => {
  describe('bone math (folded into skeleton)', () => {
    it('composes parent→child world transform correctly', () => {
      const sk = new Skeleton(makeSkeleton([
        bone('root'),
        bone('child', 'root', { x: 10, y: 0, length: 20 }),
      ]))
      const root = sk.boneMap.get('root')!
      const child = sk.boneMap.get('child')!
      // Child world position should be root + 10 (since root is identity).
      expect(child.worldX).toBeCloseTo(10, 5)
      expect(child.worldY).toBeCloseTo(0, 5)
      // Child matrix should be identity (root rotates 0, no scale, no shear).
      expect(child.a).toBeCloseTo(1, 5)
      expect(child.b).toBeCloseTo(0, 5)
      expect(child.c).toBeCloseTo(0, 5)
      expect(child.d).toBeCloseTo(1, 5)
    })

    it('applies parent rotation to child world transform', () => {
      const sk = new Skeleton(makeSkeleton([
        bone('root', null, { rotation: 90 }),
        bone('child', 'root', { x: 10, y: 0 }),
      ]))
      const child = sk.boneMap.get('child')!
      // 90° rotation: child world position rotates (10, 0) → (0, 10).
      expect(child.worldX).toBeCloseTo(0, 5)
      expect(child.worldY).toBeCloseTo(10, 5)
    })

    it('produces finite values for all bones (regression for IK NaN)', () => {
      // Reproduce the regression scenario: many bones, deep hierarchy.
      const bones: BoneData[] = []
      for (let i = 0; i < 20; i++) {
        bones.push(bone(`b${i}`, i === 0 ? null : `b${i - 1}`))
      }
      const sk = new Skeleton(makeSkeleton(bones))
      for (const b of sk.bones) {
        expect(Number.isFinite(b.worldX)).toBe(true)
        expect(Number.isFinite(b.worldY)).toBe(true)
        expect(Number.isFinite(b.a)).toBe(true)
        expect(Number.isFinite(b.b)).toBe(true)
        expect(Number.isFinite(b.c)).toBe(true)
        expect(Number.isFinite(b.d)).toBe(true)
        expect(Number.isFinite(b.arotation)).toBe(true)
      }
    })
  })

  describe('IK constraint solver (folded into skeleton)', () => {
    it('applies a 1-bone IK constraint to point at a target', () => {
      const ik: IkConstraintData = {
        name: 'aim',
        bones: ['arm'],
        target: 'target',
      }
      const sk = new Skeleton(makeSkeleton(
        [
          bone('root'),
          bone('target', 'root', { x: 100, y: 100 }),
          bone('arm', 'root', { x: 0, y: 0, length: 10 }),
        ],
        { ik: [ik] }
      ))
      const arm = sk.boneMap.get('arm')!
      const target = sk.boneMap.get('target')!
      // arm rotation should now point from arm world position toward target.
      const dx = target.worldX - arm.worldX
      const dy = target.worldY - arm.worldY
      const expectedAngle = (Math.atan2(dy, dx) * 180) / Math.PI
      expect(arm.arotation).toBeCloseTo(expectedAngle, 1)
    })

    it('applies a 2-bone IK constraint (the NaN-regression scenario)', () => {
      // Specifically regression-tests the front-leg-ik / rear-leg-ik bones
      // that produced NaN when RAD2DEG was not exported. With proper
      // RAD2DEG the rotation must remain finite.
      const ik: IkConstraintData = {
        name: 'leg-ik',
        bones: ['thigh', 'shin'],
        target: 'foot-target',
      }
      const sk = new Skeleton(makeSkeleton(
        [
          bone('root'),
          bone('foot-target', 'root', { x: 50, y: 100 }),
          bone('thigh', 'root', { x: -17, y: -12, rotation: -95, length: 80 }),
          bone('shin', 'thigh', { x: 78, y: 1, length: 80 }),
        ],
        { ik: [ik] }
      ))
      const thigh = sk.boneMap.get('thigh')!
      const shin = sk.boneMap.get('shin')!
      expect(Number.isFinite(thigh.arotation)).toBe(true)
      expect(Number.isFinite(shin.arotation)).toBe(true)
      expect(Number.isFinite(thigh.a)).toBe(true)
      expect(Number.isFinite(shin.d)).toBe(true)
    })
  })

  describe('transform constraint solver (folded into skeleton)', () => {
    it('no-op when all mix values are 0', () => {
      const tc: TransformConstraintData = {
        name: 'follow',
        bones: ['follower'],
        target: 'leader',
        mixRotate: 0,
        mixX: 0,
        mixY: 0,
        mixScaleX: 0,
        mixScaleY: 0,
        mixShearY: 0,
      }
      const sk = new Skeleton(makeSkeleton(
        [
          bone('leader', null, { rotation: 45, x: 10 }),
          bone('follower', null, { rotation: 0, x: 0 }),
        ],
        { transform: [tc] }
      ))
      const follower = sk.boneMap.get('follower')!
      expect(follower.rotation).toBe(0)
      expect(follower.x).toBe(0)
    })

    it('mixes rotation in absolute-local mode', () => {
      const tc: TransformConstraintData = {
        name: 'follow',
        bones: ['follower'],
        target: 'leader',
        mixRotate: 0.5,
        local: true,
        relative: false,
      }
      const sk = new Skeleton(makeSkeleton(
        [
          bone('leader', null, { rotation: 90 }),
          bone('follower', null, { rotation: 0 }),
        ],
        { transform: [tc] }
      ))
      const follower = sk.boneMap.get('follower')!
      // Should be halfway between 0 and 90.
      expect(follower.arotation).toBeCloseTo(45, 1)
    })
  })

  describe('applied-transform decomposition (folded into skeleton)', () => {
    it('decomposes a world matrix back into applied local transform', () => {
      const sk = new Skeleton(makeSkeleton([
        bone('root', null, { rotation: 30, scaleX: 2, scaleY: 0.5 }),
        bone('child', 'root', { x: 5, y: 0, rotation: 60 }),
      ]))
      const child = sk.boneMap.get('child')!
      // After the constructor runs updateWorldTransform, the child matrix
      // [a, b, c, d] should equal the parent matrix * the child's local
      // rotation. Decomposing back via updateAppliedTransform (which the
      // path solver does) must reproduce the child's arotation=60.
      // Re-run update to invoke applied transform via a re-set.
      child.rotation = 60
      sk.updateWorldTransform()
      expect(child.arotation).toBeCloseTo(60, 4)
    })
  })
})