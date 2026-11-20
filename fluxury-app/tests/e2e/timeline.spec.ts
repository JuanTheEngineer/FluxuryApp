import { test, expect, type Page } from '@playwright/test'

/*
 * Timed lyrics, Step A, in a real browser (demo mode, mock backend):
 * "Try new" turns on the timeline view, Pin places the outlined line at the
 * playhead, Undo reverts it, and "Back to classic" keeps the times.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

async function openFirstSession(page: Page) {
  await page.goto('/sessions')
  await page.locator('[data-testid="session-card"]').first().click()
  await expect(page.locator('[data-testid="script-editor"] .ql-editor')).toBeVisible({ timeout: 10_000 })
}

/** A lyric line inside the editor (not the same words in the Pin message). */
const line = (page: Page, text: string) => page.locator('[data-testid="script-editor"] .ql-editor').getByText(text, { exact: true })

const lineTimes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="script-editor"] .ql-editor > *')].map((el) => ({
      text: el.textContent,
      time: el.getAttribute('data-time'),
    })),
  )

test('Try new: pin a line at the playhead, undo it, switch back to classic', async ({ page }) => {
  await openFirstSession(page)
  const toggle = page.getByTestId('editor-mode-toggle')
  await expect(toggle).toHaveText(/Try new/)
  await expect(page.getByTestId('pin-line')).toHaveCount(0) // classic: no Pin

  await toggle.click()
  await expect(toggle).toHaveText(/Back to classic/)
  const pin = page.getByTestId('pin-line')
  await expect(pin).toBeVisible()

  // Write two lines, so there is something to pin.
  const editor = page.locator('[data-testid="script-editor"] .ql-editor')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('first timed line')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second timed line')

  // Tap the first new line to make it the Pin target, then Pin.
  await line(page, 'first timed line').click()
  await expect(page.getByTestId('pin-target')).toBeVisible()
  await pin.click()
  await expect(page.getByTestId('pin-toast')).toContainText(/Pinned “first timed line” at \d:\d\d/)

  let lines = await lineTimes(page)
  const first = lines.find((l) => l.text === 'first timed line')!
  expect(first.time).not.toBeNull()
  expect(page.getByTestId('line-time').first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('timeline-pinned.png'), fullPage: false })

  // Undo reverts the pin.
  await page.getByTestId('pin-undo').click()
  lines = await lineTimes(page)
  expect(lines.find((l) => l.text === 'first timed line')!.time).toBeNull()

  // Pin again, then switch back to classic: the time stays in the document.
  await line(page, 'first timed line').click()
  await pin.click()
  await toggle.click()
  await expect(toggle).toHaveText(/Try new/)
  await expect(page.getByTestId('line-time')).toHaveCount(0)
  lines = await lineTimes(page)
  expect(lines.find((l) => l.text === 'first timed line')!.time).not.toBeNull()

  // The choice is remembered on this device.
  await toggle.click()
  await page.reload()
  await expect(page.getByTestId('editor-mode-toggle')).toHaveText(/Back to classic/, { timeout: 10_000 })
})

test('Return after a pinned line does not copy its time (real key press)', async ({ page }) => {
  await openFirstSession(page)
  if (!(await page.getByTestId('editor-mode-toggle').textContent())?.includes('Back')) {
    await page.getByTestId('editor-mode-toggle').click()
  }
  const editor = page.locator('[data-testid="script-editor"] .ql-editor')
  await editor.click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('pinned then return')
  await line(page, 'pinned then return').click()
  await page.getByTestId('pin-line').click()
  await line(page, 'pinned then return').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fresh line')
  const lines = await lineTimes(page)
  expect(lines.find((l) => l.text === 'pinned then return')!.time).not.toBeNull()
  expect(lines.find((l) => l.text === 'fresh line')!.time).toBeNull()
})
