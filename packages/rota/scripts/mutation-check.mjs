/**
 * Mutation check — does the test suite actually notice a broken component?
 *
 * Each probe breaks one behaviour in a component's source, runs that
 * component's tests, and reports whether they failed. A probe that *survives*
 * is a hole in the tests, not in the component: the behaviour is unverified,
 * so it is free to regress.
 *
 * Usage (from packages/rota):
 *
 *   node scripts/mutation-check.mjs            # all probes
 *   node scripts/mutation-check.mjs checkbox   # only probes whose name matches
 *
 * The source file is restored after every probe, including on failure; the
 * script exits non-zero when any probe survives.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * [component (matches its test files), file, code to break, replacement]
 *
 * Prefer mutations that are *behavioural* — the value a user or an assistive
 * technology observes — over internal details, so a probe maps onto a scenario
 * worth testing.
 */
const PROBES = [
  ['checkbox', 'src/components/checkbox/index.ts',
    "'data-state': () => state().dataState,", "'data-state': 'checked',"],
  ['checkbox', 'src/components/checkbox/index.ts',
    "if (cur === true) {\n        newValue = 'indeterminate'", "if (cur === true) {\n        newValue = false"],
  ['switch', 'src/components/switch/index.ts',
    "'aria-checked': () => String(isChecked()),", "'aria-checked': 'false',"],
  ['switch', 'src/components/switch/index.ts',
    '      get checked() {\n        return isChecked()\n      },', '      get checked() {\n        return false\n      },'],
  ['toggle', 'src/components/toggle/index.ts',
    "'aria-pressed': () => String(isPressed()),", "'aria-pressed': 'false',"],
  ['label', 'src/components/label/index.ts', 'for: props?.htmlFor,', 'for: undefined,'],
  ['separator', 'src/components/separator/index.ts',
    "'aria-orientation': decorative ? undefined : orientation,", "'aria-orientation': undefined,"],
  ['aspect-ratio', 'src/components/aspect-ratio/index.ts',
    'paddingBottom: `${(1 / ratio) * 100}%`,', 'paddingBottom: `${ratio * 100}%`,'],
  ['progress', 'src/components/progress/index.ts',
    "'aria-valuenow': () => value() ?? undefined,", "'aria-valuenow': 0,"],
  ['progress', 'src/components/progress/index.ts',
    "            ? 'translateX(-100%)'\n            : `translateX(-${100 - current}%)`",
    "            ? 'translateX(0%)'\n            : `translateX(0%)`"],
  ['collapsible', 'src/components/collapsible/index.ts',
    'hidden: () => (forceMount || isOpen() ? false : true),', 'hidden: () => false,'],
  ['collapsible', 'src/components/collapsible/index.ts',
    '      isOpen,\n      disabled: isDisabled(),\n      toggle', '      isOpen: () => false,\n      disabled: isDisabled(),\n      toggle'],
  ['tabs', 'src/components/tabs/index.ts',
    "'aria-selected': () => String(ctx?.value() === props.value),", "'aria-selected': 'false',"],
  ['tabs', 'src/components/tabs/index.ts',
    'hidden: () => (forceMount || ctx?.value() === props.value ? false : true),', 'hidden: () => false,'],
  ['accordion', 'src/components/accordion/index.ts',
    "'aria-expanded': () => String(ctx?.isOpen(itemValue) ?? false),", "'aria-expanded': 'true',"],
  ['accordion', 'src/components/accordion/index.ts',
    "      'data-orientation': orientation,", "      'data-orientation': 'vertical',"],
  ['alert-dialog', 'src/components/alert-dialog/index.ts',
    '        if (props?.onEscapeKeyDown) {\n          props.onEscapeKeyDown(event)\n        } else {\n          event.preventDefault()\n        }',
    '        if (props?.onEscapeKeyDown) {\n          props.onEscapeKeyDown(event)\n        } else {\n          ctx?.setOpen(false)\n        }'],
  ['avatar', 'src/components/avatar/index.ts', "        status !== 'loaded' &&", '        true &&'],
  ['number-field', 'src/components/number-field/index.ts',
    'current.updateValue(Math.min(current.max, next))', 'current.updateValue(next)'],
  ['pin-input', 'src/components/pin-input/index.ts',
    '        current.setFocusedIndex(index + 1)\n        focusCell(index + 1)',
    '        current.setFocusedIndex(index)\n        focusCell(index)'],
  ['pin-input', 'src/components/pin-input/index.ts',
    '      if (!isValidChar(char, current.type)) {\n        cell.value = \'\'\n        return\n      }',
    '      if (false) {\n        cell.value = \'\'\n        return\n      }'],
  ['slider', 'src/components/slider/index.ts',
    'setValueAt(index, (value[index] ?? min()) + steps * step())', 'setValueAt(index, (value[index] ?? min()) + steps)'],
  ['slider', 'src/components/slider/index.ts',
    '          ? { left: () => `${percentNow()}%` }', '          ? { left: () => `0%` }'],
  ['radio-group', 'src/components/radio-group/index.ts',
    "      'data-orientation': orientation,", "      'data-orientation': 'vertical',"],
  ['radio-group', 'src/components/radio-group/index.ts',
    '        current.focusItem(target)\n        current.select(values[target]!)', '        current.focusItem(target)'],
  ['tags-input', 'src/components/tags-input/index.ts',
    '      if (index < 0 || index >= value.length) return\n      const next = [...value]\n      next.splice(index, 1)',
    '      if (index < 0 || index >= value.length) return\n      const next = [...value]\n      next.splice(0, 1)'],
  ['toggle-group', 'src/components/toggle-group/index.ts',
    '        if (value[0] === itemValue) return\n        setValue([itemValue])', '        setValue([itemValue])'],
]

const filter = process.argv[2]
const probes = filter ? PROBES.filter(([name]) => name.includes(filter)) : PROBES

const survivors = []

for (const [name, relativeFile, breakCode, replacement] of probes) {
  const file = join(root, relativeFile)
  const source = readFileSync(file, 'utf8')

  if (!source.includes(breakCode)) {
    console.log(`SKIP      ${name.padEnd(14)} anchor no longer matches — update the probe`)
    continue
  }

  const backup = `${file}.mutation-backup`
  copyFileSync(file, backup)
  writeFileSync(file, source.replace(breakCode, replacement))

  let output = ''
  try {
    output = execSync(
      `../../node_modules/.bin/vitest --run tests/unit/${name} 2>&1`,
      { cwd: root, encoding: 'utf8' }
    )
  } catch (error) {
    output = String(error.stdout ?? '')
  } finally {
    copyFileSync(backup, file)
    unlinkSync(backup)
  }

  const summary =
    output
      .split('\n')
      .filter((line) => /Tests\s+/.test(line))
      .slice(-1)[0] ?? '(no summary)'
  const caught = /failed/.test(summary)

  if (!caught) survivors.push(name)
  console.log(`${caught ? 'caught   ' : 'SURVIVED '} ${name.padEnd(14)} ${summary.trim()}`)
}

console.log(
  `\n${probes.length - survivors.length}/${probes.length} mutations caught` +
    (survivors.length ? ` — holes in: ${[...new Set(survivors)].join(', ')}` : '')
)

process.exit(survivors.length ? 1 : 0)
