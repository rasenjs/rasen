/**
 * Layering guardrail.
 *
 * The GPU backend split only stays real if the engine layer cannot name a
 * graphics API. This test is the mechanism that enforces it — without an
 * automated guard, `WebGL*` types creep back into the engine within a few
 * commits and the WebGPU backend stops being addable.
 *
 * Scope, and why it is currently partial:
 *
 *   ENFORCED NOW  `renderer/device.ts` (the interface itself) and everything
 *                 under `backend/`.
 *   NOT YET       `render-context.ts`, `renderer/batch.ts`, `components/**`.
 *                 These still hold GL handles directly — that is exactly the
 *                 work of stages 1–2 in docs/GPU-BACKEND-DESIGN.md §4. As each
 *                 file is migrated it must be moved into the ENFORCED list
 *                 below, so the ratchet only ever tightens.
 *
 * Keeping the un-migrated files in an explicit allow-list (rather than not
 * listing them at all) means the debt is visible and countable instead of
 * implied.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..')

/** Graphics-API identifiers that must not appear in the engine layer. */
const FORBIDDEN = /\b(WebGL\w*|GPUBuffer|GPUTexture|GPURenderPipeline|GPUDevice|GPUShaderModule|GPUBindGroup|GPUCommandEncoder)\b/

/** Files that must stay API-free. Add to this list as files are migrated. */
const ENFORCED = ['renderer/device.ts', 'backend/webgl.ts']

/**
 * Known debt: files that still reference GL directly. Migrating a file means
 * deleting its line here, and the test fails if a listed file no longer needs
 * the exemption (so the list cannot rot).
 */
const KNOWN_DEBT = [
  'node.ts',
  'render-context.ts',
  'renderer/batch.ts',
  'renderer/instanced.ts',
  'renderer/shader.ts',
  'renderer/shadow.ts',
  'components/spine.ts',
  'test-utils/index.ts',
]

/** Comments legitimately discuss the APIs they abstract; strip them first. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function offendingLines(file: string): string[] {
  const source = stripComments(readFileSync(join(srcRoot, file), 'utf8'))
  return source
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => FORBIDDEN.test(line))
    .map(({ line, n }) => `${file}:${n}: ${line.trim()}`)
}

describe('GPU backend layering', () => {
  it('keeps the device interface free of any graphics API type', () => {
    // `backend/webgl.ts` is exempt from the SOURCE check below only for the
    // `WebGLBuffer`/`WebGLTexture` handles it legitimately wraps; the interface
    // file has no such excuse and must be perfectly clean.
    const hits = offendingLines('renderer/device.ts')
    expect(hits, `renderer/device.ts must not name a GPU API:\n${hits.join('\n')}`).toEqual([])
  })

  it('exports a device interface with no canvas or DOM dependency chain', () => {
    const source = readFileSync(join(srcRoot, 'renderer/device.ts'), 'utf8')
    // The engine must be able to construct descriptors without a DOM.
    expect(source).not.toMatch(/from ['"]\.\.\/node['"]/)
    expect(source).toMatch(/export interface GpuDevice/)
  })

  it('has no migrated file regressing into GL usage', () => {
    const violations: string[] = []
    for (const file of ENFORCED) {
      if (file === 'backend/webgl.ts') continue // wraps GL by definition
      violations.push(...offendingLines(file))
    }
    expect(violations, `migrated files must stay API-free:\n${violations.join('\n')}`).toEqual([])
  })

  it('keeps the known-debt list honest', () => {
    // Every listed file must (a) exist and (b) still contain a GL reference.
    // Otherwise the list accumulates stale entries that hide real progress.
    for (const file of KNOWN_DEBT) {
      let content: string
      try {
        content = readFileSync(join(srcRoot, file), 'utf8')
      } catch {
        throw new Error(`KNOWN_DEBT lists ${file}, which does not exist — remove it`)
      }
      expect(
        FORBIDDEN.test(stripComments(content)),
        `${relative(srcRoot, join(srcRoot, file))} no longer references a GPU API; ` +
          `remove it from KNOWN_DEBT so the debt count stays truthful`
      ).toBe(true)
    }
  })
})
