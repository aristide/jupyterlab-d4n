#!/usr/bin/env node
/**
 * Every `anchor` L1234 pair in COMPONENT-INDEX.md must be true.
 *
 * The index maps every JupyterLab surface to the exact string and line where
 * its specification lives in `JupyterLab Theme.html`. Line numbers rot: TODO
 * P0-11 found every CSS banner 76 lines low and every body anchor 103 low,
 * because the index had been written against an older revision of the design
 * page. Nothing caught it, and the file kept reading as authoritative.
 *
 * So the file states its claims in one machine-checkable shape:
 *
 *     `<literal string from the target file>` L<line number>
 *
 * This lint reads that line of the target file and asserts the string is on
 * it. An anchor with no line number is not checked — that is the escape hatch
 * for "search for this, it moves".
 *
 *   node tests/lint/lint-doc-anchors.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const INDEX = join(REPO, 'design-reference', 'data4now', 'COMPONENT-INDEX.md');
const TARGET = join(
  REPO,
  'design-reference',
  'data4now',
  'JupyterLab Theme.html'
);

// `anything` followed by a space and L<digits>. The anchor may not span lines,
// and a table cell never wraps, so a single-line match is the whole claim.
const CLAIM = /`([^`\n]+)`\s+L(\d+)/g;

const rel = p => relative(REPO, p).split(sep).join('/');
const index = readFileSync(INDEX, 'utf8');
const targetLines = readFileSync(TARGET, 'utf8').split('\n');

const problems = [];
let checked = 0;

index.split('\n').forEach((row, i) => {
  CLAIM.lastIndex = 0;
  let m;
  while ((m = CLAIM.exec(row))) {
    const [, anchor, lineNo] = m;
    const n = Number(lineNo);
    checked += 1;
    const line = targetLines[n - 1];
    if (line === undefined) {
      problems.push({
        row: i + 1,
        anchor,
        why: `L${n} is past the end of the file (${targetLines.length} lines)`
      });
    } else if (!line.includes(anchor)) {
      problems.push({
        row: i + 1,
        anchor,
        why: `L${n} is: ${line.trim().slice(0, 90) || '(blank)'}`
      });
    }
  }
});

if (problems.length === 0) {
  console.log(
    `lint:anchors — ${checked} anchor(s) in ${rel(INDEX)} all resolve in ${rel(TARGET)}.`
  );
  process.exit(0);
}

console.error(
  `\n${problems.length} stale anchor(s) of ${checked} in ${rel(INDEX)}:\n`
);
for (const p of problems) {
  console.error(`  x line ${p.row}: \`${p.anchor}\`\n      ${p.why}`);
}
console.error(
  '\nGrep the target file for the anchor and write the line it is really on.\n' +
    'To stop checking an anchor that genuinely moves, drop its L<number>.\n'
);
process.exit(1);
