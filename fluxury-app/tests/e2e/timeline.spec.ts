import { test, expect, type Page } from '@playwright/test'

/*
 * Timed lyrics, Step A, in a real browser (demo mode, mock backend):
 * "Try new" turns on the timeline view, Pin places the outlined line at the
 * playhead, Undo reverts it, and switching back to classic (⋯ menu) keeps the times.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

async function openFirstSession(page: Page) {
  await page.goto('/sessions')
  await page.locator('[data-testid="session-card"]').first().click()
  await expect(page.locator('[data-testid="script-editor"] .ql-editor')).toBeVisible({ timeout: 10_000 })
}

/** A lyric line inside the editor (not the same words in the Pin message). */
const line = (page: Page, text: string) => page.locator('[data-testid="script-editor"] .ql-editor').getByText(text, { exact: true })

/** Switch this device to the timeline view if it isn't already. */
async function useTimeline(page: Page) {
  const pill = page.getByTestId('editor-mode-toggle')
  if (await pill.isVisible()) await pill.click()
  await expect(pill).toHaveCount(0)
}

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
  await expect(toggle).toHaveCount(0) // the pill only shows in classic; classic is in the ⋯ menu now
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
  // The ⋯ menu opens above the timeline (it used to be hidden behind it).
  await page.getByTestId('session-menu').click()
  await expect(page.getByTestId('switch-to-classic')).toBeVisible()
  const menuItem = (await page.getByTestId('switch-to-classic').boundingBox())!
  const onTop = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="switch-to-classic"]') != null, [menuItem.x + menuItem.width / 2, menuItem.y + menuItem.height / 2])
  expect(onTop).toBe(true)
  await page.getByTestId('switch-to-classic').click()
  await expect(toggle).toHaveText(/Try new/)
  await expect(page.getByTestId('line-time')).toHaveCount(0)
  lines = await lineTimes(page)
  expect(lines.find((l) => l.text === 'first timed line')!.time).not.toBeNull()

  // The choice is remembered on this device.
  await toggle.click()
  await page.reload()
  await expect(page.getByTestId('song-strip')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('editor-mode-toggle')).toHaveCount(0)
})

