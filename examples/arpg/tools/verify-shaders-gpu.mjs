#!/usr/bin/env node
/* eslint-disable */
/**
 * How much of the game's exported shader set is loadable on WebGPU — measured,
 * not asserted.
 *
 * `tools/verify-shaders.ts` reads the 119 translated `.wgsl` modules and reports
 * what they *declare*. This tool is the other half of the claim: for every one of
 * them, in a real WebGPU device, through `@rasenjs/gfx`'s shader-pass layer,
 *
 *   - load the module through the example's own catalogue (`src/shaders.ts`, over
 *     HTTP, so the loader and its cache are the ones a caller would use);
 *   - describe a pipeline from the module's *own reflection* — its bind group
 *     layout, its vertex layout, its render targets — and create it;
 *   - create a bind group for it, with synthesised resources of the right kind
 *     (a uniform buffer, a storage buffer, 1x1 textures of the declared
 *     dimension and sample type, samplers of the declared type);
 *   - and, for the pipelines the frame pass can host, actually draw with them,
 *     with the device's error scope watched.
 *
 * The number that matters is pipelines created / pipelines attempted. Every
 * failure is printed with the WebGPU error that caused it, and every failure must
 * be attributable to a named WebGPU or WGSL rule: a refusal with no reason fails
 * the run, because that is the shape a bug in this layer takes.
 *
 * ## What fails, and why none of it is this layer
 *
 * Four classes were found on this backend, and all four are properties of the
 * translated set rather than of the pipeline layer (the numbers are printed, not
 * remembered here):
 *
 *   - `texture_storage_*<rgba8unorm, read_write>` — the format cannot support
 *     read-write storage access at all. The diagnosis line tries the two accesses
 *     that are supported and reports that neither can host the module as its own
 *     text declares it, which is what makes this unfixable from a bind group
 *     layout: the declaration itself has to change. Seven of the eight only ever
 *     `textureStore` into it, so the SPIR-V was write-only and the translator's
 *     default of `read_write` is what narrowed the set.
 *   - `subgroupShuffle` without the `subgroups` extension — the translator's own
 *     report lists subgroups as a rejection class, and these are the modules that
 *     came through anyway.
 *   - `textureSample`/`textureSampleCompare` outside uniform control flow — again
 *     a rejection class in the translator's report.
 *
 * ## What is synthesised, and why that is honest
 *
 * A module here is one *stage*: 32 declare a vertex entry point, 71 a fragment
 * one, 16 a compute one, and none declares both (see `verify-shaders.ts`). A
 * render pipeline needs two stages, so a scaffold stage is generated for the
 * missing half — mechanically, from the other stage's reflected interface:
 *
 *   - a fragment module gets a vertex stage that writes exactly the `@location`
 *     inputs it declares (with their types and interpolation), plus
 *     `@builtin(position)`;
 *   - a vertex module gets a fragment stage that consumes nothing, which is
 *     legal: extra vertex outputs are allowed.
 *
 * The scaffold is a fixture, not a claim about the game: it exists so that one
 * module can be judged *alone*, and WHICH scaffold was used is printed for every
 * module. Pairing the game's own vertex and fragment modules instead is a
 * different question, and it is answered where it can be: `verify-shaders.ts`
 * reports, from the reflections, how many fragment modules some vertex module can
 * feed. Most cannot, because the modules bind different resources at the same
 * `@group/@binding` — they were split into separate binaries by the translator,
 * and their per-module binding tables disagree.
 *
 * ## Bind group entries are reflection, not a game table
 *
 * The module's `@group/@binding` declarations, classified into WebGPU kinds, ARE
 * the bind group layout. Nothing here knows what a binding *means*; a dummy of the
 * declared kind is enough to satisfy pipeline creation. The keys are opaque
 * hashes, so there is no table to consult even if one wanted to.
 *
 * Usage:
 *   yarn workspace @rasenjs/examples-arpg dev   # or: cd examples/arpg && vite --port 5199
 *   node examples/arpg/tools/verify-shaders-gpu.mjs [url]
 *
 * Needs the generated shader set (`public/original/shaders/`) and a browser with
 * WebGPU (`--enable-unsafe-webgpu`). Exits 1 when the checks fail.
 */

