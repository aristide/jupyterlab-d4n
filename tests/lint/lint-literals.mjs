#!/usr/bin/env node
/**
 * PRD AC4 / G3: zero hardcoded colour, font, spacing or radius literals in
 * shipped CSS. Everything routes through var(--d4n-*).
 *
 * This is the lint that keeps the token pipeline honest. Without it the tokens
 * become documentation rather than a source of truth: someone in a hurry writes
 * `#0F3D6E` once, it renders correctly in light mode, and the dark-mode bug
 * ships silently because nobody looks at that surface in dark.
 *
 *   node tests/lint/lint-literals.mjs
 *   node tests/lint/lint-literals.mjs --report   # list, but exit 0
 *
 * SCOPE: packages/<pkg>/style/**\/*.css, excluding style/generated/ (those ARE
 * the token definitions — literals are the point there).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PACKAGES = join(REPO, 'packages');
const reportOnly = process.argv.includes('--report');

/** Values that are structural rather than design decisions. */
const ALLOWED_VALUES = new Set([
  '0',
  'auto',
  'none',
  'inherit',
  'initial',
  'unset',
  'currentcolor',
  'transparent',
  '100%',
  '50%',
  'fit-content',
  'max-content',
  'min-content'
]);

const findings = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // The generated directory holds the token definitions themselves.
      if (entry === 'generated' || entry === 'node_modules') {
        continue;
      }
      walk(full, out);
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments so a hex in an explanatory note is not a violation. */
const stripComments = css =>
  css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

const COLOUR_PATTERNS = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, what: 'hex colour' },
  { re: /\brgba?\(/g, what: 'rgb()/rgba() literal' },
  { re: /\bhsla?\(/g, what: 'hsl()/hsla() literal' },
  {
    re: /\b(?:white|black|red|green|blue|yellow|orange|purple|gray|grey|silver|navy|teal|magenta|cyan)\b(?=\s*[;)])/g,
    what: 'named colour'
  }
];

const DIMENSION_PROPERTIES =
  /^(?:padding|margin|gap|row-gap|column-gap|border-radius|font-size|font-family|line-height|width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|inset|letter-spacing)(?:-(?:top|right|bottom|left|start|end|inline|block))?$/;

for (const file of walk(PACKAGES)) {
  const rel = relative(REPO, file).split(sep).join('/');
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');

  lines.forEach((line, i) => {
    const at = n => `${rel}:${n + 1}`;

    for (const { re, what } of COLOUR_PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) {
        findings.push({
          severity: 'error',
          where: at(i),
          what,
          detail: line.trim()
        });
      }
    }

    // Dimension check: `prop: value;` where value has a bare unit and no var().
    const decl = /^\s*([a-z-]+)\s*:\s*([^;{}]+);?\s*$/.exec(line);
    if (!decl) {
      return;
    }
    const [, prop, rawValue] = decl;
    if (!DIMENSION_PROPERTIES.test(prop)) {
      return;
    }
    const value = rawValue.trim().toLowerCase();
    if (value.includes('var(') || ALLOWED_VALUES.has(value)) {
      return;
    }
    // A bare number+unit that is not inside var() or a relative unit.
    if (/\b\d*\.?\d+(?:px|rem|em|ch|vh|vw)\b/.test(value)) {
      findings.push({
        severity: 'error',
        where: at(i),
        what: `hardcoded ${prop}`,
        detail: line.trim()
      });
    }
  });
}

if (findings.length === 0) {
  console.log('lint:tokens — no hardcoded literals in shipped CSS.');
  process.exit(0);
}

console.error(
  `\n${findings.length} hardcoded literal(s) in shipped CSS (PRD AC4):\n`
);
for (const f of findings) {
  console.error(`  x ${f.where}  ${f.what}`);
  console.error(`      ${f.detail}`);
}
console.error(
  '\nRoute these through a token. If a value genuinely is not a design decision,\n' +
    'add it to ALLOWED_VALUES here with a comment saying why.\n'
);
process.exit(reportOnly ? 0 : 1);
