#!/usr/bin/env node
/**
 * PRD M1 / R12: every `:hover` rule in a Lumino menu stylesheet must have a
 * matching `.lm-mod-active` rule with the same treatment.
 *
 * WHY THIS IS A CI GATE AND NOT A CODE REVIEW NOTE
 * -----------------------------------------------
 * Lumino manages its own active-item index. `.lm-mod-active` is the
 * KEYBOARD-highlighted item — it is not `:hover` and it is not `:focus`. A menu
 * styled only on `:hover` therefore has *completely invisible* keyboard
 * navigation: arrow keys move an indicator nobody can see.
 *
 * It is invisible in review too, because the mouse path looks perfect. The only
 * way to catch it reliably is mechanically, which is why PRD §8.4.6 lists it as
 * "CI-linted" rather than as a review checklist item.
 *
 *   node tests/lint/lint-menu-active.mjs
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
      if (entry === 'node_modules' || entry === 'generated') {
        continue;
      }
      walk(full, out);
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a stylesheet into {selector, body} rules. Good enough for flat CSS. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2].trim() });
  }
  return out;
}

/** Normalise a declaration block so two rules can be compared for sameness. */
const normalise = body =>
  body
    .split(';')
    .map(d => d.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)
    .sort()
    .join(';');

const problems = [];

for (const file of walk(PACKAGES)) {
  const css = stripComments(readFileSync(file, 'utf8'));
  // Only stylesheets that actually talk about Lumino menus.
  if (!/\.lm-Menu\b/.test(css)) {
    continue;
  }
  const rel = relative(REPO, file).split(sep).join('/');
  const all = rules(css);

  const hoverRules = all.filter(
    r =>
      /\.lm-Menu-item[^,{]*:hover/.test(r.selector) ||
      /\.lm-MenuBar-item[^,{]*:hover/.test(r.selector)
  );

  for (const hover of hoverRules) {
    // The counterpart selector: swap :hover for .lm-mod-active.
    const wanted = hover.selector.replace(/:hover/g, '.lm-mod-active');
    const match = all.find(r => {
      const parts = r.selector.split(',').map(s => s.trim());
      return (
        parts.some(p => p === wanted.trim()) ||
        r.selector.includes('.lm-mod-active')
      );
    });

    if (!match) {
      problems.push({
        file: rel,
        selector: hover.selector,
        why: 'no .lm-mod-active counterpart — keyboard navigation is invisible'
      });
      continue;
    }
    // A counterpart that exists but does something different is still a bug:
    // PRD §8.4.3 says the keyboard-active treatment is "identical to hover.
    // Non-negotiable."
    const combined = all
      .filter(r => r.selector.includes('.lm-mod-active'))
      .map(r => normalise(r.body))
      .join(';');
    for (const decl of normalise(hover.body).split(';').filter(Boolean)) {
      if (!combined.includes(decl)) {
        problems.push({
          file: rel,
          selector: hover.selector,
          why: `hover declares "${decl}" but no .lm-mod-active rule does`
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log(
    'lint:menus — every menu :hover rule has its .lm-mod-active pair.'
  );
  process.exit(0);
}

console.error(
  `\n${problems.length} menu keyboard-visibility problem(s) (PRD M1, R12):\n`
);
for (const p of problems) {
  console.error(`  x ${p.file}`);
  console.error(`      ${p.selector}`);
  console.error(`      ${p.why}`);
}
console.error(
  '\n.lm-mod-active is the KEYBOARD-highlighted item, not :hover. Without a\n' +
    'matching rule, arrow-key navigation moves an indicator nobody can see.\n'
);
process.exit(1);
