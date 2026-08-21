/**
 * Galata / Playwright config for the visual regression suite (PRD §10.1).
 *
 * The snapshot matrix is every surface in PRD §6 × {light, dark} × {default,
 * compact} — roughly 180 snapshots. Two config choices below are what make that
 * matrix trustworthy rather than a source of noise:
 *
 * 1. FONT RENDERING IS PINNED. Text antialiasing differs between a developer's
 *    macOS box and CI's Linux container, which is enough to blow a 0.2% pixel
 *    threshold on every snapshot containing text — i.e. all of them. Snapshots
 *    are therefore only authoritative from the container; `jlpm test:galata`
 *    locally is for iterating, and CI regenerates the baseline.
 *
 * 2. THE THEME IS PINNED PER PROJECT, not toggled mid-test. Toggling would make
 *    every dark snapshot depend on the theme-switch path working, so a switch
 *    regression would show up as 90 failed snapshots instead of one failed
 *    switch test. The switch gets its own dedicated test (PRD G4/AC3).
 */
const baseURL = process.env.JUPYTER_URL ?? 'http://localhost:8890';

module.exports = {
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  // Snapshots are regenerated deliberately and approved by a human on the PR
  // (PRD §10.1), so a retry that happens to pass would hide a real flake.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  expect: {
    toHaveScreenshot: {
      // PRD §10.1.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled'
    }
  },

  use: {
    baseURL,
    // PRD §4.2: viewport floor is 1280×720. Snapshotting at the floor catches
    // the overflow behaviour (menu bar < 900px, status bar < 1024px) that a
    // roomier viewport hides.
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Deterministic across machines: no locale-dependent date formats, no
    // timezone-dependent timestamps in the status bar or the file browser.
    locale: 'en-US',
    timezoneId: 'UTC'
  },

  projects: [
    {
      name: 'light',
      use: { d4nTheme: 'Data4Now Light', d4nDensity: 'comfortable' }
    },
    {
      name: 'dark',
      use: { d4nTheme: 'Data4Now Dark', d4nDensity: 'comfortable' }
    },
    // PRD G2 makes light and dark peers: they run the IDENTICAL suite. The
    // compact projects are added in P5-04 once the density axis is wired.
    {
      name: 'light-compact',
      use: { d4nTheme: 'Data4Now Light', d4nDensity: 'compact' },
      // TODO P5-04 — density is not wired yet; enabling this now would produce
      // 180 snapshots identical to `light` and hide the real ones later.
      testIgnore: '**/*'
    },
    {
      name: 'dark-compact',
      use: { d4nTheme: 'Data4Now Dark', d4nDensity: 'compact' },
      testIgnore: '**/*' // TODO P5-04
    }
  ],

  webServer: process.env.CI
    ? undefined
    : {
        // Locally, assume `docker compose up -d` is already running rather than
        // starting a second JupyterLab that would fight it for the port.
        command:
          'echo "using the running docker compose stack at ' + baseURL + '"',
        url: `${baseURL}/lab`,
        reuseExistingServer: true,
        timeout: 120_000
      }
};
