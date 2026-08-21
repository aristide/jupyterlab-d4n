#!/usr/bin/env node
/**
 * PRD I2 / §7.8.4: no shipped icon may contain a literal colour value.
 *
 * Fills must use JupyterLab's icon classes (jp-icon0..4, jp-icon-brand0..3,
 * jp-icon-accent0..3, jp-icon-contrast0..4) or `currentColor`. A literal hex is
 * an icon that is invisible in one of the two modes — and since nobody reviews
 * 120 icons in both modes, it ships.
 *
 * §7.8.4 also requires: no <style> blocks and no id attributes (they collide
 * when SVGs are inlined into one document), and a <title> for screen readers
 * (I5). All three are checked here.
 *
 * THE ONE SANCTIONED EXCEPTION (§8.9.1): a brand mark with fixed brand colours
 * that must not shift between modes. Mark it with a comment containing
 * `d4n-allow-literal-color` and say why — the comment is the review artifact.
 *
 *   node tests/lint/lint-icon-colors.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SVG_DIRS = [
  join(REPO, 'packages', 'icons', 'svg'),
  join(REPO, 'packages', 'ui-overrides', 'style', 'images')
];

function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.svg')) {
      out.push(full);
    }
  }
  return out;
}

const LITERAL_COLOUR =
  /(?:fill|stroke|stop-color|flood-color|lighting-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|(?!none|currentColor|inherit|transparent|url\()[a-z]{3,})/gi;

const problems = [];
let scanned = 0;

for (const dir of SVG_DIRS) {
  for (const file of walk(dir)) {
    scanned += 1;
    const rel = relative(REPO, file).split(sep).join('/');
    const svg = readFileSync(file, 'utf8');
    const exempt = svg.includes('d4n-allow-literal-color');

    if (!exempt) {
      LITERAL_COLOUR.lastIndex = 0;
      let m;
      while ((m = LITERAL_COLOUR.exec(svg))) {
        problems.push({
          file: rel,
          why: `literal colour "${m[1]}" — invisible in one of the two modes`
        });
      }
    }

    if (/<style[\s>]/i.test(svg)) {
      problems.push({ file: rel, why: '<style> block — §7.8.4 forbids it' });
    }
    if (/\sid\s*=\s*["']/i.test(svg)) {
      problems.push({
        file: rel,
        why: 'id attribute — ids collide when SVGs are inlined into one document'
      });
    }
    if (!/<title[\s>]/i.test(svg)) {
      problems.push({
        file: rel,
        why: 'no <title> — screen readers get nothing (PRD I5)'
      });
    }
  }
}

if (scanned === 0) {
  console.log(
    'lint:icons — no SVGs to scan yet (packages/icons/svg is empty).'
  );
  process.exit(0);
}

if (problems.length === 0) {
  console.log(`lint:icons — ${scanned} SVG(s) clean.`);
  process.exit(0);
}

console.error(
  `\n${problems.length} icon problem(s) across ${scanned} SVG(s) (PRD I2, I5, §7.8.4):\n`
);
for (const p of problems) {
  console.error(`  x ${p.file}\n      ${p.why}`);
}
console.error(
  '\nFills must be currentColor or a jp-icon-* class. For a brand mark with\n' +
    'genuinely fixed colours, add a comment containing d4n-allow-literal-color\n' +
    'explaining why (§8.9.1 — the one sanctioned exception).\n'
);
process.exit(1);
