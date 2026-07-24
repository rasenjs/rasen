import { test, expect } from '@playwright/test'

test.describe('Switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render switch with role="switch"', async ({ page }) => {
      const sw = page.locator('#switch-off')
      await expect(sw).toBeVisible()
      await expect(sw).toHaveAttribute('role', 'switch')
    })

    test('should have aria-checked="false" when off', async ({ page }) => {
      const sw = page.locator('#switch-off')
      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await expect(sw).toHaveAttribute('data-state', 'unchecked')
    })

    test('should have aria-checked="true" when on', async ({ page }) => {
      const sw = page.locator('#switch-on')
      await expect(sw).toHaveAttribute('aria-checked', 'true')
      await expect(sw).toHaveAttribute('data-state', 'checked')
    })

    test('should render disabled switch with correct attributes', async ({
      page
    }) => {
      const sw = page.locator('#switch-disabled')
      await expect(sw).toHaveAttribute('aria-disabled', 'true')
      await expect(sw).toHaveAttribute('data-disabled', '')
      await expect(sw).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('interaction', () => {
    test('should toggle to checked on click', async ({ page }) => {
      const sw = page.locator('#switch-off')
      await sw.click()

      await expect(sw).toHaveAttribute('aria-checked', 'true')
      await expect(sw).toHaveAttribute('data-state', 'checked')
    })

    test('should toggle back to unchecked on second click', async ({
      page
    }) => {
      const sw = page.locator('#switch-off')
      await sw.click()
      await sw.click()

      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await expect(sw).toHaveAttribute('data-state', 'unchecked')
    })

    test('should not toggle disabled switch', async ({ page }) => {
      const sw = page.locator('#switch-disabled')
      await sw.click({ force: true })

      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await expect(sw).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('accessibility', () => {
    test('should be focusable', async ({ page }) => {
      const sw = page.locator('#switch-off')
      await sw.focus()
      await expect(sw).toBeFocused()
    })

    test('should have tabindex="0" when enabled', async ({ page }) => {
      const sw = page.locator('#switch-off')
      await expect(sw).toHaveAttribute('tabindex', '0')
    })

    test('should have tabindex="-1" when disabled', async ({ page }) => {
      const sw = page.locator('#switch-disabled')
      await expect(sw).toHaveAttribute('tabindex', '-1')
    })

    test('should have correct role for screen readers', async ({ page }) => {
      const sw = page.locator('#switch-on')
      await expect(sw).toHaveAttribute('role', 'switch')
    })
  })
})
