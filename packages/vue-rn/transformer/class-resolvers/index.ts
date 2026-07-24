/**
 * Class Resolver — Convert CSS class names to RN style objects.
 */

export interface ClassResolverOptions {
  projectRoot?: string
  extraCSS?: string
}

export interface ClassResolverResult {
  styleMap: Map<string, Record<string, unknown>>
  cssOutput: string
}

export interface ClassResolver {
  readonly name: string
  detect(options?: ClassResolverOptions): boolean
  resolve(options?: ClassResolverOptions): Promise<ClassResolverResult>
}

// Lazy-init built-in plugins (loaded on first detect/resolve).
let _plugins: ClassResolver[] | null = null

/** User-registered custom plugins (checked before built-ins). */
const _userPlugins: ClassResolver[] = []

function getPlugins(): ClassResolver[] {
  if (!_plugins) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tw4: ClassResolver = require('./plugins/tw-v4').default
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tw3: ClassResolver = require('./plugins/tw-v3').default
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const uno: ClassResolver = require('./plugins/unocss').default
      _plugins = [tw4, tw3, uno]
    } catch {
      _plugins = []
    }
  }
  return [..._userPlugins, ..._plugins]
}

/**
 * Register a custom class resolver plugin.
 * Registered plugins are checked before built-in ones.
 */
export function use(resolver: ClassResolver): void {
  _userPlugins.push(resolver)
}

/**
 * Auto-detect the appropriate class resolver.
 */
export function detect(options?: ClassResolverOptions): ClassResolver | null {
  for (const r of getPlugins()) {
    if (r.detect(options)) return r
  }
  return null
}

/**
 * Resolve class names to RN styles.
 */
export async function resolve(options?: ClassResolverOptions): Promise<ClassResolverResult> {
  for (const r of getPlugins()) {
    if (r.detect(options)) {
      console.log(`[vue-rn] class resolver: ${r.name}`)
      return r.resolve(options)
    }
  }
  return { styleMap: new Map(), cssOutput: '' }
}
