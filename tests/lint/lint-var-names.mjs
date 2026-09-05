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

function walk(dir, keep, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // `lib/` and `dist/` are compiled copies of `src/`, so scanning them
      // reports every problem twice and points at a file nobody edits.
      if (entry === 'node_modules' || entry === 'lib' || entry === 'dist') {
        continue;
      }
      walk(full, keep, out);
    } else if (keep(entry)) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = source =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));

/** Where a custom property can be DECLARED: stylesheets only. */
const styleFiles = walk(PACKAGES, name => name.endsWith('.css'));

/**
 * Where one can be REFERENCED.
 *
 * TypeScript is in this list because of P3-08. `editor-theme` builds its CSS
 * with `EditorView.baseTheme()` rather than a stylesheet, so four `var(--d4n-*)`
 * names in `debugDecorations.ts` kept the camelCase spelling through the
 * project-wide rename to kebab-case and no lint could see them. They resolved
 * to nothing for months, which nobody noticed, because the decorations were not
 * yet wired to anything that drew them.
 */
const files = [
  ...styleFiles,
  ...walk(PACKAGES, name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
];

// Pass 1 — everything DECLARED. That is the generated token surface plus any
// package-local property a stylesheet declares for itself (which is legitimate:
// see settings-forms' layout metrics, derived from --d4n-space-* via calc()).
const declared = new Set();
for (const file of styleFiles) {
  const css = stripComments(readFileSync(file, 'utf8'));
  for (const m of css.matchAll(/(--d4n-[A-Za-z0-9-]+)\s*:/g)) {
    declared.add(m[1]);
  }
}

// Pass 2 — everything REFERENCED.
//
// A fallback used to exempt the reference. It no longer does, and P3-08 is the
// reason. A fallback answers "this layer can be out of scope", which is the
// AC10 case: on a stock theme the `--d4n-*` layer is not applied and the stock
// `--jp-*` value must take over. It does not answer "this name is misspelled".
// Under a Data4Now theme a misspelled name IS in scope and still misses, so the
// fallback wins silently and forever — the design token never reaches the
// screen and nothing anywhere reports it. Every `--d4n-*` property is generated
// by us, so an undeclared one is a typo whether or not a fallback follows it.
const problems = [];
for (const file of files) {
  const rel = relative(REPO, file).split(sep).join('/');
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--d4n-[A-Za-z0-9-]+)/g)) {
      const [, name] = m;
      if (declared.has(name)) {
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
  `lint:vars — ${declared.size} custom properties declared across ` +
    `${styleFiles.length} stylesheet(s); ${files.length} file(s) scanned for ` +
    `references.`
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
    '`outline: none`, which is a silent accessibility regression.\n' +
    '\nA `var(--d4n-x, fallback)` is reported too. The fallback covers the AC10\n' +
    'case, where a stock theme puts our layer out of scope. It does not cover a\n' +
    'misspelled name, which stays out of reach under OUR theme as well and\n' +
    'silently ships the fallback instead of the design token.\n'
);
process.exit(1);
