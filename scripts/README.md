# The autonomous task runner

`run-tasks.mjs` takes the ordered queue in `task-queue.json`, starts one headless
Claude Code session per task, runs the project gates, and commits when they pass.

**It never pushes.** You push.

## Commands

```
jlpm tasks                 # print the run order and exit. Changes nothing.
jlpm tasks:run             # run the queue
jlpm tasks:follow          # attach to a live run and stream it
jlpm tasks:status          # print the current state as JSON
jlpm tasks:report          # print the report table

node scripts/run-tasks.mjs --yes --only P2-04
node scripts/run-tasks.mjs --yes --max 3
node scripts/run-tasks.mjs --yes --keep-going
node scripts/run-tasks.mjs --yes --include-high-risk
```

Without `--yes` it prints the plan and stops. That is the default on purpose.

## One run at a time, whoever starts it

Start it from a terminal, then start it again from an agent, and the second
invocation does not begin a second run. It attaches to the first and streams the
same events. This is what makes it safe for a person and an agent to watch
together.

The lock is **a named pipe**, not the pid in `run.lock`. That file is
diagnostic metadata; nothing trusts it. The reason is measured, not assumed:

- Windows recycles pids fast — 960 short spawns gave 782 distinct pids, 178 of
  them reuses within seconds. "That pid is alive" never proves "a run is live".
- `process.kill(pid, 0)` throws `EPERM` for a process that exists but is
  protected. Reading that as dead would start a second run on top of a live one.
- An open file descriptor does not help: another process can delete a lock file
  you are holding, and `UV_FS_O_EXLOCK` is `undefined` on Node 22, so the usual
  advisory-lock recipe silently does nothing.

A pipe name is owned by the kernel. A second `listen` fails with `EADDRINUSE`,
and the name is released the instant the holder dies, even under `taskkill /F`.

## How an agent follows along

Three ways, in order of preference:

1. `node scripts/run-tasks.mjs --follow` — attaches to the pipe. The leader
   replays the whole log first, so a late watcher still sees the run from step 1.
2. Read `.taskrunner/status.json` — a small snapshot: phase, current task,
   counts, heartbeat. Written with temp-plus-rename, so a reader never sees half
   a file.
3. Read `.taskrunner/log.ndjson` — the full ordered event stream, append-only,
   one atomic write per line. Tail it by byte offset and drop the incomplete
   trailing line.

Event types: `run-start`, `note`, `task-start`, `tool`, `gate`, `commit`,
`task-end`, `run-end`, `run-error`. Every event carries the `runId`.

`log.ndjson` holds **one run only**. The previous one is moved into
`.taskrunner/runs/` when a new run starts. Without that boundary, a watcher
attaching to a live run was replayed the whole history first, including old
`run-end` lines — so an agent could read last week's failure as this run's
outcome.

The person who starts the run sees the same events on their own terminal. That
had to be added: the leader was writing the log and feeding followers, but
printing nothing itself, so the terminal that launched it stayed blank until the
final table.

## What one task does

1. Refuse to start if the working tree is dirty. A commit must belong to one task.
2. Start `claude` with the task prompt: Opus 5, effort `max`, `ultracode` in the
   prompt, a fresh session id, and a turn cap.
3. Run every gate in the container: build, `lint:check`, `lint:design`,
   `test:contrast`, `test:selectors`, `pytest`.
4. Commit if the gates pass.

If the session fails, if it changes nothing, or if a gate fails, the task is
recorded as failed **and the work is left in the tree** for you to look at. The
queue then stops, unless you passed `--keep-going`.

The session is denied `git commit`, `push`, `reset`, `checkout`, `stash` and
`rebase` through `--disallowed-tools`, and the runner compares `HEAD` before and
after anyway. A denial list is only as good as its patterns. If `HEAD` moved, the
task is recorded as `session-committed` and the run stops, because that commit
never went through the gates.

## The report

Written to `.taskrunner/report.md` after **every** task, not only at the end, so
a watcher sees it grow.

```
| Task  | Start    | Duration | Status |
| ----  | -----    | -------- | ------ |
| P2-04 | 14:02:11 | 18m 40s  | done   |
| P2-05 | 14:20:51 | 6m 2s    | failed |

Problems:
  P2-05 (gate-failed): jlpm lint:check failed. The work is left in the tree.
```

## What it will not attempt

`task-queue.json` marks 21 open tasks as not runnable. Eleven need a person to
decide or sign off, three are net-new design work, one needs an asset from the
design tool, and one waits on a decision task. The runner prints them as skipped
with the reason. It does not guess.

Three more are marked high risk and need `--include-high-risk`, because each
disables a core JupyterLab plugin or replaces a core control: P2-15, P3-11 and
P4-08. A wrong move in any of them can leave the application unable to start.

## The permission setting, stated plainly

Each session runs with `--permission-mode bypassPermissions`, which turns off
every permission check for that session. An unattended run cannot answer a
prompt, so there is no other way to do this. That is why `--yes` exists: the
runner will not start a real run by accident.

## Changing the order

Edit `order` in `task-queue.json`. The runner sorts by that field. The file was
generated from `TODO.md` by an eight-way classification pass, then ordered by the
rule at the top of `TODO.md`: lowest-numbered task first, with dependencies
enforced.
