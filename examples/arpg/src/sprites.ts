/**
 * Procedural art.
 *
 * Every pixel the game draws is generated here at startup into offscreen
 * canvases — the example ships no image files at all, so it has no third-party
 * content to license and stays a single self-contained bundle.
 *
 * A sheet is `columns` frames wide and `rows` directions tall, because
 * `@rasenjs/canvas-2d`'s `sprite` indexes frames as
 * `row = floor(frame / columns)`, `col = frame % columns`. The `spriteFrame`
 * helper below is the only place that arithmetic is allowed to live.
 */

import { TILE_HEIGHT, TILE_WIDTH, spriteDirToWorldAngle } from './iso'

const DIRECTIONS = 8
const WALK_FRAMES = 4

export interface SpriteSheet {
  image: HTMLCanvasElement
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
}

/** Frame index for "actor facing `dir`, walk phase `frame`". */
export function spriteFrame(dir: number, frame: number): number {
  return (dir % DIRECTIONS) * WALK_FRAMES + Math.min(frame, WALK_FRAMES - 1)
}

export const SPRITE_DIRECTIONS = DIRECTIONS
export const SPRITE_WALK_FRAMES = WALK_FRAMES

export interface ActorPalette {
  armor: string
  armorDark: string
  skin: string
  accent: string
  weapon: string
  eye: string
  /** Optional glow behind the figure (elites). */
  aura?: string
}

