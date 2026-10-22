/**
 * Reading the original game's own assets.
 *
 * Everything in this folder is a port of the reference project's extractors
 * (`dm/ios/tools/romfs_art.py`, `touch_layout.py`, `dm/gfx/nvn/nvn_tex.c`,
 * `dm/gfx/tex/nvn_deswizzle.c`). It contains **no game data**: it reads files the
 * caller supplies and verifies each one against the manifest, which is how a
 * wrong game version is caught instead of decoding into wrong pixels.
 *
 * The reason this exists is narrow and worth stating plainly: original art is the
 * only way to reproduce the original *look*, and the look is the only part of a
 * Diablo II: Resurrected port that art extraction can actually reach. The game's
 * behaviour lives in its compiled program, which no extractor can read.
 */

export { md5, md5Hex } from './md5'
export {
  nvnFmtBpb,
  nvnTexLayout,
  nvnTexLevelOffset,
  nvnTexLevelTiles,
  type NvnTextureDesc,
  type NvnTextureLayout,
} from './nvn-tex'
export {
  decodeBc1,
  decodeDxt5,
  nvnBlOffset,
  nvnDeswizzle,
  nvnDeswizzleGeometry,
  nvnSwizzle,
  type DeswizzleGeometry,
} from './nvn-deswizzle'
export {
  findEntry,
  parseManifest,
  readEntry,
  readFile,
  type ManifestEntry,
  type RomfsSource,
} from './romfs'
export { parseSprite, spriteFrame, spriteToCanvas, type Sprite } from './sprite'
export {
  decodeTexture,
  mipOffset,
  parseTextureHeader,
  type Texture,
  type TextureFormat,
  type TextureHeader,
} from './texture'
export { encodePng } from './png'
