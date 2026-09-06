import { computeAttachmentWorldVertices, type SpineAtlas } from '../parsers/atlas'
import type { AttachmentData } from '../types'
import type { Skeleton, Slot, Bone } from './skeleton'

/** Result of a spine hit-test: the topmost slot/attachment under a world point. */
export interface SpineHit {
  /** The slot whose attachment was hit (topmost in draw order). */
  slot: Slot
  /** Attachment name that was hit. */
  attachment: string
  /** The bone driving the hit slot. */
  bone: Bone
}

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/**
 * Hit-test a world-space point against the posed skeleton.
 *
 * Iterates slots topmost-first and point-in-triangle tests each attachment's
 * world vertices. Returns the first (visually topmost) hit, or null. The
 * skeleton must already be posed (world transforms current) — call after
 * `state.apply()` / `skeleton.updateWorldTransform()`.
 */
export function hitTestSpine(
  skeleton: Skeleton,
  atlas: SpineAtlas,
  worldX: number,
  worldY: number
): SpineHit | null {
  for (let i = skeleton.drawOrder.length - 1; i >= 0; i--) {
    const slot = skeleton.drawOrder[i]
    const attName = slot.attachment
    if (!attName) continue
    const att = skeleton.findAttachment(slot.data.name, attName) as AttachmentData | undefined
    if (!att) continue
    const mesh = att as { uvs?: number[] }
    const cap = att.type === 'region' ? 4 : mesh.uvs ? mesh.uvs.length / 2 : 4
    let buf = new Float32Array(Math.max(8, cap * 2))
    let vCount = computeAttachmentWorldVertices(att, slot, skeleton, atlas, attName, buf)
    // First call may have written into a too-small buffer; regrow and retry.
    if (vCount * 2 > buf.length) {
      buf = new Float32Array(vCount * 2)
      vCount = computeAttachmentWorldVertices(att, slot, skeleton, atlas, attName, buf)
    }
    if (!vCount) continue
    for (let t = 0; t < vCount * 3; t += 3) {
      if (
        pointInTriangle(
          worldX,
          worldY,
          buf[2 * t],
          buf[2 * t + 1],
          buf[2 * t + 2],
          buf[2 * t + 3],
          buf[2 * t + 4],
          buf[2 * t + 5]
        )
      ) {
        return { slot, attachment: attName, bone: slot.bone }
      }
    }
  }
  return null
}
