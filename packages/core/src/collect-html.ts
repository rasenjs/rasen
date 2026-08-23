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
  m({
    fragments,
    append(s: string) {
      fragments.push(s)
    },
    toString() {
      return fragments.join('')
    },
  })
  return fragments.join('')
}
