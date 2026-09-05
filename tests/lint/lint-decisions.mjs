#!/usr/bin/env node
/**
 * Every `D-0NN` reference in the repository must resolve to a heading in
 * `docs/decisions.md`.
 *
 * The file's own convention says each decision "is referenced by id from the
 * code that depends on it, so a future reader who finds a surprising line can
 * get to the reason without archaeology". A reference to an id that does not
 * exist breaks exactly that, and it is silent: nothing compiles it, nothing
 * renders it, and the reader only finds out when they go looking.
 *
 * IT HAS ALREADY HAPPENED THREE TIMES, ON THE SAME ID. Three separate pieces of
 * work cited **D-033** for a decision none of them wrote — the completer badge
 * (P3-07), the debugger decorations (P3-08) and the launcher (P2-15). Only the
 * launcher wrote a record, so for months the other two citations would have sent
 * a reader to somebody else's argument. See the note at the end of D-035.
 *
 * WHAT THIS CANNOT CATCH. A reference that resolves to the WRONG decision reads
 * exactly like a correct one. The rule that closes that gap is procedural rather
 * than machine-checkable: write the record in the same change that first cites
 * it. This lint enforces the half a machine can see — that the id exists at all
 * — which is enough, because in all three collisions the heading did not yet
 * exist when the reference landed.
 *
 *   node tests/lint/lint-decisions.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DECISIONS = join(REPO, 'docs', 'decisions.md');

/**
 * Directories that hold no authored reference.
 *
 * `design-reference` is an imported artefact, `.taskrunner` is a machine log,
 * and the rest are build output or dependencies. A stale id inside any of them
 * is not something a reader would follow.
 */
const SKIP_DIRS = new Set([
  '.git',
  '.taskrunner',
  '.yarn',
  '__pycache__',
  'design-reference',
  'dist',
  'labextensions',
  'lib',
  'node_modules',
  'test-results'
]);

const EXTENSIONS = new Set([
  '.css',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
]);

const rel = p => relative(REPO, p).split(sep).join('/');

const headings = new Set(
  [...readFileSync(DECISIONS, 'utf8').matchAll(/^## (D-\d{3})\b/gm)].map(
    m => m[1]
  )
);

if (headings.size === 0) {
  console.error('lint:decisions — no `## D-0NN` headings found. Wrong file?');
  process.exit(1);
}

const problems = [];
const seen = new Set();

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(extname(entry))) {
      continue;
    }
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/\bD-(\d{3})\b/g)) {
        const id = `D-${match[1]}`;
        seen.add(id);
        if (!headings.has(id)) {
          problems.push(`${rel(full)}:${index + 1} references ${id}`);
        }
      }
    });
  }
}

walk(REPO);

if (problems.length) {
  console.error(
    `lint:decisions — ${problems.length} reference(s) to a decision that does not exist:`
  );
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error('');
  console.error(
    'Write the record in docs/decisions.md, in the same change that cites it.'
  );
  process.exit(1);
}

console.log(
  `lint:decisions — ${seen.size} distinct id(s) referenced, all ${headings.size} decision(s) resolvable.`
);
