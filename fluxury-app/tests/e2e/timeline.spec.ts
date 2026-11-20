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

test('Step B: song strip scrubs, sections split the beat, Pin snaps to the section tempo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  if (!(await page.getByTestId('editor-mode-toggle').textContent())?.includes('Back')) {
    await page.getByTestId('editor-mode-toggle').click()
  }
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 }) // shown once the beat's length is known
  const header = page.getByTestId('timeline-header')

  // Scrub to 25% of the beat by tapping the strip.
  const box = (await strip.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
  const pos = page.getByTestId('beat-position')
  await expect(pos).toHaveText(/0:[45]\d/) // 25% of 3:20 is 0:50

  // Add a section there and give it 120 BPM.
  await page.getByTestId('sections-toggle').click()
  await page.getByTestId('add-section').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(2)
  await expect(page.getByTestId('section-editor')).toBeVisible()
  await page.getByTestId('section-bpm').fill('120')
  await page.getByTestId('section-bpm').press('Enter')
  await expect(pos).toContainText('bar 1')

  // Pin a new line: its time lands on the 120 BPM grid of the new section.
  const editor = page.locator('[data-testid="script-editor"] .ql-editor')
  await editor.click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('snapped line')
  await page.locator('[data-testid="script-editor"] .ql-editor').getByText('snapped line', { exact: true }).click()
  // The page has scrolled down to the new line; the strip must still be in view, under the app header.
  const h = (await header.boundingBox())!
  expect(h.y).toBeGreaterThanOrEqual(45)
  expect(h.y).toBeLessThan(60)
  // The strip is sticky, so after typing it has moved: measure it again.
  const box2 = (await strip.boundingBox())!
  await page.mouse.click(box2.x + box2.width * 0.3, box2.y + box2.height / 2)
  await page.getByTestId('pin-line').click()
  await expect(page.getByTestId('pin-toast')).toContainText(/Pinned “snapped line” at Verse 1, bar \d+ \(1:0\d\)/) // 30% of 3:20 is 1:00

  const t = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="script-editor"] .ql-editor > *')].find((e) => e.textContent === 'snapped line')
    return Number(el?.getAttribute('data-time'))
  })
  expect(Number.isFinite(t)).toBe(true) // snapping maths is covered in timing.test.ts
  await expect(page.getByTestId('line-time').filter({ hasText: 'bar' }).first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('step-b.png') })

  // Removing the section offers Undo, which brings it back.
  await page.getByTestId('section-chip').nth(1).click()
  await page.getByTestId('section-chip').nth(1).click()
  await page.getByTestId('remove-section').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(1)
  await page.getByTestId('pin-undo').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(2)
})
