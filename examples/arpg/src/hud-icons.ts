/**
 * HUD icons, painted once into data URLs.
 *
 * Same art path as the sprites: everything is drawn in code, so the demo ships
 * no image files. Painting them into data URLs lets the DOM HUD show the same
 * visual language as the canvas, without a second drawing surface to keep in
 * sync.
 */

import { iconDataURL } from './sprites'

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void

const metal = (ctx: CanvasRenderingContext2D, size: number): CanvasGradient => {
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, '#cfd6e0')
  gradient.addColorStop(0.55, '#8c94a1')
  gradient.addColorStop(1, '#4d545e')
  return gradient
}

const painters: Record<string, Painter> = {
  sword: (ctx, size) => {
    const cx = size / 2
    ctx.save()
    ctx.translate(cx, size / 2)
    ctx.rotate(-0.72)
    ctx.fillStyle = metal(ctx, size)
    ctx.beginPath()
    ctx.moveTo(-size * 0.055, -size * 0.36)
    ctx.lineTo(size * 0.055, -size * 0.36)
    ctx.lineTo(size * 0.035, size * 0.12)
    ctx.lineTo(-size * 0.035, size * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c9a24a'
    ctx.fillRect(-size * 0.17, size * 0.12, size * 0.34, size * 0.07)
    ctx.fillStyle = '#5a3f1c'
    ctx.fillRect(-size * 0.045, size * 0.19, size * 0.09, size * 0.17)
    ctx.fillStyle = '#d8b45e'
    ctx.beginPath()
    ctx.arc(0, size * 0.38, size * 0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  fireball: (ctx, size) => {
    const cx = size / 2
    const cy = size * 0.54
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const radius = size * (0.34 - i * 0.08)
      const glow = ctx.createRadialGradient(cx, cy - i * 2, 1, cx, cy - i * 2, radius)
      glow.addColorStop(0, '#fff6cf')
      glow.addColorStop(0.4, '#ffab2e')
      glow.addColorStop(0.75, 'rgba(214,64,10,0.6)')
      glow.addColorStop(1, 'rgba(120,16,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy - i * 2, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.fillStyle = 'rgba(255,224,150,0.95)'
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.1, cy - size * 0.16)
    ctx.lineTo(cx + size * 0.02, cy - size * 0.34)
    ctx.lineTo(cx + size * 0.12, cy - size * 0.12)
    ctx.closePath()
    ctx.fill()
  },

  nova: (ctx, size) => {
    const cx = size / 2
    const cy = size / 2
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, size * 0.44)
    glow.addColorStop(0, 'rgba(226,246,255,0.95)')
    glow.addColorStop(0.35, 'rgba(96,180,240,0.7)')
    glow.addColorStop(1, 'rgba(20,60,120,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#cfeaff'
    ctx.lineWidth = Math.max(1.5, size * 0.035)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * size * 0.08, cy + Math.sin(angle) * size * 0.08)
      ctx.lineTo(cx + Math.cos(angle) * size * 0.38, cy + Math.sin(angle) * size * 0.38)
      ctx.stroke()
    }
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.07, 0, Math.PI * 2)
    ctx.fill()
  },

  potion: (ctx, size) => {
    const cx = size / 2
    const body = size * 0.46
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx, size * 0.86, size * 0.3, size * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()

    const glass = ctx.createLinearGradient(0, size * 0.3, 0, size * 0.85)
    glass.addColorStop(0, '#5a0c14')
    glass.addColorStop(0.45, '#a8121f')
    glass.addColorStop(1, '#e04a48')
    ctx.fillStyle = glass
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.14, size * 0.3)
    ctx.lineTo(cx + size * 0.14, size * 0.3)
    ctx.quadraticCurveTo(cx + body / 2, size * 0.52, cx + body / 2, size * 0.68)
    ctx.quadraticCurveTo(cx + body / 2, size * 0.86, cx, size * 0.86)
    ctx.quadraticCurveTo(cx - body / 2, size * 0.86, cx - body / 2, size * 0.68)
    ctx.quadraticCurveTo(cx - body / 2, size * 0.52, cx - size * 0.14, size * 0.3)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.ellipse(cx - size * 0.11, size * 0.6, size * 0.045, size * 0.17, -0.3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#3c2a14'
    ctx.fillRect(cx - size * 0.16, size * 0.22, size * 0.32, size * 0.09)
    ctx.fillStyle = '#7a5a28'
    ctx.fillRect(cx - size * 0.16, size * 0.22, size * 0.32, size * 0.03)
  },

  shield: (ctx, size) => {
    const cx = size / 2
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.3, size * 0.24)
    ctx.lineTo(cx + size * 0.3, size * 0.24)
    ctx.lineTo(cx + size * 0.26, size * 0.6)
    ctx.lineTo(cx, size * 0.82)
    ctx.lineTo(cx - size * 0.26, size * 0.6)
    ctx.closePath()
    ctx.fillStyle = metal(ctx, size)
    ctx.fill()
    ctx.strokeStyle = '#c9a24a'
    ctx.lineWidth = Math.max(1.5, size * 0.04)
    ctx.stroke()
    ctx.fillStyle = '#c9a24a'
    ctx.fillRect(cx - size * 0.035, size * 0.3, size * 0.07, size * 0.34)
  },

  rune: (ctx, size) => {
    const cx = size / 2
    ctx.beginPath()
    ctx.moveTo(cx, size * 0.16)
    ctx.lineTo(cx + size * 0.28, size * 0.34)
    ctx.lineTo(cx + size * 0.22, size * 0.76)
    ctx.lineTo(cx - size * 0.22, size * 0.76)
    ctx.lineTo(cx - size * 0.28, size * 0.34)
    ctx.closePath()
    ctx.fillStyle = '#3a3f4a'
    ctx.fill()
    ctx.strokeStyle = '#ff9a3d'
    ctx.lineWidth = Math.max(1.5, size * 0.045)
    ctx.beginPath()
    ctx.moveTo(cx, size * 0.26)
    ctx.lineTo(cx, size * 0.66)
    ctx.moveTo(cx - size * 0.12, size * 0.4)
    ctx.lineTo(cx + size * 0.12, size * 0.4)
    ctx.moveTo(cx - size * 0.09, size * 0.54)
    ctx.lineTo(cx + size * 0.09, size * 0.54)
    ctx.stroke()
  },

  skull: (ctx, size) => {
    const cx = size / 2
    ctx.fillStyle = '#ded7c0'
    ctx.beginPath()
    ctx.ellipse(cx, size * 0.44, size * 0.26, size * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(cx - size * 0.15, size * 0.6, size * 0.3, size * 0.16)
    ctx.fillStyle = '#171512'
    ctx.beginPath()
    ctx.ellipse(cx - size * 0.1, size * 0.44, size * 0.075, size * 0.09, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + size * 0.1, size * 0.44, size * 0.075, size * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(cx - size * 0.03, size * 0.55, size * 0.06, size * 0.06)
  },

  sound: (ctx, size) => {
    const cx = size / 2
    ctx.fillStyle = '#e6dcc4'
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.26, size * 0.4)
    ctx.lineTo(cx - size * 0.12, size * 0.4)
    ctx.lineTo(cx + size * 0.04, size * 0.26)
    ctx.lineTo(cx + size * 0.04, size * 0.74)
    ctx.lineTo(cx - size * 0.12, size * 0.6)
    ctx.lineTo(cx - size * 0.26, size * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#e6dcc4'
    ctx.lineWidth = Math.max(1.4, size * 0.04)
    ctx.beginPath()
    ctx.arc(cx + size * 0.06, size * 0.5, size * 0.14, -0.9, 0.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx + size * 0.06, size * 0.5, size * 0.24, -0.9, 0.9)
    ctx.stroke()
  },

  mute: (ctx, size) => {
    const cx = size / 2
    ctx.fillStyle = '#8f8676'
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.26, size * 0.4)
    ctx.lineTo(cx - size * 0.12, size * 0.4)
    ctx.lineTo(cx + size * 0.04, size * 0.26)
    ctx.lineTo(cx + size * 0.04, size * 0.74)
    ctx.lineTo(cx - size * 0.12, size * 0.6)
    ctx.lineTo(cx - size * 0.26, size * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#c8402f'
    ctx.lineWidth = Math.max(2, size * 0.055)
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.3, size * 0.26)
    ctx.lineTo(cx + size * 0.3, size * 0.74)
    ctx.moveTo(cx + size * 0.3, size * 0.26)
    ctx.lineTo(cx - size * 0.3, size * 0.74)
    ctx.stroke()
  },
}

const cache = new Map<string, string>()

/**
 * Icons replaced by extracted original artwork, by icon name.
 *
 * Populated once at startup (see `original-assets.ts`). Only icons the package
 * actually contains are replaced; everything else falls through to the drawn
 * version, so a partial extraction still yields a complete HUD.
 */
const overrides = new Map<string, string>()

/** Point an icon at real artwork instead of the drawn fallback. */
export function setIconOverrides(next: Record<string, string>): void {
  overrides.clear()
  cache.clear()
  for (const [name, url] of Object.entries(next)) overrides.set(name, url)
}

/** How many icons are currently served by extracted original art. */
export function iconOverrideCount(): number {
  return overrides.size
}

/** URL (either an override, or a data URL painted once and reused). */
export function hudIcon(name: keyof typeof painters | string, size = 48): string {
  const replaced = overrides.get(name)
  if (replaced) return replaced

  const key = `${name}@${size}`
  const cached = cache.get(key)
  if (cached) return cached
  const painter = painters[name]
  const url = painter
    ? iconDataURL(painter, size)
    : iconDataURL((ctx) => {
        ctx.fillStyle = '#6b5a33'
        ctx.fillRect(0, 0, 8, 8)
      }, size)
  cache.set(key, url)
  return url
}