test('Return after a pinned line does not copy its time (real key press)', async ({ page }) => {
  await openFirstSession(page)
  await useTimeline(page)
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
  await useTimeline(page)
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
  await useTimeline(page)
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
  await expect(page.getByTestId('section-boundary')).toHaveCount(2) // Section 1: its start (Intro) and its end

  // Move the section boundary from 40% to about 50% by dragging it.
  const handle = page.locator('[data-testid="section-boundary"][data-edge="end"]')
  const hb = (await handle.boundingBox())!
  const sb = (await strip.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * 0.5, hb.y + hb.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('pin-toast')).toContainText(/is now 0:00–1:(3|4)\d/) // 50% of 3:20 is 1:40
  await page.getByTestId('pin-undo').click()
  await expect(handle).toHaveAttribute('aria-label', /now 1:2\d/) // back at 40% (1:20)

  // Done with sections: close the panel (its grips go away), scroll away,
  // then tap the pinned line's block: that line is picked and scrolled into view.
  await page.getByTestId('sections-toggle').click()
  await expect(page.getByTestId('section-boundary')).toHaveCount(0)
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

test('Step C: zoomed-in view shows bars around the playhead; dragging it looks along the song, lines stay put', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  await useTimeline(page)
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 })
  const zoom = page.getByTestId('zoom-view')
  await expect(zoom).toBeVisible() // shown by default
  await expect(page.getByTestId('strip-window')).toHaveCount(1) // its box on the strip

  // One section at 120 BPM for the whole beat (a beat is 500 ms, a bar 2 s).
  const sb = (await strip.boundingBox())!
  await page.mouse.click(sb.x + 3, sb.y + sb.height / 2)
  await page.getByTestId('sections-toggle').click()
  await page.getByTestId('add-section').click()
  await page.getByTestId('section-bpm').fill('120')
  await page.getByTestId('section-bpm').press('Enter')
  await page.getByTestId('sections-toggle').click()
  const labels = page.getByTestId('zoom-label')
  await expect(labels.filter({ hasText: /^2$/ })).toHaveCount(1) // plain bar numbers, no repeated "bar"
  await expect(zoom).not.toContainText('bar')

  // Pin the first lyric line at about 0:04 (bar 3).
  const ql = page.locator('[data-testid="script-editor"] .ql-editor')
  const first = ql.locator('> *').first()
  await page.mouse.click(sb.x + sb.width * 0.02, sb.y + sb.height / 2)
  await first.click()
  await page.getByTestId('pin-line').click()
  const timeOf = () => first.getAttribute('data-time').then(Number)
  const before = await timeOf()
  await expect(page.getByTestId('pin-toast')).toContainText(/bar \d+/) // on the section's grid (it starts where the strip was tapped)

  // Dragging in the zoomed-in view slides it along the song. The line keeps its
  // time (lines can't be dragged) and the playhead stays where it was.
  const block = page.getByTestId('zoom-line').first()
  await expect(block).toBeVisible()
  const pos = page.getByTestId('beat-position')
  const posBefore = await pos.textContent()
  const firstLabel = async () => (await labels.allTextContents()).join(',')
  const labelBefore = await firstLabel()
  const zb = (await zoom.boundingBox())!
  const bb = (await block.boundingBox())!
  await page.mouse.move(bb.x + 8, bb.y + bb.height / 2) // start the drag ON the line's block
  await page.mouse.down()
  await page.mouse.move(bb.x + 8 - zb.width / 2, bb.y + bb.height / 2, { steps: 6 }) // half the view: 2 bars later
  await page.mouse.up()
  expect(await timeOf()).toBe(before)
  await expect(pos).toHaveText(posBefore!)
  expect(await firstLabel()).not.toBe(labelBefore)
  await expect(page.getByTestId('pin-toast')).not.toContainText('Moved')
  await page.screenshot({ path: test.info().outputPath('step-c.png') })

  // Moving the beat (a tap on the strip) brings the view back to the playhead.
  await page.mouse.click(sb.x + sb.width * 0.02, sb.y + sb.height / 2)
  await expect.poll(firstLabel).toBe(labelBefore)

  // Zoom: + shows fewer bars, − more; the level shows briefly and is remembered.
  const barsShown = () => zoom.getAttribute('data-bars').then(Number)
  expect(await barsShown()).toBe(4)
  await page.getByTestId('zoom-in').click()
  expect(await barsShown()).toBe(2)
  await expect(page.getByTestId('zoom-level')).toHaveText('2 bars')
  await page.getByTestId('zoom-out').click()
  await page.getByTestId('zoom-out').click()
  await page.getByTestId('zoom-out').click()
  expect(await barsShown()).toBe(16)
  await expect(page.getByTestId('zoom-out')).toBeDisabled() // 16 is the widest
  expect((await labels.count())).toBeLessThanOrEqual(7) // labels thin out instead of crowding
  await page.reload()
  await expect(page.getByTestId('zoom-view')).toHaveAttribute('data-bars', '16', { timeout: 10_000 })
  await page.getByTestId('zoom-in').click()
  await page.getByTestId('zoom-in').click() // back to 4 for the rest

  // Momentum: after a quick flick, the view keeps gliding once the finger lifts.
  const z2 = (await page.getByTestId('zoom-view').boundingBox())!
  await page.mouse.move(z2.x + z2.width * 0.8, z2.y + 10)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(z2.x + z2.width * (0.8 - i * 0.05), z2.y + 10)
    await page.waitForTimeout(10)
  }
  await page.mouse.up()
  const atRelease = await firstLabel()
  await expect.poll(firstLabel, { timeout: 2000 }).not.toBe(atRelease)

  // Hide it: a slim bar remains, the box leaves the strip, and the choice is remembered.
  await page.getByTestId('zoom-toggle').click()
  await expect(zoom).toHaveCount(0)
  await expect(page.getByTestId('zoom-toggle')).toContainText('Show zoomed-in view')
  await expect(page.getByTestId('strip-window')).toHaveCount(0)
  await expect(page.getByText('drag the strip to scrub')).toHaveCount(0) // no instruction text anywhere
  await expect(page.getByText(/ZOOMED IN/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('zoom-toggle')).toContainText('Show zoomed-in view', { timeout: 10_000 })
  await page.getByTestId('zoom-toggle').click()
  await expect(page.getByTestId('zoom-view')).toBeVisible()
})

test('Edges: drag the first section’s start to make an Intro; tapping a block centres it in the zoomed-in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  await useTimeline(page)
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 })
  const sb = (await strip.boundingBox())!

  // One section for the whole song at 120 BPM (added within the song's first second).
  await page.mouse.click(sb.x + 0.5, sb.y + sb.height / 2)
  await page.getByTestId('sections-toggle').click()
  await page.getByTestId('add-section').click()
  await page.getByTestId('section-bpm').fill('120')
  await page.getByTestId('section-bpm').press('Enter')
  await expect(page.getByTestId('section-chip')).toHaveCount(1)

  // Grips on both edges of the selected section, even at the song's start and end.
  const start = page.locator('[data-testid="section-boundary"][data-edge="start"]')
  await expect(start).toHaveAttribute('aria-label', /makes an Intro/)
  await expect(page.locator('[data-testid="section-boundary"][data-edge="end"]')).toHaveAttribute('aria-label', /makes an Outro/)

  // Drag the start to about 10%: an Intro appears before it.
  const g = (await start.boundingBox())!
  const s2 = (await strip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(s2.x + s2.width * 0.1, g.y + g.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('pin-toast')).toContainText(/Added “Intro” \(0:00–0:(1|2)\d\)/)
  await expect(page.getByTestId('section-chip')).toHaveCount(2)
  await expect(page.getByTestId('section-chip').first()).toHaveText('Intro')
  await page.getByTestId('pin-undo').click()
  await expect(page.getByTestId('section-chip')).toHaveCount(1)

  // Pin a line, scrub away, tap its block in the zoomed-in view: it lands in the middle.
  await page.getByTestId('sections-toggle').click()
  const ql = page.locator('[data-testid="script-editor"] .ql-editor')
  const first = ql.locator('> *').first()
  await page.mouse.click(s2.x + s2.width * 0.05, s2.y + s2.height / 2)
  await first.click()
  await page.getByTestId('pin-line').click()
  const zoom = page.getByTestId('zoom-view')
  const block = page.getByTestId('zoom-line').first()
  await block.click()
  const zb = (await zoom.boundingBox())!
  const bb = (await block.boundingBox())!
  const startPct = (bb.x - 2 - zb.x) / zb.width
  expect(startPct).toBeGreaterThan(0.45)
  expect(startPct).toBeLessThan(0.55)
  await page.screenshot({ path: test.info().outputPath('edges.png') })
})

