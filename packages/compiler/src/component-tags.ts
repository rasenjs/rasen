/**
 * Component tags — lowercase JSX tags that are MODULE IMPORTS, not strings.
 *
 * The JSX transform treats a lowercase tag as a host-element *string*
 * (`jsx('canvas', …)`), which the runtime can only resolve through the global
 * tag registry. That is why `import { canvas } from '@rasenjs/dom'` never
 * connected to `<canvas>`: a module binding and a string are two different
 * things. The registry is also a global singleton the build graph has to feed —
 * which is how the gfx-backed `canvas` got pinned into apps that never render one.
 *
 * In Rasen every tag is a component, so the compiler resolves them the same way
 * it resolves PascalCase ones: the hoisting pass emits a `canvas({…})` CALL for
 * a compilable `<canvas/>`, and injects the import. Nothing reaches the bundler
 * as a string, so nothing needs the registry — and a tag nobody uses is never
 * imported.
 *
 * This module also handles what the compiler could NOT compile (spread props,
 * unusual shapes). That JSX is left to the bundler, where a lowercase tag would
 * be read as a string, so only those occurrences are renamed to an identifier.
 * `<div>` and friends keep their host-element (template) path throughout.
 */
import { parse } from '@babel/parser'
// eslint-disable-next-line import/order
import traverseModule from '@babel/traverse'
// eslint-disable-next-line import/order
import generatorModule from '@babel/generator'

// @babel/traverse / generator ESM-CJS interop (same shape as core.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: any = (traverseModule as any).default || traverseModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: any = (generatorModule as any).default || generatorModule

/**
 * The host's tag manifest — what a build tool needs to resolve every tag.
 *
 * `elements` compile to a `template()` (no import); `components` resolve to a
 * module import. Hosts export one (`@rasenjs/dom/tags`) so an app can pass the
 * defaults through and extend them instead of restating them.
 */
export interface TagManifest {
  elements?: readonly string[]
  components?: Record<string, ComponentTagSpec>
}

export interface ComponentTagSpec {
  /** Module the component is imported from. */
  module: string
  /** Exported name; defaults to the tag name. */
  export?: string
}

/**
 * Lowercase tags that resolve to an import instead of a host-element string.
 *
 * `canvas` is the DOM host's gfx bridge: it is a component, but its natural
 * spelling is lowercase (it renders a `<canvas>` element), so the JSX transform
 * would otherwise hand the runtime a string.
 */
export const DEFAULT_COMPONENT_TAGS: Record<string, ComponentTagSpec> = {
  canvas: { module: '@rasenjs/dom' },
}

/**
 * The component-tag table a host gets by default, keyed by its `templateSource`
 * (the compiler's existing pointer at the host).
 *
 * Only the DOM host treats `canvas` as a component. `@rasenjs/html` — the string
 * renderer — has a `canvas` that is a plain element, so injecting the DOM bridge
 * there would substitute another host's component. Any templateSource other than
 * the DOM one therefore gets no defaults; such hosts can opt in with an explicit
 * `componentTags`.
 */
/**
 * The component table in force for a build: explicit option → manifest → host
 * default. Both the hoisting pass and the leftover-JSX rewrite read it here, so
 * a tag can never be compiled by one and unknown to the other.
 */
export function resolveComponentTags(options: {
  componentTags?: Record<string, ComponentTagSpec>
  tagManifest?: TagManifest
  templateSource?: string
}): Record<string, ComponentTagSpec> {
  return (
    options.componentTags ??
    options.tagManifest?.components ??
    componentTagsForHost(options.templateSource ?? '@rasenjs/dom/template')
  )
}

export function componentTagsForHost(
  templateSource: string
): Record<string, ComponentTagSpec> {
  return templateSource === '@rasenjs/dom/template' ? DEFAULT_COMPONENT_TAGS : {}
}

/** `canvas` → `_rasenCanvas` (a name no hand-written JSX would use). */
const localNameFor = (tag: string): string =>
  `_rasen${tag[0].toUpperCase()}${tag.slice(1)}`

/**
 * Rewrite component tags to imported bindings.
 *
 * Returns the new source, or null when the file has no such tag (or cannot be
 * parsed, in which case the caller's other passes decide what to do).
 */
export function rewriteComponentTags(
  code: string,
  filename: string,
  componentTags: Record<string, ComponentTagSpec> = DEFAULT_COMPONENT_TAGS
): string | null {
  const tags = Object.keys(componentTags)
  if (tags.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ast: any
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      sourceFilename: filename,
    })
  } catch {
    return null
  }

  /** Module-scope names already bound — a second binding would be a redeclare. */
  const bound = new Set<string>()
  for (const node of ast.program.body ?? []) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers ?? []) if (spec.local?.name) bound.add(spec.local.name)
      continue
    }
    for (const decl of node.declarations ?? []) if (decl.id?.name) bound.add(decl.id.name)
    if (node.id?.name) bound.add(node.id.name)
  }

  /**
   * Tags whose JSX could not be compiled and so reach the bundler as strings,
   * with EVERY alias they need: a file may use the same tag more than once
   * (two `<canvas>` mounts), and each occurrence gets its own local name — the
   * second one cannot reuse the first's, or the two would be one binding. Only
   * the last alias used to be imported, which left the earlier one undefined
   * at runtime ("_rasenCanvas is not defined").
   */
  const leftover = new Map<string, string[]>()
  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JSXElement(path: any) {
      const name = path.node.openingElement?.name
      if (!name || name.type !== 'JSXIdentifier' || !componentTags[name.name]) return
      const tag = name.name
      const target = componentTags[tag].export ?? tag
      // The JSX transform reads a lowercase tag as a HOST-ELEMENT STRING, so the
      // replacement has to be an identifier, whatever the export is called.
      let local = /^[a-z]/.test(target) ? localNameFor(tag) : target
      for (let i = 2; bound.has(local); i++) local = `${localNameFor(tag)}${i}`
      bound.add(local)
      const aliases = leftover.get(tag) ?? []
      aliases.push(local)
      leftover.set(tag, aliases)
      name.name = local
      if (path.node.closingElement?.name?.type === 'JSXIdentifier') {
        path.node.closingElement.name.name = local
      }
    },
  })

  // Compiled output calls the export BY NAME, so the name has to be importable
  // even when no JSX is left. Read from the AST: scanning the text would match
  // the leftover `<canvas {...}` attribute brace as a call.
  const called = new Set<string>()
  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CallExpression(path: any) {
      const callee = path.node.callee
      if (callee?.type === 'Identifier') called.add(callee.name)
    },
  })

  const imports: string[] = []
  for (const tag of tags) {
    const spec = componentTags[tag]
    const target = spec.export ?? tag
    const aliases = leftover.get(tag) ?? []
    // Already in scope (the author imported it themselves) — inject nothing.
    if (bound.has(target)) {
      for (const alias of aliases) {
        if (alias !== target) {
          imports.push(`import { ${target} as ${alias} } from '${spec.module}'`)
        }
      }
      continue
    }
    // Compiled call → the export name; leftover JSX → the identifier aliases.
    if (called.has(target)) imports.push(`import { ${target} } from '${spec.module}'`)
    for (const alias of aliases) {
      if (alias !== target) {
        imports.push(`import { ${target} as ${alias} } from '${spec.module}'`)
      }
    }
  }
  if (imports.length === 0) return null

  const parsed = parse(imports.join('\n'), { sourceType: 'module' })
  ast.program.body.unshift(...parsed.program.body)

  return generate(ast, { sourceMaps: false }).code
}
