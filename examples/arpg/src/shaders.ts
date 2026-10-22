/**
 * The catalogue of the game's own WGSL shaders.
 *
 * `public/original/shaders/` holds 119 `.wgsl` modules translated from the
 * game's shipped shader binaries (plus the `.spv` they came from), and the
 * translator's report, `shaders.json`. Those files are generated locally from a
 * copy of the game and are git-ignored (`src/original/README.md`); nothing here
 * fabricates them, it only loads what is present.
 *
 * ## The names are opaque, and this file does not pretend otherwise
 *
 * Every module is named by the 16-hex-digit key it arrived under
 * (`0549859780e33eaa.wgsl`). That key is not a name, and the translator's report
 * *does* name what it translated (`ps_2d.bin`, `cs_generate_mips_c.bin`, …) but
 * does not record which key each name got, so **key → purpose cannot be
 * recovered from what shipped**. Guessing it from a hash would be a fabrication.
 *
 * What can be read is the source itself, and that turns out to be enough to use a
 * module without knowing what it is for: `reflectWgsl` reads the entry points,
 * the bindings and the structs out of the text. Everything the pipeline layer in
 * `@rasenjs/gfx` needs to build a pipeline for a module is in that reflection,
 * because the reflection is WebGPU's own vocabulary — the same binding kinds, the
 * same view dimensions. Where a shader extracts *data* from (which `@binding`
 * holds the world, what a uniform struct's fields mean) is not recoverable and is
 * exactly what the reflection leaves to the caller.
 *
 * ## Loading is on demand
 *
 * A module is fetched the first time it is asked for and cached by key, so a
 * caller can iterate the whole set (see `tools/verify-shaders-gpu.mjs`) at a cost
 * proportional to what it inspects. `null` means "not present", which is the
 * honest answer for a key that is not in the directory, and is also how a caller
 * finds out which keys exist without a directory listing: the web has no way to
 * enumerate one, so presence is probed per key.
 */

/** Where the translated modules live, relative to the served root. */
export const SHADER_BASE_URL = '/original/shaders'

/** The translator's report, one directory up from the modules. */
export const SHADER_REPORT_URL = '/original/shaders/shaders.json'

// ---------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------

export type WgslStage = 'vertex' | 'fragment' | 'compute'

/**
 * A binding kind, in the vocabulary `@rasenjs/gfx`'
 * `ShaderBindingDeclaration.kind` uses — the two are deliberately the same
 * strings, so a reflection can be handed to the pipeline layer entry for entry
 * without a translation table in between.
 */
export type WgslBindingKind =
  | 'uniform'
  | 'storage'
  | 'read-only-storage'
  | 'texture'
  | 'storage-texture'
  | 'depth-texture'
  | 'sampler'
  | 'comparison-sampler'
  /** A declaration this parser does not recognise. Never silently usable. */
  | 'unknown'

export type WgslSampleType = 'float' | 'unfilterable-float' | 'sint' | 'uint' | 'depth'

export type WgslViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d'

export type WgslStorageAccess = 'write-only' | 'read-only' | 'read-write'

export type WgslSamplerType = 'filtering' | 'non-filtering' | 'comparison'

/** One `@location`/`@builtin` value crossing a stage boundary. */
export interface WgslIo {
  /** `@location(n)` when the value crosses the boundary. */
  location?: number
  /** `@builtin(name)` when it does not. */
  builtin?: string
  name: string
  type: string
  /** Verbatim `@interpolate(...)` arguments; must match between two stages. */
  interpolation?: string
}

export interface WgslEntryPoint {
  stage: WgslStage
  name: string
  /** `@workgroup_size(x, y, z)`; compute only. */
  workgroupSize?: [number, number, number]
  inputs: WgslIo[]
  outputs: WgslIo[]
  /** The struct the entry point returns, when it returns one instead of a list. */
  returnsStruct?: string
}

export interface WgslStructField {
  name: string
  type: string
  location?: number
  builtin?: string
  interpolation?: string
}

export interface WgslStruct {
  name: string
  fields: WgslStructField[]
}

export interface WgslBinding {
  group: number
  binding: number
  name: string
  /** The declared type, verbatim (`texture_2d<f32>`, `type_7`). */
  type: string
  /** `uniform` / `storage`, when the declaration has an address space. */
  addressSpace?: string
  /** `read` / `read_write`, for a storage declaration. */
  access?: string
  kind: WgslBindingKind
  sampleType?: WgslSampleType
  viewDimension?: WgslViewDimension
  multisampled?: boolean
  /** `texture_storage_*` only, from the declaration's first type argument. */
  storageFormat?: string
  storageAccess?: WgslStorageAccess
  samplerType?: WgslSamplerType
}

