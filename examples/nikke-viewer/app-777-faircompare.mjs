/* eslint-disable */
/**
 * Framing-free comparison of the 777 app screenshots.
 *
 * The three backends are measured through the viewer app, whose *iterative
 * pixel fit* depends on a per-backend pixel readback. WebGPU's readback rejects
 * on this machine, so WebGPU keeps the deterministic bone fit and lands at a
 * ~0.607x smaller scale than Canvas 2D / WebGL (which pixel-fit to 0.3646).
 * Comparing the raw screenshots therefore measures the fit, not the renderer.
 *
 * Method: box-filter BOTH images' content bbox down to one common coarse grid,
 * then diff. Both sides lose the same high-frequency detail, so what remains is
 * a fair measure of "is this the same picture". Downsampling (rather than
 * upsampling the smaller one) avoids inventing detail, which is what made the
 * first attempt at this uninformative.
 *
 * Usage: node app-777-faircompare.mjs canvas webgl
 *        node app-777-faircompare.mjs canvas webgpu
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const OUT = path.join('/Users/wuhaofeng/Projects/@rasen/examples/nikke-viewer', 'reports-777')
const TOL = 8
const GRID = 240

function bboxOf(png) {
  const { width, height, data } = png
  const bg = [data[0], data[1], data[2]]
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const d =
        Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
      if (d > TOL) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Box-filter `png`'s content bbox into a GRID x GRID grid of [r,g,b,cov].
 *
 * Coverage is measured against the BACKGROUND COLOUR, not alpha: the view is
 * configured with an opaque `bg`, so every pixel is alpha 255 and an
 * alpha-based metric reports "fully covered" everywhere (which is exactly how
 * the first version of this file produced a meaningless 1.0000 ratio).
 *
 * `cov` is the share of source pixels in the cell that differ from the
 * background; the colour is averaged over those covered pixels only, so a cell
 * straddling the silhouette keeps the sprite's colour instead of being dragged
 * toward the background.
 */
function gridOf(png, box) {
  const { width, data } = png
  const bg = [data[0], data[1], data[2]]
  const out = new Float64Array(GRID * GRID * 4)
  const cnt = new Float64Array(GRID * GRID)
  const w = box.maxX - box.minX + 1
  const h = box.maxY - box.minY + 1
  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      const gx = Math.min(GRID - 1, Math.floor(((x - box.minX) / w) * GRID))
      const gy = Math.min(GRID - 1, Math.floor(((y - box.minY) / h) * GRID))
      const gi = (gy * GRID + gx) * 4
      const i = (y * width + x) * 4
      const d =
        Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
      cnt[gy * GRID + gx]++
      if (d > TOL) {
        out[gi] += data[i]
        out[gi + 1] += data[i + 1]
        out[gi + 2] += data[i + 2]
        out[gi + 3] += 1
      }
    }
  }
  for (let k = 0; k < GRID * GRID; k++) {
    const n = cnt[k] || 1
    const hit = out[k * 4 + 3]
    if (hit > 0) {
      out[k * 4] /= hit
      out[k * 4 + 1] /= hit
      out[k * 4 + 2] /= hit
    }
    out[k * 4 + 3] = hit / n
  }
  return out
}

const [refMode, candMode] = process.argv.slice(2)
if (!refMode || !candMode) {
  console.error('usage: node app-777-faircompare.mjs <ref> <cand>')
  process.exit(2)
}

const ref = PNG.sync.read(fs.readFileSync(path.join(OUT, `app-777-${refMode}.png`)))
const cand = PNG.sync.read(fs.readFileSync(path.join(OUT, `app-777-${candMode}.png`)))
const refBox = bboxOf(ref)
const candBox = bboxOf(cand)
const A = gridOf(ref, refBox)
const B = gridOf(cand, candBox)

console.log(`${refMode.padEnd(7)} content ${refBox.maxX - refBox.minX + 1}x${refBox.maxY - refBox.minY + 1}`)
console.log(`${candMode.padEnd(7)} content ${candBox.maxX - candBox.minX + 1}x${candBox.maxY - candBox.minY + 1}`)
console.log(`common grid ${GRID}x${GRID}  (box-filtered on both sides)\n`)

let covRef = 0
let covCand = 0
let covAbsDiff = 0
let colorSum = 0
let colorN = 0
let cellsOff = 0
for (let k = 0; k < GRID * GRID; k++) {
  const a = A[k * 4 + 3]
  const b = B[k * 4 + 3]
  covRef += a
  covCand += b
  covAbsDiff += Math.abs(a - b)
  if (Math.abs(a - b) > 0.25) cellsOff++
  if (a > 0.5 && b > 0.5) {
    const d =
      Math.abs(A[k * 4] - B[k * 4]) +
      Math.abs(A[k * 4 + 1] - B[k * 4 + 1]) +
      Math.abs(A[k * 4 + 2] - B[k * 4 + 2])
    colorSum += d
    colorN++
  }
}
const cells = GRID * GRID
console.log(`coverage (sum of cell alpha): ${refMode}=${covRef.toFixed(1)} ${candMode}=${covCand.toFixed(1)}` +
  `  ratio=${(covRef / covCand).toFixed(4)}`)
console.log(`mean |coverage difference| per cell: ${(covAbsDiff / cells).toFixed(4)}` +
  `  (${((covAbsDiff / cells) * 100).toFixed(2)}% of full coverage)`)
console.log(`cells where coverage differs by >0.25: ${cellsOff} / ${cells} (${((cellsOff / cells) * 100).toFixed(2)}%)`)
console.log(`mean colour delta over covered cells: ${(colorSum / Math.max(1, colorN)).toFixed(2)}` +
  `  (of 765 max, n=${colorN})`)
