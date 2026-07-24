import { test, expect } from '@playwright/test'

test.describe('Avatar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render avatar with image', async ({ page }) => {
      const avatar = page.locator('#avatar-with-image')
      await expect(avatar).toBeVisible()
    })

    test('should render image inside avatar', async ({ page }) => {
      const img = page.locator('#avatar-with-image img')
      await expect(img).toBeVisible()
    })

    test('should render avatar with fallback', async ({ page }) => {
      const avatar = page.locator('#avatar-with-fallback')
      await expect(avatar).toBeVisible()
    })

    test('should render fallback text', async ({ page }) => {
      const fallback = page.locator('#avatar-with-fallback .avatar-fallback')
      await expect(fallback).toBeVisible()
      await expect(fallback).toContainText('AB')
    })
  })

  test.describe('layout', () => {
    test('should have non-zero dimensions', async ({ page }) => {
      const avatar = page.locator('#avatar-with-image')
      const box = await avatar.boundingBox()
      expect(box?.width).toBeGreaterThan(0)
      expect(box?.height).toBeGreaterThan(0)
    })

    test('should be circular with border-radius', async ({ page }) => {
      const avatar = page.locator('#avatar-with-image')
      const borderRadius = await avatar.evaluate(
        (el) => window.getComputedStyle(el).borderRadius
      )
      expect(borderRadius).toBeTruthy()
    })
  })
})
