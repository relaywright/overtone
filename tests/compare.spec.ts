import { expect, test, type Page } from '@playwright/test';

const EXAMPLE_DURATION = 12;
const MIN_FREQUENCY = 40;
const MAX_FREQUENCY = 12_000;

async function openStudio(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
}

function frequencyAt(y: number) {
  return MIN_FREQUENCY * (MAX_FREQUENCY / MIN_FREQUENCY) ** (1 - y);
}

function yAt(hz: number) {
  return 1 - Math.log(hz / MIN_FREQUENCY) / Math.log(MAX_FREQUENCY / MIN_FREQUENCY);
}

async function selectionValues(page: Page) {
  const values = await Promise.all(
    ['Start time', 'End time', 'Low frequency', 'High frequency'].map(async (name) =>
      Number(await page.getByLabel(name, { exact: true }).inputValue()),
    ),
  );
  return { startTime: values[0], endTime: values[1], lowHz: values[2], highHz: values[3] };
}

async function peakReadout(page: Page) {
  const text = await page.locator('.signal-meta').textContent();
  const match = /PEAK (−?-?[\d.]+) dBFS/.exec(text ?? '');
  expect(match, `peak readout missing from "${text}"`).not.toBeNull();
  return Number(match![1].replace('−', '-'));
}

test('the Removed view plays and shows only what the edits took away', async ({ page }) => {
  await openStudio(page);
  const original = page.getByRole('button', { name: 'Original', exact: true });
  const edited = page.getByRole('button', { name: 'Edited', exact: true });
  const removed = page.getByRole('button', { name: 'Removed', exact: true });
  await expect(removed).toBeDisabled();
  // Before an edit there is nothing else to compare with, so C leaves Original selected.
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('c');
  await expect(original).toHaveAttribute('aria-pressed', 'true');
  const originalPeak = await peakReadout(page);

  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(edited).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.studio-status [role="status"]')).toHaveText(
    'Edit ready. Press Play, then compare Original, Edited and Removed.',
  );
  await expect(removed).toBeEnabled();

  await removed.click();
  await expect(removed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.spectrum-footer')).toContainText('what your edits took away');
  // The whistle alone is much quieter than the whole mix: the readout is measured from
  // the difference signal, not copied from the original.
  const removedPeak = await peakReadout(page);
  expect(removedPeak).toBeLessThan(originalPeak - 10);
  expect(removedPeak).toBeGreaterThan(-40);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const playhead = page.getByRole('slider', { name: 'Playback position' });
  await expect.poll(async () => Number(await playhead.inputValue())).toBeGreaterThan(0.1);

  // C cycles through every view that has something to play, without stopping playback.
  await page.keyboard.press('c');
  await expect(original).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(edited).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(removed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  // With the edit undone the difference is silence, so the view falls back to Edited.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(removed).toBeDisabled();
  await expect(edited).toHaveAttribute('aria-pressed', 'true');
});

test('the output meter moves only while sound is playing', async ({ page }) => {
  await openStudio(page);
  const meter = page.locator('.level-meter');
  const level = () =>
    meter.evaluate((element) => Number(element.style.getPropertyValue('--level') || 0));
  expect(await level()).toBe(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(meter).toHaveClass(/live/);
  await expect.poll(level).toBeGreaterThan(0.02);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(meter).not.toHaveClass(/live/);
  await expect.poll(level).toBe(0);
});

test('selection edges and corners can be dragged, and the readout shows the level', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Hover readouts and edge cursors are a pointer feature.');
  await openStudio(page);
  await page.getByRole('button', { name: 'Precise selection', exact: true }).click();
  const stage = page.getByRole('group', { name: 'Select a region of the spectrogram' });
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  const readout = page.locator('.spectrum-hover-readout');

  // The hover readout reports time, frequency and the measured level under the pointer.
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await expect(readout).toContainText('Hz');
  await expect(readout).toContainText('dB');
  await expect(readout).not.toContainText('drag to resize');

  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  const before = await selectionValues(page);
  expect(before).toEqual({ startTime: 0, endTime: EXAMPLE_DURATION, lowHz: 2900, highHz: 3450 });

  // Grab the right edge: the cursor and readout say so, and only the end time moves.
  const rightEdge = { x: box.x + box.width - 2, y: box.y + box.height * yAt(3100) };
  await page.mouse.move(rightEdge.x, rightEdge.y);
  await expect(stage).toHaveCSS('cursor', 'ew-resize');
  await expect(readout).toContainText('drag to resize');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, rightEdge.y, { steps: 10 });
  await page.mouse.up();
  const afterRight = await selectionValues(page);
  const timeTolerance = EXAMPLE_DURATION / box.width + 0.01;
  expect(Math.abs(afterRight.endTime - 9)).toBeLessThan(timeTolerance);
  expect(afterRight.startTime).toBe(0);
  expect(afterRight.lowHz).toBe(2900);
  expect(afterRight.highHz).toBe(3450);

  // Grab the bottom edge from just below the thin box and pull it down.
  const bottomEdge = { x: box.x + box.width * 0.4, y: box.y + box.height * yAt(2900) + 5 };
  await page.mouse.move(bottomEdge.x, bottomEdge.y);
  await expect(stage).toHaveCSS('cursor', 'ns-resize');
  await page.mouse.down();
  await page.mouse.move(bottomEdge.x, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const afterBottom = await selectionValues(page);
  const expectedLow = frequencyAt(0.5);
  const tolerance = expectedLow * ((MAX_FREQUENCY / MIN_FREQUENCY) ** (1 / box.height) - 1) + 0.01;
  expect(Math.abs(afterBottom.lowHz - expectedLow)).toBeLessThan(tolerance);
  expect(afterBottom.highHz).toBe(3450);
  expect(Math.abs(afterBottom.endTime - afterRight.endTime)).toBeLessThan(0.001);

  // A corner moves both of its edges at once.
  const corner = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.5 };
  await page.mouse.move(corner.x, corner.y);
  await expect(stage).toHaveCSS('cursor', 'nwse-resize');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();
  const afterCorner = await selectionValues(page);
  expect(Math.abs(afterCorner.endTime - 7.2)).toBeLessThan(timeTolerance);
  expect(afterCorner.lowHz).toBeGreaterThan(afterBottom.lowHz);
  expect(afterCorner.startTime).toBe(0);
  expect(afterCorner.highHz).toBe(3450);

  // Away from the edges, a drag still draws a fresh box instead of resizing.
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await expect(stage).not.toHaveCSS('cursor', /resize/);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.9, { steps: 6 });
  await page.mouse.up();
  const fresh = await selectionValues(page);
  expect(Math.abs(fresh.startTime - 2.4)).toBeLessThan(timeTolerance);
  expect(Math.abs(fresh.endTime - 3.6)).toBeLessThan(timeTolerance);
  expect(fresh.highHz).toBeLessThan(1000);
});
