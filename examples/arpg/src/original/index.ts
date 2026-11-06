/**
 * Reading the original game's own assets.
 *
 * The FORMAT readers now live in `@rasenjs/assets` — the Granny containers and
 * their BitKnit2 payload, the NVN texture layouts, the `.ds1` level layout and
 * the manifest checksum. They are pure byte readers and nothing about them is
 * specific to this game, so a host that stages retail assets can use them
 * directly.
 *
 * What stays here is what IS specific: the RomFS tree this game's files come
 * from, the sprite and PNG helpers used by the extraction tools, the physics
 * description read from the data, and the model assembly that turns a decoded
 * mesh into the parts the renderer draws.
 *
 * It contains **no game data**: it reads files the caller supplies and verifies
 * each one against the manifest, which is how a wrong game version is caught
 * instead of decoding into wrong pixels.
 */

export {
  findEntry,
  parseManifest,
  readEntry,
  readFile,
  type ManifestEntry,
  type RomfsSource,
} from './romfs'
export { parseSprite, spriteFrame, spriteToCanvas, type Sprite } from './sprite'
export { encodePng } from './png'