/** A `@group/@binding` declared more than once in one module. */
export interface WgslBindingDuplicate {
  group: number
  binding: number
  count: number
  /** The distinct declarations there, as `addressSpace|type`, in declaration
   *  order — the same string `bindingShape` summarises, so two names in one slot
   *  that describe it differently are visible as such. */
  shapes: string[]
}

export interface WgslReflection {
  entryPoints: WgslEntryPoint[]
  bindings: WgslBinding[]
  structs: WgslStruct[]
  /** Distinct group indices, ascending. */
  groups: number[]
  /**
   * Legal WGSL — two names, one slot — and present in 65 of the 119 modules,
   * where the translator emitted the same texture twice. A caller collapsing
   * them must check `types`: distinct types at one slot cannot be expressed as
   * one bind group layout entry.
   */
  duplicates: WgslBindingDuplicate[]
  /** Declarations this parser could not classify. A non-empty list is a failure. */
  unclassified: WgslBinding[]
}

export interface WgslReflectionResult {
  reflection: WgslReflection | null
  /** Why the source could not be reflected, when `reflection` is `null`. */
  error: string | null
}

/** Strip `//` and block comments, keeping strings (WGSL has none in shaders, but
 *  a diagnostic attribute may contain text). Returns line count unchanged, so
 *  reported positions stay meaningful. */
function stripComments(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    const two = source.slice(index, index + 2)
    if (two === '//') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }
    out += source[index]
    index++
  }
  return out
}

