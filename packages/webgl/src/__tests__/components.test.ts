/**
 * Component tests
 */
import { describe, it, expect } from 'vitest'

describe('@rasenjs/webgl components', () => {
  describe('rect', () => {
    it('should export rect component', async () => {
      const { rect } = await import('../components/2d/rect')
      expect(rect).toBeDefined()
      expect(typeof rect).toBe('function')
    })
  })

  describe('circle', () => {
    it('should export circle component', async () => {
      const { circle } = await import('../components/2d/circle')
      expect(circle).toBeDefined()
      expect(typeof circle).toBe('function')
    })
  })

  describe('line', () => {
    it('should export line component', async () => {
      const { line } = await import('../components/2d/line')
      expect(line).toBeDefined()
      expect(typeof line).toBe('function')
    })
  })

  describe('ellipse', () => {
    it('should export ellipse component', async () => {
      const { ellipse } = await import('../components/2d/ellipse')
      expect(ellipse).toBeDefined()
      expect(typeof ellipse).toBe('function')
    })
  })

  describe('arc', () => {
    it('should export arc component', async () => {
      const { arc } = await import('../components/2d/arc')
      expect(arc).toBeDefined()
      expect(typeof arc).toBe('function')
    })
  })

  describe('ring', () => {
    it('should export ring component', async () => {
      const { ring } = await import('../components/2d/ring')
      expect(ring).toBeDefined()
      expect(typeof ring).toBe('function')
    })
  })

  describe('star', () => {
    it('should export star component', async () => {
      const { star } = await import('../components/2d/star')
      expect(star).toBeDefined()
      expect(typeof star).toBe('function')
    })
  })

  describe('wedge', () => {
    it('should export wedge component', async () => {
      const { wedge } = await import('../components/2d/wedge')
      expect(wedge).toBeDefined()
      expect(typeof wedge).toBe('function')
    })
  })

  describe('polygon', () => {
    it('should export polygon component', async () => {
      const { polygon } = await import('../components/2d/polygon')
      expect(polygon).toBeDefined()
      expect(typeof polygon).toBe('function')
    })
  })

  describe('arrow', () => {
    it('should export arrow component', async () => {
      const { arrow } = await import('../components/2d/arrow')
      expect(arrow).toBeDefined()
      expect(typeof arrow).toBe('function')
    })
  })

  describe('all components export', () => {
    it('should export all components from index', async () => {
      const components = await import('../components')
      expect(components.rect).toBeDefined()
      expect(components.circle).toBeDefined()
      expect(components.line).toBeDefined()
      expect(components.ellipse).toBeDefined()
      expect(components.arc).toBeDefined()
      expect(components.ring).toBeDefined()
      expect(components.star).toBeDefined()
      expect(components.wedge).toBeDefined()
      expect(components.polygon).toBeDefined()
      expect(components.arrow).toBeDefined()
    })
  })
})
