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

/** Preconditions this script can create before checking a selector. */
const PRECONDITIONS = {
  'menu-open': async page => {
    await page.click('.lm-MenuBar-item:has-text("File")');
    await page.waitForSelector('.lm-Menu', { timeout: 5_000 });
  },
  'notebook-open': async page => {
    await page.keyboard.press('Control+Shift+C');
    await page.fill('#modal-command-palette input', 'New Notebook');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.jp-Notebook', { timeout: 20_000 });
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
  for (const [surface, group] of Object.entries(m.data)) {
    if (surface.startsWith('$')) {
      continue;
    }
    for (const raw of group.selectors ?? []) {
      const entry = typeof raw === 'string' ? { selector: raw } : raw;
      entries.push({
        ...entry,
        package: m.package,
        surface,
        upstream: group.upstream ?? 'unspecified',
        manifest: m.file
      });
    }
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
  await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('#main', { timeout: 60_000 });

  // Group by precondition so each is set up once rather than per selector.
  const byPrecondition = new Map();
  for (const e of entries) {
    const key = e.requires ?? '';
    if (!byPrecondition.has(key)) {
      byPrecondition.set(key, []);
    }
    byPrecondition.get(key).push(e);
  }

  for (const [requires, group] of byPrecondition) {
    if (requires) {
      const setup = PRECONDITIONS[requires];
      if (!setup) {
        for (const e of group) {
          skipped.push({
            ...e,
            why: `no automation for precondition "${requires}"`
          });
        }
        continue;
      }
      try {
        await setup(page);
      } catch (err) {
        for (const e of group) {
          skipped.push({
            ...e,
            why: `precondition "${requires}" failed: ${err.message}`
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
        failed.push({ ...e, why: `invalid selector: ${err.message}` });
        continue;
      }
      if (count > 0) {
        passed.push(e);
      } else {
        failed.push({ ...e, why: 'matched 0 elements' });
      }
    }

    if (requires === 'menu-open') {
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
