/**
 * Granny 3D containers, as this build ships them.
 *
 * The retail 3D assets are Granny containers whose payload is BitKnit2-compressed.
 * The three modules here are one reader split by concern: the codec
 * (`bitknit2`), the object tree (`gr2`), and the animation curves (`anim`). They
 * are pure byte readers — no I/O, no images — so a host decides where the bytes
 * come from.
 *
 * The container flow was worked out with reference to the MIT `d2r-mobile`
 * project (`Copyright (c) 2026 jhaizhou`); `gr2.ts` states what that reference
 * contributed beside what was measured against the retail files.
 */

export { BITKNIT2_MAGIC, decodeBitknit2, isBitknit2 } from './bitknit2'
export * from './gr2'
export * from './anim'