/** Index of the `close` matching the `open` at `start`, or -1. */
function matchDelimiter(text: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (character === open) depth++
    else if (character === close) {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

/** Split at commas that are not inside `<>` or `()`. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '<' || character === '(' || character === '[') depth++
    else if (character === '>' || character === ')' || character === ']') depth--
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/** `@location(2) @interpolate(flat, either) x` → `{ location: 2, interpolation: 'flat, either', rest: 'x' }`. */
function parseAttributes(text: string): {
  location?: number
  builtin?: string
  interpolation?: string
  rest: string
  restOffset: number
} {
  const result: {
    location?: number
    builtin?: string
    interpolation?: string
    rest: string
    restOffset: number
  } = { rest: '', restOffset: 0 }
  let index = 0
  for (;;) {
    while (index < text.length && /\s/.test(text[index])) index++
    if (text[index] !== '@') break
    let cursor = index + 1
    while (cursor < text.length && /[A-Za-z_0-9]/.test(text[cursor])) cursor++
    const name = text.slice(index + 1, cursor)
    let argument = ''
    if (text[cursor] === '(') {
      const close = matchDelimiter(text, cursor, '(', ')')
      argument = text.slice(cursor + 1, close === -1 ? text.length : close)
      index = close === -1 ? text.length : close + 1
    } else {
      index = cursor
    }
    if (name === 'location') result.location = Number.parseInt(argument, 10)
    else if (name === 'builtin') result.builtin = argument.trim()
    else if (name === 'interpolate') result.interpolation = argument.trim()
  }
  while (index < text.length && /\s/.test(text[index])) index++
  result.restOffset = index
  result.rest = text.slice(index)
  return result
}

const VIEW_DIMENSIONS: Record<string, WgslViewDimension> = {
  texture_1d: '1d',
  texture_2d: '2d',
  texture_2d_array: '2d-array',
  texture_cube: 'cube',
  texture_cube_array: 'cube-array',
  texture_3d: '3d',
  texture_depth_2d: '2d',
  texture_depth_2d_array: '2d-array',
  texture_depth_cube: 'cube',
  texture_depth_cube_array: 'cube-array',
  texture_multisampled_2d: '2d',
  texture_depth_multisampled_2d: '2d',
  texture_storage_1d: '1d',
  texture_storage_2d: '2d',
  texture_storage_2d_array: '2d-array',
  texture_storage_3d: '3d',
}

/** `texture_2d<f32>` → `{ base: 'texture_2d', args: ['f32'] }`. */
function splitGeneric(type: string): { base: string; args: string[] } {
  const open = type.indexOf('<')
  if (open === -1) return { base: type.trim(), args: [] }
  const close = type.lastIndexOf('>')
  return {
    base: type.slice(0, open).trim(),
    args: type
      .slice(open + 1, close === -1 ? type.length : close)
      .split(',')
      .map((argument) => argument.trim()),
  }
}

const STORAGE_ACCESS: Record<string, WgslStorageAccess> = {
  write: 'write-only',
  read: 'read-only',
  read_write: 'read-write',
}

/**
 * Classify one declaration. The result uses WebGPU's own binding vocabulary, so
 * it can be handed to `ShaderBindingDeclaration` unchanged; a declaration this
 * function does not understand comes back as `unknown` rather than as a guess.
 */
function classifyBinding(
  type: string,
  addressSpace: string | undefined,
  access: string | undefined,
): Pick<
  WgslBinding,
  'kind' | 'sampleType' | 'viewDimension' | 'multisampled' | 'storageFormat' | 'storageAccess' | 'samplerType'
> {
  if (addressSpace === 'uniform') return { kind: 'uniform' }
  if (addressSpace === 'storage') {
    // `var<storage>` without an access mode defaults to `read` in WGSL, which is
    // the difference between a binding the vertex stage may use and one it may
    // not — so it is spelled out rather than assumed.
    return { kind: access === 'read_write' ? 'storage' : 'read-only-storage' }
  }
  if (type === 'sampler') return { kind: 'sampler', samplerType: 'filtering' }
  if (type === 'sampler_comparison') return { kind: 'comparison-sampler', samplerType: 'comparison' }

  const { base, args } = splitGeneric(type)
  const viewDimension = VIEW_DIMENSIONS[base]
  if (!viewDimension) return { kind: 'unknown' }

  if (base.startsWith('texture_storage_')) {
    return {
      kind: 'storage-texture',
      viewDimension,
      storageFormat: args[0],
      storageAccess: STORAGE_ACCESS[args[1] ?? 'write'] ?? 'write-only',
    }
  }
  const multisampled = base.includes('multisampled')
  if (base.startsWith('texture_depth_')) {
    return { kind: 'depth-texture', sampleType: 'depth', viewDimension, multisampled: multisampled || undefined }
  }
  // `f32` maps to `float` — the permissive choice: a `float` binding accepts a
  // filterable OR unfilterable texture, while the reverse does not validate.
  const sampleType: WgslSampleType = args[0] === 'i32' ? 'sint' : args[0] === 'u32' ? 'uint' : 'float'
  return { kind: 'texture', sampleType, viewDimension, multisampled: multisampled || undefined }
}

/** Read every `struct Name { … }` in a comment-stripped module. */
function readStructs(source: string): WgslStruct[] {
  const structs: WgslStruct[] = []
  const pattern = /struct\s+([A-Za-z_][A-Za-z_0-9]*)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const open = source.indexOf('{', match.index)
    const close = matchDelimiter(source, open, '{', '}')
    if (close === -1) continue
    const fields: WgslStructField[] = []
    for (const field of splitTopLevel(source.slice(open + 1, close))) {
      const colon = field.indexOf(':')
      if (colon === -1) continue
      const attributes = parseAttributes(field.slice(0, colon))
      const name = attributes.rest.trim()
      if (name.length === 0) continue
      fields.push({
        name,
        type: field.slice(colon + 1).trim(),
        location: attributes.location,
        builtin: attributes.builtin,
        interpolation: attributes.interpolation,
      })
    }
    structs.push({ name: match[1], fields })
    pattern.lastIndex = close
  }
  return structs
}

/** Read every `@group(n) @binding(m) var…` resource declaration. */
function readBindings(source: string): WgslBinding[] {
  const bindings: WgslBinding[] = []
  const pattern = /@group\((\d+)\)\s*@binding\((\d+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    // Anything between the attributes and the `var` keyword is another attribute.
    const after = source.slice(match.index + match[0].length)
    const varIndex = after.search(/\bvar\b/)
    if (varIndex === -1) continue
    const tail = after.slice(varIndex)
    const semicolon = tail.indexOf(';')
    if (semicolon === -1) continue
    const declaration = tail.slice(0, semicolon).replace(/\s+/g, ' ').trim()
    const parsed = /^var(?:<\s*([^>]+)>)?\s+([A-Za-z_][A-Za-z_0-9]*)\s*:\s*(.+)$/.exec(declaration)
    if (!parsed) continue
    const address = parsed[1]
      ?.split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    const addressSpace = address?.[0] === 'storage' ? 'storage' : address?.[0] === 'uniform' ? 'uniform' : undefined
    const access = address?.find((part) => part === 'read' || part === 'read_write' || part === 'write')
    const classified = classifyBinding(parsed[3].trim(), addressSpace, access)
    bindings.push({
      group: Number.parseInt(match[1], 10),
      binding: Number.parseInt(match[2], 10),
      name: parsed[2],
      type: parsed[3].trim(),
      addressSpace,
      access,
      ...classified,
    })
    pattern.lastIndex = match.index + match[0].length + semicolon
  }
  return bindings
}

/** Read one entry point, starting at its stage attribute. */
function readEntryPoint(
  source: string,
  stage: WgslStage,
  attributeIndex: number,
  attributeEnd: number,
  structs: WgslStruct[],
): WgslEntryPoint | null {
  // Anything between the stage attribute and `fn` is another attribute
  // (`@workgroup_size(8, 8, 1)` on every compute entry point in this set).
  const leading = parseAttributes(source.slice(attributeEnd))
  let index = attributeEnd + leading.restOffset
  if (!source.startsWith('fn', index)) return null
  index += 2
  while (index < source.length && /\s/.test(source[index])) index++
  const nameMatch = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(index))
  if (!nameMatch) return null
  const name = nameMatch[0]
  index += name.length
  while (index < source.length && /\s/.test(source[index])) index++
  if (source[index] !== '(') return null
  const closeParen = matchDelimiter(source, index, '(', ')')
  if (closeParen === -1) return null
  const inputs: WgslIo[] = []
  for (const parameter of splitTopLevel(source.slice(index + 1, closeParen))) {
    const colon = parameter.indexOf(':')
    if (colon === -1) continue
    const parsed = parseAttributes(parameter.slice(0, colon))
    if (parsed.rest.length === 0) continue
    inputs.push({
      name: parsed.rest,
      type: parameter.slice(colon + 1).trim(),
      location: parsed.location,
      builtin: parsed.builtin,
      interpolation: parsed.interpolation,
    })
  }
  index = closeParen + 1
  while (index < source.length && /\s/.test(source[index])) index++

  const entry: WgslEntryPoint = { stage, name, inputs, outputs: [] }
  if (stage === 'compute') {
    const size = /@workgroup_size\(([^)]*)\)/.exec(source.slice(attributeIndex, closeParen))
    if (size) {
      const values = size[1].split(',').map((value) => Number.parseInt(value.trim(), 10))
      entry.workgroupSize = [values[0] || 1, values[1] || 1, values[2] || 1]
    }
  }

  if (source.startsWith('->', index)) {
    index += 2
    const bodyOpen = source.indexOf('{', index)
    if (bodyOpen !== -1) {
      const returned = source.slice(index, bodyOpen).trim()
      if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(returned)) {
        // A named struct: its `@location`/`@builtin` fields ARE the interface.
        const struct = structs.find((candidate) => candidate.name === returned)
        entry.returnsStruct = returned
        entry.outputs = struct
          ? struct.fields.map((field) => ({
              name: field.name,
              type: field.type,
              location: field.location,
              builtin: field.builtin,
              interpolation: field.interpolation,
            }))
          : []
      } else {
        // A list of `@location(n) type` values, which is how a fragment stage
        // writes several render targets.
        for (const value of splitTopLevel(returned)) {
          const parsed = parseAttributes(value)
          const typeMatch = /([A-Za-z_][A-Za-z_0-9]*(?:<[^>]*>)?)\s*$/.exec(parsed.rest)
          entry.outputs.push({
            name: `output${entry.outputs.length}`,
            type: typeMatch ? typeMatch[1] : parsed.rest,
            location: parsed.location,
            builtin: parsed.builtin,
            interpolation: parsed.interpolation,
          })
        }
      }
    }
  }
  return entry
}

