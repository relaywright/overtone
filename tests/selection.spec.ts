import { expect, test, type Locator, type Page } from '@playwright/test';

const EXAMPLE_DURATION = 12;
const MIN_FREQUENCY = 40;
const MAX_FREQUENCY = 12_000;

async function openStudio(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const stage = page.getByRole('group', {
    name: 'Select a region of the spectrogram',
    exact: true,
  });
  await expect(stage).toHaveAttribute('aria-disabled', 'false');
  await page.getByRole('button', { name: 'Precise selection', exact: true }).click();
  return stage;
}

async function stableBox(page: Page, element: Locator) {
  // The studio has a finite entrance animation. Wait for its ancestors as well
  // as the element so a pointer does not chase a moving coordinate system.
  await element.evaluate(async (node) => {
    const pending: Promise<unknown>[] = [];
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      for (const animation of ancestor.getAnimations()) {
        if (
          animation.playState === 'running' &&
          animation.effect?.getTiming().iterations !== Infinity
        ) {
          pending.push(animation.finished.catch(() => undefined));
        }
      }
    }
    await Promise.all(pending);
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
  });

  await expect
    .poll(async () => {
      const before = await element.boundingBox();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const after = await element.boundingBox();
      return (
        before !== null &&
        after !== null &&
        Math.abs(before.x - after.x) < 0.1 &&
        Math.abs(before.y - after.y) < 0.1 &&
        Math.abs(before.width - after.width) < 0.1 &&
        Math.abs(before.height - after.height) < 0.1
      );
    })
    .toBe(true);

  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function selectionValues(page: Page) {
  const values = await Promise.all(
    ['Start time', 'End time', 'Low frequency', 'High frequency'].map(async (name) =>
      Number(await page.getByLabel(name, { exact: true }).inputValue()),
    ),
  );
  return { startTime: values[0], endTime: values[1], lowHz: values[2], highHz: values[3] };
}

function frequencyAt(y: number) {
  return MIN_FREQUENCY * (MAX_FREQUENCY / MIN_FREQUENCY) ** (1 - y);
}

function expectCloseToFrequency(actual: number, expected: number, displayHeight: number) {
  // One CSS pixel of pointer precision, plus the numerical field's rounding.
  // A fixed Hz tolerance would be misleading on a logarithmic frequency axis.
  const tolerance = expected * ((MAX_FREQUENCY / MIN_FREQUENCY) ** (1 / displayHeight) - 1) + 0.01;
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

test('mouse selection maps to time and logarithmic frequency, clamps at edges, and clears with Escape', async ({
  page,
}) => {
  const stage = await openStudio(page);
  let box = await stableBox(page, stage);

  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.spectrum-selection')).toHaveCount(1);
  const region = await selectionValues(page);
  const timeTolerance = EXAMPLE_DURATION / box.width + 0.01;
  expect(Math.abs(region.startTime - 3)).toBeLessThan(timeTolerance);
  expect(Math.abs(region.endTime - 9)).toBeLessThan(timeTolerance);
  expectCloseToFrequency(region.lowHz, frequencyAt(0.75), box.height);
  expectCloseToFrequency(region.highHz, frequencyAt(0.25), box.height);

  box = await stableBox(page, stage);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 16, box.y + box.height + 16, { steps: 8 });
  await page.mouse.up();
  const lowerRight = await selectionValues(page);
  expect(lowerRight.endTime).toBe(EXAMPLE_DURATION);
  expect(lowerRight.lowHz).toBe(MIN_FREQUENCY);
  expect(Math.abs(lowerRight.startTime - 6)).toBeLessThan(timeTolerance);
  expectCloseToFrequency(lowerRight.highHz, frequencyAt(0.5), box.height);

  box = await stableBox(page, stage);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 16, box.y - 16, { steps: 8 });
  await page.mouse.up();
  const upperLeft = await selectionValues(page);
  expect(upperLeft.startTime).toBe(0);
  expect(upperLeft.highHz).toBe(MAX_FREQUENCY);
  expect(Math.abs(upperLeft.endTime - 6)).toBeLessThan(timeTolerance);
  expectCloseToFrequency(upperLeft.lowHz, frequencyAt(0.5), box.height);

  await stage.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.spectrum-selection')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reduce selection', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('');
});

