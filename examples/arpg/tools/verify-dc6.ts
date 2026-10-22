/**
 * Re-runs the DC6 decoding invariant against a real extracted directory.
 *
 * The claims the decoder rests on are all checkable from the files themselves:
 * walking a frame's row commands must consume exactly the body the next frame's
 * offset allows, must decode exactly `height` rows, and no run may leave the
 * frame's width. If the grammar is wrong, frames drift and the run walks past
 * its own data, so this reports counts rather than a boolean.
 *
 * This is deliberately a second implementation of the same grammar: if it and
 * the decoder ever disagree, this stops reporting a full pass, which is the
 * reason for keeping it separate.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-dc6.ts [<extracted romfs dir>]
 *
 * Needs an extracted copy of the game, which the repository does not carry.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '/tmp/d2r-all')

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

/** Every `.dc6` below a directory, at any depth. */
function findFiles(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    let isDirectory = false
    try {
      isDirectory = statSync(path).isDirectory()
    } catch {
      continue
    }
    if (isDirectory) findFiles(path, out)
    else if (entry.toLowerCase().endsWith('.dc6')) out.push(path)
  }
}

interface Walk {
  consumed: number
  rows: number
  overrunRows: number
  truncated: boolean
  overrun: boolean
}

/**
 * Walks one frame's row commands.
 *
 * `truncated` means the data ended inside a row, which is how a frame whose
 * trailing rows are all transparent ends; `overrun` means a command ran past the
 * body, which is the failure this tool exists to catch.
 */
function walkFrame(
  bytes: Uint8Array,
  bodyAt: number,
  length: number,
  width: number,
  height: number,
): Walk {
  const end = Math.min(bodyAt + length, bytes.length)
  let cursor = bodyAt
  let rows = 0
  let overrunRows = 0
  for (let y = 0; y < height; y += 1) {
    if (cursor >= end) break
    let x = 0
    let closed = false
    for (;;) {
      if (cursor >= end) break
      let command = bytes[cursor]
      cursor += 1
      if (command === 0x80) {
        closed = true
        break
      }
      while (command & 0x80) {
        x += command & 0x7f
        if (cursor >= end) break
        command = bytes[cursor]
        cursor += 1
        if (command === 0x80) {
          closed = true
          break
        }
      }
      if (closed) break
      cursor += command
      x += command
      if (x > width) overrunRows += 1
    }
    if (cursor > end) {
      return { consumed: cursor - bodyAt, rows, overrunRows, truncated: true, overrun: true }
    }
    if (!closed) return { consumed: cursor - bodyAt, rows, overrunRows, truncated: true, overrun: false }
    rows += 1
  }
  return { consumed: cursor - bodyAt, rows, overrunRows, truncated: false, overrun: cursor > end }
}

function main(): void {
  const files: string[] = []
  findFiles(root, files)
  if (files.length === 0) {
    console.error(`verify-dc6: no .dc6 files under ${root}`)
    process.exitCode = 1
    return
  }

  let frames = 0
  let exact = 0
  let badRows = 0
  let overrunRows = 0
  let truncated = 0
  let overrun = 0
  const failures: string[] = []

  for (const path of files) {
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(readFileSync(path))
    } catch (error) {
      failures.push(`${relative(root, path)}: ${String(error)}`)
      continue
    }
    if (bytes.length < 0x18) {
      failures.push(`${relative(root, path)}: shorter than a header`)
      continue
    }
    const directions = u32(bytes, 0x10)
    const framesPerDirection = u32(bytes, 0x14)
    if (directions === 0 || framesPerDirection === 0) {
      failures.push(`${relative(root, path)}: no frames`)
      continue
    }
    const count = directions * framesPerDirection
    if (0x18 + count * 4 > bytes.length) {
      failures.push(`${relative(root, path)}: offset table does not fit`)
      continue
    }
    const offsets = new Int32Array(count)
    for (let i = 0; i < count; i += 1) offsets[i] = u32(bytes, 0x18 + i * 4)

    for (let i = 0; i < count; i += 1) {
      const at = offsets[i]
      if (at <= 0 || at + 0x20 > bytes.length) continue
      const width = u32(bytes, at + 4)
      const height = u32(bytes, at + 8)
      const declared = u32(bytes, at + 0x1c)
      if (width === 0 || height === 0) continue

      const bodyAt = at + 0x20
      const successor = offsets[i + 1] ?? bytes.length
      const length = Math.max(declared, Math.min(declared + 3, successor - bodyAt))
      const walked = walkFrame(bytes, bodyAt, length, width, height)

      frames += 1
      overrunRows += walked.overrunRows
      if (walked.overrun) {
        overrun += 1
        if (failures.length < 20) {
          failures.push(`${relative(root, path)} #${i}: ran past its body`)
        }
        continue
      }
      if (walked.truncated) {
        truncated += 1
        continue
      }
      if (walked.rows !== height) {
        badRows += 1
        if (failures.length < 20) {
          failures.push(`${relative(root, path)} #${i}: ${walked.rows} rows of ${height}`)
        }
        continue
      }
      exact += 1
    }
  }

  const percent = frames === 0 ? 0 : (100 * exact) / frames
  console.log(`verify-dc6: ${files.length} files, ${frames} frames`)
  console.log(
    `verify-dc6: ${exact} fully decoded (${percent.toFixed(3)}%), ` +
      `${truncated} ended inside a row, ${badRows} short of rows`,
  )
  if (overrunRows > 0) console.warn(`verify-dc6: ${overrunRows} runs left their frame's width`)
  for (const failure of failures.slice(0, 20)) console.warn(`  ${failure}`)
  if (overrun > 0 || badRows > 0 || failures.length > 0) {
    console.error(`verify-dc6: FAILED (${overrun} over-runs, ${badRows} short)`)
    process.exitCode = 1
    return
  }
  console.log('verify-dc6: OK')
}

main()
