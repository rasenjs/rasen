import { test, expect } from '@playwright/test'

test.describe('Collapsible', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render collapsible with trigger and content', async ({
      page
    }) => {
      const trigger = page.locator('#collapsible-trigger')
      const content = page.locator('#collapsible-content')

      await expect(trigger).toBeVisible()
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('should have closed state by default', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      const content = page.locator('#collapsible-content')

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toHaveAttribute('data-state', 'closed')
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('should have correct button type', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await expect(trigger).toHaveAttribute('type', 'button')
    })
  })

  test.describe('interaction', () => {
    test('should expand content on trigger click', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger).toHaveAttribute('data-state', 'open')

      const content = page.locator('#collapsible-content')
      await expect(content).toBeVisible()
      await expect(content).toHaveAttribute('data-state', 'open')
    })

    test('should collapse content on second click', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')

      await trigger.click()
      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toHaveAttribute('data-state', 'closed')

      const content = page.locator('#collapsible-content')
      await expect(content).not.toBeVisible()
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('should toggle multiple times', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')

      await trigger.click()
      await trigger.click()
      await trigger.click()

      const content = page.locator('#collapsible-content')
      await expect(content).toBeVisible()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    test('should preserve content after collapse/expand cycle', async ({
      page
    }) => {
      const trigger = page.locator('#collapsible-trigger')

      await trigger.click()
      await trigger.click()
      await trigger.click()

      const content = page.locator('#collapsible-content')
      await expect(content).toContainText('This is collapsible content.')
    })
  })

  test.describe('keyboard interaction', () => {
    test('should toggle on Enter key', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await trigger.focus()

      await page.keyboard.press('Enter')

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    test('should toggle on Space key', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await trigger.focus()

      await page.keyboard.press('Space')

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    test('should be focusable', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await trigger.focus()
      await expect(trigger).toBeFocused()
    })
  })

  test.describe('accessibility', () => {
    test('should have aria-expanded attribute', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await expect(trigger).toHaveAttribute('aria-expanded')
    })

    test('should have data-state attribute', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await expect(trigger).toHaveAttribute('data-state')
    })

    test('should update aria-expanded when toggled', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  test.describe('edge cases', () => {
    test('should handle rapid clicks', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')

      await Promise.all([trigger.click(), trigger.click()])

      // Should end in a consistent state
      await expect(trigger).toHaveAttribute('data-state')
    })

    test('should not trigger form submission', async ({ page }) => {
      const trigger = page.locator('#collapsible-trigger')
      await trigger.click()

      // Page should not reload or navigate
      await expect(page).toHaveURL('/')
    })
  })
})
