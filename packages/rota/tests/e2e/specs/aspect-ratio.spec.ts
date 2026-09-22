import { test, expect } from '@playwright/test'

test.describe('AspectRatio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render aspect ratio container', async ({ page }) => {
      const container = page.locator('#aspect-ratio-16-9')
      await expect(container).toBeVisible()
    })

    test('should have padding-bottom for 16:9 ratio', async ({ page }) => {
      const container = page.locator('#aspect-ratio-16-9')
      const style = await container.getAttribute('style')
      expect(style).toContain('padding-bottom: 56.25%')
    })

    test('should render child image inside container', async ({ page }) => {
      const img = page.locator('#aspect-ratio-16-9 img')
      await expect(img).toBeVisible()
    })

    test('should have correct alt text on image', async ({ page }) => {
      const img = page.locator('#aspect-ratio-16-9 img')
      await expect(img).toHaveAttribute('alt', '16:9 ratio')
    })
  })

  test.describe('content', () => {
    test('should centre a child smaller than the box', async ({ page }) => {
      // Geometry, not styles: jsdom cannot observe a layout, so this is the
      // only place the centring is actually verified.
      const child = page.locator('#aspect-ratio-centered-child')
      const box = await page.locator('#aspect-ratio-center-host > *').boundingBox()
      const inner = await child.boundingBox()
      expect(box).not.toBeNull()
      expect(inner).not.toBeNull()

      const childCentre = {
        x: inner!.x + inner!.width / 2,
        y: inner!.y + inner!.height / 2
      }
      const boxCentre = {
        x: box!.x + box!.width / 2,
        y: box!.y + box!.height / 2
      }

      // Within a pixel: sub-pixel rounding is the only slack worth allowing.
      expect(Math.abs(childCentre.x - boxCentre.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(childCentre.y - boxCentre.y)).toBeLessThanOrEqual(1)
      // And it really is smaller than the box, so the assertion means something.
      expect(inner!.width).toBeLessThan(box!.width)
    })

    test('should not disturb a child that fills the box', async ({ page }) => {
      // The image demo pins its child with `position: absolute; inset: 0`;
      // out-of-flow children are unaffected by the flex layout, so the fill
      // still measures the same as the box.
      const box = await page.locator('#aspect-ratio-host > *').boundingBox()
      const img = await page.locator('#aspect-ratio-16-9 img').boundingBox()

      expect(Math.abs(img!.width - box!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(img!.height - box!.height)).toBeLessThanOrEqual(1)
    })
  })

  test.describe('layout', () => {
    test('should maintain aspect ratio container width', async ({ page }) => {
      const container = page.locator('#aspect-ratio-16-9')
      const boundingBox = await container.boundingBox()
      expect(boundingBox?.width).toBeGreaterThan(0)
    })

    test('should have non-zero height from padding trick', async ({ page }) => {
      const container = page.locator('#aspect-ratio-16-9')
      const boundingBox = await container.boundingBox()
      expect(boundingBox?.height).toBeGreaterThan(0)
    })
  })
})
