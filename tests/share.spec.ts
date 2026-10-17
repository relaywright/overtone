import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openStudio(page: Page, path = './') {
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
}

async function exportWav(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return readFile((await download.path())!);
}

function monoFixture() {
  const rate = 24000;
  const samples = rate;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000), 44 + i * 2);
  return { name: 'local-tone.wav', mimeType: 'audio/wav', buffer: bytes };
}

test('a link carries an example’s edits and opens to the identical WAV', async ({
  page,
  context,
  browserName,
}) => {
  await openStudio(page);
  const history = page.getByRole('list', { name: 'Edit history' }).getByRole('listitem');
  const status = page.locator('.studio-status [role="status"]');
  const copyLink = page.getByRole('button', { name: 'Copy link', exact: true });
  await expect(copyLink).toBeDisabled();
  expect(await page.evaluate(() => window.location.hash)).toBe('');

  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  const edited = await exportWav(page);
  // The address keeps up with the edits, so reloading or sharing it keeps the work.
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toMatch(/^#edit=[A-Za-z0-9_-]+$/);

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await copyLink.click();
    await expect(status).toHaveText(
      'Link copied. It opens this example with these edits already applied.',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await page.evaluate(() => window.location.href),
    );
  }

  // Opening the link in a fresh tab loads the example and applies the edit.
  await page.goto('about:blank');
  await openStudio(page, `./${hash}`);
  await expect(status).toHaveText(
    'Link opened: 1 edit applied. Press Play, then compare Original, Edited and Removed.',
  );
  await expect(history).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await exportWav(page)).equals(edited)).toBe(true);

  await page.getByRole('button', { name: 'Reset edits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(history).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(copyLink).toBeDisabled();

  // Pasting a link into a tab that already shows the studio only changes the fragment.
  await page.evaluate((fragment) => {
    window.location.hash = fragment;
  }, hash);
  await expect(status).toHaveText(
    'Link opened: 1 edit applied. Press Play, then compare Original, Edited and Removed.',
  );
  await expect(history).toHaveCount(1);
  expect((await exportWav(page)).equals(edited)).toBe(true);
  await page.getByRole('button', { name: 'Reset edits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();

  // A local file cannot travel in a link, so the address is cleared and the button stays off.
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(history).toHaveCount(1);
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(monoFixture());
  await expect(page.getByText('local-tone.wav', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(copyLink).toBeDisabled();
});

test('a link that cannot be read opens the example without edits and says so', async ({ page }) => {
  await openStudio(page, './#edit=not-a-link');
  await expect(page.getByRole('alert')).toContainText('could not be read');
  await expect(page.getByText('Glasshouse', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Edit history' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  // The example still works normally afterwards.
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
});

test('the Removed view plays and shows only what the edits took away', async ({ page }) => {
  await openStudio(page);
  const removed = page.getByRole('button', { name: 'Removed', exact: true });
  const meta = page.locator('.signal-meta');
  await expect(removed).toBeDisabled();
  const peakOf = async () => {
    const text = await meta.textContent();
    const match = /PEAK (-?[\d.]+) dBFS/.exec(text ?? '');
    expect(match, text ?? '').not.toBeNull();
    return Number(match![1]);
  };
  const originalPeak = await peakOf();

  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  const edited = await exportWav(page);
  await removed.click();
  await expect(removed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.spectrum-footer')).toContainText('what your edits took away');
  // The whistle alone peaks far below the full mix: it was a quiet line in a loud picture.
  const removedPeak = await peakOf();
  expect(removedPeak).toBeLessThan(originalPeak - 10);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const playhead = page.getByRole('slider', { name: 'Playback position' });
  await expect.poll(async () => Number(await playhead.inputValue())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  // Export always saves the edited sound, whichever view is showing.
  expect((await exportWav(page)).equals(edited)).toBe(true);
  // With nothing removed the view falls back to Edited, which now equals the original.
  await page.getByRole('button', { name: 'Reset edits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(removed).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the hover readout names the nearest musical note', async ({ page }) => {
  await openStudio(page);
  const stage = page.getByRole('group', { name: 'Select a region of the spectrogram' });
  await expect(stage).toHaveAttribute('aria-disabled', 'false');
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const readout = page.locator('.spectrum-hover-readout');
  await expect(readout).toBeVisible();
  await expect(readout).toHaveText(/\d+\.\d\d s \/ [\d.]+k? Hz \/ [A-G]♯?\d( [+−]\d+¢)?/);
});

test('example thumbnails are real, distinct spectrograms', async ({ page }) => {
  await openStudio(page);
  await expect(page.locator('.thumbnail--ready')).toHaveCount(3);
  const pictures = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLCanvasElement>('.thumbnail-canvas')).map((canvas) => {
      const context = canvas.getContext('2d')!;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let brightest = 0;
      let darkest = 255;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
        brightest = Math.max(brightest, luminance);
        darkest = Math.min(darkest, luminance);
        sum += luminance;
      }
      return { width: canvas.width, height: canvas.height, brightest, darkest, sum };
    }),
  );
  expect(pictures).toHaveLength(3);
  for (const picture of pictures) {
    expect(picture.width).toBe(96);
    expect(picture.height).toBe(40);
    expect(picture.brightest).toBeGreaterThan(120);
    expect(picture.darkest).toBeLessThan(20);
  }
  expect(new Set(pictures.map((picture) => picture.sum)).size).toBe(3);
  await expect(page.getByRole('img', { name: 'Spectrogram of Glasshouse' })).toBeVisible();
});
