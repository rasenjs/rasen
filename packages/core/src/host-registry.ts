/**
 * Lightweight host component registry for JSX auto-detection.
 *
 * Host packages (dom, html, react-native, web) register their
 * component dict at module init as a side effect. jsx-runtime
 * reads from this registry to auto-configure intrinsic tags.
 *
 * This avoids:
 * - Host packages needing to import from @rasenjs/jsx-runtime
 * - jsx-runtime needing require() or dynamic import() for detection
 *
 * All Rasen packages already depend on @rasenjs/core, so this
 * module is always available without additional dependencies.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registered = new Map<string, Record<string, any>>()

/** Register a host package's component dictionary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHostComponents(name: string, components: Record<string, any>): void {
  registered.set(name, components)
}

/** Retrieve the first available host's components (priority order). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getHostComponents(priority: string[]): Record<string, any> | undefined {
  for (const name of priority) {
    const comps = registered.get(name)
    if (comps) return comps
  }
  // Fallback: return whatever was registered
  for (const comps of registered.values()) {
    return comps
  }
  return undefined
}