test('touch drag selects a region without scrolling the phone page', async ({
  page,
  isMobile,
  browserName,
}) => {
  test.skip(!isMobile, 'Touch selection is exercised by the mobile project.');
  test.skip(
    browserName !== 'chromium',
    'Native touch dispatch in this test uses the Chromium browser protocol.',
  );
  const stage = await openStudio(page);
  const box = await stableBox(page, stage);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.2, y: box.y + box.height * 0.2 }],
    });
    for (const position of [0.35, 0.5, 0.65, 0.8]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: box.x + box.width * position, y: box.y + box.height * position }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await client.detach();
  }

  await expect(page.locator('.spectrum-selection')).toHaveCount(1);
  const region = await selectionValues(page);
  const timeTolerance = EXAMPLE_DURATION / box.width + 0.01;
  expect(Math.abs(region.startTime - 2.4)).toBeLessThan(timeTolerance);
  expect(Math.abs(region.endTime - 9.6)).toBeLessThan(timeTolerance);
  expectCloseToFrequency(region.lowHz, frequencyAt(0.8), box.height);
  expectCloseToFrequency(region.highHz, frequencyAt(0.2), box.height);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(1);
  await expect(page.getByRole('button', { name: 'Reduce selection', exact: true })).toBeEnabled();
});

test('waveform seeks through its full height and supports native keyboard controls', async ({
  page,
}) => {
  await openStudio(page);
  const track = page.locator('.waveform-track');
  const slider = page.getByRole('slider', { name: 'Playback position', exact: true });
  const box = await stableBox(page, track);
  const sliderBox = await slider.boundingBox();
  expect(sliderBox).not.toBeNull();
  expect(sliderBox!.height).toBeGreaterThanOrEqual(44);

  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.2);
  await expect.poll(async () => Math.abs(Number(await slider.inputValue()) - 3)).toBeLessThan(0.1);
  // Regression: a general range-input style once limited this control to its
  // upper 24px, leaving a visible but unresponsive lower waveform half.
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.8);
  await expect.poll(async () => Math.abs(Number(await slider.inputValue()) - 9)).toBeLessThan(0.1);

  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue(String(EXAMPLE_DURATION));
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('0.01');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('0');
});

test('precise fields accept values typed one key at a time and fit them into range when finished', async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'Find the whistle', exact: true }).click();
  const summary = page.locator('.selection-summary');
  await expect(summary).toHaveText('0.00–12.00s · 2.9k–3.5k Hz');

  async function type(name: string, text: string) {
    const field = page.getByLabel(name, { exact: true });
    await field.click();
    await field.press('ControlOrMeta+a');
    await field.pressSequentially(text);
    return field;
  }

  // Regression: each keystroke used to be clamped, so typing 5000 became 41 after the
  // first "5" and finished at the 12 kHz ceiling, and typing 100 finished at 4000.
  const high = await type('High frequency', '5000');
  // A value that already fits applies while typing, so the box follows along.
  await expect(summary).toHaveText('0.00–12.00s · 2.9k–5.0k Hz');
  await high.press('Tab');
  await expect(high).toHaveValue('5000');

  const low = await type('Low frequency', '100');
  await low.press('Enter');
  await expect(low).toHaveValue('100');
  const start = await type('Start time', '2.5');
  await start.press('Tab');
  await expect(start).toHaveValue('2.5');
  await expect(summary).toHaveText('2.50–12.00s · 100–5.0k Hz');

  // A finished value outside the range moves to the nearest valid one.
  const lowAgain = await type('Low frequency', '9000');
  await lowAgain.press('Enter');
  await expect(lowAgain).toHaveValue('4999');

  // A cleared field returns to the current value instead of leaving a blank box.
  const end = await type('End time', '');
  await end.press('Backspace');
  await end.press('Tab');
  await expect(end).toHaveValue('12');
});