/**
 * Read a module's interface out of its own text.
 *
 * This is a reader, not a compiler: it understands the shape the game's
 * translated modules use (structs, `@group/@binding var…` resources, entry
 * points whose `@location`/`@builtin` values come from a struct or a return
 * list) and returns `null` when it does not understand a module. It deliberately
 * does not evaluate expressions or resolve types: nothing here needs to know what
 * a shader computes, only what it declares.
 */
export function reflectWgslResult(source: string): WgslReflectionResult {
  if (source.trim().length === 0) return { reflection: null, error: 'empty source' }
  const cleaned = stripComments(source)
  const structs = readStructs(cleaned)
  const bindings = readBindings(cleaned)

  const entryPoints: WgslEntryPoint[] = []
  const pattern = /@(vertex|fragment|compute)\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cleaned)) !== null) {
    const entry = readEntryPoint(cleaned, match[1] as WgslStage, match.index, match.index + match[0].length, structs)
    if (entry) entryPoints.push(entry)
  }
  if (entryPoints.length === 0 && bindings.length === 0) {
    return { reflection: null, error: 'no entry point and no resource binding found' }
  }

  const counts = new Map<string, WgslBinding[]>()
  for (const binding of bindings) {
    const key = `${binding.group}:${binding.binding}`
    const list = counts.get(key)
    if (list) list.push(binding)
    else counts.set(key, [binding])
  }
  const duplicates: WgslBindingDuplicate[] = []
  for (const list of counts.values()) {
    if (list.length < 2) continue
    duplicates.push({
      group: list[0].group,
      binding: list[0].binding,
      count: list.length,
      shapes: [...new Set(list.map((binding) => `${binding.addressSpace ?? ''}|${binding.type}`))],
    })
  }

  return {
    reflection: {
      entryPoints,
      bindings,
      structs,
      groups: [...new Set(bindings.map((binding) => binding.group))].sort((a, b) => a - b),
      duplicates,
      unclassified: bindings.filter((binding) => binding.kind === 'unknown'),
    },
    error: null,
  }
}

