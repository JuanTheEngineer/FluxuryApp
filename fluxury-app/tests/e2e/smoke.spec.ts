import { test, expect } from '@playwright/test'

test.describe('Creative Core Loop E2E', () => {

  test('Session_Browser first-paint under 5s (Req 1.4)', async ({ page }) => {
    const start = Date.now()
    await page.goto('/sessions')
    await expect(page.locator('[data-testid="session-card"]').first()).toBeVisible({ timeout: 5000 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
  })

  test('Resume last session → type → see Saved status (Req 9.5)', async ({ page }) => {
    await page.goto('/sessions')
    await expect(page.locator('[data-testid="session-card"]').first()).toBeVisible({ timeout: 10000 })

    // Click the first session card (resume)
    await page.locator('[data-testid="session-card"]').first().click()

    // Wait for editor to mount
    await expect(page.locator('[data-testid="script-editor"]')).toBeVisible({ timeout: 10000 })

    // Wait for Quill to initialize (ql-editor becomes visible)
    const editor = page.locator('[data-testid="script-editor"] .ql-editor')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Wait for the __simulateEdit test helper exposed on window in demo mode.
    // Quill 2.x has known selection issues in headless browsers that prevent direct API usage.
    await page.waitForFunction(() => typeof (window as any).__simulateEdit === 'function', null, { timeout: 5000 })

    // Simulate an edit — this directly sets the delta ref triggering the autosave flow
    await page.evaluate(() => {
      ;(window as any).__simulateEdit()
    })

    // Wait for save status to show "Saved" (debounce 1.5s + server write ~1.5s)
    await expect(page.locator('[data-testid="save-status"]')).toContainText(/Saved/i, { timeout: 15000 })
  })

  test('Browse beats → start session with beat → editor loads (Req 2.4)', async ({ page }) => {
    await page.goto('/beats')

    // Wait for beat list to render
    await expect(page.getByText('Die Trying (PND x Drake)')).toBeVisible({ timeout: 10000 })

    // Click a beat to select it
    await page.getByText('Die Trying (PND x Drake)').click()

    // Wait for "Write to this beat" button to appear
    await expect(page.getByText('Write to this beat')).toBeVisible({ timeout: 5000 })

    // Click it
    await page.getByText('Write to this beat').click()

    // Should navigate to the editor with a new session
    await expect(page.locator('[data-testid="script-editor"]')).toBeVisible({ timeout: 10000 })

    // Beat player should show the beat filename
    await expect(page.getByText('dietrying')).toBeVisible({ timeout: 5000 })
  })

})
