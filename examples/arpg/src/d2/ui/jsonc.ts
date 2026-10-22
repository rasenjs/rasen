/**
 * The JSON dialect the game's UI layouts are written in.
 *
 * The layouts are hand-written JSONC: they carry `//` comments on most lines,
 * trailing commas, and — in three of the 204 files — a literal newline or tab
 * inside a string. `JSON.parse` rejects all four, and the naive fix of stripping
 * `//.*` with a regular expression corrupts any string that contains a slash,
 * which these files do (`"PANEL/HUD_02/…"` is everywhere).
 *
 * So this scans rather than substitutes: it tracks whether it is inside a string
 * and only removes comments outside one, drops trailing commas outside strings,
 * escapes the raw control characters a JSON string may not contain, and then
 * hands the result to `JSON.parse`.
 */

/**
 * Rewrites the text into strict JSON.
 *
 * Exported because the tests check the rewrite directly rather than only its
 * output, and because a caller reporting a parse failure wants both the offset
 * and the rewritten text.
 */
export function toStrictJson(text: string): string {
  const out: string[] = []
  let index = 0
  let inString = false

  while (index < text.length) {
    const char = text[index]

    if (inString) {
      if (char === '\\') {
        // Copy the escape and whatever it escapes, so an escaped quote does not
        // end the string.
        out.push(char, text[index + 1] ?? '')
        index += 2
        continue
      }
      if (char === '"') {
        inString = false
        out.push(char)
        index += 1
        continue
      }
      // A raw control character is not legal in JSON but does occur in retail.
      // Escaping it keeps the value rather than losing the whole file.
      if (char <= '\u001f') {
        out.push(escapeControl(char))
        index += 1
        continue
      }
      out.push(char)
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      out.push(char)
      index += 1
      continue
    }

    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }

    if (char === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }

    if (char === ',' && closesNext(text, index)) {
      index += 1
      continue
    }

    out.push(char)
    index += 1
  }

  return out.join('')
}

/** Whether the next value-or-comment character after a comma closes a container. */
function closesNext(text: string, commaAt: number): boolean {
  let look = commaAt + 1
  for (;;) {
    while (look < text.length && /\s/.test(text[look])) look += 1
    if (text[look] === '/' && text[look + 1] === '/') {
      while (look < text.length && text[look] !== '\n') look += 1
      continue
    }
    if (text[look] === '/' && text[look + 1] === '*') {
      look += 2
      while (look < text.length && !(text[look] === '*' && text[look + 1] === '/')) look += 1
      look += 2
      continue
    }
    break
  }
  return text[look] === '}' || text[look] === ']'
}

function escapeControl(char: string): string {
  const code = char.charCodeAt(0)
  switch (char) {
    case '\n':
      return '\\n'
    case '\r':
      return '\\r'
    case '\t':
      return '\\t'
    case '\b':
      return '\\b'
    case '\f':
      return '\\f'
    default:
      return `\\u${code.toString(16).padStart(4, '0')}`
  }
}

/** Parses a layout file. Throws with the surrounding text when it is not JSON. */
export function parseJsonc(text: string): unknown {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const strict = toStrictJson(withoutBom)
  try {
    return JSON.parse(strict)
  } catch (error) {
    const at = /position (\d+)/.exec(String(error))?.[1]
    const where =
      at === undefined
        ? strict.slice(0, 160)
        : strict.slice(Math.max(0, Number(at) - 80), Number(at) + 80)
    throw new Error(`jsonc: ${String(error)} near ${JSON.stringify(where)}`)
  }
}
