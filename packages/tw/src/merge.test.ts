import { describe, expect, it } from 'vitest'
import { expandAggregates, mergeStyles } from './merge'

describe('expandAggregates()', () => {
  it('expands uniform padding to four sides', () => {
    expect(expandAggregates({ padding: 16 })).toEqual({
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16
    })
  })

  it('expands margin object form', () => {
    expect(expandAggregates({ margin: { top: 4, right: 8, bottom: 4, left: 8 } })).toEqual({
      marginTop: 4,
      marginRight: 8,
      marginBottom: 4,
      marginLeft: 8
    })
  })

  it('expands shadow object to single keys', () => {
    expect(expandAggregates({ shadow: { color: '#000', blur: 6, offsetX: 0, offsetY: 2 } })).toEqual({
      shadowColor: '#000',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2
    })
  })

  it('expands border object to width + color', () => {
    expect(expandAggregates({ border: { width: 2, color: '#111827' } })).toEqual({
      borderWidth: 2,
      borderColor: '#111827'
    })
  })

  it('keeps single keys and gap as-is', () => {
    expect(expandAggregates({ gap: 8, paddingTop: 4, backgroundColor: '#fff' })).toEqual({
      gap: 8,
      paddingTop: 4,
      backgroundColor: '#fff'
    })
  })
})

describe('mergeStyles()', () => {
  it('merges multiple sources with later-wins priority', () => {
    expect(mergeStyles({ color: 'red' }, { color: 'blue' })).toEqual({ color: 'blue' })
  })

  it('resolves aggregate-vs-single conflicts correctly', () => {
    expect(mergeStyles({ padding: 16 }, { paddingTop: 4 })).toEqual({
      paddingTop: 4,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16
    })
  })

  it('later aggregate overrides earlier single keys', () => {
    expect(mergeStyles({ paddingTop: 4 }, { padding: 8 })).toEqual({
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8
    })
  })

  it('ignores null / undefined sources', () => {
    expect(mergeStyles(null, { color: 'red' }, undefined)).toEqual({ color: 'red' })
  })

  it('merges a realistic class + inline style combo', () => {
    const result = mergeStyles(
      { padding: 16, backgroundColor: '#fff', borderRadius: 8 },
      { paddingTop: 4, opacity: 0.8 }
    )
    expect(result).toEqual({
      paddingTop: 4,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      backgroundColor: '#fff',
      borderRadius: 8,
      opacity: 0.8
    })
  })
})