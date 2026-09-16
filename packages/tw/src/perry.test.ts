import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTw } from './perry'

// The perry_ui_* functions are ambient globals rewritten by the Perry
// compiler. In tests we stub them on globalThis and assert the calls.
const fns = [
  'perry_ui_widget_set_background_color',
  'perry_ui_widget_set_corner_radius',
  'perry_ui_widget_set_border_color',
  'perry_ui_widget_set_border_width',
  'perry_ui_widget_set_edge_insets',
  'perry_ui_widget_set_opacity',
  'perry_ui_widget_set_shadow',
  'perry_ui_widget_set_hidden',
  'perry_ui_widget_set_enabled',
  'perry_ui_widget_set_tooltip',
  'perry_ui_widget_set_width',
  'perry_ui_widget_set_height',
  'perry_ui_text_set_color',
  'perry_ui_text_set_font_size',
  'perry_ui_text_set_font_weight',
  'perry_ui_text_set_font_family',
  'perry_ui_button_set_text_color',
  'perry_ui_button_set_bordered'
] as const

const mocks: Record<string, ReturnType<typeof vi.fn>> = {}

beforeEach(() => {
  for (const name of fns) {
    mocks[name] = vi.fn()
    vi.stubGlobal(name, mocks[name])
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('applyTw()', () => {
  it('applies background color with normalized RGBA', () => {
    applyTw(1, 'bg-blue-500')
    expect(mocks.perry_ui_widget_set_background_color).toHaveBeenCalledWith(1, 59 / 255, 130 / 255, 246 / 255, 1)
  })

  it('applies text color and font styles', () => {
    applyTw(2, 'text-red-500 text-xl font-bold')
    expect(mocks.perry_ui_text_set_color).toHaveBeenCalledWith(2, 239 / 255, 68 / 255, 68 / 255, 1)
    expect(mocks.perry_ui_text_set_font_size).toHaveBeenCalledWith(2, 20)
    expect(mocks.perry_ui_text_set_font_weight).toHaveBeenCalledWith(2, 20, 700)
  })

  it('routes color to the button setter when kind is button', () => {
    applyTw(3, 'text-white', 'button')
    expect(mocks.perry_ui_button_set_text_color).toHaveBeenCalledWith(3, 1, 1, 1, 1)
    expect(mocks.perry_ui_text_set_color).not.toHaveBeenCalled()
  })

  it('maps borderWidth to the button bordered flag when kind is button', () => {
    applyTw(3, 'border', 'button')
    expect(mocks.perry_ui_widget_set_border_width).toHaveBeenCalledWith(3, 1)
    expect(mocks.perry_ui_button_set_bordered).toHaveBeenCalledWith(3, 1)
  })

  it('applies border and radius', () => {
    applyTw(4, 'border-2 border-gray-900 rounded-lg')
    expect(mocks.perry_ui_widget_set_border_width).toHaveBeenCalledWith(4, 2)
    expect(mocks.perry_ui_widget_set_border_color).toHaveBeenCalledWith(4, 17 / 255, 24 / 255, 39 / 255, 1)
    expect(mocks.perry_ui_widget_set_corner_radius).toHaveBeenCalledWith(4, 8)
  })

  it('applies padding as edge insets (top, left, bottom, right)', () => {
    applyTw(5, 'p-4')
    expect(mocks.perry_ui_widget_set_edge_insets).toHaveBeenCalledWith(5, 16, 16, 16, 16)
  })

  it('applies opacity and shadow', () => {
    applyTw(6, 'opacity-50 shadow-md')
    expect(mocks.perry_ui_widget_set_opacity).toHaveBeenCalledWith(6, 0.5)
    expect(mocks.perry_ui_widget_set_shadow).toHaveBeenCalledWith(6, 0, 0, 0, 0.1, 6, 0, 2)
  })

  it('maps display none to hidden', () => {
    applyTw(7, 'hidden')
    expect(mocks.perry_ui_widget_set_hidden).toHaveBeenCalledWith(7, 1)
  })

  it('applies width and height', () => {
    applyTw(8, 'w-24 h-10')
    expect(mocks.perry_ui_widget_set_width).toHaveBeenCalledWith(8, 96)
    expect(mocks.perry_ui_widget_set_height).toHaveBeenCalledWith(8, 40)
  })

  it('does not call setters for absent properties', () => {
    applyTw(9, 'flex')
    for (const name of fns) {
      expect(mocks[name]).not.toHaveBeenCalled()
    }
  })
})