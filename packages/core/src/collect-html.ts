/**
 * Run a child component against a minimal StringHost-shaped collector and
 * return the HTML it appended.
 *
 * Marker comments around slot content are NOT added here: they are
 * positional literals emitted by the compiler into both the client template
 * and the SSR parts, so the runtime never needs to know the marker text.
 */

export function collectHtml(m: (host: unknown) => unknown): string {
  const fragments: string[] = []
  try {
    m({
      fragments,
      append(s: string) {
        fragments.push(s)
      },
      toString() {
        return fragments.join('')
      },
    })
  } catch {
    // Collecting is best-effort: a component that mounts DOM (or anything
    // else the collector cannot host) throws here. The runtime mount of the
    // same component is the one that matters, and a throw in this pass used
    // to abort the whole reactive flush — the batched watchers stop at the
    // first throwing job, so the component's own instance never received the
    // signal change it was waiting for (a panel that never opened).
  }
  return fragments.join('')
}
