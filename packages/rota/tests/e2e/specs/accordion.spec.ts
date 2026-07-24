import { test, expect } from '@playwright/test'

test.describe('Accordion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render accordion with correct orientation', async ({
      page
    }) => {
      const accordion = page.locator('#accordion-single')
      await expect(accordion).toBeVisible()
      await expect(accordion).toHaveAttribute('data-orientation', 'vertical')
    })

    test('should render correct number of items', async ({ page }) => {
      const items = page.locator('#accordion-single .accordion-item')
      await expect(items).toHaveCount(3)
    })

    test('should render triggers with correct attributes', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toBeVisible()
      await expect(trigger1).toHaveAttribute('role', 'button')
      await expect(trigger1).toHaveAttribute('type', 'button')
      await expect(trigger1).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger1).toHaveAttribute('data-state', 'open')
    })

    test('should render content with correct roles and attributes', async ({
      page
    }) => {
      const content1 = page.locator('#accordion-content-1')
      await expect(content1).toBeVisible()
      await expect(content1).toHaveAttribute('role', 'region')
      await expect(content1).toHaveAttribute('data-state', 'open')
    })

    test('should have first item expanded by default', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger1).toHaveAttribute('data-state', 'open')
    })

    test('should have other items collapsed by default', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await expect(trigger2).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger2).toHaveAttribute('data-state', 'closed')
    })

    test('should render disabled item with correct attributes', async ({
      page
    }) => {
      const trigger3 = page.locator('#accordion-trigger-3')
      await expect(trigger3).toHaveAttribute('aria-disabled', 'true')
      await expect(trigger3).toHaveAttribute('data-disabled', '')
      await expect(trigger3).toBeDisabled()
    })
  })

  test.describe('interaction - single mode', () => {
    test('should expand collapsed item when clicked', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.click()

      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('data-state', 'open')

      const content2 = page.locator('#accordion-content-2')
      await expect(content2).toBeVisible()
      await expect(content2).toHaveAttribute('data-state', 'open')
    })

    test('should collapse expanded item and expand clicked item in single mode', async ({
      page
    }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      const trigger2 = page.locator('#accordion-trigger-2')

      await trigger2.click()

      await expect(trigger1).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger1).toHaveAttribute('data-state', 'closed')
      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('data-state', 'open')
    })

    test('should not collapse item when clicking same item (non-collapsible)', async ({
      page
    }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.click()

      await expect(trigger1).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger1).toHaveAttribute('data-state', 'open')
    })

    test('should not toggle disabled item on click', async ({ page }) => {
      const trigger3 = page.locator('#accordion-trigger-3')
      await trigger3.click({ force: true })

      await expect(trigger3).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger3).toHaveAttribute('data-state', 'closed')
    })
  })

  test.describe('interaction - multiple mode', () => {
    test('should allow multiple items to be open', async ({ page }) => {
      const trigger1 = page.locator('#accordion-multi-trigger-1')
      const trigger2 = page.locator('#accordion-multi-trigger-2')

      await expect(trigger1).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
    })

    test('should toggle individual items independently', async ({ page }) => {
      const trigger1 = page.locator('#accordion-multi-trigger-1')
      await trigger1.click()

      await expect(trigger1).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger1).toHaveAttribute('data-state', 'closed')

      const trigger2 = page.locator('#accordion-multi-trigger-2')
      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
    })

    test('should not affect other items when toggling', async ({ page }) => {
      const trigger1 = page.locator('#accordion-multi-trigger-1')
      const trigger2 = page.locator('#accordion-multi-trigger-2')

      await trigger1.click()
      await trigger1.click()

      await expect(trigger1).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
    })
  })

  test.describe('interaction - collapsible mode', () => {
    test('should collapse item when clicking same item (collapsible)', async ({
      page
    }) => {
      const trigger = page.locator('#accordion-collapsible-trigger-1')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toHaveAttribute('data-state', 'closed')
    })

    test('should expand item after collapsing', async ({ page }) => {
      const trigger = page.locator('#accordion-collapsible-trigger-1')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  test.describe('keyboard navigation', () => {
    test('should focus first trigger on initial focus', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.focus()
      await expect(trigger1).toBeFocused()
    })

    test('should navigate to next trigger with ArrowDown', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.focus()

      await page.keyboard.press('ArrowDown')

      const trigger2 = page.locator('#accordion-trigger-2')
      await expect(trigger2).toBeFocused()
    })

    test('should navigate to previous trigger with ArrowUp', async ({
      page
    }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('ArrowUp')

      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toBeFocused()
    })

    test('should skip disabled tabs during keyboard navigation', async ({
      page
    }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('ArrowDown')

      // Should skip trigger-3 (disabled) and wrap to trigger-1
      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toBeFocused()
    })

    test('should wrap around to first trigger when at end', async ({
      page
    }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('ArrowDown')

      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toBeFocused()
    })

    test('should wrap around to last trigger when at start with ArrowUp', async ({
      page
    }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.focus()

      await page.keyboard.press('ArrowUp')

      const trigger2 = page.locator('#accordion-trigger-2')
      await expect(trigger2).toBeFocused()
    })

    test('should move focus to Home key', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('Home')

      const trigger1 = page.locator('#accordion-trigger-1')
      await expect(trigger1).toBeFocused()
    })

    test('should move focus to End key', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.focus()

      await page.keyboard.press('End')

      const trigger2 = page.locator('#accordion-trigger-2')
      await expect(trigger2).toBeFocused()
    })

    test('should toggle trigger on Enter key', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('Enter')

      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('data-state', 'open')
    })

    test('should toggle trigger on Space key', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('Space')

      await expect(trigger2).toHaveAttribute('aria-expanded', 'true')
      await expect(trigger2).toHaveAttribute('data-state', 'open')
    })
  })

  test.describe('keyboard navigation - horizontal', () => {
    test('should navigate with ArrowRight in horizontal orientation', async ({
      page
    }) => {
      const trigger1 = page.locator('#accordion-horizontal-trigger-1')
      await trigger1.focus()

      await page.keyboard.press('ArrowRight')

      const trigger2 = page.locator('#accordion-horizontal-trigger-2')
      await expect(trigger2).toBeFocused()
    })

    test('should navigate with ArrowLeft in horizontal orientation', async ({
      page
    }) => {
      const trigger2 = page.locator('#accordion-horizontal-trigger-2')
      await trigger2.focus()

      await page.keyboard.press('ArrowLeft')

      const trigger1 = page.locator('#accordion-horizontal-trigger-1')
      await expect(trigger1).toBeFocused()
    })
  })

  test.describe('accessibility', () => {
    test('should have aria-controls linking trigger to content', async ({
      page
    }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      const controls = await trigger1.getAttribute('aria-controls')
      const content = page.locator(`#${controls}`)
      await expect(content).toHaveAttribute('role', 'region')
      await expect(content).toHaveAttribute(
        'aria-labelledby',
        'accordion-header-1'
      )
    })

    test('should have aria-labelledby linking content to header', async ({
      page
    }) => {
      const content1 = page.locator('#accordion-content-1')
      const labelledby = await content1.getAttribute('aria-labelledby')
      const header = page.locator(`#${labelledby}`)
      await expect(header).toHaveAttribute('role', 'heading')
    })

    test('should have unique IDs for all triggers and contents', async ({
      page
    }) => {
      const triggers = await page.locator('.accordion-trigger').all()
      const contents = await page.locator('.accordion-content').all()

      const triggerIds = await Promise.all(
        triggers.map((trigger) => trigger.getAttribute('id'))
      )
      const contentIds = await Promise.all(
        contents.map((content) => content.getAttribute('id'))
      )

      const allIds = [...triggerIds, ...contentIds]
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(allIds.length)
    })

    test('should have correct heading role and level', async ({ page }) => {
      const header = page.locator('#accordion-header-1')
      await expect(header).toHaveAttribute('role', 'heading')
      await expect(header).toHaveAttribute('aria-level', '3')
    })

    test('should not have focus trap', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.focus()

      await page.keyboard.press('Tab')

      const activeElement = page.locator(':focus')
      await expect(activeElement).not.toHaveAttribute('id', /accordion-trigger/)
    })
  })

  test.describe('edge cases', () => {
    test('should handle rapid clicks', async ({ page }) => {
      const trigger1 = page.locator('#accordion-trigger-1')
      const trigger2 = page.locator('#accordion-trigger-2')

      await trigger2.click()
      await trigger1.click()
      await trigger2.click()

      const singleAccordion = page.locator('#accordion-single')
      const openTriggers = singleAccordion.locator(
        '[data-state="open"].accordion-trigger'
      )
      await expect(openTriggers).toHaveCount(1)
    })

    test('should preserve content when switching items', async ({ page }) => {
      const trigger2 = page.locator('#accordion-trigger-2')
      await trigger2.click()

      const trigger1 = page.locator('#accordion-trigger-1')
      await trigger1.click()
      await trigger2.click()

      const content2 = page.locator('#accordion-content-2')
      await expect(content2).toContainText('Content for item 2')
    })

    test('should maintain state after multiple toggles', async ({ page }) => {
      const trigger1 = page.locator('#accordion-multi-trigger-1')

      await trigger1.click()
      await trigger1.click()
      await trigger1.click()

      // After 3 clicks: open -> closed -> open -> closed
      await expect(trigger1).toHaveAttribute('aria-expanded', 'false')
    })
  })
})
