import { test, expect, type Page } from '@playwright/test'

// Spike: per-line time stored as a Quill block attribute. Throwaway.
const URL = '/spikes/quill-line-time/index.html'

/* eslint-disable @typescript-eslint/no-explicit-any */
const lines = (page: Page): Promise<{ text: string; timeMs: number | null }[]> =>
  page.evaluate(() => (window as any).spike.readLines())
const times = async (page: Page) => (await lines(page)).map((l) => l.timeMs)

// Put the caret at `offset` characters into line `i`, then focus the editor.
async function caret(page: Page, i: number, offset: number | 'end') {
  await page.evaluate(
    ([i, offset]) => {
      const q = (window as any).spike.quill
      const line = q.getLines()[i as number]
      const idx = q.getIndex(line) + (offset === 'end' ? line.length() - 1 : (offset as number))
      q.focus()
      q.setSelection(idx, 0, 'silent')
    },
    [i, offset] as const,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL)
  await page.waitForFunction(() => (window as any).spike)
})

test('1. times survive save and load as JSON', async ({ page }) => {
  const before = await lines(page)
  const rt = await page.evaluate(() => (window as any).spike.roundTrip())
  expect(rt.lines).toEqual(before)
  // Record the stored shape: the time sits on each line's newline.
  const ops = JSON.parse(rt.json).ops.slice(0, 4)
  test.info().annotations.push({ type: 'delta shape', description: JSON.stringify(ops) })
  expect(ops[1]).toEqual({ insert: '\n', attributes: { time: '8720' } })
})

test('2. Enter at the end of a timed line keeps the time on that line only', async ({ page }) => {
  const before = await times(page)
  await caret(page, 0, 'end')
  await page.keyboard.press('Enter')
  const after = await times(page)
  expect(after[0]).toBe(8720)
  expect(after[1]).toBeNull()
  expect(after.slice(2)).toEqual(before.slice(1))
})

test('3. Enter in the middle of a timed line: first half keeps the time, second half has none', async ({ page }) => {
  const before = await times(page)
  await caret(page, 2, 8)
  await page.keyboard.press('Enter')
  const ls = await lines(page)
  expect(ls[2].timeMs).toBe(17000)
  expect(ls[2].text).toBe('Clock in')
  expect(ls[3].timeMs).toBeNull()
  expect(ls.map((l) => l.timeMs).slice(4)).toEqual(before.slice(3))
})

test('4. Enter at the start of a timed line: the new empty line above has no time', async ({ page }) => {
  const before = await times(page)
  await caret(page, 2, 0)
  await page.keyboard.press('Enter')
  const ls = await lines(page)
  expect(ls[2].text).toBe('')
  expect(ls[2].timeMs).toBeNull()
  expect(ls[3].timeMs).toBe(17000)
  expect(ls.map((l) => l.timeMs).slice(4)).toEqual(before.slice(3))
})

test('5. pasting lines that carry times does not copy the times', async ({ page }) => {
  await page.evaluate(() => {
    const q = (window as any).spike.quill
    q.insertText(q.getLength() - 1, '\n', 'api') // empty last line to paste into
    q.clipboard.dangerouslyPasteHTML(
      q.getLength() - 1,
      '<p data-time="1000">pasted a</p><p data-time="2000">pasted b</p>',
      'user',
    )
  })
  const ls = await lines(page)
  const pasted = ls.filter((l) => l.text.startsWith('pasted'))
  expect(pasted.length).toBe(2)
  for (const p of pasted) expect(p.timeMs).toBeNull()
})

test('6. observation: Backspace joining two timed lines (not asserted)', async ({ page }) => {
  await caret(page, 2, 0)
  await page.keyboard.press('Backspace')
  const ls = await lines(page)
  test.info().annotations.push({
    type: 'backspace join',
    description: `line 1 time ${ls[1].timeMs}, line count ${ls.length}, times ${JSON.stringify(ls.map((l) => l.timeMs))}`,
  })
  expect(ls.length).toBe(7)
})

test('7. moving a line keeps its time, and one Undo restores the document', async ({ page }) => {
  const original = await page.evaluate(() => JSON.stringify((window as any).spike.quill.getContents()))
  const before = await lines(page)
  await page.evaluate(() => (window as any).spike.moveLine(5, 1))
  const moved = await lines(page)
  expect(moved[1]).toEqual(before[5])
  expect(moved.map((l) => l.text)).toEqual([before[0], before[5], before[1], before[2], before[3], before[4], before[6], before[7]].map((l) => l.text))
  await page.evaluate(() => (window as any).spike.moveLine(0, 8)) // move first line to the end
  const movedToEnd = await lines(page)
  expect(movedToEnd[7].text).toBe(before[0].text)
  expect(movedToEnd[7].timeMs).toBe(before[0].timeMs)
  await page.evaluate(() => {
    ;(window as any).spike.quill.history.undo()
    ;(window as any).spike.quill.history.undo()
  })
  const restored = await page.evaluate(() => JSON.stringify((window as any).spike.quill.getContents()))
  expect(restored).toBe(original)
})

test('8. pinning a line sets its time, and a second pin replaces it', async ({ page }) => {
  await page.evaluate(() => (window as any).spike.setLineTime(3, 22000))
  expect((await times(page))[3]).toBe(22000)
  await page.evaluate(() => (window as any).spike.setLineTime(3, 23000))
  expect((await times(page))[3]).toBe(23000)
  await page.evaluate(() => (window as any).spike.setLineTime(3, null))
  expect((await times(page))[3]).toBeNull()
})

const sizes = [
  { name: 'iPhone portrait 390x700', w: 390, h: 700 },
  { name: 'small phone 320x560', w: 320, h: 560 },
  { name: 'landscape 700x390', w: 700, h: 390 },
  { name: 'keyboard open 390x330', w: 390, h: 330 },
]
for (const s of sizes) {
  test(`9. marks and headings stay aligned, scrolled and not: ${s.name}`, async ({ page }) => {
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.waitForTimeout(150)
    const check = async (label: string) => {
      const m = await page.evaluate(() => (window as any).spike.measure())
      for (const d of m.marks) expect(d, `${label}: mark offset`).toBeLessThanOrEqual(1)
      for (const h of m.headings) {
        expect(h.gapToLine, `${label}: heading gap`).toBeLessThanOrEqual(1)
        expect(h.overlapsPrev, `${label}: heading overlaps previous line`).toBe(false)
      }
      return m.marks.length + m.headings.length
    }
    expect(await check('top')).toBeGreaterThan(0)
    await page.evaluate(() => {
      const r = (window as any).spike.quill.root
      r.scrollTop = r.scrollHeight
    })
    await page.waitForTimeout(100)
    await check('scrolled to bottom')
    await page.evaluate(() => {
      const r = (window as any).spike.quill.root
      r.scrollTop = r.scrollHeight / 2
    })
    await page.waitForTimeout(100)
    await check('scrolled to middle')
  })
}

test('10. typing in a line under a section heading keeps everything aligned', async ({ page }) => {
  await caret(page, 3, 'end')
  await page.keyboard.type(' and then some extra words that make this line wrap onto another row on a phone')
  await page.waitForTimeout(100)
  const m = await page.evaluate(() => (window as any).spike.measure())
  for (const d of m.marks) expect(d).toBeLessThanOrEqual(1)
  for (const h of m.headings) {
    expect(h.gapToLine).toBeLessThanOrEqual(1)
    expect(h.overlapsPrev).toBe(false)
  }
})
