import { defineConfig, devices } from '@playwright/test';

// Optional local Chromium (e.g. a cloud container whose bundled browser differs). CI leaves it unset.
const chromiumLaunch = process.env.CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE } } : {};

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8876',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', ...chromiumLaunch } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, ...chromiumLaunch } },
  ],
  webServer: {
    command: 'python3 -m http.server 8876 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8876',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
