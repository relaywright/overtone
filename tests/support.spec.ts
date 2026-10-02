import { test, expect } from '@playwright/test';

test('unavailable audio output gives a recoverable explanation without hanging', async ({
  page,
}) => {
  await page.addInitScript(() => {
    AudioContext.prototype.resume = () => new Promise(() => {});
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('output device');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
});

test('missing Web Audio support keeps the studio visible with a useful explanation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioBuffer', { configurable: true, value: undefined });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('does not provide audio playback');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import audio', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Find the whistle' }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Edit history' }).getByRole('listitem')).toHaveCount(
    1,
  );
  expect(errors).toEqual([]);
});
