import { defineConfig, devices } from '@playwright/test';

const hostedUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = hostedUrl ?? 'http://127.0.0.1:4186/overtone/';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1080 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    ...(process.env.OVERTONE_CROSS_BROWSER === '1'
      ? [
          {
            name: 'desktop-firefox',
            use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1080 } },
          },
          {
            name: 'desktop-webkit',
            use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1080 } },
          },
        ]
      : []),
  ],
  webServer: hostedUrl
    ? undefined
    : {
        command: 'npm run preview -- --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
