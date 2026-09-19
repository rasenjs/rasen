import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3010/tests/e2e',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    // Vite, not a static file server: the page imports the library by its
    // workspace name and the library's own imports are bare specifiers, which
    // a browser cannot resolve on its own. Vite does, and the config aliases
    // them to sources so a spec runs against the code being edited.
    command: '../../node_modules/.bin/vite --config vite.e2e.config.ts',
    // Probe the page, not the root: a bare '/' is not something this server
    // serves, and a 404 there is easy to mistake for "not up yet".
    url: 'http://127.0.0.1:3010/tests/e2e/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
})