/** `reflectWgslResult`, for callers that only want the reflection. */
export function reflectWgsl(source: string): WgslReflection | null {
  return reflectWgslResult(source).reflection
}

/** The entry point of a stage, if the module declares one. */
export function entryPointOf(reflection: WgslReflection, stage: WgslStage): WgslEntryPoint | undefined {
  return reflection.entryPoints.find((entry) => entry.stage === stage)
}

/**
 * Why a vertex stage cannot feed a fragment stage, or `[]` when it can.
 *
 * A vertex output the fragment does not consume is fine; an input the vertex does
 * not write, or writes with a different type or interpolation, is not. Derived
 * from the two reflections, which is what makes it possible to pair modules whose
 * names say nothing.
 */
export function stageLinkProblems(vertex: WgslEntryPoint, fragment: WgslEntryPoint): string[] {
  const problems: string[] = []
  for (const input of fragment.inputs) {
    if (input.builtin) continue
    const output = vertex.outputs.find((candidate) => candidate.location === input.location)
    if (!output) {
      problems.push(`fragment input @location(${input.location}) has no vertex output`)
      continue
    }
    if (output.type !== input.type) {
      problems.push(
        `@location(${input.location}) is ${output.type} out of the vertex stage but ${input.type} into the fragment stage`,
      )
    }
    if ((output.interpolation ?? '') !== (input.interpolation ?? '')) {
      problems.push(
        `@location(${input.location}) interpolation differs: '${output.interpolation ?? 'default'}' vs '${input.interpolation ?? 'default'}'`,
      )
    }
  }
  return problems
}

/**
 * Why two modules' bindings cannot share one pipeline layout, or `[]` when they
 * can. Two stages of one pipeline bind the same group, so a slot they describe
 * differently (`@binding(1)` a storage buffer in one and a texture in the other)
 * cannot be expressed at all — and that is a real property of the shader set, not
 * a limitation to work around.
 */
export function bindingUnionProblems(a: WgslReflection, b: WgslReflection): string[] {
  const problems: string[] = []
  for (const left of a.bindings) {
    for (const right of b.bindings) {
      if (left.group !== right.group || left.binding !== right.binding) continue
      const leftShape = bindingShape(left)
      const rightShape = bindingShape(right)
      if (leftShape !== rightShape) {
        problems.push(
          `@group(${left.group}) @binding(${left.binding}) is '${leftShape}' in one stage and '${rightShape}' in the other`,
        )
      }
    }
  }
  return problems
}

