/**
 * The shared HTML attribute conventions.
 *
 * These rules are what keeps the string renderer and the DOM writer emitting
 * the same markup; each case below is a place where two implementations would
 * otherwise drift, so they are pinned individually.
 */
import { describe, it, expect } from 'vitest'
import {
  camelToKebab,
  getAttrName,
  isEventProp,
  getEventName,
  attrValue
} from './html-attributes'

describe('@rasenjs/core - html attribute conventions', () => {
  describe('camelToKebab', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(camelToKebab('backgroundColor')).toBe('background-color')
      expect(camelToKebab('flexDirection')).toBe('flex-direction')
    })

    it('should leave kebab-case and single words alone', () => {
      expect(camelToKebab('color')).toBe('color')
      expect(camelToKebab('border-radius')).toBe('border-radius')
    })

    it('should split after digits', () => {
      expect(camelToKebab('gridColumn2Start')).toBe('grid-column2-start')
    })
  })

  describe('getAttrName', () => {
    it('should kebab-case aria* and data* keys', () => {
      expect(getAttrName('ariaChecked')).toBe('aria-checked')
      expect(getAttrName('ariaValueNow')).toBe('aria-value-now')
      expect(getAttrName('dataState')).toBe('data-state')
      expect(getAttrName('dataSide')).toBe('data-side')
    })

    it('should leave other keys untouched', () => {
      expect(getAttrName('tabIndex')).toBe('tabIndex')
      expect(getAttrName('title')).toBe('title')
      expect(getAttrName('aria-label')).toBe('aria-label')
    })
  })

  describe('isEventProp / getEventName', () => {
    it('should accept on* with an uppercase third character', () => {
      expect(isEventProp('onClick')).toBe(true)
      expect(isEventProp('onMouseEnter')).toBe(true)
      expect(isEventProp('on')).toBe(false)
    })

    it('should not mistake an ordinary attribute for a handler', () => {
      // These start with "on" but are real attributes, not listeners.
      expect(isEventProp('once')).toBe(false)
      expect(isEventProp('only')).toBe(false)
    })

    it('should lowercase the event name', () => {
      expect(getEventName('onClick')).toBe('click')
      expect(getEventName('onMouseEnter')).toBe('mouseenter')
    })
  })

  describe('attrValue', () => {
    it('should treat null and undefined as absent', () => {
      expect(attrValue('title', null)).toBeNull()
      expect(attrValue('title', undefined)).toBeNull()
    })

    it('should carry a boolean value on data-* attributes', () => {
      expect(attrValue('data-state', true)).toBe('true')
      expect(attrValue('data-state', false)).toBe('false')
    })

    it('should make a boolean a flag on other attributes', () => {
      expect(attrValue('disabled', true)).toBe('')
      expect(attrValue('disabled', false)).toBeNull()
    })

    it('should stringify everything else', () => {
      expect(attrValue('tabindex', -1)).toBe('-1')
      expect(attrValue('title', 'a')).toBe('a')
      expect(attrValue('value', 0)).toBe('0')
    })

    it('should keep an empty string present', () => {
      // '' means "present but empty", which is why absent is null instead.
      expect(attrValue('alt', '')).toBe('')
    })
  })
})
