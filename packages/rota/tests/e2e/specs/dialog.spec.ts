import { test, expect } from '@playwright/test'

/**
 * Dialog in a real browser.
 *
 * The unit tests drive jsdom, which has no layout and no real key handling — so
 * this is where the parts that only exist in a browser get checked: the panel
 * is actually visible, Tab really moves between focusable elements and wraps,
 * Escape arrives at the document, and a press on the overlay (which sits on top
 * of the page) dismisses.
 */
test.describe('Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render a trigger button', async ({ page }) => {
      await expect(page.locator('#dialog-trigger')).toBeVisible()
    })

    test('should start closed', async ({ page }) => {
      const content = page.locator('#dialog-content')
      await expect(content).toHaveAttribute('data-state', 'closed')
      await expect(content).toBeHidden()
    })

    test('should open on trigger click with dialog semantics', async ({
      page
    }) => {
      await page.locator('#dialog-trigger').click()

      const content = page.locator('#dialog-content')
      await expect(content).toBeVisible()
      await expect(content).toHaveAttribute('role', 'dialog')
      await expect(content).toHaveAttribute('aria-modal', 'true')
      await expect(content).toHaveAttribute('data-state', 'open')
    })

    test('should link the panel to its title and description', async ({
      page
    }) => {
      await page.locator('#dialog-trigger').click()

      const content = page.locator('#dialog-content')
      const labelledby = await content.getAttribute('aria-labelledby')
      const describedby = await content.getAttribute('aria-describedby')

      await expect(page.locator(`#${labelledby}`)).toBeVisible()
      await expect(page.locator(`#${describedby}`)).toBeVisible()
    })

    test('should report the trigger state', async ({ page }) => {
      const trigger = page.locator('#dialog-trigger')
      await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()

      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  test.describe('focus', () => {
    test('should move focus into the panel on open', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      // The panel's only focusable part is the close button.
      await expect(page.locator('#dialog-close')).toBeFocused()
    })

    test('should keep Tab inside the panel', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      await expect(page.locator('#dialog-close')).toBeFocused()

      await page.keyboard.press('Tab')
      // One focusable element: Tab wraps back to it instead of leaving.
      await expect(page.locator('#dialog-close')).toBeFocused()

      await page.keyboard.press('Shift+Tab')
      await expect(page.locator('#dialog-close')).toBeFocused()
    })

    test('should give focus back to the trigger on close', async ({ page }) => {
      const trigger = page.locator('#dialog-trigger')
      await trigger.click()
      await expect(page.locator('#dialog-close')).toBeFocused()

      await page.locator('#dialog-close').click()

      await expect(trigger).toBeFocused()
    })
  })

  test.describe('relocated into an application container', () => {
    const movedTrigger = '#dialog-relocated-trigger'
    const movedPanel = '#dialog-relocated-content'

    test('should put the panel and overlay in the container, not in the root', async ({
      page
    }) => {
      await page.locator(movedTrigger).click()
      await expect(page.locator(movedPanel)).toBeVisible()

      const placement = await page.evaluate(() => {
        const panel = document.getElementById('dialog-relocated-content')!
        const overlay = document.getElementById('dialog-relocated-overlay')!
        const host = document.getElementById('overlay-root')!
        const demo = document.getElementById('dialog-relocated')!
        return {
          panelParent: panel.parentElement?.id ?? null,
          overlayParent: overlay.parentElement?.id ?? null,
          panelStillInDemo: demo.contains(panel),
          overlayIsHost: host.contains(overlay),
          panelIsHost: host.contains(panel)
        }
      })

      expect(placement.panelParent).toBe('overlay-root')
      expect(placement.overlayParent).toBe('overlay-root')
      expect(placement.panelStillInDemo).toBe(false)
      expect(placement.overlayIsHost).toBe(true)
      expect(placement.panelIsHost).toBe(true)
      // One panel, moved - not a second copy left behind.
      await expect(page.locator(movedPanel)).toHaveCount(1)
    })

    test('should keep working after the move', async ({ page }) => {
      await page.locator(movedTrigger).click()
      await expect(page.locator(movedPanel)).toBeVisible()

      // The layer's listeners follow the element, wherever it now lives.
      await page.keyboard.press('Escape')
      await expect(page.locator(movedPanel)).toBeHidden()

      // Opening again still moves focus into the relocated panel.
      await page.locator(movedTrigger).click()
      await expect(page.locator(movedPanel)).toBeVisible()
      const focused = await page.evaluate(
        () => document.activeElement?.id || document.activeElement?.tagName
      )
      expect(focused).toBe('dialog-relocated-close')
    })

    test('should not move the panels that were not asked to move', async ({
      page
    }) => {
      await page.locator('#dialog-trigger').click()
      await expect(page.locator('#dialog-content')).toBeVisible()

      const where = await page.evaluate(() => {
        const panel = document.getElementById('dialog-content')!
        return {
          // The default path is unchanged: still inside the demo that declared
          // it. Asserted by containment rather than by parent id, because the
          // wrapper between the host and the panel is the component's own.
          inDemo: document.getElementById('dialog')!.contains(panel),
          inOverlayRoot: document
            .getElementById('overlay-root')!
            .contains(panel)
        }
      })
      expect(where.inDemo).toBe(true)
      expect(where.inOverlayRoot).toBe(false)
      await page.keyboard.press('Escape')
    })
  })

  test.describe('scroll lock', () => {
    test('should stop the page scrolling behind the modal', async ({ page }) => {
      // A modal that leaves the page scrollable underneath can be scrolled
      // *behind*, which slides the panel out from under the pointer.
      const overflow = () =>
        page.evaluate(() => document.body.style.overflow)

      expect(await overflow()).not.toBe('hidden')

      await page.locator('#dialog-trigger').click()
      await expect(page.locator('#dialog-content')).toBeVisible()
      expect(await overflow()).toBe('hidden')

      await page.keyboard.press('Escape')
      await expect(page.locator('#dialog-content')).toBeHidden()
      // Released, so the page is usable again.
      expect(await overflow()).not.toBe('hidden')
    })
  })

  test.describe('dismissing', () => {
    test('should close on Escape', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      await expect(page.locator('#dialog-content')).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(page.locator('#dialog-content')).toBeHidden()
      await expect(page.locator('#dialog-content')).toHaveAttribute(
        'data-state',
        'closed'
      )
    })

    test('should close on a press outside the panel', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      await expect(page.locator('#dialog-content')).toBeVisible()

      // Somewhere on the page behind the overlay.
      await page.mouse.click(5, 5)

      await expect(page.locator('#dialog-content')).toBeHidden()
    })

    test('should close from the close button', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      await page.locator('#dialog-close').click()
      await expect(page.locator('#dialog-content')).toBeHidden()
    })

    test('should stay closed after dismissing', async ({ page }) => {
      await page.locator('#dialog-trigger').click()
      await page.keyboard.press('Escape')
      await expect(page.locator('#dialog-content')).toBeHidden()

      // Focus is back on the trigger; Escape must not do anything now.
      await page.keyboard.press('Escape')

      await expect(page.locator('#dialog-content')).toBeHidden()
      await expect(page.locator('#dialog-trigger')).toBeFocused()
    })
  })
})