/** The part of a binding a bind group layout entry has to agree on. */
export function bindingShape(binding: WgslBinding): string {
  switch (binding.kind) {
    case 'texture':
    case 'depth-texture':
      return `${binding.kind}:${binding.viewDimension ?? '2d'}:${binding.sampleType ?? 'float'}:${binding.multisampled ? 'ms' : 'single'}`
    case 'storage-texture':
      return `${binding.kind}:${binding.viewDimension ?? '2d'}:${binding.storageFormat ?? '?'}:${binding.storageAccess ?? '?'}`
    case 'sampler':
    case 'comparison-sampler':
      return binding.kind
    default:
      return binding.kind
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const sourceCache = new Map<string, string | null>()
const reflectionCache = new Map<string, WgslReflection | null>()

/** The URL a module is served from. */
export function shaderUrl(id: string, base: string = SHADER_BASE_URL): string {
  return `${base}/${id}.wgsl`
}

/** A module already loaded, without awaiting. `null` for a key known to be absent. */
export function cachedShaderSource(id: string): string | null | undefined {
  return sourceCache.get(id)
}

/** How many modules are cached, and how many of them are known-absent. */
export function shaderCacheStats(): { known: number; missing: number } {
  let missing = 0
  for (const value of sourceCache.values()) if (value === null) missing++
  return { known: sourceCache.size, missing }
}

/** Forget everything cached. Only useful between runs. */
export function clearShaderCache(): void {
  sourceCache.clear()
  reflectionCache.clear()
}

/**
 * Load one module by key, caching by key. `null` when the server does not have
 * it — the one honest way to ask whether a key exists.
 */
export async function loadShaderSource(
  id: string,
  base: string = SHADER_BASE_URL,
): Promise<string | null> {
  const cached = sourceCache.get(id)
  if (cached !== undefined) return cached
  const response = await fetch(shaderUrl(id, base))
  const source = response.ok ? await response.text() : null
  sourceCache.set(id, source)
  return source
}

/** Load and reflect one module, caching both. */
export async function reflectShader(
  id: string,
  base: string = SHADER_BASE_URL,
): Promise<WgslReflection | null> {
  const cached = reflectionCache.get(id)
  if (cached !== undefined) return cached
  const source = await loadShaderSource(id, base)
  const reflection = source === null ? null : reflectWgsl(source)
  reflectionCache.set(id, reflection)
  return reflection
}

/** Which of `ids` the catalogue can load. */
export async function probeShaders(
  ids: readonly string[],
  base: string = SHADER_BASE_URL,
): Promise<{ present: string[]; missing: string[] }> {
  const present: string[] = []
  const missing: string[] = []
  for (const id of ids) {
    const source = await loadShaderSource(id, base)
    if (source === null) missing.push(id)
    else present.push(id)
  }
  return { present, missing }
}

/** Load every key, returning reflections in the order asked for. */
export async function loadReflections(
  ids: readonly string[],
  base: string = SHADER_BASE_URL,
): Promise<{ id: string; reflection: WgslReflection }[]> {
  const loaded: { id: string; reflection: WgslReflection }[] = []
  for (const id of ids) {
    const reflection = await reflectShader(id, base)
    if (reflection) loaded.push({ id, reflection })
  }
  return loaded
}

// ---------------------------------------------------------------------------
// The translator's report
// ---------------------------------------------------------------------------

/** One program the translator rejected, and why. */
export interface ShaderTranslationFailure {
  reason: string
  stage: string
  program: string
}

export interface ShaderTranslationReport {
  /** reason → `[stage, program]` pairs, exactly as reported. `OK` is the successes. */
  byReason: Record<string, readonly (readonly [string, string])[]>
  /** Programs the translator produced WGSL for. */
  translated: number
  /** Programs it could not, with the blocking reason. */
  failures: ShaderTranslationFailure[]
}

/**
 * The translator's own account of the shader set: `shaders.json` maps a blocking
 * reason to the `[stage, program]` pairs it blocked, with `OK` for the ones it
 * translated. Its names are the game's program names — the report does **not**
 * carry the `.wgsl` keys, so it cannot be joined against the files; it is the
 * upper bound of what the set could contain, not a key→name table.
 */
export async function loadTranslationReport(
  url: string = SHADER_REPORT_URL,
): Promise<ShaderTranslationReport | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  const raw = (await response.json()) as Record<string, [string, string][]>
  const failures: ShaderTranslationFailure[] = []
  for (const [reason, entries] of Object.entries(raw)) {
    if (reason === 'OK') continue
    for (const [stage, program] of entries) failures.push({ reason, stage, program })
  }
  return {
    byReason: raw,
    translated: raw.OK?.length ?? 0,
    failures,
  }
}
