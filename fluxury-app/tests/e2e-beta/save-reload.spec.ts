import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * The one test that proves Fluxury's core promise on the real deployment:
 * lyrics you write are still there when you come back on a fresh browser.
 *
 * Real keyboard input, real autosave, real S3 + DynamoDB. The reopen happens in
 * a brand-new browser context, so there is no local draft (IndexedDB) to hide
 * a broken server save.
 *
 * Side effect: creates one "Untitled Session" per run in the test account.
 */

const USERNAME = process.env.FLUXURY_E2E_USERNAME
const PASSWORD = process.env.FLUXURY_E2E_PASSWORD

test.skip(!USERNAME || !PASSWORD, 'Set FLUXURY_E2E_USERNAME and FLUXURY_E2E_PASSWORD')

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Enter username').fill(USERNAME!)
  await page.getByPlaceholder('Enter password').fill(PASSWORD!)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15_000 })
}

async function freshLoggedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await logIn(page)
  return page
}

test('lyrics survive save -> reopen in a fresh browser', async ({ browser }) => {
  const marker = `e2e bar ${Date.now()}`
  const failedRequests: string[] = []

  // --- Write ---
  const page = await freshLoggedInPage(browser)
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`))

  await page.getByRole('link', { name: /New Session/ }).click()
  await expect(page.getByRole('heading', { name: 'Pick a beat' })).toBeVisible()
  await page.getByRole('button', { name: 'Write without a beat' }).click()
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  const sessionUrl = page.url()

  const editor = page.locator('[data-testid="script-editor"] .ql-editor')
  await expect(editor).toBeVisible({ timeout: 15_000 })
  await editor.click()
  await page.keyboard.type(marker)

  // Real server save, not just "dirty" or "saved locally"
  await expect(page.locator('[data-testid="save-status"]')).toContainText(/Saved/i, { timeout: 20_000 })
  expect(failedRequests, `Network failures during save:\n${failedRequests.join('\n')}`).toEqual([])
  await page.context().close()

  // --- Reopen in a brand-new browser context (no local draft) ---
  const reopened = await freshLoggedInPage(browser)
  await reopened.goto(sessionUrl)
  await expect(reopened.locator('[data-testid="script-editor"] .ql-editor')).toContainText(marker, {
    timeout: 20_000,
  })
  await reopened.context().close()
})
