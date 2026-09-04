/**
 * Fixtures for the visual regression suite (PRD §10.1, TODO P1-07).
 *
 * WHY THIS IS NOT `galata.test`
 * -----------------------------
 * `@jupyterlab/galata` ships a `test` fixture with JupyterLab-aware page
 * helpers, and those helpers talk to `window.galata`, which is injected by
 * `@jupyterlab/galata-extension`. That extension is **not installed in our
 * image**, and installing it would put a test-only labextension inside the very
 * application these snapshots photograph. A baseline is only worth having if it
 * is a picture of what ships.
 *
 * So the suite uses plain `@playwright/test` and takes from Galata the two
 * pieces that do not touch the running app: `galata.Mock.mockSettings`, which
 * intercepts the settings API in the browser, and `galata.DEFAULT_SETTINGS`,
 * which is the determinism set (no news fetch, no console banner, no blinking
 * cursors). Nothing is installed into JupyterLab. Revisit this when a test
 * genuinely needs to drive a notebook — that is when the extension earns its
 * place, and the trade changes.
 *
 * HOW THE THEME IS PINNED
 * -----------------------
 * Through the mocked settings, before the first paint — never by toggling.
 * The config explains why: a toggled dark project would make every dark
 * snapshot depend on the theme-switch path, so one switch regression would read
 * as ninety failed snapshots.
 *
 * `mockSettings` replaces each plugin's *user* layer and leaves its schema
 * alone. Our `jupyter-config/lab-settings/overrides.json` is merged by the
 * server into the schema DEFAULTS, not into the user layer — verified against
 * the running instance, where `schema.theme.default` reads "Data4Now Light".
 * So mocking clears leftover user state without losing a single override.
 *
 * `adaptive-theme` is forced off. Its schema default is `true`, which would let
 * the OS colour-scheme preference override the pin and silently swap a project.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { galata } from '@jupyterlab/galata';
// `base-url.js` is CommonJS so playwright.config.js can require it too.
import baseURL from './base-url';

export type D4nOptions = {
  /** Theme to pin for the whole project. Set in playwright.config.js. */
  d4nTheme: string;
  /** Density to pin. Wired in P5-04; carried now so the projects can declare it. */
  d4nDensity: 'comfortable' | 'compact';
};

type PluginSettings = { id: string; raw: string; settings: unknown };
type D4nWorkerFixtures = D4nOptions & { settingsSeed: PluginSettings[] };

