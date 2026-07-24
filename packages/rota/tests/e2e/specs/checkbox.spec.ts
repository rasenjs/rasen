import { test, expect } from '@playwright/test'

test.describe('Checkbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render unchecked checkbox with correct attributes', async ({
      page
    }) => {
      const cb = page.locator('#checkbox-root-1')
      await expect(cb).toBeVisible()
      await expect(cb).toHaveAttribute('role', 'checkbox')
      await expect(cb).toHaveAttribute('aria-checked', 'false')
      await expect(cb).toHaveAttribute('data-state', 'unchecked')
    })

    test('should render checked checkbox with correct attributes', async ({
      page
    }) => {
      const cb = page.locator('#checkbox-root-2')
      await expect(cb).toHaveAttribute('aria-checked', 'true')
      await expect(cb).toHaveAttribute('data-state', 'checked')
    })

    test('should render disabled checkbox with correct attributes', async ({
      page
    }) => {
      const cb = page.locator('#checkbox-root-3')
      await expect(cb).toHaveAttribute('aria-disabled', 'true')
      await expect(cb).toHaveAttribute('data-disabled', '')
      await expect(cb).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('interaction', () => {
    test('should toggle to checked on click', async ({ page }) => {
      const cb = page.locator('#checkbox-root-1')
      await cb.click()

      await expect(cb).toHaveAttribute('aria-checked', 'true')
      await expect(cb).toHaveAttribute('data-state', 'checked')
    })

    test('should toggle back to unchecked on second click', async ({
      page
    }) => {
      const cb = page.locator('#checkbox-root-1')
      await cb.click()
      await cb.click()

      await expect(cb).toHaveAttribute('aria-checked', 'false')
      await expect(cb).toHaveAttribute('data-state', 'unchecked')
    })

    test('should not toggle disabled checkbox', async ({ page }) => {
      const cb = page.locator('#checkbox-root-3')
      await cb.click({ force: true })

      await expect(cb).toHaveAttribute('aria-checked', 'false')
      await expect(cb).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('accessibility', () => {
    test('should be focusable when enabled', async ({ page }) => {
      const cb = page.locator('#checkbox-root-1')
      await cb.focus()
      await expect(cb).toBeFocused()
    })

    test('should have tabindex="0" when enabled', async ({ page }) => {
      const cb = page.locator('#checkbox-root-1')
      await expect(cb).toHaveAttribute('tabindex', '0')
    })

    test('should have tabindex="-1" when disabled', async ({ page }) => {
      const cb = page.locator('#checkbox-root-3')
      await expect(cb).toHaveAttribute('tabindex', '-1')
    })

    test('should have correct role for screen readers', async ({ page }) => {
      const cb = page.locator('#checkbox-root-2')
      await expect(cb).toHaveAttribute('role', 'checkbox')
    })
  })
})
