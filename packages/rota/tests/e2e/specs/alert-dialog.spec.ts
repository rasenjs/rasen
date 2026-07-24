import { test, expect } from '@playwright/test'

test.describe('AlertDialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render trigger button', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await expect(trigger).toBeVisible()
    })

    test('should have content hidden by default', async ({ page }) => {
      const content = page.locator('#alert-dialog-content')
      await expect(content).toHaveAttribute('data-state', 'closed')
      await expect(content).toBeHidden()
    })

    test('should have role="alertdialog" on content', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const content = page.locator('#alert-dialog-content')
      await expect(content).toHaveAttribute('role', 'alertdialog')
    })

    test('should have aria-modal="true" on content', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const content = page.locator('#alert-dialog-content')
      await expect(content).toHaveAttribute('aria-modal', 'true')
    })

    test('should have aria-labelledby linking to title', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const content = page.locator('#alert-dialog-content')
      const labelledby = await content.getAttribute('aria-labelledby')
      const title = page.locator(`#${labelledby}`)
      await expect(title).toBeVisible()
    })

    test('should have aria-describedby linking to description', async ({
      page
    }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const content = page.locator('#alert-dialog-content')
      const describedby = await content.getAttribute('aria-describedby')
      const description = page.locator(`#${describedby}`)
      await expect(description).toBeVisible()
    })
  })

  test.describe('interaction', () => {
    test('should open dialog on trigger click', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const content = page.locator('#alert-dialog-content')
      await expect(content).toBeVisible()
      await expect(content).toHaveAttribute('data-state', 'open')
    })

    test('should close dialog on action button click', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const action = page.locator('#alert-dialog-action')
      await action.click()

      const content = page.locator('#alert-dialog-content')
      await expect(content).toBeHidden()
      await expect(content).toHaveAttribute('data-state', 'closed')
    })

    test('should close dialog on cancel button click', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const cancel = page.locator('#alert-dialog-cancel')
      await cancel.click()

      const content = page.locator('#alert-dialog-content')
      await expect(content).toBeHidden()
    })

    test('should focus action button when dialog opens', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const action = page.locator('#alert-dialog-action')
      await expect(action).toBeFocused()
    })

    test('should NOT close on ESC key press', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      await page.keyboard.press('Escape')

      const content = page.locator('#alert-dialog-content')
      await expect(content).toBeVisible()
      await expect(content).toHaveAttribute('data-state', 'open')
    })
  })

  test.describe('accessibility', () => {
    test('should have title text visible when open', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const title = page.locator('#alert-dialog-title')
      await expect(title).toBeVisible()
      await expect(title).toContainText('Are you sure?')
    })

    test('should have description text visible when open', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      const description = page.locator('#alert-dialog-description')
      await expect(description).toBeVisible()
      await expect(description).toContainText('This action cannot be undone.')
    })

    test('should have both action and cancel buttons', async ({ page }) => {
      const trigger = page.locator('#alert-dialog-trigger')
      await trigger.click()

      await expect(page.locator('#alert-dialog-action')).toBeVisible()
      await expect(page.locator('#alert-dialog-cancel')).toBeVisible()
    })
  })
})
