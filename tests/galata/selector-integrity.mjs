#!/usr/bin/env node
/**
 * Selector integrity (PRD §7.4(5), §10.3, R1).
 *
 * Boots the target JupyterLab and asserts that every selector this project
 * depends on matches at least one element. Broken selectors then fail the build
 * BEFORE anyone sees a visual regression — which matters because the failure
 * mode of a stale selector is not an error, it is a surface that quietly
 * renders stock while everything around it is redesigned.
 *
 * Input: every `packages/<pkg>/style/selectors.json`. Shape:
 *
 *   {
 *     "surface-file.css": {
 *       "upstream": "@jupyterlab/ui-components 4.5",
 *       "selectors": [
 *         ".jp-Toolbar",
 *         { "selector": ".lm-Menu-item", "requires": "menu-open" }
 *       ]
 *     }
 *   }
 *
 * `requires` names a precondition this script knows how to create. Selectors
 * whose precondition is not yet automatable are reported as SKIPPED with the
 * reason — never as passing, because a silent skip is how a broken selector
 * survives an upgrade.
 *
 *   docker compose up -d
 *   node tests/galata/selector-integrity.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PACKAGES = join(REPO, 'packages');

const argUrl = process.argv.indexOf('--url');
const BASE =
  argUrl !== -1
    ? process.argv[argUrl + 1]
    : (process.env.JUPYTER_URL ?? 'http://localhost:8890');

/**
 * The committed notebook the `notebook-open` state opens.
 *
 * It OPENS a fixture rather than creating a notebook, and that is the whole
 * point. The precondition used to run "New Notebook" from the command palette,
 * which left an `Untitled.ipynb` behind on EVERY run — the server log showed one
 * "Creating new notebook in" per invocation, and twelve of them accumulated in
 * the repo looking like somebody's stray work. Worse, they were not inert: the
 * file browser assertions read that directory, so each leftover changed the
 * state the next run measured, and the job grew flakier the more often it ran.
 *
 * Deleting them afterwards was the obvious fix and the wrong one. It needs a
 * DELETE through the contents API, which Jupyter Server rejects with 403 without
 * an XSRF token — and a cleanup step that silently fails is worse than none,
 * because it looks handled.
 *
 * Opening a fixed, committed file creates nothing, so there is nothing to clean.
 */
const NOTEBOOK_FIXTURE = 'fixture.ipynb';

/** Preconditions this script can create before checking a selector. */
const PRECONDITIONS = {
  'menu-open': async page => {
    await page.click('.lm-MenuBar-item:has-text("File")');
    await page.waitForSelector('.lm-Menu', { timeout: 5_000 });
  },
  'notebook-open': async page => {
    const row = page
      .locator('.jp-DirListing-item', { hasText: NOTEBOOK_FIXTURE })
      .first();
    await row.waitFor({ timeout: 20_000 });
    await row.dblclick();
    await page.waitForSelector('.jp-Notebook', { timeout: 30_000 });
    // WAIT FOR THE MARKDOWN TO RENDER, not just for the notebook to exist.
    //
    // `.jp-Notebook` appears while the cells are still being built. The fixture
    // carries a table, a blockquote, a fenced block and a `kbd` precisely so
    // that markdown.css has something to match, and measured here, NONE of them
    // exist 5s after the notebook appears while all of them exist by 20s.
    //
    // Without this wait the five markdown selectors report as BROKEN and the
    // job prints "Upstream markup moved" with a note about promoting the
    // surface from T2 to T3. That is a false alarm pointing at a regression
    // that does not exist, and it is expensive: someone goes looking for a
    // rendermime change that never happened.
    await page.waitForSelector('.jp-RenderedHTMLCommon table', {
      timeout: 60_000
    });
    // Put a cell in the active state so the cell toolbar, input area and prompt
    // are rendered rather than merely present in the model.
    await page.locator('.jp-Notebook .jp-Cell').first().click();
    await page.waitForTimeout(300);
  }
};

// ---------------------------------------------------------------------------
// Collect the manifests
// ---------------------------------------------------------------------------

const manifests = [];
if (existsSync(PACKAGES)) {
  for (const pkg of readdirSync(PACKAGES)) {
    const file = join(PACKAGES, pkg, 'style', 'selectors.json');
    if (!existsSync(file)) {
      continue;
    }
    manifests.push({
      package: pkg,
      file: relative(REPO, file).split(sep).join('/'),
      data: JSON.parse(readFileSync(file, 'utf8'))
    });
  }
}

