#!/usr/bin/env node
/**
 * PRD §7.4(4): `!important` requires an inline comment naming the upstream rule
 * it beats. CI greps for uncommented ones and fails.
 *
 * The rule is not "never use !important" — sometimes core's specificity genuinely
 * wins and there is no clean way around it. The rule is that an unexplained
 * `!important` is unmaintainable: on the next JupyterLab upgrade nobody can tell
 * whether the upstream rule it was fighting still exists, so it never gets
 * removed and the stylesheet accretes.
 *
 * A valid annotation is a comment on the same line, or anywhere in the unbroken
 * run of lines above it, that mentions a selector or an upstream package. A
 * blank line ends that run. For example:
 *
 *   /* beats .jp-Toolbar .jp-ToolbarButtonComponent from
 *      @jupyterlab/ui-components 4.5 *\/
 *   background: var(--d4n-toolbar-bg-active) !important;
 *
 *   node tests/lint/lint-important.mjs
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
      if (
        entry === 'node_modules' ||
        entry === 'generated' ||
        entry === 'lib' ||
        entry === 'dist'
      ) {
        continue;
      }
      walk(full, out);
    } else if (
      entry.endsWith('.css') ||
      (entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
    ) {
      // TypeScript is here because of P3-08. `editor-theme` writes its CSS with
      // `EditorView.baseTheme()`, so an `!important` in that package never
      // reached a `.css` file and this gate could not see it.
      out.push(full);
    }
  }
  return out;
}

/**
 * Does this text look like it names an upstream rule?
 *
 * CodeMirror joins JupyterLab and Lumino on the list for the same reason the
 * other two are on it: a CM6 base theme is upstream code whose declarations we
 * sometimes have to beat, and `.cm-gutter { display: flex !important }` is one
 * of them.
 */
const namesUpstream = text =>
  /\.(?:jp|lm|cm)-[A-Za-z-]+/.test(text) ||
  /@jupyterlab\//.test(text) ||
  /@lumino\//.test(text) ||
  /@codemirror\//.test(text);

/**
 * Blank out comment CONTENT while preserving line structure, so a line number
 * in the stripped copy still indexes the original.
 *
 * Needed because this file's own subject matter appears in prose constantly —
 * "…without !important, which matters because…" is a comment explaining why a
 * rule avoids it, and flagging that as a violation is exactly backwards.
 */
const blankComments = source =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    // Line comments, for the TypeScript files. `[^:]` keeps `https://` intact.
    .replace(/(^|[^:])\/\/[^\n]*/gm, m => m.replace(/[^\n]/g, ' '));

const problems = [];

for (const file of walk(PACKAGES)) {
  const rel = relative(REPO, file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const stripped = blankComments(source).split('\n');

  stripped.forEach((declLine, i) => {
    // Match against the comment-stripped copy; report the original.
    if (!declLine.includes('!important')) {
      return;
    }
    const line = lines[i];
    // Same line, or anywhere in the unbroken run of lines above it.
    //
    // This used to be a fixed two-line window, which is right for CSS and wrong
    // for the TypeScript themes: one CodeMirror rule is a single selector string
    // of eight wrapped lines, so its comment sat far outside the window and read
    // as undocumented. A blank line ends the run, so a comment about some other
    // declaration is still not counted for this one.
    const context = [line];
    for (let j = i - 1; j >= 0 && i - j <= 16; j--) {
      if (lines[j].trim() === '') {
        break;
      }
      context.unshift(lines[j]);
    }
    const text = context.join('\n');
    const hasComment =
      /\/\*/.test(text) || /\*\//.test(text) || /(^|[^:])\/\//m.test(text);
    if (hasComment && namesUpstream(text)) {
      return;
    }
    problems.push({
      where: `${rel}:${i + 1}`,
      line: line.trim(),
      why: hasComment
        ? 'comment does not name the upstream rule being beaten'
        : 'no explanatory comment'
    });
  });
}

if (problems.length === 0) {
  console.log('lint:important — every !important names the rule it beats.');
  process.exit(0);
}

console.error(`\n${problems.length} unexplained !important (PRD §7.4(4)):\n`);
for (const p of problems) {
  console.error(`  x ${p.where}  — ${p.why}`);
  console.error(`      ${p.line}`);
}
console.error(
  '\nAdd a comment naming the upstream selector or package. On the next\n' +
    'JupyterLab upgrade, that comment is the only way to tell whether the rule\n' +
    'this was fighting still exists.\n'
);
process.exit(1);