// The two options are WORKER-scoped, not test-scoped, and that is forced rather
// than chosen: `settingsSeed` is a worker fixture and Playwright refuses to let
// a worker fixture depend on a test-scoped one. It is also the honest scope —
// the config pins a theme per project, so it cannot vary between two tests of
// the same worker.
export const test = base.extend<{ lab: Page }, D4nWorkerFixtures>({
  d4nTheme: ['Data4Now Light', { scope: 'worker', option: true }],
  d4nDensity: ['comfortable', { scope: 'worker', option: true }],

  /**
   * The whole settings response, already overlaid, fetched ONCE per worker.
   *
   * `galata.Mock.mockSettings` fetches the real settings from inside its route
   * handler the first time the store is empty. Doing that once per test raced
   * the page teardown and failed with "apiResponse.json: Response has been
   * disposed" — seen once in fourteen tests on the first baseline run. Seeding
   * the store means the handler never fetches, so the race cannot happen, and
   * each test saves a round trip.
   */
  settingsSeed: [
    async ({ playwright, d4nTheme }, use) => {
      const mocked: Record<string, unknown> = {
        ...galata.DEFAULT_SETTINGS,
        '@jupyterlab/apputils-extension:themes': {
          theme: d4nTheme,
          'adaptive-theme': false
        }
      };
      const api = await playwright.request.newContext({ baseURL });
      const response = await api.get('/lab/api/settings/');
      if (!response.ok()) {
        throw new Error(
          `settings API returned ${response.status()} — is JupyterLab at ${baseURL}?`
        );
      }
      const loaded = (await response.json()).settings as PluginSettings[];
      await api.dispose();
      // Same shape mockSettings builds itself: keep each plugin's schema, and
      // replace only its user layer.
      await use(
        loaded.map(plugin => ({
          ...plugin,
          raw: JSON.stringify(mocked[plugin.id] ?? {}),
          settings: (mocked[plugin.id] ?? {}) as unknown
        }))
      );
    },
    { scope: 'worker' }
  ],

  lab: async ({ page, d4nTheme, settingsSeed }, use) => {
    const mocked: Record<string, unknown> = {
      ...galata.DEFAULT_SETTINGS,
      '@jupyterlab/apputils-extension:themes': {
        theme: d4nTheme,
        'adaptive-theme': false
      }
    };
    // A per-test copy: the PUT branch of the mock writes into this store, and a
    // test that changes a setting must not leak into the next one.
    const store = structuredClone(settingsSeed);
    await galata.Mock.mockSettings(page, store as never[], mocked);
    // The file browser's Last Modified column is a relative time ("2 minutes
    // ago"), so it changes between two runs of the same suite.
    await galata.Mock.freezeContentLastModified(page);
    // Belt and braces with the config's `animations: 'disabled'`: this also
    // stops CSS that branches on the preference from taking the animated path.
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // `reset=1` clears the workspace, so open tabs from a previous run cannot
    // change the shell. It does NOT reset the theme — that is what the mock is
    // for.
    await page.goto(`${baseURL}/lab?reset=1`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForSelector('#jp-main-dock-panel', { timeout: 90_000 });
    await settle(page, d4nTheme);
    await use(page);
  }
});

/**
 * Wait until the frame is worth photographing.
 *
 * Montserrat resolves late and moves every text run, so a snapshot taken before
 * `document.fonts.ready` measures a fallback face and differs from the next
 * one. The theme assertion is not a nicety either: if the pin failed, every
 * snapshot in the project would be wrong in the same direction and would be
 * approved as a set.
 */
export async function settle(page: Page, expectedTheme: string): Promise<void> {
  // 60s, not 30s, and the reason is contention rather than caution. The suite
  // runs one worker per project, so two browsers boot JupyterLab against one
  // server at once. Under that load the attribute took longer than 30s often
  // enough to fail a run, while the same test passed alone in 10.6s.
  await page.waitForFunction(
    theme => document.body.dataset.jpThemeName === theme,
    expectedTheme,
    { timeout: 60_000 }
  );

  // THE ATTRIBUTE IS NOT THE THEME. It is set when the theme manager STARTS
  // applying; the stylesheet carrying the values loads after it. A snapshot
  // taken in that window catches a half-styled frame, and because the window
  // varies with load, a DIFFERENT surface fails on each run — status bar on one,
  // left rail on the next. P2-05 spent a run diagnosing exactly that.
  //
  // The fix is a plain wait, deliberately. A first attempt polled computed
  // colours until they repeated and also gated on the menu-bar overflow
  // plugin's attribute; both turned intermittent snapshot mismatches into
  // intermittent 60s TIMEOUTS inside this helper, which is worse — the failure
  // moved from a diffable image to a stack trace. A fixed beat that is longer
  // than the theme swap costs a second per test and fails visibly when it is
  // wrong.
  await page.waitForTimeout(1500);

  // The menu-bar overflow plugin (D-017) measures and re-lays the bar after
  // `app.restored` AND after its own font wait, so it settles later than
  // anything else on screen. It announces itself with this attribute, and the
  // two snapshots that kept flaking after the theme wait — `application frame`
  // and `top panel` — are exactly the two that contain the menu bar.
  await page.waitForSelector('body[data-d4n-menubar-overflow]', {
    timeout: 60_000,
    state: 'attached'
  });

  // Montserrat resolves late and moves every text run, so a snapshot taken
  // before `document.fonts.ready` measures a fallback face.
  await page.evaluate(() => document.fonts.ready);
  // The shell lays out once more after the fonts land.
  await page.waitForTimeout(600);
}

export { expect };
