import { describe, expect, it } from 'vitest'
import { injectHmr, usesCom, hasHmrWrapping } from './hmr'

const PRELUDE = "import { enterHmrModule, exitHmrModule } from '@rasenjs/core';\n"

describe('injectHmr', () => {
  it('inserts after single-line imports', () => {
    const out = injectHmr(
      "import { com } from '@rasenjs/core'\nconst x = com(() => {})\n",
      'app.ts'
    )
    const at = out.indexOf(PRELUDE)
    expect(at).toBeGreaterThan(0)
    // after the real import, before the com() line
    expect(out.indexOf("import { com }")).toBeLessThan(at)
    expect(at).toBeLessThan(out.indexOf('const x'))
    expect(out).toContain("enterHmrModule('app.ts')")
    expect(out.endsWith('exitHmrModule();\n/* rasen-hmr */')).toBe(true)
  })

  it('inserts after a multi-line import, never inside it', () => {
    const src = [
      "import {",
      "  computeAttachmentWorld,",
      "  computeClippingWorld,",
      "} from '@rasenjs/assets'",
      'export const spine = com(() => {})',
      '',
    ].join('\n')
    const out = injectHmr(src, 'spine.ts')
    const at = out.indexOf(PRELUDE)
    expect(at).toBeGreaterThan(0)
    // the multi-line import must stay contiguous
    expect(out.indexOf("} from '@rasenjs/assets'\n" + PRELUDE)).toBeGreaterThan(0)
    expect(out).toContain("} from '@rasenjs/assets'\n" + PRELUDE + "enterHmrModule('spine.ts')")
  })

  it('prepends when the module has no imports', () => {
    const out = injectHmr('export const x = 1\n', 'x.ts')
    expect(out.startsWith(PRELUDE)).toBe(true)
  })

  it('is idempotent via hasHmrWrapping', () => {
    const once = injectHmr("import 'x'\nconst y = com(1)\n", 'y.ts')
    expect(hasHmrWrapping(once)).toBe(true)
    expect(hasHmrWrapping("const y = com(1)\n")).toBe(false)
  })
})

describe('usesCom', () => {
  it('detects com( calls', () => {
    expect(usesCom('const a = com(() => {})')).toBe(true)
    expect(usesCom('const combine = 1')).toBe(false)
  })

  it('ignores com( mentions in comments and strings', () => {
    expect(usesCom('/** 组件生命周期作用域：com() 用它归集订阅 */\nconst x = 1')).toBe(false)
    expect(usesCom('// com() wraps components\nconst x = 1')).toBe(false)
    expect(usesCom("const msg = 'com() is pure'")).toBe(false)
  })
})
