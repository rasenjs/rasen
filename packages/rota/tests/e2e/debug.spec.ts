import { test, expect } from '@playwright/test'

test('debug checkbox', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()))
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message))
  
  await page.goto('/tests/e2e/')
  await page.waitForTimeout(2000)
  
  const checkboxRoot1 = page.locator('#checkbox-root-1')
  const isVisible = await checkboxRoot1.isVisible()
  console.log('checkbox-root-1 visible:', isVisible)
  
  const innerHTML = await checkboxRoot1.innerHTML()
  console.log('checkbox-root-1 innerHTML:', innerHTML)
  
  await expect(checkboxRoot1).toHaveAttribute('role', 'checkbox')
})