if (manifests.length === 0) {
  console.log(
    'No packages/*/style/selectors.json found. Nothing to verify.\n' +
      '(PRD §7.4(5) requires one per package that owns selectors — TODO P2-13.)'
  );
  process.exit(0);
}

const entries = [];
for (const m of manifests) {
  // The manifest is {package, scope, verifiedAgainst, states, surfaces: [...]}.
  // An earlier version of this loop walked Object.entries(m.data) looking for a
  // `.selectors` on each top-level key — which matches NONE of them, so it
  // collected zero selectors and the job passed vacuously. A verification job
  // that silently verifies nothing is worse than no job at all: it reports
  // green on exactly the upstream breakage it exists to catch. Hence the
  // explicit `surfaces` read and the guards below.
  const surfaces = m.data.surfaces;
  if (!Array.isArray(surfaces)) {
    console.error(
      `${m.file}: expected a top-level "surfaces" array, found ` +
        `${surfaces === undefined ? 'nothing' : typeof surfaces}. ` +
        'Refusing to pass on a manifest this job cannot read.'
    );
    process.exit(1);
  }
  for (const group of surfaces) {
    for (const raw of group.selectors ?? []) {
      const entry = typeof raw === 'string' ? { selector: raw } : raw;
      entries.push({
        ...entry,
        package: m.package,
        surface: group.file,
        upstream: Array.isArray(group.upstream)
          ? group.upstream.join('; ')
          : (group.upstream ?? 'unspecified'),
        manifest: m.file
      });
    }
  }
}

if (entries.length === 0) {
  console.error(
    'Manifests parsed but contributed zero selectors. That is the vacuous-pass ' +
      'failure mode this job exists to avoid — treating it as an error.'
  );
  process.exit(1);
}

// COVERAGE: a stylesheet with no manifest entry is unowned. PRD §7.4(5) makes
// the manifest the record of what we depend on upstream, so a surface file that
// never appears in it is invisible to the integrity job — which is exactly how
// seven new stylesheets shipped unregistered (and, as it happened, unimported).
for (const m of manifests) {
  const dir = join(PACKAGES, m.package, 'style', 'surfaces');
  if (!existsSync(dir)) {
    continue;
  }
  const declared = new Set(m.data.surfaces.map(s => s.file));
  const missing = readdirSync(dir)
    .filter(f => f.endsWith('.css'))
    .map(f => `style/surfaces/${f}`)
    .filter(f => !declared.has(f));
  if (missing.length) {
    console.error(
      `\n${missing.length} stylesheet(s) in ${m.package} have no entry in ` +
        `${m.file}:\n    ${missing.join('\n    ')}\n` +
        'Add a surfaces[] entry naming the upstream selectors each depends on.'
    );
    process.exit(1);
  }
}

console.log(
  `Verifying ${entries.length} selector(s) from ${manifests.length} manifest(s) against ${BASE}/lab ...`
);

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  console.error(
    'Playwright is not installed. Run `jlpm install`, then `npx playwright install chromium`.'
  );
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const passed = [];
const failed = [];
const skipped = [];

