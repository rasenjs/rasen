import { test, expect } from '@playwright/test'

test.describe('Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render tablist with correct role and orientation', async ({
      page
    }) => {
      const tablist = page.locator('#tabs-list')
      await expect(tablist).toBeVisible()
      await expect(tablist).toHaveAttribute('role', 'tablist')
      await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
    })

    test('should render correct number of tabs', async ({ page }) => {
      const tabs = page.locator('[role="tab"]')
      await expect(tabs).toHaveCount(3)
    })

    test('should render tabpanels with correct roles', async ({ page }) => {
      const panels = page.locator('[role="tabpanel"]')
      await expect(panels).toHaveCount(3)
    })

    test('should have first tab active by default', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      await expect(tab1).toHaveAttribute('aria-selected', 'true')
      await expect(tab1).toHaveAttribute('data-state', 'active')
      await expect(tab1).toHaveAttribute('tabindex', '0')
    })

    test('should have inactive tabs with correct attributes', async ({
      page
    }) => {
      const tab2 = page.locator('#tab-2')
      await expect(tab2).toHaveAttribute('aria-selected', 'false')
      await expect(tab2).toHaveAttribute('data-state', 'inactive')
      await expect(tab2).toHaveAttribute('tabindex', '-1')
    })
  })

  test.describe('interaction', () => {
    test('should switch to tab 2 when clicked', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.click()

      await expect(tab2).toHaveAttribute('aria-selected', 'true')
      await expect(tab2).toHaveAttribute('data-state', 'active')

      const panel2 = page.locator('#tabpanel-2')
      await expect(panel2).toBeVisible()
      await expect(panel2).toHaveAttribute('data-state', 'active')
    })

    test('should update previous tab to inactive state', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.click()

      const tab1 = page.locator('#tab-1')
      await expect(tab1).toHaveAttribute('aria-selected', 'false')
      await expect(tab1).toHaveAttribute('data-state', 'inactive')
    })

    test('should hide previous tabpanel', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.click()

      const panel1 = page.locator('#tabpanel-1')
      await expect(panel1).not.toBeVisible()
      await expect(panel1).toHaveAttribute('data-state', 'inactive')
    })

    test('should not activate disabled tab on click', async ({ page }) => {
      const tab3 = page.locator('#tab-3')
      await expect(tab3).toBeDisabled()
      await expect(tab3).toHaveAttribute('data-disabled', '')

      await tab3.click({ force: true })

      await expect(tab3).toHaveAttribute('aria-selected', 'false')
      await expect(tab3).toHaveAttribute('data-state', 'inactive')
    })

    test('should maintain state after multiple clicks', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      const tab2 = page.locator('#tab-2')

      await tab2.click()
      await tab1.click()
      await tab2.click()

      await expect(tab2).toHaveAttribute('aria-selected', 'true')
      await expect(tab1).toHaveAttribute('aria-selected', 'false')
    })
  })

  test.describe('keyboard navigation', () => {
    test('should focus first tab on initial focus', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      await tab1.focus()
      await expect(tab1).toBeFocused()
    })

    test('should navigate to next tab with ArrowRight', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      await tab1.focus()

      await page.keyboard.press('ArrowRight')

      const tab2 = page.locator('#tab-2')
      await expect(tab2).toBeFocused()
    })

    test('should navigate to previous tab with ArrowLeft', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('ArrowLeft')

      const tab1 = page.locator('#tab-1')
      await expect(tab1).toBeFocused()
    })

    test('should skip disabled tabs during keyboard navigation', async ({
      page
    }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('ArrowRight')

      // Should skip tab-3 (disabled) and wrap to tab-1
      const tab1 = page.locator('#tab-1')
      await expect(tab1).toBeFocused()
    })

    test('should wrap around to first tab when at end', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('ArrowRight')

      const tab1 = page.locator('#tab-1')
      await expect(tab1).toBeFocused()
    })

    test('should activate tab on Enter key', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('Enter')

      await expect(tab2).toHaveAttribute('aria-selected', 'true')
      const panel2 = page.locator('#tabpanel-2')
      await expect(panel2).toBeVisible()
    })

    test('should activate tab on Space key', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('Space')

      await expect(tab2).toHaveAttribute('aria-selected', 'true')
    })

    test('should move focus to Home key', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.focus()

      await page.keyboard.press('Home')

      const tab1 = page.locator('#tab-1')
      await expect(tab1).toBeFocused()
    })

    test('should move focus to End key', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      await tab1.focus()

      await page.keyboard.press('End')

      const tab2 = page.locator('#tab-2')
      await expect(tab2).toBeFocused()
    })
  })

  test.describe('accessibility', () => {
    test('should have aria-controls linking tab to panel', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      const controls = await tab1.getAttribute('aria-controls')
      const panel = page.locator(`#${controls}`)
      await expect(panel).toHaveAttribute('role', 'tabpanel')
      await expect(panel).toHaveAttribute('aria-labelledby', 'tab-1')
    })

    test('should have aria-labelledby linking panel to tab', async ({
      page
    }) => {
      const panel1 = page.locator('#tabpanel-1')
      const labelledby = await panel1.getAttribute('aria-labelledby')
      const tab = page.locator(`#${labelledby}`)
      await expect(tab).toHaveAttribute('role', 'tab')
    })

    test('should have unique IDs for all tabs and panels', async ({ page }) => {
      const tabs = await page.locator('[role="tab"]').all()
      const panels = await page.locator('[role="tabpanel"]').all()

      const tabIds = await Promise.all(
        tabs.map((tab) => tab.getAttribute('id'))
      )
      const panelIds = await Promise.all(
        panels.map((panel) => panel.getAttribute('id'))
      )

      const allIds = [...tabIds, ...panelIds]
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(allIds.length)
    })

    test('should not have focus trap', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      await tab1.focus()

      await page.keyboard.press('Tab')

      // Focus should move to next focusable element outside tabs
      const activeElement = page.locator(':focus')
      await expect(activeElement).not.toHaveAttribute('role', 'tab')
    })
  })

  test.describe('edge cases', () => {
    test('should handle rapid clicks', async ({ page }) => {
      const tab1 = page.locator('#tab-1')
      const tab2 = page.locator('#tab-2')

      await tab1.click()
      await tab2.click()

      // Should end in a consistent state
      const activeTab = page.locator('[data-state="active"][role="tab"]')
      await expect(activeTab).toHaveCount(1)
    })

    test('should preserve content when switching tabs', async ({ page }) => {
      const tab2 = page.locator('#tab-2')
      await tab2.click()

      const tab1 = page.locator('#tab-1')
      await tab1.click()
      await tab2.click()

      const panel2 = page.locator('#tabpanel-2')
      await expect(panel2).toContainText('Tab 2 content')
    })
  })
})