test('More room to write: scrolling down shrinks the timeline to its strip, the toolbar stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  await useTimeline(page)
  const header = page.getByTestId('timeline-header')
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('zoom-view')).toBeVisible()
  const toolbar = page.locator('[data-testid="script-editor"] .ql-toolbar')

  /** The toolbar sits right under the timeline and inside the window. */
  const toolbarUnderHeader = async () => {
    const h = (await header.boundingBox())!
    const t = (await toolbar.boundingBox())!
    return Math.abs(t.y - (h.y + h.height)) <= 2 && t.y >= 0 ? 'stuck' : `toolbar at ${Math.round(t.y)}, timeline ends ${Math.round(h.y + h.height)}`
  }

  // Scroll down into the lyrics with the wheel, like a writer would.
  const editor = (await page.locator('[data-testid="script-editor"] .ql-editor').boundingBox())!
  await page.mouse.move(editor.x + editor.width / 2, Math.min(editor.y + 200, 600))
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 150)
    await page.waitForTimeout(60)
  }
  await expect(header).toHaveAttribute('data-compact', 'true')
  await expect(strip).toBeVisible() // the bird's-eye view stays
  await expect(page.getByTestId('zoom-view')).toHaveCount(0)
  await expect(page.getByTestId('sections-toggle')).toHaveCount(0)
  await expect.poll(toolbarUnderHeader).toBe('stuck')
  const compactH = (await header.boundingBox())!.height
  await page.screenshot({ path: test.info().outputPath('compact.png') })

  // Scrolling up a little brings the rest back. The toolbar is never hidden under
  // the taller timeline (it may sit lower, in its normal place, near the top of the page).
  await page.mouse.wheel(0, -80)
  await expect(header).toHaveAttribute('data-compact', 'false')
  await expect(page.getByTestId('zoom-view')).toBeVisible()
  expect((await header.boundingBox())!.height).toBeGreaterThan(compactH + 40)
  await expect
    .poll(async () => (await toolbar.boundingBox())!.y >= (await header.boundingBox())!.y + (await header.boundingBox())!.height - 2)
    .toBe(true)

  // Scrolling down again shrinks it again; back at the top it is full size.
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 150)
  await expect(header).toHaveAttribute('data-compact', 'true')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(header).toHaveAttribute('data-compact', 'false')
})

test('Toolbar: Bold and Italic only in the timeline; Clean in the classic editor keeps pins', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openFirstSession(page)
  await useTimeline(page)
  const bar = page.locator('[data-testid="script-editor"] .ql-toolbar')
  await expect(bar.locator('.ql-bold')).toBeVisible()
  await expect(bar.locator('.ql-italic')).toBeVisible()
  for (const hidden of ['.ql-underline', '.ql-list', '.ql-clean']) await expect(bar.locator(hidden).first()).toBeHidden()

  // Pin the first line, then select part of it and press Ctrl/Cmd+U: no underline in the timeline.
  const strip = page.getByTestId('song-strip')
  await expect(strip).toBeVisible({ timeout: 10_000 })
  const sb = (await strip.boundingBox())!
  await page.mouse.click(sb.x + sb.width * 0.05, sb.y + sb.height / 2)
  const first = page.locator('[data-testid="script-editor"] .ql-editor > *').first()
  await first.click()
  await page.getByTestId('pin-line').click()
  const time = await first.getAttribute('data-time')
  expect(time).not.toBeNull()
  await first.click({ clickCount: 3 })
  await page.keyboard.press('ControlOrMeta+u')
  await expect(first.locator('u')).toHaveCount(0)

  // Classic editor: all tools are back, and Clean removes formatting but not the pin.
  await page.getByTestId('session-menu').click()
  await page.getByTestId('switch-to-classic').click()
  await expect(bar.locator('.ql-clean')).toBeVisible()
  await expect(first.locator('strong')).toHaveCount(1) // the demo's "Verse 1:" is bold
  await first.click({ clickCount: 3 })
  await bar.locator('.ql-clean').click()
  await expect(first.locator('strong')).toHaveCount(0)
  await expect(first).toHaveAttribute('data-time', time!)
})