export interface ActorStyle {
  palette: ActorPalette
  /** Height multiplier — the hero is 1, the elite is noticeably larger. */
  scale?: number
  /** Draw a cape behind the body. */
  cape?: string
  /** Draw a helm instead of a bare head. */
  helm?: boolean
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function fill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/** Cell size shared by every actor sheet. */
const ACTOR_W = 44
const ACTOR_H = 56

/**
 * One actor frame, drawn with its feet at the bottom-centre of the cell.
 *
 * Direction is a real parameter, not a mirror: `facingX` moves the face and the
 * weapon, `facingY` squashes the body and hides the face when the figure turns
 * away. That is what makes eight directions read as eight directions instead of
 * four mirrored twice.
 */
function drawActorFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  style: ActorStyle,
  dir: number,
  frame: number,
  flatColor?: string,
): void {
  const p = style.palette
  const scale = style.scale ?? 1
  const color = (value: string): string => flatColor ?? value

  // The eight sprite directions are the screen's compass with SOUTH first
  // (the retail order: south, south-west, west, north-west, north,
  // north-east, east, south-east), so the world direction a sprite faces
  // runs backwards through the world angles: south is world +X+Y, east is
  // world +X-Y, and so on.
  const angle = spriteDirToWorldAngle(dir)
  const facingX = Math.cos(angle)
  const facingY = Math.sin(angle)

  const cx = ox + ACTOR_W / 2
  const baseY = oy + ACTOR_H - 5
  const bob = frame === 0 ? 0 : -Math.abs(Math.sin((frame / WALK_FRAMES) * Math.PI * 2)) * 1.6
  const swing = frame === 0 ? 0 : Math.sin((frame / WALK_FRAMES) * Math.PI * 2)

  // Keep a sense of depth: turning away shrinks the silhouette a touch.
  const squash = 1 - Math.abs(facingY) * 0.06
  const unit = 18 * scale * squash

  const legacy = (v: number): number => v * scale

  // Ground shadow (never tinted — it is not part of the silhouette).
  if (!flatColor) {
    ellipse(ctx, cx, baseY + 1, 13 * scale, 5 * scale, 'rgba(0,0,0,0.34)')
  }

  if (p.aura && !flatColor) {
    const glow = ctx.createRadialGradient(cx, baseY - unit * 0.8, 2, cx, baseY - unit * 0.8, 26 * scale)
    glow.addColorStop(0, p.aura)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, baseY - unit * 0.8, 26 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  if (style.cape && !flatColor) {
    roundRect(
      ctx,
      cx - legacy(9) - facingX * legacy(1),
      baseY - unit - legacy(2),
      legacy(18),
      unit * 1.05,
      legacy(6),
      style.cape,
    )
  }

  // Legs — swing opposite each other so the walk cycle reads at 4 frames.
  const legTop = baseY - unit * 0.55
  const legH = unit * 0.55
  const legW = legacy(6)
  fill(
    ctx,
    cx - legacy(7) + swing * legacy(4),
    legTop,
    legW,
    legH,
    color(p.armorDark),
  )
  fill(
    ctx,
    cx + legacy(1) - swing * legacy(4),
    legTop,
    legW,
    legH,
    color(p.armorDark),
  )

  // Boots
  fill(ctx, cx - legacy(8) + swing * legacy(4), baseY - legacy(3), legacy(8), legacy(3), color('#2a2118'))
  fill(ctx, cx + swing * -legacy(4), baseY - legacy(3), legacy(8), legacy(3), color('#2a2118'))

  // Torso
  const bodyTop = baseY - unit * 1.55 + bob
  const bodyH = unit * 1.02
  roundRect(ctx, cx - legacy(9), bodyTop, legacy(18), bodyH, legacy(5), color(p.armor))
  fill(ctx, cx - legacy(9), bodyTop + bodyH * 0.55, legacy(18), legacy(3), color(p.accent))

  // Shoulders
  fill(ctx, cx - legacy(11), bodyTop + legacy(1), legacy(5), legacy(7), color(p.armorDark))
  fill(ctx, cx + legacy(6), bodyTop + legacy(1), legacy(5), legacy(7), color(p.armorDark))

  // Head
  const headR = legacy(6.5)
  const headX = cx + facingX * legacy(1.4)
  const headY = bodyTop - headR + bob
  ellipse(ctx, headX, headY, headR, headR * (style.helm ? 1.02 : 0.98), color(style.helm ? p.armorDark : p.skin))

  if (style.helm) {
    fill(ctx, headX - headR, headY - headR * 0.2, headR * 2, headR * 0.55, color(p.armor))
    fill(ctx, headX - headR * 0.7, headY - headR * 1.25, headR * 1.4, headR * 0.75, color(p.accent))
  }

  // Face only while the figure faces the camera.
  if (facingY > -0.2) {
    const eyeShift = facingX * legacy(2.4)
    const eyeY = headY + legacy(0.4)
    fill(ctx, headX - legacy(3.4) + eyeShift, eyeY, legacy(2.4), legacy(2.2), color(p.eye))
    fill(ctx, headX + legacy(1) + eyeShift, eyeY, legacy(2.4), legacy(2.2), color(p.eye))
    fill(ctx, headX - legacy(2) + eyeShift, eyeY + legacy(3.4), legacy(4), legacy(1.4), color('rgba(0,0,0,0.45)'))
  }

  // Weapon, held on the facing side and angled with the direction.
  const handX = cx + facingX * legacy(10)
  const handY = bodyTop + bodyH * 0.45
  ctx.save()
  ctx.translate(handX, handY)
  ctx.rotate(angle * 0.5 + (frame === 0 ? 0 : swing * 0.25) - 0.5)
  fill(ctx, 0, -legacy(3), legacy(2.4), legacy(20), color(p.weapon))
  fill(ctx, -legacy(2.5), legacy(15), legacy(7.4), legacy(3), color(p.accent))
  ctx.restore()
}

export function createActorSheet(style: ActorStyle): SpriteSheet {
  const columns = WALK_FRAMES
  const rows = DIRECTIONS
  const canvas = createCanvas(columns * ACTOR_W, rows * ACTOR_H)
  const ctx = canvas.getContext('2d')!

  ctx.imageSmoothingEnabled = false
  for (let dir = 0; dir < rows; dir++) {
    for (let frame = 0; frame < columns; frame++) {
      drawActorFrame(ctx, frame * ACTOR_W, dir * ACTOR_H, style, dir, frame)
    }
  }

  return {
    image: canvas,
    frameWidth: ACTOR_W,
    frameHeight: ACTOR_H,
    columns,
    rows,
  }
}

/** Same silhouettes, flat white — used for the one-frame hit flash. */
export function createFlashSheet(style: ActorStyle): SpriteSheet {
  const columns = WALK_FRAMES
  const rows = DIRECTIONS
  const canvas = createCanvas(columns * ACTOR_W, rows * ACTOR_H)
  const ctx = canvas.getContext('2d')!

  for (let dir = 0; dir < rows; dir++) {
    for (let frame = 0; frame < columns; frame++) {
      drawActorFrame(ctx, frame * ACTOR_W, dir * ACTOR_H, style, dir, frame, '#ffffff')
    }
  }

  return {
    image: canvas,
    frameWidth: ACTOR_W,
    frameHeight: ACTOR_H,
    columns,
    rows,
  }
}

/** A single-frame prop: tree, rock, brazier, bones, torch. */
export type PropKind = 'pine' | 'deadTree' | 'rock' | 'brazier' | 'bones' | 'pillar'

const PROP_BOX: Record<PropKind, { w: number; h: number }> = {
  pine: { w: 72, h: 104 },
  deadTree: { w: 64, h: 88 },
  rock: { w: 56, h: 44 },
  brazier: { w: 44, h: 64 },
  bones: { w: 48, h: 32 },
  pillar: { w: 56, h: 96 },
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  w: number,
  h: number,
): void {
  const cx = w / 2
  const ground = h - 3

  switch (kind) {
    case 'pine': {
      ellipse(ctx, cx, ground, 24, 8, 'rgba(0,0,0,0.32)')
      fill(ctx, cx - 4, ground - 26, 8, 26, '#3b2a1a')
      for (let i = 0; i < 3; i++) {
        const top = 12 + i * 20
        const half = 12 + i * 9
        ctx.beginPath()
        ctx.moveTo(cx, top)
        ctx.lineTo(cx + half, top + 30)
        ctx.lineTo(cx - half, top + 30)
        ctx.closePath()
        ctx.fillStyle = i === 0 ? '#2f5d3a' : i === 1 ? '#29512f' : '#22462a'
        ctx.fill()
      }
      break
    }
    case 'deadTree': {
      ellipse(ctx, cx, ground, 17, 6, 'rgba(0,0,0,0.3)')
      fill(ctx, cx - 4, ground - 52, 8, 52, '#43331f')
      ctx.strokeStyle = '#43331f'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(cx, ground - 36)
      ctx.lineTo(cx - 16, ground - 56)
      ctx.moveTo(cx, ground - 44)
      ctx.lineTo(cx + 15, ground - 62)
      ctx.stroke()
      break
    }
    case 'rock': {
      ellipse(ctx, cx, ground, 20, 7, 'rgba(0,0,0,0.3)')
      ctx.beginPath()
      ctx.moveTo(cx - 20, ground)
      ctx.lineTo(cx - 12, ground - 22)
      ctx.lineTo(cx + 4, ground - 26)
      ctx.lineTo(cx + 19, ground - 12)
      ctx.lineTo(cx + 16, ground)
      ctx.closePath()
      ctx.fillStyle = '#5b5f68'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx - 12, ground - 22)
      ctx.lineTo(cx + 4, ground - 26)
      ctx.lineTo(cx - 2, ground - 14)
      ctx.closePath()
      ctx.fillStyle = '#767c88'
      ctx.fill()
      break
    }
    case 'brazier': {
      ellipse(ctx, cx, ground, 14, 5, 'rgba(0,0,0,0.3)')
      fill(ctx, cx - 10, ground - 16, 20, 14, '#3b3f47')
      fill(ctx, cx - 13, ground - 20, 26, 6, '#4c525c')
      const fire = ctx.createRadialGradient(cx, ground - 30, 1, cx, ground - 30, 18)
      fire.addColorStop(0, '#fff3b0')
      fire.addColorStop(0.4, '#ff9a2e')
      fire.addColorStop(1, 'rgba(200,40,0,0)')
      ctx.fillStyle = fire
      ctx.beginPath()
      ctx.arc(cx, ground - 30, 18, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'bones': {
      ellipse(ctx, cx, ground, 18, 5, 'rgba(0,0,0,0.28)')
      fill(ctx, cx - 16, ground - 5, 32, 4, '#cfc7b0')
      ellipse(ctx, cx - 10, ground - 8, 5, 4.5, '#e6dfcb')
      fill(ctx, cx - 12, ground - 10, 2.4, 2.4, '#2a2a2a')
      fill(ctx, cx - 8, ground - 10, 2.4, 2.4, '#2a2a2a')
      break
    }
    case 'pillar': {
      ellipse(ctx, cx, ground, 20, 7, 'rgba(0,0,0,0.32)')
      fill(ctx, cx - 12, ground - 74, 24, 74, '#6a6f7a')
      fill(ctx, cx - 15, ground - 78, 30, 8, '#7d8391')
      fill(ctx, cx - 15, ground - 6, 30, 6, '#7d8391')
      fill(ctx, cx - 9, ground - 70, 4, 60, '#565b65')
      break
    }
  }
}

export function createPropSheet(kinds: readonly PropKind[]): SpriteSheet {
  const frameWidth = Math.max(...kinds.map((k) => PROP_BOX[k].w))
  const frameHeight = Math.max(...kinds.map((k) => PROP_BOX[k].h))
  const canvas = createCanvas(frameWidth * kinds.length, frameHeight)

  const ctx = canvas.getContext('2d')!
  kinds.forEach((kind, index) => {
    const box = PROP_BOX[kind]
    const ox = index * frameWidth + (frameWidth - box.w) / 2
    const oy = frameHeight - box.h
    ctx.save()
    ctx.translate(ox, oy)
    drawProp(ctx, kind, box.w, box.h)
    ctx.restore()
  })

  return {
    image: canvas,
    frameWidth,
    frameHeight,
    columns: kinds.length,
    rows: 1,
  }
}

/** Ground tile kinds, drawn into the baked map bitmap. */
export type GroundTile = 'grass' | 'dirt' | 'stone' | 'water' | 'path'

export function groundColors(tile: GroundTile): { top: string; side: string } {
  switch (tile) {
    case 'grass':
      return { top: '#2f4a2e', side: '#1e3320' }
    case 'dirt':
      return { top: '#4a3d2a', side: '#33291b' }
    case 'stone':
      return { top: '#45464a', side: '#2e2f33' }
    case 'water':
      return { top: '#1d3a4d', side: '#142834' }
    case 'path':
      return { top: '#5b4c33', side: '#3d3220' }
  }
}

/** Draw one isometric tile diamond, top face only. */
export function drawIsoTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  top: string,
  side: string,
  lift = 0,
): void {
  const hw = TILE_WIDTH / 2
  const hh = TILE_HEIGHT / 2

  ctx.beginPath()
  ctx.moveTo(cx, cy - hh - lift)
  ctx.lineTo(cx + hw, cy - lift)
  ctx.lineTo(cx, cy + hh - lift)
  ctx.lineTo(cx - hw, cy - lift)
  ctx.closePath()
  ctx.fillStyle = top
  ctx.fill()

  // A thin south/east lip reads as thickness without a second pass.
  ctx.beginPath()
  ctx.moveTo(cx - hw, cy - lift)
  ctx.lineTo(cx, cy + hh - lift)
  ctx.lineTo(cx, cy + hh - lift + 3)
  ctx.lineTo(cx - hw, cy - lift + 3)
  ctx.closePath()
  ctx.fillStyle = side
  ctx.fill()
}

/** Animated fireball — 4 frames of a glowing orb. */
export function createFireballSheet(): SpriteSheet {
  const size = 40
  const frames = 4
  const canvas = createCanvas(size * frames, size)
  const ctx = canvas.getContext('2d')!

  for (let i = 0; i < frames; i++) {
    const cx = i * size + size / 2
    const cy = size / 2
    const pulse = 1 + Math.sin((i / frames) * Math.PI * 2) * 0.14
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 17 * pulse)
    glow.addColorStop(0, '#fff6cf')
    glow.addColorStop(0.35, '#ffb03a')
    glow.addColorStop(0.7, 'rgba(226,72,12,0.75)')
    glow.addColorStop(1, 'rgba(140,20,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2)
    ctx.fill()
  }

  return { image: canvas, frameWidth: size, frameHeight: size, columns: frames, rows: 1 }
}

/** Loot icons: gold, health potion, mana potion, weapon, armour, ring. */
export type LootIcon = 'gold' | 'health' | 'mana' | 'sword' | 'armor' | 'ring' | 'rune'
export const LOOT_ICONS: readonly LootIcon[] = [
  'gold',
  'health',
  'mana',
  'sword',
  'armor',
  'ring',
  'rune',
]

/**
 * The loot sheet, optionally overlaid with the original game's item art.
 *
 * Frames keep the `LOOT_ICONS` order either way, so `game.ts` never needs to know
 * whether real art is present. Icons with no original sprite keep their drawn
 * version — a partially extracted package still renders a complete set.
 */
export function createLootSheet(
  images: Partial<Record<LootIcon, CanvasImageSource>> = {},
): SpriteSheet {
  const size = 36
  const canvas = createCanvas(size * LOOT_ICONS.length, size)
  const ctx = canvas.getContext('2d')!

  LOOT_ICONS.forEach((icon, index) => {
    const cellX = index * size
    const original = images[icon]
    if (original) {
      // Centre the original art in the cell at its own aspect ratio, so a wide
      // sprite does not get squashed into a square frame.
      ctx.clearRect(cellX, 0, size, size)
      const art = original as { width: number; height: number }
      const scale = Math.min((size - 4) / art.width, (size - 4) / art.height)
      const w = art.width * scale
      const h = art.height * scale
      ctx.drawImage(original, cellX + (size - w) / 2, (size - h) / 2, w, h)
      return
    }
    const cx = cellX + size / 2
    const cy = size / 2 + 6
    ellipse(ctx, cx, cy + 8, 11, 4, 'rgba(0,0,0,0.3)')

    switch (icon) {
      case 'gold':
        ellipse(ctx, cx, cy, 9, 5, '#d9a423')
        ellipse(ctx, cx - 3, cy - 3, 7, 4, '#f2c752')
        ellipse(ctx, cx + 4, cy - 5, 5.5, 3.4, '#ffe08a')
        break
      case 'health':
        roundRect(ctx, cx - 5, cy - 8, 10, 14, 3, '#8d1220')
        roundRect(ctx, cx - 4, cy + 5, 8, 4, 2, '#5f0b16')
        fill(ctx, cx - 2, cy - 4, 4, 7, '#ef5b62')
        break
      case 'mana':
        roundRect(ctx, cx - 5, cy - 8, 10, 14, 3, '#16306f')
        roundRect(ctx, cx - 4, cy + 5, 8, 4, 2, '#0d1f4a')
        fill(ctx, cx - 2, cy - 4, 4, 7, '#5ea8f0')
        break
      case 'sword':
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(-0.7)
        fill(ctx, -2, -12, 4, 20, '#c9d1dc')
        fill(ctx, -6, 7, 12, 3, '#8a6a33')
        fill(ctx, -2, 10, 4, 6, '#6a4f26')
        ctx.restore()
        break
      case 'armor':
        ctx.beginPath()
        ctx.moveTo(cx - 8, cy - 8)
        ctx.lineTo(cx + 8, cy - 8)
        ctx.lineTo(cx + 7, cy + 8)
        ctx.lineTo(cx, cy + 11)
        ctx.lineTo(cx - 7, cy + 8)
        ctx.closePath()
        ctx.fillStyle = '#9aa6b8'
        ctx.fill()
        fill(ctx, cx - 2, cy - 6, 4, 12, '#6d7787')
        break
      case 'ring':
        ctx.beginPath()
        ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2)
        ctx.strokeStyle = '#e6c34a'
        ctx.lineWidth = 3
        ctx.stroke()
        fill(ctx, cx - 3, cy - 8, 6, 5, '#7ad7f0')
        break
      case 'rune':
        ctx.beginPath()
        ctx.moveTo(cx, cy - 10)
        ctx.lineTo(cx + 9, cy - 3)
        ctx.lineTo(cx + 6, cy + 9)
        ctx.lineTo(cx - 6, cy + 9)
        ctx.lineTo(cx - 9, cy - 3)
        ctx.closePath()
        ctx.fillStyle = '#3f4b5c'
        ctx.fill()
        fill(ctx, cx - 2, cy - 6, 4, 14, '#ff8a3d')
        fill(ctx, cx - 6, cy - 2, 12, 3, '#ff8a3d')
        break
    }
  })

  return { image: canvas, frameWidth: size, frameHeight: size, columns: LOOT_ICONS.length, rows: 1 }
}

/**
 * A HUD icon rendered to a data URL, so DOM controls can show the same art the
 * canvas does without a second drawing path.
 */
export function iconDataURL(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 48,
): string {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  return canvas.toDataURL()
}
