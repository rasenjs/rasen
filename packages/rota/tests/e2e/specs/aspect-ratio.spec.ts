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
