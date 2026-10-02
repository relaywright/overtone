import { test, expect } from '@playwright/test';

test('loop survives the end of the clip and monitoring volume changes the actual audio gain', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = createGain.call(this);
      (window as unknown as { monitoredGain: GainNode }).monitoredGain = node;
      return node;
    };
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const seek = page.getByRole('slider', { name: 'Playback position' });
  await seek.focus();
  await seek.press('End');
  await seek.press('ArrowLeft');
  expect(Number(await seek.inputValue())).toBeGreaterThan(11.8);
  await page.getByRole('button', { name: 'Loop playback' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await seek.inputValue())).toBeLessThan(1);
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0.15);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Loop playback' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const volume = page.getByRole('slider', { name: 'Playback volume' });
  await volume.focus();
  await volume.press('Home');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { monitoredGain: GainNode }).monitoredGain.gain.value,
      ),
    )
    .toBeLessThan(0.005);
  await volume.press('End');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { monitoredGain: GainNode }).monitoredGain.gain.value,
      ),
    )
    .toBeGreaterThan(0.995);
  await page.getByRole('button', { name: 'Loop playback' }).click();
  await expect(page.getByRole('button', { name: 'Loop playback' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
