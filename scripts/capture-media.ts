import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4186/overtone/';
await mkdir('docs/media', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  // Example thumbnails arrive from the worker shortly after the first example.
  await expect(page.locator('.thumbnail--ready')).toHaveCount(3);
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: 'docs/media/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Find the whistle' }).click();
  await page.getByRole('button', { name: 'Reduce selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export WAV', exact: true })).toBeEnabled();
  await page.locator('#studio').screenshot({ path: 'docs/media/studio-edited.png' });
  await page.getByRole('button', { name: 'Removed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Removed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.sound-workspace').screenshot({ path: 'docs/media/studio-removed.png' });
  await page.getByRole('button', { name: 'Edited', exact: true }).click();

  // Social preview card: the studio itself, cropped to the 1200 × 630 size link previews use.
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(() => {
    const studio = document.querySelector<HTMLElement>('#studio');
    const top = studio ? studio.getBoundingClientRect().top + window.scrollY : 0;
    window.scrollTo(0, top - 1);
  });
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: 'public/social-card.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/media/studio-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
  console.log(
    `Captured current studio, edited result, removed view, social card and 390px layout from ${baseURL}`,
  );
} finally {
  await browser.close();
}