try {
  // `?reset=1` discards the saved workspace. Without it the run inherits
  // whatever was last left open — this job was restoring twelve dead notebook
  // tabs from an earlier session, each firing a 404 and changing which
  // selectors happened to be present. A verification job has to start from a
  // known state or it measures the previous run instead of the build.
  // THE WAIT IS 180s, AND 60s WAS MEASURED TO BE TOO SHORT.
  //
  // The dev container runs `jlpm watch`: eight `build-labextension --watch`
  // processes polling a bind-mounted tree, which is its steady state rather
  // than a burst — they hold the container above 100% CPU indefinitely, and
  // TypeScript output stops changing long before they go quiet. Under that
  // load, time-to-#main measured 66s, 69s, 73s, 75s, 75s and 78s across two
  // builds. So a 60s cap does not test the product at all; it reports whatever
  // the machine was doing.
  //
  // It failed as a TIMEOUT ON #main, which reads like the application is
  // broken. That cost real time here: the same symptom was read in turn as a
  // plugin deadlock, a bundling problem and a missing chunk before the number
  // was measured. A verification job must not fail in a way that looks like a
  // product defect when it is only impatient.
  await page.goto(`${BASE}/lab?reset=1`, {
    waitUntil: 'networkidle',
    timeout: 180_000
  });
  await page.waitForSelector('#main', { timeout: 180_000 });

  // `#main` exists before the shell has finished populating. The dock panel
  // creates its tab bar only when the first widget lands in it, so querying at
  // this point reported `.lm-DockPanel-tabBar` as BROKEN while the very same
  // selector matched fine in a browser a moment later. Waiting for the default
  // boot widget makes "boot" mean the state a user actually sees, rather than
  // the first frame after the shell element appears.
  //
  // This matters more than a flaky assertion: a false "upstream markup moved"
  // is the report most likely to be waved away, and the next real one with it.
  await page
    .waitForSelector('.jp-Launcher, .lm-DockPanel-tabBar', { timeout: 30_000 })
    .catch(() => {
      console.warn(
        '  ! No launcher or dock tab bar after 30s — boot-state selectors may ' +
          'report broken for want of a mounted shell rather than for real.'
      );
    });

  // Group by precondition so each is set up once rather than per selector.
  const byPrecondition = new Map();
  // The manifest names the precondition `state`; an earlier version of this
  // loop read `requires`, which no entry uses. Every selector therefore landed
  // in the ''-keyed group and was asserted at cold boot — so a rule that only
  // exists with a menu open, or the extension manager showing, reported as
  // BROKEN. That is the same class of bug as the vacuous pass above, inverted:
  // noise instead of silence, and noise gets muted.
  for (const e of entries) {
    const key = e.state ?? e.requires ?? 'boot';
    if (!byPrecondition.has(key)) {
      byPrecondition.set(key, []);
    }
    byPrecondition.get(key).push(e);
  }

  for (const [state, group] of byPrecondition) {
    // `boot` is the cold-start state: nothing to set up.
    if (state && state !== 'boot') {
      const setup = PRECONDITIONS[state];
      if (!setup) {
        for (const e of group) {
          skipped.push({ ...e, why: `no automation for state "${state}"` });
        }
        continue;
      }
      try {
        await setup(page);
      } catch (err) {
        for (const e of group) {
          skipped.push({
            ...e,
            why: `state "${state}" failed: ${err.message}`
          });
        }
        continue;
      }
    }

    for (const e of group) {
      let count = 0;
      try {
        count = await page.evaluate(
          sel => document.querySelectorAll(sel).length,
          e.selector
        );
      } catch (err) {
        // An unparsable selector is OUR error and is never optional.
        failed.push({ ...e, why: `invalid selector: ${err.message}` });
        continue;
      }
      if (count > 0) {
        passed.push(e);
      } else if (e.optional) {
        // Declared as only existing in a state this harness cannot reach — a
        // rename in flight, a drag, a typed filter term. Reported, never
        // asserted, so it cannot be used to quietly mute a real break.
        skipped.push({ ...e, why: 'optional: not present in this state' });
      } else {
        failed.push({ ...e, why: 'matched 0 elements' });
      }
    }

    if (state === 'menu-open') {
      await page.keyboard.press('Escape');
    }
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (skipped.length) {
  console.warn(`\n${skipped.length} selector(s) SKIPPED — not verified:`);
  for (const s of skipped) {
    console.warn(
      `  ~ ${s.selector}\n      ${s.surface} (${s.package}) — ${s.why}`
    );
  }
}

console.log(
  `\nSelector integrity: ${passed.length} matched, ${failed.length} broken, ${skipped.length} skipped.`
);

if (failed.length) {
  console.error(`\n${failed.length} BROKEN SELECTOR(S):\n`);
  for (const f of failed) {
    console.error(`  x ${f.selector}`);
    console.error(
      `      declared in ${f.surface} (${f.package}), verified against ${f.upstream}`
    );
    console.error(`      ${f.why}`);
  }
  console.error(
    '\nUpstream markup moved. PRD Appendix C: the break budget is <= 2 selectors\n' +
      'per minor. Exceeding it triggers a review of whether that surface should be\n' +
      'promoted from T2 to T3 — a structural override that keeps breaking is a\n' +
      'plugin replacement that has not happened yet.\n'
  );
  process.exit(1);
}
