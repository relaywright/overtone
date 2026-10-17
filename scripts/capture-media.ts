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
  // The link preview image: the studio with the edit applied, at the 1200×630 size that
  // social cards expect. The page gutter is 46px, so a 1292px viewport gives a 1200px studio.
  await page.setViewportSize({ width: 1292, height: 900 });
  const studio = page.locator('#studio');
  await studio.scrollIntoViewIfNeeded();
  const bounds = await studio.boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(bounds).not.toBeNull();
  expect(Math.round(bounds!.width)).toBe(1200);
  await page.screenshot({
    path: 'public/social.png',
    fullPage: true,
    clip: { x: bounds!.x, y: bounds!.y + scrollY, width: 1200, height: 630 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/media/studio-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
  console.log(
    `Captured current studio, edited result, link preview image, and 390px layout from ${baseURL}`,
  );
} finally {
  await browser.close();
}
