import { describe, expect, it } from 'vitest'
import { createTw, resolveClasses, tw } from './interpreter'

describe('tw()', () => {
  it('resolves a simple class', () => {
    expect(tw('flex')).toEqual({ display: 'flex' })
  })

  it('merges multiple classes into one record', () => {
    expect(tw('flex flex-col gap-2')).toEqual({
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    })
  })

  it('resolves spacing scale to px numbers', () => {
    expect(tw('p-4')).toEqual({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
    expect(tw('px-2')).toEqual({ paddingLeft: 8, paddingRight: 8 })
    expect(tw('mt-1')).toEqual({ marginTop: 4 })
    expect(tw('gap-x-3')).toEqual({ gapX: 12 })
  })

  it('resolves sizing', () => {
    expect(tw('w-full')).toEqual({ width: '100%' })
    expect(tw('h-screen')).toEqual({ height: '100vh' })
    expect(tw('w-1/2')).toEqual({ width: '50%' })
    expect(tw('size-8')).toEqual({ width: 32, height: 32 })
  })

  it('resolves colors from the palette', () => {
    expect(tw('bg-blue-500')).toEqual({ backgroundColor: '#3b82f6' })
    expect(tw('text-red-600')).toEqual({ color: '#dc2626' })
    expect(tw('border-gray-900')).toEqual({ borderColor: '#111827' })
  })

  it('resolves text styles', () => {
    expect(tw('text-xl font-bold')).toEqual({ fontSize: 20, fontWeight: 700 })
    expect(tw('font-mono')).toEqual({ fontFamily: 'ui-monospace, monospace' })
    expect(tw('underline')).toEqual({ textDecoration: 'underline' })
  })

  it('resolves borders and radius', () => {
    expect(tw('border border-2 rounded-lg')).toEqual({ borderWidth: 2, borderRadius: 8 })
    expect(tw('rounded-full')).toEqual({ borderRadius: 9999 })
  })

  it('resolves effects', () => {
    expect(tw('opacity-50')).toEqual({ opacity: 0.5 })
    expect(tw('shadow-md')).toEqual({
      shadowColor: 'rgba(0,0,0,0.1)',
      shadowBlur: 6,
      shadowOffsetY: 2
    })
  })

  it('resolves arbitrary values', () => {
    expect(tw('bg-[#505050]')).toEqual({ backgroundColor: '#505050' })
    expect(tw('w-[500px]')).toEqual({ width: 500 })
    expect(tw('p-[10px]')).toEqual({ paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10 })
    expect(tw('text-[20px]')).toEqual({ fontSize: 20 })
    expect(tw('text-[#ff0000]')).toEqual({ color: '#ff0000' })
    expect(tw('rounded-[8px]')).toEqual({ borderRadius: 8 })
    expect(tw('opacity-[0.5]')).toEqual({ opacity: 0.5 })
  })

  it('later classes override earlier ones', () => {
    expect(tw('p-2 p-4')).toEqual({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
    expect(tw('text-red-500 text-blue-500')).toEqual({ color: '#3b82f6' })
  })

  it('ignores unknown tokens and empty strings', () => {
    expect(tw('')).toEqual({})
    expect(tw('   ')).toEqual({})
    expect(tw('flex not-a-real-class')).toEqual({ display: 'flex' })
  })

  it('handles extra whitespace', () => {
    expect(tw('  flex   flex-col  ')).toEqual({ display: 'flex', flexDirection: 'column' })
  })

  it('returns the same frozen instance for the same string (memoization)', () => {
    const a = tw('flex flex-col gap-2')
    const b = tw('flex flex-col gap-2')
    expect(a).toBe(b)
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('returns distinct instances for distinct strings', () => {
    expect(tw('flex')).not.toBe(tw('flex-col'))
  })
})

describe('createTw()', () => {
  it('short-circuits to prebuilt full-string records', () => {
    const prebuilt = {
      'flex flex-col': { display: 'flex', flexDirection: 'column' }
    }
    const localTw = createTw(prebuilt)
    expect(localTw('flex flex-col')).toBe(prebuilt['flex flex-col'])
  })

  it('falls back to runtime parsing for unknown strings', () => {
    const localTw = createTw({ 'flex flex-col': { display: 'flex', flexDirection: 'column' } })
    expect(localTw('bg-red-500')).toEqual({ backgroundColor: '#ef4444' })
  })

  it('memoizes runtime-parsed strings per instance', () => {
    const a = createTw()
    const b = createTw()
    expect(a('p-2')).toBe(a('p-2'))
    expect(a('p-2')).not.toBe(b('p-2'))
  })
})

describe('resolveClasses()', () => {
  it('resolves without memoization (fresh record each call)', () => {
    const a = resolveClasses('flex')
    const b = resolveClasses('flex')
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})