import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const HERE = dirname(fileURLToPath(import.meta.url))
const URL = process.argv[2] ?? 'http://localhost:5199/webgpu-probe.html'
const SHADERS_DIR = resolve(HERE, '../public/original/shaders')
/** The gfx *source* for the WebGPU backend, served by the dev server. The
 *  package index is not used: it re-exports the component tree, none of which
 *  this check needs. Importing the source means the check follows the working
 *  tree rather than a stale `dist` build. */
const GFX_ENTRY = resolve(HERE, '../../../packages/gfx/src/renderer/gpu/index.ts')
/** Vite serves files outside the project root under `/@fs`. */
const GFX_URL = `/@fs${GFX_ENTRY}`
/** The example's catalogue module, transformed by the dev server on request. */
const CATALOGUE = '/src/shaders.ts'

const failures = []
const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail })
  if (!condition) failures.push(`${name}: ${detail}`)
}

function percent(part, whole) {
  return whole === 0 ? '0%' : `${((part / whole) * 100).toFixed(1)}%`
}

const ids = readdirSync(SHADERS_DIR)
  .filter((name) => name.endsWith('.wgsl'))
  .map((name) => name.slice(0, -'.wgsl'.length))
  .sort()

if (ids.length === 0) {
  console.error(`No .wgsl modules in ${SHADERS_DIR}.`)
  console.error('The set is generated from a local copy of the game (see src/original/README.md).')
  process.exit(2)
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  await page.goto(URL, { waitUntil: 'load' })
  const ready = await page
    .waitForFunction(() => window.__gpu && window.__gpu.ok !== undefined, { timeout: 25000 })
    .then(() => true)
    .catch(() => false)
  if (!ready) {
    console.error(`The WebGPU probe page never reported. Is ${URL} served?`)
    process.exit(2)
  }

  const report = await page.evaluate(
    async ({ ids, catalogueUrl, gfxUrl }) => {
      // --- the one part that runs in Node is the id list; the rest is the browser
      const cat = await import(/* @vite-ignore */ catalogueUrl)
      const gfx = await import(/* @vite-ignore */ gfxUrl)

      const out = {
        ok: true,
        adapter: null,
        loaded: 0,
        parsed: 0,
        parseErrors: [],
        attempted: 0,
        created: 0,
        bindGroupsCreated: 0,
        createdIds: [],
        failures: [],
        modes: {},
        drawn: 0,
        drawFailures: [],
      }

      /**
       * Classify a failure by the evidence in it. A failure this function cannot
       * attribute is `unexplained`, and the run fails: every refusal has to be a
       * named WebGPU or WGSL rule, or it is this adapter's bug.
       */
      const classify = (error) => {
        if (/^\s*line \d+:\d+/.test(error)) return 'wgsl compile error'
        if (/storage texture access/.test(error)) return 'storage texture access'
        if (/uniform control flow/.test(error)) return 'uniform control flow'
        if (/subgroup/.test(error)) return 'subgroup built-in'
        if (/Invalid|invalid|validation/i.test(error)) return 'pipeline state'
        return 'unexplained'
      }

      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) {
        out.ok = false
        out.error = 'no adapter'
        return out
      }
      out.adapter = adapter.info ? { ...adapter.info } : {}
      const device = await adapter.requestDevice()

      // 1. Load and reflect every module through the catalogue (HTTP + cache).
      //    `probeShaders` is the catalogue's own "which keys are present" answer;
      //    the sources it warms are then served from its cache, not refetched.
      const presence = await cat.probeShaders(ids)
      out.present = presence.present.length
      out.missing = presence.missing
      const translation = await cat.loadTranslationReport()
      out.translation = translation
        ? {
            translated: translation.translated,
            failures: translation.failures.length,
            classes: Object.keys(translation.byReason).length - 1,
          }
        : null

      const source = new Map()
      const reflection = new Map()
      for (const id of ids) {
        const text = await cat.loadShaderSource(id)
        if (text === null) {
          out.parseErrors.push({ id, error: 'not served' })
          continue
        }
        out.loaded++
        const parsed = cat.reflectWgsl(text)
        if (!parsed) {
          out.parseErrors.push({ id, error: 'reflection failed' })
          continue
        }
        out.parsed++
        source.set(id, text)
        reflection.set(id, parsed)
      }
      out.cache = cat.shaderCacheStats()

      // 2. Resources of every kind the set declares, created once and reused: a
      //    bind group entry only has to satisfy the layout, not hold data.
      const uniformBuffer = device.createBuffer({
        size: 65536,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      const storageBuffer = device.createBuffer({
        size: 65536,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      const sampler = device.createSampler({})
      const comparisonSampler = device.createSampler({ compare: 'less' })
      const textureViews = new Map()
      /** Entries here are the pipeline's *declarations* (gfx's field names), so
       *  the storage format arrives as `format`, not `storageFormat`. */
      const textureViewFor = (binding) => {
        const dimension = binding.viewDimension ?? '2d'
        const format =
          binding.kind === 'storage-texture'
            ? binding.format
            : binding.kind === 'depth-texture'
              ? 'depth32float'
              : binding.sampleType === 'sint'
                ? 'rgba8sint'
                : binding.sampleType === 'uint'
                  ? 'rgba8uint'
                  : 'rgba8unorm'
        if (!format) throw new Error(`binding ${binding.binding} declares no storage texture format`)
        const key = `${dimension}|${format}|${binding.multisampled ? 4 : 1}`
        const cached = textureViews.get(key)
        if (cached) return cached
        const layers = dimension === 'cube' || dimension === 'cube-array' ? 6 : 1
        const texture = device.createTexture({
          size: dimension === '3d' ? [1, 1, 1] : dimension === '1d' ? [1, 1] : [1, 1, layers],
          dimension: dimension === '3d' ? '3d' : dimension === '1d' ? '1d' : '2d',
          format,
          sampleCount: binding.multisampled ? 4 : 1,
          usage:
            binding.kind === 'storage-texture'
              ? GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
              : GPUTextureUsage.TEXTURE_BINDING,
        })
        const view = texture.createView({ dimension })
        textureViews.set(key, view)
        return view
      }

      // 3. A pipeline description from one module's reflection.
      const VERTEX_FORMATS = {
        f32: 'float32',
        'vec2<f32>': 'float32x2',
        'vec3<f32>': 'float32x3',
        'vec4<f32>': 'float32x4',
        u32: 'uint32',
        'vec2<u32>': 'uint32x2',
        'vec3<u32>': 'uint32x3',
        'vec4<u32>': 'uint32x4',
        i32: 'sint32',
        'vec2<i32>': 'sint32x2',
        'vec3<i32>': 'sint32x3',
        'vec4<i32>': 'sint32x4',
      }
      const TARGET_FORMATS = { f32: 'rgba8unorm', u32: 'rgba8uint', i32: 'rgba8sint' }

      const componentCount = (format) => Number(/(\d)$/.exec(format)?.[1] ?? 1)

      /** One interleaved buffer, attributes packed in location order. A real
       *  caller states its mesh layout; the pipeline layer never infers it. */
      const vertexBuffersFor = (entry) => {
        const attributes = []
        let offset = 0
        for (const input of entry.inputs) {
          if (input.location === undefined) continue
          const format = VERTEX_FORMATS[input.type]
          if (!format) return null
          attributes.push({ shaderLocation: input.location, offset, format })
          offset += componentCount(format) * 4
        }
        if (attributes.length === 0) return { buffers: [], stride: 0 }
        return { buffers: [{ arrayStride: offset, attributes }], stride: offset }
      }

      /** Target formats from the fragment stage's own output types. */
      const targetsFor = (entry) => {
        const byLocation = new Map()
        for (const output of entry.outputs) {
          if (output.location === undefined) continue
          const base = /^vec?\d?<\s*(f32|u32|i32)\s*>$/.exec(output.type.trim())
          const scalar = base ? base[1] : output.type.trim() === 'f32' ? 'f32' : null
          if (!scalar) return null
          byLocation.set(output.location, { format: TARGET_FORMATS[scalar] })
        }
        return [...byLocation.keys()]
          .sort((a, b) => a - b)
          .map((location) => byLocation.get(location))
      }

      /** A depth attachment, when the fragment stage needs one to exist at all:
       *  it writes `@builtin(frag_depth)`, or it writes nothing — and WebGPU
       *  rejects a pipeline with no attachment anywhere. Derived from the
       *  reflection, and reported as its own mode, because such a pipeline needs
       *  the caller to own a pass with a depth attachment; the frame pass this
       *  renderer provides has none. */
      const DEPTH_STATE = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
      const needsDepth = (entry, targets) =>
        entry.outputs.some((output) => output.builtin === 'frag_depth') || targets.length === 0

      /** The stage a fragment module does not have: writes exactly the inputs it
       *  declares, with their types and interpolation. */
      const scaffoldVertexFor = (entry) => {
        const fields = ['  @builtin(position) position : vec4<f32>,']
        for (const input of entry.inputs) {
          if (input.location === undefined) continue
          const interpolation = input.interpolation ? ` @interpolate(${input.interpolation})` : ''
          fields.push(`  @location(${input.location})${interpolation} v${input.location} : ${input.type},`)
        }
        return `struct ScaffoldOut {\n${fields.join('\n')}\n}
@vertex
fn main() -> ScaffoldOut {
  var out : ScaffoldOut;
  out.position = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  return out;
}`
      }

      /** The stage a vertex module does not have: consumes nothing, which is
       *  legal — extra vertex outputs are not an error. */
      const SCAFFOLD_FRAGMENT = `@fragment
fn main() -> @location(0) vec4<f32> { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }`

      /** The declared bindings of a module as gfx's bind group declarations. */
      const bindGroupsFor = (reflection) => {
        const byGroup = new Map()
        for (const binding of reflection.bindings) {
          // Two names in one slot is legal WGSL and is how the translator emitted
          // an aliased resource; the slot is declared once, with its shape.
          const entries = byGroup.get(binding.group) ?? new Map()
          if (!entries.has(binding.binding)) {
            entries.set(binding.binding, {
              binding: binding.binding,
              kind: binding.kind,
              sampleType: binding.sampleType,
              viewDimension: binding.viewDimension,
              multisampled: binding.multisampled,
              access: binding.storageAccess,
              format: binding.storageFormat,
              samplerType: binding.samplerType,
            })
          }
          byGroup.set(binding.group, entries)
        }
        return [...byGroup.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([group, entries]) => ({
            group,
            entries: [...entries.values()].sort((a, b) => a.binding - b.binding),
          }))
      }

      const resourcesFor = (bindGroups) => {
        const groups = []
        for (const group of bindGroups) {
          const entries = []
          for (const entry of group.entries) {
            if (entry.kind === 'uniform') entries.push({ binding: entry.binding, buffer: uniformBuffer })
            else if (entry.kind === 'storage' || entry.kind === 'read-only-storage') {
              entries.push({ binding: entry.binding, buffer: storageBuffer })
            } else if (entry.kind === 'texture' || entry.kind === 'storage-texture' || entry.kind === 'depth-texture') {
              entries.push({ binding: entry.binding, texture: textureViewFor(entry) })
            } else if (entry.kind === 'comparison-sampler') {
              entries.push({ binding: entry.binding, sampler: comparisonSampler })
            } else {
              entries.push({ binding: entry.binding, sampler })
            }
          }
          groups.push({ group: group.group, entries })
        }
        return groups
      }

      // 4. One canvas-backed renderer: the draw phase has to go through the real
      //    frame path, so the pipeline is judged in the pass it would be used in.
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const renderer = new gfx.WebGPURenderer(canvas.getContext('webgpu'), device, {
        format: 'rgba8unorm',
      })

      /** What would happen if a read-write storage texture were declared with
       *  another access — the diagnosis for the one failure class whose cause is
       *  not the caller's layout. */
      const accessDiagnosis = async (options, access) => {
        const relaxed = (options.bindGroups ?? []).map((group) => ({
          group: group.group,
          entries: group.entries.map((entry) =>
            entry.kind === 'storage-texture' ? { ...entry, access } : entry,
          ),
        }))
        let refused = null
        device.pushErrorScope('validation')
        const result = await renderer.compileShaderPipeline({
          ...options,
          label: `${options.label ?? 'diagnosis'} ${access}`,
          bindGroups: relaxed,
          onError: (message) => {
            refused = message
          },
        })
        const scope = await device.popErrorScope()
        let message = null
        if (!result.pipeline) message = String(refused ?? result.error ?? 'refused').split('\n')[0]
        else if (scope) message = scope.message.split('\n')[0]
        if (result.pipeline) renderer.destroyShaderPipeline(result.pipeline)
        return message ?? 'creates'
      }

      /** Record a failure, classified by the evidence in it. A failure whose
       *  class is `unexplained` fails the run: every refusal has to be a named
       *  WebGPU or WGSL rule, or it is a bug in this pipeline layer. */
      const record = async (failure) => {
        const error = String(failure.error)
        const entry = {
          id: failure.id,
          mode: failure.mode,
          error: error.split('\n')[0],
          class: classify(error),
        }
        if (entry.class === 'storage texture access' && failure.options) {
          const writeOnly = await accessDiagnosis(failure.options, 'write-only')
          const readOnly = await accessDiagnosis(failure.options, 'read-only')
          entry.diagnosis = `declared write-only: ${writeOnly}; read-only: ${readOnly}`
        }
        out.failures.push(entry)
      }

      const drawable = []
      for (const id of ids) {
        const parsed = reflection.get(id)
        if (!parsed) continue
        out.attempted++

        const vertexEntry = parsed.entryPoints.find((entry) => entry.stage === 'vertex')
        const fragmentEntry = parsed.entryPoints.find((entry) => entry.stage === 'fragment')
        const computeEntry = parsed.entryPoints.find((entry) => entry.stage === 'compute')
        const bindGroups = bindGroupsFor(parsed)

        let options = null
        let mode = null
        if (computeEntry) {
          mode = 'compute (own stage)'
          options = {
            label: id,
            compute: { module: source.get(id), entryPoint: computeEntry.name },
            bindGroups,
          }
        } else if (vertexEntry && fragmentEntry) {
          const layout = vertexBuffersFor(vertexEntry)
          const targets = targetsFor(fragmentEntry)
          if (!layout || !targets) {
            await record({
              id,
              mode: 'vertex+fragment (own stages)',
              error: !layout ? 'vertex attribute type not expressible' : 'fragment output type not expressible',
            })
            continue
          }
          mode = needsDepth(fragmentEntry, targets)
            ? 'vertex+fragment (own stages, depth attachment)'
            : 'vertex+fragment (own stages)'
          options = {
            label: id,
            vertex: { module: source.get(id), entryPoint: vertexEntry.name, buffers: layout.buffers },
            fragment: { module: source.get(id), entryPoint: fragmentEntry.name, targets },
            bindGroups,
            stride: layout.stride,
            depthStencil: needsDepth(fragmentEntry, targets) ? DEPTH_STATE : undefined,
          }
        } else if (vertexEntry) {
          mode = 'vertex (scaffold fragment)'
          const layout = vertexBuffersFor(vertexEntry)
          if (!layout) {
            await record({ id, mode, error: 'vertex attribute type not expressible' })
            continue
          }
          options = {
            label: id,
            vertex: { module: source.get(id), entryPoint: vertexEntry.name, buffers: layout.buffers },
            fragment: {
              module: SCAFFOLD_FRAGMENT,
              entryPoint: 'main',
              targets: [{ format: 'rgba8unorm' }],
            },
            bindGroups,
            stride: layout.stride,
          }
        } else if (fragmentEntry) {
          const targets = targetsFor(fragmentEntry)
          if (!targets) {
            await record({ id, mode: 'fragment (scaffold vertex)', error: 'fragment output type not expressible' })
            continue
          }
          const depth = needsDepth(fragmentEntry, targets)
          mode = depth
            ? targets.length === 0
              ? 'fragment (scaffold vertex, writes nothing → depth attachment)'
              : 'fragment (scaffold vertex, frag_depth → depth attachment)'
            : 'fragment (scaffold vertex)'
          options = {
            label: id,
            vertex: { module: scaffoldVertexFor(fragmentEntry), entryPoint: 'main', buffers: [] },
            fragment: { module: source.get(id), entryPoint: fragmentEntry.name, targets },
            bindGroups,
            stride: 0,
            depthStencil: depth ? DEPTH_STATE : undefined,
          }
        } else {
          await record({ id, mode: 'none', error: 'no entry point' })
          continue
        }

        out.modes[mode] = (out.modes[mode] ?? 0) + 1

        // Creation is where WebGPU reports layout and state mistakes (thrown) and
        // where a WGSL error arrives asynchronously; both are captured. An
        // invalid pipeline is not a created pipeline, so it is released here
        // rather than counted.
        let refused = null
        device.pushErrorScope('validation')
        const result = await renderer.compileShaderPipeline({
          ...options,
          onError: (message) => {
            refused = message
          },
        })
        const scopeError = await device.popErrorScope()
        if (!result.pipeline) {
          await record({ id, mode, error: refused ?? result.error ?? 'refused with no reason', options })
          continue
        }
        if (scopeError) {
          renderer.destroyShaderPipeline(result.pipeline)
          await record({ id, mode, error: refused ?? scopeError.message, options })
          continue
        }
        out.created++
        out.createdIds.push({ id, mode, targets: options.fragment?.targets?.length ?? 0 })

        let group = null
        let groupError = null
        let groupEntries = []
        try {
          groupEntries = resourcesFor(bindGroups).find((candidate) => candidate.group === 0)?.entries ?? []
        } catch (error) {
          await record({ id, mode, error: String(error) })
          continue
        }
        group = renderer.createShaderBindGroup(result.pipeline, {
          group: 0,
          entries: groupEntries,
          onError: (message) => {
            groupError = message
          },
        })
        if (!group && bindGroups.length > 0) {
          await record({ id, mode, error: `bind group refused: ${groupError ?? 'no reason'}` })
          continue
        }
        out.bindGroupsCreated++

        const firstTarget = options.fragment?.targets?.[0]?.format
        if (
          mode !== 'compute (own stage)' &&
          options.fragment?.targets?.length === 1 &&
          firstTarget === 'rgba8unorm' &&
          !options.depthStencil
        ) {
          drawable.push({ id, pass: result.pipeline, group, stride: options.stride ?? 0 })
        }
      }

      // 5. Draw with the ones the frame pass can host — one target, no depth —
      //    each in its own frame so a validation error is attributable.
      for (const entry of drawable) {
        device.pushErrorScope('validation')
        const draw = {
          pass: entry.pass,
          bindGroups: [entry.group],
          order: 0,
        }
        if (entry.stride > 0) draw.vertices = new Float32Array(3 * (entry.stride / 4))
        else draw.vertexCount = 3
        renderer.drawShaderPass(draw)
        renderer.requestRedraw()
        const error = await device.popErrorScope()
        if (error) out.drawFailures.push({ id: entry.id, error: error.message })
        else out.drawn++
      }
      out.drawable = drawable.length

      // 6. Leave nothing behind: every buffer this renderer created for a bind
      //    group is destroyed here, which is the documented ownership rule.
      renderer.destroy()
      return out
    },
    { ids, catalogueUrl: CATALOGUE, gfxUrl: GFX_URL },
  )

  if (!report.ok) {
    console.error(`WebGPU failed: ${report.error}`)
    process.exit(1)
  }

  console.log(`adapter: ${JSON.stringify(report.adapter)}`)
  console.log(`modules: ${ids.length} on disk`)
  console.log(`  reported present by the catalogue: ${report.present}${report.missing.length > 0 ? `, missing: ${report.missing.join(', ')}` : ''}`)
  console.log(`  loaded through the catalogue: ${report.loaded}`)
  console.log(`  reflected: ${report.parsed}`)
  if (report.translation) {
    console.log(
      `  translator's own report: ${report.translation.translated} programs translated, ` +
        `${report.translation.failures} rejected in ${report.translation.classes} classes ` +
        `(program names, not keys — it cannot be joined to these ${ids.length} modules)`,
    )
  }
  console.log(`  pipelines attempted: ${report.attempted}`)
  console.log(`  pipelines created:   ${report.created} (${percent(report.created, report.attempted)})`)
  console.log(`  bind groups created: ${report.bindGroupsCreated}`)
  for (const [mode, count] of Object.entries(report.modes)) {
    console.log(`    ${mode}: ${count}`)
  }
  console.log(
    `  drawn in the frame pass: ${report.drawn} of ${report.drawable ?? 0} drawable` +
      ` (a pipeline with several targets, an integer output or a depth attachment cannot be drawn into the` +
      ` frame's single rgba8unorm attachment, so it is created but not drawn)`,
  )

  const byClass = new Map()
  for (const failure of report.failures) {
    const list = byClass.get(failure.class) ?? []
    list.push(failure)
    byClass.set(failure.class, list)
  }
  console.log(`\nfailures (${report.failures.length}), by class:`)
  for (const [name, list] of [...byClass.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(3)}  ${name}`)
  }
  for (const failure of report.failures) {
    console.log(`\n  ${failure.id} [${failure.mode}] — ${failure.class}`)
    console.log(`    ${failure.error}`)
    if (failure.diagnosis) console.log(`    diagnosis: ${failure.diagnosis}`)
  }
  if (report.drawFailures.length > 0) {
    console.log(`\ndraw failures (${report.drawFailures.length}):`)
    for (const failure of report.drawFailures) {
      console.log(`  ${failure.id} — ${failure.error}`)
    }
  }

  const unexplained = report.failures.filter((failure) => failure.class === 'unexplained')
  check('every module is served and reflected', report.parsed === ids.length, `${report.parsed} of ${ids.length}`)
  check(
    'the catalogue reports every module present',
    report.present === ids.length && report.missing.length === 0,
    `${report.present} present, ${report.missing.join(', ') || 'none missing'}`,
  )
  check(
    'every module is accounted for: created, or refused with a named rule',
    report.created + report.failures.length === report.attempted,
    `${report.created} created + ${report.failures.length} refused of ${report.attempted} attempted`,
  )
  check(
    'every refusal is a named WebGPU or WGSL rule, not a silent refusal',
    unexplained.length === 0,
    unexplained.map((failure) => `${failure.id}: ${failure.error}`).join(' | '),
  )
  check(
    'every created pipeline got a bind group',
    report.bindGroupsCreated === report.created,
    `${report.bindGroupsCreated} for ${report.created} pipelines`,
  )
  check(
    'the draw path was exercised and drew without a validation error',
    report.drawable > 0 && report.drawFailures.length === 0,
    `${report.drawn} drawn of ${report.drawable} drawable, ${report.drawFailures.length} failure(s)`,
  )
  check('the catalogue cached every module', report.cache?.known === ids.length, JSON.stringify(report.cache))
} finally {
  await browser.close()
}

console.log('')
for (const { name, pass, detail } of checks) {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${pass ? '' : ` — ${detail}`}`)
}
console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} WebGPU shader check(s) failed`)
  process.exit(1)
}
console.log(`${checks.length} WebGPU shader checks passed`)
