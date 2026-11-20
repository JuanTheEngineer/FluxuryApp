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
  await page.getByTestId('section-more').click() // Remove sits behind More now
  await page.getByTestId('remove-section').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(1)
  await page.getByTestId('pin-undo').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(2)
})

/** Visible to the writer: inside the window and not hidden under the sticky strip or the player. */
async function expectReadable(page: Page, locator: ReturnType<Page['locator']>) {
  await expect
    .poll(async () => {
      const r = await locator.boundingBox()
      const h = await page.getByTestId('timeline-header').boundingBox()
      const p = await page.getByTestId('beat-player').boundingBox()
      if (!r || !h || !p) return 'missing'
      return r.y >= h.y + h.height - 1 && r.y + r.height <= p.y + 1 ? 'readable' : `line ${Math.round(r.y)}-${Math.round(r.y + r.height)}, strip ends ${Math.round(h.y + h.height)}, player starts ${Math.round(p.y)}`
    }, { timeout: 4000 })
    .toBe('readable')
}

test('Step B review: tap a pinned line on the strip, move a section, one tempo for the song, lyrics follow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  if (!(await page.getByTestId('editor-mode-toggle').textContent())?.includes('Back')) {
    await page.getByTestId('editor-mode-toggle').click()
  }
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 })
  const at = async (f: number) => {
    const b = (await strip.boundingBox())!
    await page.mouse.click(b.x + b.width * f, b.y + b.height / 2)
  }
  const ql = page.locator('[data-testid="script-editor"] .ql-editor')

  // Two sections, then one tempo: the other section takes it too.
  await at(0.4)
  await page.getByTestId('sections-toggle').click()
  await page.getByTestId('add-section').click()
  await page.getByTestId('section-bpm').fill('100')
  await page.getByTestId('section-bpm').press('Enter')
  await expect(page.getByTestId('pin-toast')).toContainText('also used for 1 other section')
  await page.getByTestId('section-chip').first().click()
  await expect(page.getByTestId('section-bpm')).toHaveValue('100')

  // An empty line can't be pinned.
  const blank = ql.locator('> *').filter({ hasText: /^$/ }).first()
  await blank.click()
  await expect(page.getByTestId('pin-line')).toBeDisabled()

  // Pin the first lyric line near the start, so the strip has a block there.
  await at(0.02)
  await ql.locator('> *').first().click()
  await page.getByTestId('pin-line').click()

  // Boundaries can only be dragged for the selected section.
  await page.getByTestId('sections-toggle').click() // close: nothing selected on the strip
  await expect(page.getByTestId('section-boundary')).toHaveCount(0)
  await page.getByTestId('sections-toggle').click() // reopen: Section 1 is still selected
  await expect(page.getByTestId('section-boundary')).toHaveCount(1) // Section 1: only its end

  // Move the section boundary from 40% to about 50% by dragging it.
  const handle = page.getByTestId('section-boundary').first()
  const hb = (await handle.boundingBox())!
  const sb = (await strip.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * 0.5, hb.y + hb.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('pin-toast')).toContainText(/now starts at 1:(3|4)\d/) // 50% of 3:20 is 1:40
  await page.getByTestId('pin-undo').click()
  await expect(handle).toHaveAttribute('aria-label', /now 1:2\d/) // back at 40% (1:20)

  // Scroll away, then tap the pinned line's block: that line is picked and scrolled into view.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const firstLine = ql.locator('> *').first()
  await at(0.025)
  await expect(page.getByTestId('pin-target')).toBeVisible()
  await expectReadable(page, firstLine)

  // Moving the beat makes the lyrics follow: scroll away, scrub back to the pinned line.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(3200) // past the pause that follows our own scroll
  await at(0.9)
  await at(0.03)
  await expectReadable(page, firstLine)
  await page.screenshot({ path: test.info().outputPath('step-b-review.png') })
})
