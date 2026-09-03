#!/usr/bin/env node
/**
 * `scripts/task-queue.json` must agree with `TODO.md`.
 *
 * The queue is what the autonomous runner works from; `TODO.md` is what a
 * person reads. They drifted twice before this check existed: **P2-04** stayed
 * in the queue after it was ticked, so the runner would have re-done finished
 * work, and **P2-16** never entered the queue at all, so it was invisible to
 * the runner entirely. Neither is loud. Both are one line to fix and easy to
 * miss for months.
 *
 * Four invariants, in the order they bite:
 *
 *  1. Every task open in `TODO.md` is in the queue.
 *  2. No task ticked in `TODO.md` is in the queue.
 *  3. `order` is 1..N with no gaps and no repeats — the runner sorts on it.
 *  4. Every entry carries the fields the runner reads, and a `blockerKind` of
 *     `none` agrees with `runnable: true`.
 *
 *   node tests/lint/lint-task-queue.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const QUEUE = join(REPO, 'scripts', 'task-queue.json');
const TODO = join(REPO, 'TODO.md');

const rel = p => relative(REPO, p).split(sep).join('/');
const problems = [];

const queue = JSON.parse(readFileSync(QUEUE, 'utf8'));
const todo = readFileSync(TODO, 'utf8');

const openIds = [...todo.matchAll(/^- \[ \] \*\*([A-Z0-9-]+)\*\*/gm)].map(
  m => m[1]
);
const doneIds = new Set(
  [...todo.matchAll(/^- \[x\] \*\*([A-Z0-9-]+)\*\*/gm)].map(m => m[1])
);
const queued = queue.tasks.map(t => t.id);
const queuedSet = new Set(queued);

// 1 + 2 — membership.
for (const id of openIds) {
  if (!queuedSet.has(id)) {
    problems.push(
      `${id} is open in TODO.md but missing from the queue — the runner cannot see it`
    );
  }
}
for (const id of queued) {
  if (doneIds.has(id)) {
    problems.push(
      `${id} is ticked in TODO.md but still in the queue — the runner would re-do it`
    );
  }
}
const seen = new Set();
for (const id of queued) {
  if (seen.has(id)) {
    problems.push(`${id} appears in the queue more than once`);
  }
  seen.add(id);
}

// 3 — ordering. The runner sorts on `order`, so a gap or a repeat silently
// changes what runs first.
queue.tasks.forEach((task, index) => {
  if (task.order !== index + 1) {
    problems.push(
      `${task.id} has order ${task.order} but sits at position ${index + 1} — renumber after any insert or removal`
    );
  }
});

// 4 — shape.
const REQUIRED = [
  'order',
  'id',
  'title',
  'runnable',
  'risk',
  'dependsOn',
  'blockerKind',
  'reason',
  'riskReason'
];
for (const task of queue.tasks) {
  for (const field of REQUIRED) {
    if (!(field in task)) {
      problems.push(`${task.id ?? '(no id)'} is missing "${field}"`);
    }
  }
  if (task.runnable === true && task.blockerKind !== 'none') {
    problems.push(
      `${task.id} is runnable but its blockerKind is "${task.blockerKind}" — one of the two is wrong`
    );
  }
  if (task.runnable === false && task.blockerKind === 'none') {
    problems.push(
      `${task.id} is not runnable but names no blocker — say what blocks it`
    );
  }
  for (const dep of task.dependsOn ?? []) {
    if (!queuedSet.has(dep) && !doneIds.has(dep)) {
      problems.push(
        `${task.id} depends on ${dep}, which is neither queued nor done`
      );
    }
  }
}

if (problems.length === 0) {
  console.log(
    `lint:queue — ${queued.length} task(s) in ${rel(QUEUE)} agree with ${rel(TODO)}.`
  );
  process.exit(0);
}

console.error(`\n${problems.length} task-queue problem(s):\n`);
for (const problem of problems) {
  console.error(`  x ${problem}`);
}
console.error(
  '\nThe queue drives the autonomous runner and TODO.md is what a person reads.\n' +
    'When they disagree, one of them is lying about what is left to do.\n'
);
process.exit(1);
