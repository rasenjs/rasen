import { test, expect } from '@playwright/test'

test.describe('Progress', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render progress with role="progressbar"', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toBeVisible()
      await expect(progress).toHaveAttribute('role', 'progressbar')
    })

    test('should have correct aria-valuenow', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('aria-valuenow', '50')
    })

    test('should have aria-valuemin="0"', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('aria-valuemin', '0')
    })

    test('should have aria-valuemax="100"', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('aria-valuemax', '100')
    })

    test('should have aria-valuetext', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('aria-valuetext', '50%')
    })

    test('should move the indicator to show the value', async ({ page }) => {
      const indicator = page.locator('#progress-indicator-50')
      await expect(indicator).toBeVisible()
      const style = await indicator.getAttribute('style')

      // The fill is a full-width bar shifted left, not a percentage width.
      // These tests asserted `width: 50%`, which was never the component's
      // mechanism - `width` is a styling decision a consumer may override,
      // while the transform is how the component expresses the value (the
      // same technique Radix's Progress uses). Asserting the transform checks
      // the behaviour instead of one implementation of the look.
      expect(style).toContain('width: 100%')
      expect(style).toContain('translateX(-50%)')
    })

    test('should hide the whole indicator at zero', async ({ page }) => {
      const progress = page.locator('#progress-0')
      await expect(progress).toHaveAttribute('aria-valuenow', '0')

      const indicator = page.locator('#progress-indicator-0')
      const style = await indicator.getAttribute('style')
      // Nothing filled: the full-width bar is shifted clear of the track.
      expect(style).toContain('translateX(-100%)')
    })
  })

  test.describe('accessibility', () => {
    test('should have progressbar role for screen readers', async ({
      page
    }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('role', 'progressbar')
    })

    test('should have descriptive aria-valuetext', async ({ page }) => {
      const progress = page.locator('#progress-50')
      const valueText = await progress.getAttribute('aria-valuetext')
      expect(valueText).toBeTruthy()
    })

    test('should have both min and max values defined', async ({ page }) => {
      const progress = page.locator('#progress-50')
      await expect(progress).toHaveAttribute('aria-valuemin')
      await expect(progress).toHaveAttribute('aria-valuemax')
    })
  })
})
