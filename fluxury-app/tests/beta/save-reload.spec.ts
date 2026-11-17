import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * The one test that proves Fluxury's core promise on the real deployment:
 * lyrics you write are still there when you come back on a fresh browser.
 *
 * Real keyboard input, real autosave, real S3 + DynamoDB. The reopen happens in
 * a brand-new browser context, so there is no local draft (IndexedDB) to hide
 * a broken server save.
 *
 * Cleans up after itself: deletes the session it creates (even on failure), and
 * before starting, deletes any "Untitled Session" left in the TEST account by
 * earlier or crashed runs. Only ever run it with a dedicated test account.
 */

const USERNAME = process.env.FLUXURY_BETA_TEST_USERNAME
const PASSWORD = process.env.FLUXURY_BETA_TEST_PASSWORD
const API_URL = (
  process.env.FLUXURY_BETA_API_URL || 'https://pfqdeya4rf.execute-api.us-east-1.amazonaws.com/beta'
).replace(/\/$/, '')
const LEFTOVER_NAME = 'Untitled Session'

test.skip(!USERNAME || !PASSWORD, 'Set FLUXURY_BETA_TEST_USERNAME and FLUXURY_BETA_TEST_PASSWORD')

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

/** Amplify keeps the Cognito ID token in localStorage under "...<user>.idToken". */
async function idToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('.idToken'))
    return key ? localStorage.getItem(key) : null
  })
  if (!token) throw new Error('No Cognito idToken in localStorage after login')
  return token
}

async function deleteSession(page: Page, token: string, id: string) {
  const res = await page.request.delete(`${API_URL}/sessions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`DELETE /sessions/${id} -> ${res.status()} ${await res.text()}`)
  }
}

/** Remove leftovers from earlier runs. Scoped to the test account's own sessions. */
async function sweepLeftovers(page: Page, token: string): Promise<number> {
  const res = await page.request.get(`${API_URL}/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `GET /sessions -> ${res.status()}`).toBeTruthy()
  const { sessions } = (await res.json()) as { sessions: { id: string; name: string }[] }
  const leftovers = sessions.filter((s) => s.name === LEFTOVER_NAME)
  for (const s of leftovers) await deleteSession(page, token, s.id)
  return leftovers.length
}

test('lyrics survive save -> reopen in a fresh browser', async ({ browser }) => {
  const marker = `test bar ${Date.now()}`
  const failedRequests: string[] = []
  const pageErrors: string[] = []
  let sessionId: string | null = null

  const page = await freshLoggedInPage(browser)
  const token = await idToken(page)
  const swept = await sweepLeftovers(page, token)
  if (swept) console.log(`Cleaned up ${swept} leftover test session(s)`)

  try {
    // --- Write ---
    page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`))
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.getByRole('link', { name: /New Session/ }).click()
    await expect(page.getByRole('heading', { name: 'Pick a beat' })).toBeVisible()
    await page.getByRole('button', { name: 'Write without a beat' }).click()
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    const sessionUrl = page.url()
    sessionId = sessionUrl.split('/').pop()!

    const editor = page.locator('[data-testid="script-editor"] .ql-editor')
    await expect(editor).toBeVisible({ timeout: 15_000 })
    await editor.click()
    await page.keyboard.type(marker)
    // Separates "keystroke dropped by the editor" from "save/load lost it"
    await expect(editor, 'editor did not receive every keystroke').toContainText(marker)

    // Real server save, not just "dirty" or "saved locally"
    await expect(page.locator('[data-testid="save-status"]')).toContainText(/Saved/i, { timeout: 20_000 })

    // Second save: conditional on the version the first save returned (If-Match).
    // Proves the browser can read S3's ETag through CORS; if it couldn't, this
    // save would be wrongly refused (412) as a conflict.
    const secondSave = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes('/script.json'),
      { timeout: 20_000 },
    )
    await page.keyboard.type(' more')
    const secondSaveResponse = await secondSave
    expect(secondSaveResponse.status(), 'second (conditional) save refused').toBe(200)
    expect(secondSaveResponse.request().headers()['if-match'], 'second save was not conditional').toBeTruthy()
    await expect(page.locator('[data-testid="save-status"]')).toContainText(/Saved/i, { timeout: 20_000 })
    await expect(page.locator('[data-testid="conflict-banner"]')).toHaveCount(0)
    expect(failedRequests, `Network failures during save:\n${failedRequests.join('\n')}`).toEqual([])
    expect(pageErrors, `Uncaught errors while writing:\n${pageErrors.join('\n')}`).toEqual([])

    // --- Reopen in a brand-new browser context (no local draft) ---
    const reopened = await freshLoggedInPage(browser)
    await reopened.goto(sessionUrl)
    await expect(reopened.locator('[data-testid="script-editor"] .ql-editor')).toContainText(`${marker} more`, {
      timeout: 20_000,
    })
    await reopened.context().close()
  } finally {
    if (sessionId) await deleteSession(page, token, sessionId)
    await page.context().close()
  }
})
