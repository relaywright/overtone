import { expect, test, type Download, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function openStudio(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See sound.');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
}

async function downloadBytes(download: Download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

async function exportWav(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.wav$/i);
  return downloadBytes(download);
}

function inspectWav(bytes: Buffer) {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
  expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let data: Buffer = Buffer.alloc(0);
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    expect(offset + 8 + size).toBeLessThanOrEqual(bytes.length);
    if (type === 'fmt ') {
      expect(bytes.readUInt16LE(offset + 8)).toBe(1);
      channels = bytes.readUInt16LE(offset + 10);
      sampleRate = bytes.readUInt32LE(offset + 12);
      blockAlign = bytes.readUInt16LE(offset + 20);
      expect(bytes.readUInt16LE(offset + 22)).toBe(16);
      expect(blockAlign).toBe(channels * 2);
      expect(bytes.readUInt32LE(offset + 16)).toBe(sampleRate * blockAlign);
    }
    if (type === 'data') data = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  expect(channels).toBeGreaterThan(0);
  expect(data.length).toBeGreaterThan(0);
  expect(data.length % blockAlign).toBe(0);
  return { channels, sampleRate, frames: data.length / blockAlign, data };
}

function stereoFixture(sampleRate: number) {
  const frames = sampleRate;
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 4, 40);
  for (let n = 0; n < frames; n++) {
    bytes.writeInt16LE(
      Math.round(0.22 * Math.sin((2 * Math.PI * 440 * n) / sampleRate) * 32767),
      44 + n * 4,
    );
    bytes.writeInt16LE(
      Math.round(0.28 * Math.sin((2 * Math.PI * 2200 * n) / sampleRate) * 32767),
      46 + n * 4,
    );
  }
  return bytes;
}

function channelRms(data: Buffer, channels: number, channel: number) {
  let energy = 0;
  const frames = data.length / (channels * 2);
  for (let frame = 0; frame < frames; frame++) {
    const value = data.readInt16LE((frame * channels + channel) * 2) / 32768;
    energy += value * value;
  }
  return Math.sqrt(energy / frames);
}

test('generated example supports a real edit, history, and comparison playback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openStudio(page);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await expect(page.getByLabel('Low frequency', { exact: true })).not.toHaveValue('0');
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const playhead = page.getByRole('slider', { name: 'Playback position' });
  await expect.poll(async () => Number(await playhead.inputValue())).toBeGreaterThan(0.1);
  const beforeComparison = Number(await playhead.inputValue());
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Original', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(Number(await playhead.inputValue())).toBeGreaterThanOrEqual(beforeComparison);
  await page.getByRole('button', { name: 'Edited', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Reset edits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('local stereo import exports valid audio with measured frequency attenuation and a recipe', async ({
  page,
}) => {
  await openStudio(page);
  const sampleRate = await page.evaluate(async () => {
    const context = new AudioContext();
    const rate = context.sampleRate;
    await context.close();
    return rate;
  });
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles({
    name: 'stereo-tones.wav',
    mimeType: 'audio/wav',
    buffer: stereoFixture(sampleRate),
  });
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByText('stereo-tones.wav', { exact: true }).first()).toBeVisible();
  const original = inspectWav(await exportWav(page));
  expect(original.channels).toBe(2);
  expect(original.sampleRate).toBe(sampleRate);
  expect(original.frames).toBe(sampleRate);

  await page.getByRole('button', { name: 'Precise selection', exact: true }).click();
  await page.getByLabel('Start time', { exact: true }).fill('0');
  await page.getByLabel('End time', { exact: true }).fill('1');
  await page.getByLabel('Low frequency', { exact: true }).fill('2000');
  await page.getByLabel('High frequency', { exact: true }).fill('2400');
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  const edited = inspectWav(await exportWav(page));
  expect(edited.channels).toBe(original.channels);
  expect(edited.sampleRate).toBe(original.sampleRate);
  expect(edited.frames).toBe(original.frames);
  // The actual downloaded WAV must retain the left tone and attenuate the selected right tone.
  expect(channelRms(edited.data, 2, 0) / channelRms(original.data, 2, 0)).toBeGreaterThan(0.95);
  expect(channelRms(edited.data, 2, 0) / channelRms(original.data, 2, 0)).toBeLessThan(1.05);
  expect(channelRms(edited.data, 2, 1) / channelRms(original.data, 2, 1)).toBeLessThan(0.4);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download recipe', exact: true }).click();
  const recipeDownload = await pending;
  expect(recipeDownload.suggestedFilename()).toMatch(/\.json$/i);
  const recipe = JSON.parse((await downloadBytes(recipeDownload)).toString('utf8'));
  expect(recipe.edits).toHaveLength(1);
  expect(recipe.edits[0]).toMatchObject({
    kind: 'reduce',
    startTime: 0,
    endTime: 1,
    lowHz: 2000,
    highHz: 2400,
  });

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  const restored = inspectWav(await exportWav(page));
  expect(restored.data.equals(original.data)).toBe(true);

  await page.getByRole('button', { name: 'Isolate selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  const isolated = inspectWav(await exportWav(page));
  expect(channelRms(isolated.data, 2, 0) / channelRms(original.data, 2, 0)).toBeLessThan(0.4);
  expect(channelRms(isolated.data, 2, 1) / channelRms(original.data, 2, 1)).toBeGreaterThan(0.95);
});

test('an unsupported import reports a clear error and leaves the studio usable', async ({
  page,
}) => {
  await openStudio(page);
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles({
    name: 'broken.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('This is not a WAV file.'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/decode|read|audio|format|supported/i);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  inspectWav(await exportWav(page));
});

test('studio and method dialog fit the viewport and pass serious accessibility checks', async ({
  page,
}, testInfo) => {
  await openStudio(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  const studio = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    studio.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('studio.png'), fullPage: true });

  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inside OVERTONE' });
  await expect(dialog).toBeVisible();
  const method = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    method.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'How it works', exact: true })).toBeFocused();
});
