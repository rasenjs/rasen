import { test, expect } from '@playwright/test'

/**
 * Tooltip in a real browser.
 *
 * The reason this exists on top of the unit tests: hoverability is a pointer
 * and layout property. A synthetic `pointerenter` in jsdom cannot tell whether
 * moving onto the tooltip keeps it open, and that is a WCAG requirement.
 */
test.describe('Tooltip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  const trigger = '#tooltip-trigger'
  const content = '#tooltip-content'

  test.describe('rendering', () => {
    test('should start hidden', async ({ page }) => {
      await expect(page.locator(trigger)).toBeVisible()
      await expect(page.locator(content)).toBeHidden()
      await expect(page.locator(trigger)).not.toHaveAttribute(
        'aria-describedby'
      )
    })

    test('should be reachable by keyboard', async ({ page }) => {
      await expect(page.locator(trigger)).toHaveAttribute('tabindex', '0')
    })

    test('should place the tooltip above the trigger', async ({ page }) => {
      await page.locator(trigger).hover()
      await expect(page.locator(content)).toBeVisible()

      // One in-page snapshot for both rects, so they share a coordinate space
      // regardless of any scrolling the interaction caused.
      const rects = await page.evaluate(() => {
        const rect = (id: string) => {
          const el = document.getElementById(id)!
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        }
        return { trigger: rect('tooltip-trigger'), tip: rect('tooltip-content') }
      })

      // Above: the tooltip's bottom edge is at or above the trigger's top.
      expect(rects.tip.y + rects.tip.height).toBeLessThanOrEqual(
        rects.trigger.y + 1
      )
      await expect(page.locator(content)).toHaveAttribute('data-side', 'top')
    })
  })

  test.describe('hover', () => {
    test('should show on hover and hide on leave', async ({ page }) => {
      await page.locator(trigger).hover()
      await expect(page.locator(content)).toBeVisible()

      // Somewhere else entirely.
      await page.mouse.move(5, 5)
      await expect(page.locator(content)).toBeHidden()
    })

    test('should stay open while the pointer is on the tooltip', async ({
      page
    }) => {
      await page.locator(trigger).hover()
      await expect(page.locator(content)).toBeVisible()

      const box = await page.locator(content).boundingBox()
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)

      // WCAG: content shown on hover has to be hoverable - moving onto it must
      // not make it vanish. Leaving the trigger for the tooltip is still
      // inside the hover area.
      await expect(page.locator(content)).toBeVisible()
    })
  })

  test.describe('focus', () => {
    test('should show on focus without moving focus', async ({ page }) => {
      await page.locator(trigger).focus()

      await expect(page.locator(content)).toBeVisible()
      // A tooltip describes; it does not take the user anywhere.
      await expect(page.locator(trigger)).toBeFocused()
    })

    test('should hide on blur', async ({ page }) => {
      await page.locator(trigger).focus()
      await expect(page.locator(content)).toBeVisible()

      await page.locator(trigger).blur()

      await expect(page.locator(content)).toBeHidden()
    })

    test('should describe the trigger only while shown', async ({ page }) => {
      await page.locator(trigger).focus()

      const describedBy = await page
        .locator(trigger)
        .getAttribute('aria-describedby')
      expect(describedBy).toBe('tooltip-content')
      await expect(page.locator(`#${describedBy}`)).toHaveAttribute(
        'role',
        'tooltip'
      )

      await page.locator(trigger).blur()
      await expect(page.locator(trigger)).not.toHaveAttribute(
        'aria-describedby'
      )
    })
  })

  test.describe('Escape', () => {
    test('should dismiss on Escape and not reappear while hovered', async ({
      page
    }) => {
      await page.locator(trigger).hover()
      await expect(page.locator(content)).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.locator(content)).toBeHidden()

      // The pointer never left the trigger. WCAG requires the dismissal to
      // stick until the user re-engages.
      await expect(page.locator(content)).toBeHidden()

      // Leaving and coming back is re-engaging, so it shows again.
      await page.mouse.move(5, 5)
      await page.locator(trigger).hover()
      await expect(page.locator(content)).toBeVisible()
    })
  })
})
