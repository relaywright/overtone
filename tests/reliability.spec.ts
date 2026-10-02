import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

declare global {
  interface Window {
    __holdAudioDecode?: boolean;
    __audioDecodeStarted?: boolean;
    __audioDecodeReturned?: boolean;
    __releaseAudioDecode?: () => void;
    __failNextAudioProcess?: boolean;
    __crashAudioProcessor?: () => void;
    __decodeCalls?: number;
  }
}

function audioFixture(seconds = 1) {
  const rate = 24000;
  const samples = rate * seconds;
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
  return { name: 'delayed-local-file.wav', mimeType: 'audio/wav', buffer: bytes };
}

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
}

async function installDelayedDecode(page: Page) {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
      return original.call(this, bytes).then(async (result) => {
        if (window.__holdAudioDecode) {
          window.__audioDecodeStarted = true;
          await new Promise<void>((resolve) => {
            window.__releaseAudioDecode = resolve;
          });
        }
        window.__audioDecodeReturned = true;
        return result;
      });
    };
  });
}

test('pending local decoding cannot play or export the previous clip as the new result', async ({
  page,
}) => {
  await installDelayedDecode(page);
  await ready(page);
  await page.evaluate(() => {
    window.__holdAudioDecode = true;
  });
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(audioFixture());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeStarted)).toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download recipe', exact: true })).toBeDisabled();
  await page.evaluate(() => window.__releaseAudioDecode?.());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeReturned)).toBe(true);
  await expect(page.getByText('delayed-local-file.wav', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
});

test('a late file decode cannot overwrite a subsequently chosen example', async ({ page }) => {
  await installDelayedDecode(page);
  await ready(page);
  await page.evaluate(() => {
    window.__holdAudioDecode = true;
  });
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(audioFixture());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeStarted)).toBe(true);
  await page.getByRole('button', { name: /Night circuit/ }).click();
  await expect(page.getByRole('button', { name: 'Find the hum', exact: true })).toBeEnabled();
  await page.evaluate(() => window.__releaseAudioDecode?.());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeReturned)).toBe(true);
  // A successful request arriving afterwards must retain the newly selected source.
  await expect(page.getByRole('button', { name: /Night circuit/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('delayed-local-file.wav', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find the hum', exact: true })).toBeEnabled();
});

test('failed processing preserves the last committed history and recipe', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: { id: number; type: string }, transfer: Transferable[] = []) {
        if (message.type === 'process' && window.__failNextAudioProcess) {
          window.__failNextAudioProcess = false;
          window.setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: {
                    id: message.id,
                    type: 'error',
                    message: 'Injected processing failure: the new edit did not render.',
                  },
                }),
              ),
            0,
          );
          return;
        }
        super.postMessage(message, transfer);
      }
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await page.evaluate(() => {
    window.__failNextAudioProcess = true;
  });
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Injected processing failure');
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
  const recipe = page.getByRole('button', { name: 'Download recipe', exact: true });
  if (await recipe.isEnabled()) {
    const pending = page.waitForEvent('download');
    await recipe.click();
    const download = await pending;
    const path = await download.path();
    expect(path).toBeTruthy();
    const settings = JSON.parse(await readFile(path!, 'utf8'));
    expect(settings.edits).toHaveLength(1);
  } else {
    // Disabling export is also safe, provided a failed history is not shown as committed.
    await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeDisabled();
  }
});

test('history shortcuts work while the edit button retains focus', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  const reduce = page.getByRole('button', { name: 'Reduce selection', exact: true });
  await reduce.click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await reduce.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Download recipe', exact: true }).focus();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
});

test('processor failure prevents stale exports and has a working restart', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        window.__crashAudioProcessor = () =>
          this.dispatchEvent(new ErrorEvent('error', { message: 'Injected processor crash' }));
      }
    };
  });
  await ready(page);
  await page.evaluate(() => window.__crashAudioProcessor?.());
  await expect(page.getByRole('alert')).toContainText(/processor stopped/i);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download recipe', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restart studio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Find the whistle', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a selection below the frequency or time resolution does not claim a successful edit', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Precise selection', exact: true }).click();
  await page.getByLabel('Start time', { exact: true }).fill('0');
  await page.getByLabel('End time', { exact: true }).fill('12');
  await page.getByLabel('Low frequency', { exact: true }).fill('1501');
  await page.getByLabel('High frequency', { exact: true }).fill('1502');
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/Widen the selection/);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edited', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.getByLabel('High frequency', { exact: true }).fill('1900');
  await page.getByLabel('End time', { exact: true }).fill('0.01');
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/Widen the selection/);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
});

test('an oversized replacement cancels a pending decode without leaving the studio busy', async ({
  page,
}) => {
  await installDelayedDecode(page);
  await page.addInitScript(() => {
    const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
    Object.defineProperty(File.prototype, 'size', {
      configurable: true,
      get() {
        return this.name === 'too-large.wav' ? 31 * 1024 * 1024 : size.call(this);
      },
    });
  });
  await ready(page);
  await page.evaluate(() => {
    window.__holdAudioDecode = true;
  });
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(audioFixture());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeStarted)).toBe(true);
  await page
    .getByLabel('Import audio file', { exact: true })
    .setInputFiles({ ...audioFixture(), name: 'too-large.wav' });
  await expect(page.getByRole('alert')).toContainText('larger than 30 MB');
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await page.evaluate(() => window.__releaseAudioDecode?.());
  await expect.poll(() => page.evaluate(() => window.__audioDecodeReturned)).toBe(true);
  await expect(page.getByRole('button', { name: /Glasshouse/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('overlong audio is rejected before decoding expands the samples', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.decodeAudioData;
    window.__decodeCalls = 0;
    AudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
      window.__decodeCalls = (window.__decodeCalls ?? 0) + 1;
      return original.call(this, bytes);
    };
  });
  await ready(page);
  await page
    .getByLabel('Import audio file', { exact: true })
    .setInputFiles({ ...audioFixture(61), name: 'too-long.wav' });
  await expect(page.getByRole('alert')).toContainText(/60 seconds/);
  expect(await page.evaluate(() => window.__decodeCalls)).toBe(0);
  await expect(page.getByRole('button', { name: /Glasshouse/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
});

test('an over-range local WAV warns before a bounded PCM16 export', async ({ page }) => {
  const rate = 24000;
  const samples = rate;
  const bytes = Buffer.alloc(44 + samples * 4);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(1, 22); // IEEE 32-bit float WAV permits values above full scale.
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeFloatLE(1.4 * Math.sin((2 * Math.PI * 440 * i) / rate), 44 + i * 4);
  await ready(page);
  await page
    .getByLabel('Import audio file', { exact: true })
    .setInputFiles({ name: 'over-range.wav', mimeType: 'audio/wav', buffer: bytes });
  await expect(page.getByText('over-range.wav', { exact: true })).toBeVisible();
  await expect(page.getByText(/Some samples exceed full scale/)).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).toBeTruthy();
  const result = await readFile(path!);
  expect(result.readUInt16LE(20)).toBe(1);
  expect(result.readUInt16LE(34)).toBe(16);
  let lowest = 32767;
  let highest = -32768;
  for (let i = 44; i < result.length; i += 2) {
    lowest = Math.min(lowest, result.readInt16LE(i));
    highest = Math.max(highest, result.readInt16LE(i));
  }
  expect(lowest).toBe(-32768);
  expect(highest).toBe(32767);
});
