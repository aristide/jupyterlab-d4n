#!/usr/bin/env node
/**
 * Every `var(--d4n-*)` reference must resolve to a custom property that is
 * actually declared somewhere.
 *
 * WHY THIS EXISTS
 * ---------------
 * `lint-literals.mjs` checks that a value IS a `var()`. It never checks that
 * the NAME resolves — and an unresolvable custom property is not a CSS error.
 * It silently becomes the guaranteed-invalid value, so the declaration is
 * dropped and the property falls back to its initial value.
 *
 * That failure mode is worse than a crash because it is selectively invisible:
 *
 *   outline: var(--d4n-focusRing-width) var(--d4n-focusRing-style) var(--d4n-focusRing-color);
 *
 * One bad name takes the whole shorthand invalid, which computes to
 * `outline: none` — a WCAG 2.4.7 failure that looks exactly like a design that
 * simply has no focus ring. Nothing in review, stylelint or `tsc` catches it.
 *
 * This lint caught 56 such references in one pass, all from a mid-project
 * rename of the CSS naming convention (camelCase -> kebab-case) that landed
 * after two packages had already been written.
 *
 *   node tests/lint/lint-var-names.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PACKAGES = join(REPO, 'packages');

function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') {
        continue;
      }
      walk(full, out);
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = css =>
  css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

const files = walk(PACKAGES);

// Pass 1 — everything DECLARED. That is the generated token surface plus any
// package-local property a stylesheet declares for itself (which is legitimate:
// see settings-forms' layout metrics, derived from --d4n-space-* via calc()).
const declared = new Set();
for (const file of files) {
  const css = stripComments(readFileSync(file, 'utf8'));
  for (const m of css.matchAll(/(--d4n-[A-Za-z0-9-]+)\s*:/g)) {
    declared.add(m[1]);
  }
}

// Pass 2 — everything REFERENCED, minus anything with a fallback (a fallback is
// a deliberate "this may not exist" and degrades predictably).
const problems = [];
for (const file of files) {
  const rel = relative(REPO, file).split(sep).join('/');
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--d4n-[A-Za-z0-9-]+)\s*(,)?/g)) {
      const [, name, hasFallback] = m;
      if (declared.has(name) || hasFallback) {
        continue;
      }
      // A near-miss is almost always a casing slip, so name the likely target —
      // that is the difference between a report someone acts on and one they
      // have to investigate.
      const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      problems.push({
        where: `${rel}:${i + 1}`,
        name,
        suggestion: kebab !== name && declared.has(kebab) ? kebab : null
      });
    }
  });
}

console.log(
  `lint:vars — ${declared.size} custom properties declared across ${files.length} stylesheet(s).`
);

if (problems.length === 0) {
  console.log('lint:vars — every var(--d4n-*) reference resolves.');
  process.exit(0);
}

console.error(`\n${problems.length} unresolvable var(--d4n-*) reference(s):\n`);
for (const p of problems) {
  console.error(
    `  x ${p.where}  ${p.name}` +
      (p.suggestion ? `   -> did you mean ${p.suggestion}?` : '')
  );
}
console.error(
  '\nAn undefined custom property is NOT a CSS error — it becomes the\n' +
    'guaranteed-invalid value, the declaration is dropped, and the property\n' +
    'falls back to its initial value. In a shorthand like `outline:` that means\n' +
    '`outline: none`, which is a silent accessibility regression.\n'
);
process.exit(1);
