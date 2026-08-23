#!/usr/bin/env node
/**
 * Autonomous task runner for TODO.md.
 *
 * It takes the ordered queue in `scripts/task-queue.json`, starts one headless
 * Claude Code session per task, runs the project gates, and commits when they
 * pass. It never pushes.
 *
 *   node scripts/run-tasks.mjs                 plan only — print the order and exit
 *   node scripts/run-tasks.mjs --yes           run the queue
 *   node scripts/run-tasks.mjs --yes --only P2-04
 *   node scripts/run-tasks.mjs --yes --max 3
 *   node scripts/run-tasks.mjs --follow        attach to the live run and stream it
 *   node scripts/run-tasks.mjs --status        print the current state as JSON
 *   node scripts/run-tasks.mjs --report        print the report table
 *
 * ONE RUN AT A TIME, WHOEVER STARTS IT. A second invocation does not start a
 * second run. It attaches to the live one and streams the same output, so a
 * person in a terminal and an agent can both watch the same run.
 *
 * The lock is A NAMED PIPE, not the pid file beside it. That choice is the whole
 * reason this is reliable, and it was measured rather than assumed:
 *
 *   - Windows recycles pids fast. 960 short spawns produced 782 distinct pids —
 *     178 reuses, some within seconds. So "the recorded pid is alive" can never
 *     prove "a run is live"; it eventually names somebody else's process.
 *   - `process.kill(pid, 0)` also throws EPERM for a process that EXISTS but is
 *     protected. Reading EPERM as "dead" would let a second run start on top of
 *     a live one, which is the one thing the lock exists to prevent.
 *   - An open file descriptor does not help either: libuv opens with
 *     FILE_SHARE_DELETE, so another process can delete the lock file while we
 *     hold it. `fs.constants.UV_FS_O_EXLOCK` is undefined on Node 22, so the
 *     usual advisory-lock recipe silently degrades to an ordinary open.
 *
 * A pipe name is owned by the kernel. A second `listen` on it fails with
 * EADDRINUSE, and the name is released the moment the holder dies, even under
 * `taskkill /F`. It cannot go stale and it cannot be fooled by pid reuse. The
 * same connection then carries the event stream to whoever attached.
 *
 * `run.lock` is still written, because a person reading `.taskrunner/` wants to
 * know which pid to look at. It is DIAGNOSTIC METADATA. Nothing trusts it.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const STATE = join(REPO, '.taskrunner');
const LOCK = join(STATE, 'run.lock');
const LOG = join(STATE, 'log.ndjson');
const STATUS = join(STATE, 'status.json');
const REPORT = join(STATE, 'report.md');
const QUEUE = join(REPO, 'scripts', 'task-queue.json');
const SESSIONS = join(STATE, 'sessions');

const ARCHIVE = join(STATE, 'runs');

/**
 * The pipe name is derived from the WHOLE repository path, so two checkouts of
 * this project never share a lock.
 *
 * It hashes rather than truncates. An earlier version took the last 24 hex
 * characters of the path, which is the last 12 BYTES — the project directory
 * name, identical in every checkout. That inverted the intent exactly: every
 * checkout collided with every other, and a second checkout running `--yes`
 * would attach to the first one's run and exit 0 having done none of its own
 * work. Lower-cased first, so a drive-letter or case variant of one path is
 * still one lock.
 */
const PIPE =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\d4n-task-runner-' +
      createHash('sha256').update(REPO.toLowerCase()).digest('hex').slice(0, 24)
    : join(STATE, 'run.sock');

// ---------------------------------------------------------------------------
// Model settings
// ---------------------------------------------------------------------------

const MODEL = 'claude-opus-5';

/**
 * The Claude Code binary.
 *
 * Resolved to a real path and spawned WITHOUT a shell. That is deliberate: the
 * task prompt is multi-line and contains quotes and backticks, and on Windows
 * `shell: true` hands the whole argv to `cmd.exe`, which would mangle it. The
 * install here is a plain `claude.exe`, not a `.cmd` shim, so no shell is
 * needed to reach it. `CLAUDE_BIN` overrides for a different install.
 */
const CLAUDE_BIN =
  process.env.CLAUDE_BIN ??
  (process.platform === 'win32' ? 'claude.exe' : 'claude');

/**
 * `max` is the top of the ladder (low, medium, high, xhigh, max).
 *
 * Validated against this list before use, because an UNRECOGNISED value is not
 * an error — the CLI prints a warning to stderr and quietly runs at whatever
 * the user's settings say. A typo here would mean every task silently ran at
 * the wrong effort, and the only sign would be the bill.
 */
const EFFORT = 'max';
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Stops a task that has lost the plot from running until the budget does. */
const MAX_TURNS = 120;

/** Startup alone costs about 14s before any model work. Be generous. */
const TASK_TIMEOUT_MS = 90 * 60 * 1000;

const GATES = [
  'jlpm build',
  'jlpm lint:check',
  'jlpm lint:design',
  'jlpm test:contrast',
  'jlpm test:selectors --url http://localhost:8888',
  'python -m pytest -q'
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/** A flag value must be present and must not itself be a flag. */
function requireValue(value, message) {
  if (value === undefined || value.startsWith('-')) {
    console.error(message);
    process.exit(2);
  }
  return value;
}

function parseArgs(argv) {
  const a = {
    yes: false,
    follow: false,
    status: false,
    report: false,
    keepGoing: false,
    includeHighRisk: false,
    only: null,
    max: Infinity
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--yes' || v === '-y') {
      a.yes = true;
    } else if (v === '--follow' || v === '-f') {
      a.follow = true;
    } else if (v === '--status') {
      a.status = true;
    } else if (v === '--report') {
      a.report = true;
    } else if (v === '--keep-going') {
      a.keepGoing = true;
    } else if (v === '--include-high-risk') {
      a.includeHighRisk = true;
    } else if (v === '--only') {
      // A missing value used to leave `only` undefined, and the filter below
      // is written `if (args.only && …)`. So `--only` with a lost value did not
      // narrow the run to one task — it ran the WHOLE queue unattended. The two
      // flags that bound this script are the two that must never fail open.
      a.only = requireValue(
        argv[++i],
        '--only needs a task id, for example P2-04'
      );
    } else if (v === '--max') {
      const n = Number(requireValue(argv[++i], '--max needs a whole number'));
      if (!Number.isInteger(n) || n < 1) {
        console.error('--max needs a whole number of 1 or more.');
        process.exit(2);
      }
      a.max = n;
    } else if (v === '--help' || v === '-h') {
      a.help = true;
    } else {
      console.error(`Unknown option: ${v}. Use --help.`);
      process.exit(2);
    }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// State files
// ---------------------------------------------------------------------------

mkdirSync(STATE, { recursive: true });
mkdirSync(SESSIONS, { recursive: true });

/**
 * One `writeSync` per line on an fd opened for append.
 *
 * Measured with four concurrent writers at line sizes from 50 B to 70 KB:
 * 13 380 lines written, zero torn, zero interleaved, zero lost. This is why the
 * event stream is an append-only log and not a file that gets rewritten — a
 * rewritten file tears for readers 14% to 27% of the time.
 */
let logFd = null;
let RUN_ID = null;
let isLeader = false;

function appendEvent(event) {
  const line =
    JSON.stringify({ t: new Date().toISOString(), runId: RUN_ID, ...event }) +
    '\n';
  if (logFd === null) {
    logFd = openSync(LOG, 'a');
  }
  writeSync(logFd, line);
  return line;
}

/**
 * The one way an event reaches anybody.
 *
 * Three destinations, and the third is the one that was missing: the leader was
 * writing the log and feeding attached followers, but never printing to its own
 * stdout. So the terminal that STARTED the run — the person most likely to be
 * watching — saw nothing at all between launch and the final table. On a
 * 33-task queue with a 90-minute per-task timeout, that is a blank screen for
 * days.
 */
function publish(event) {
  const line = appendEvent(event);
  for (const c of clients) {
    try {
      c.write(line);
    } catch {
      clients.delete(c);
    }
  }
  if (isLeader) {
    render(line);
  }
}

/**
 * Replace a small file without a reader ever seeing half of it.
 *
 * Temp plus rename is atomic, but on Windows `MoveFileEx` fails with EPERM while
 * a reader holds the destination open — 96% of renames failed against three
 * tight-loop readers. The retry is mandatory, not defensive: the failure mode is
 * added latency, never a torn read.
 */
function writeAtomic(path, text) {
  const tmp = path + '.' + process.pid + '.tmp';
  writeFileSync(tmp, text);
  let delay = 1;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        try {
          rmSync(tmp, { force: true });
        } catch {
          /* nothing useful to do */
        }
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
      delay = Math.min(delay * 2, 25);
    }
  }
  throw new Error(`could not replace ${path} after 30 attempts`);
}

let status = null;
function setStatus(patch) {
  status = { ...(status ?? {}), ...patch, heartbeat: new Date().toISOString() };
  writeAtomic(STATUS, JSON.stringify(status, null, 2) + '\n');
}

/**
 * Whether a pid is alive.
 *
 * Three outcomes, all measured on this host: a clean return means alive; ESRCH
 * means dead; EPERM means the process EXISTS but is protected, which must be
 * read as ALIVE. `pid > 0` is checked first because libuv maps pid 0 to the
 * current process, so a zero or corrupted field would read as alive for ever
 * and wedge the lock.
 */
const clients = new Set();

function pidStatus(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return 'invalid';
  }
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (err) {
    if (err.code === 'EPERM') {
      return 'alive';
    }
    return err.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}

// ---------------------------------------------------------------------------
// The lock, and following a live run
// ---------------------------------------------------------------------------

/**
 * Become the run, or return the live one.
 *
 * `listen` on the pipe name is the whole lock. Everything else here is bookkeeping.
 */
function acquire() {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      clients.add(socket);
      socket.on('error', () => clients.delete(socket));
      socket.on('close', () => clients.delete(socket));
      // Replay first, so a late follower still sees the run from its first step.
      try {
        if (existsSync(LOG)) {
          socket.write(readFileSync(LOG, 'utf8'));
        }
      } catch {
        /* the live stream below is still useful */
      }
    });
    server.on('error', err => {
      resolve(
        err.code === 'EADDRINUSE'
          ? { role: 'follower' }
          : { role: 'error', err }
      );
    });
    server.listen(PIPE, () => resolve({ role: 'leader', server }));
  });
}

function follow() {
  return new Promise(resolve => {
    const socket = net.connect(PIPE);
    let carry = '';
    socket.on('data', chunk => {
      carry += chunk.toString('utf8');
      const lines = carry.split('\n');
      carry = lines.pop(); // the trailing line may still be incomplete
      for (const line of lines) {
        if (line.trim()) {
          render(line);
        }
      }
    });
    socket.on('error', () => resolve('no-pipe'));
    socket.on('close', () => resolve('closed'));
  });
}

/**
 * Whether a run is live.
 *
 * It PROBES THE PIPE, because the pipe is the lock. An earlier version read the
 * pid out of `run.lock` — the exact inference the header of this file says can
 * never be trusted. `run.lock` survives `taskkill /F`, SIGTERM, a closed console
 * and a power cut, and `pidStatus` reports EPERM as alive by design, so a stale
 * lock naming a recycled pid made `--follow` poll for ever, printing nothing.
 */
function isRunLive() {
  return new Promise(resolve => {
    const socket = net.connect(PIPE);
    const done = live => {
      socket.destroy();
      resolve(live);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 1000).unref?.();
  });
}

/**
 * The reader an agent can use when it has no access to the pipe.
 *
 * It reads only the CURRENT run's log, because the leader archives the previous
 * one before it starts. Without that, a watcher attaching to a live run was
 * replayed every earlier run first — including their `run-end` lines, which
 * render as "run finished" and would tell an agent the run it just started had
 * already finished and failed.
 */
async function tailFile() {
  if (!existsSync(LOG)) {
    console.log(
      'No run log yet. Start one with: node scripts/run-tasks.mjs --yes'
    );
    return;
  }
  let offset = 0;
  let carry = '';
  let idle = 0;
  for (;;) {
    const size = statSync(LOG).size;
    if (size > offset) {
      idle = 0;
      const fd = openSync(LOG, 'r');
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      closeSync(fd);
      carry += buf.toString('utf8');
      const lines = carry.split('\n');
      carry = lines.pop();
      lines.filter(l => l.trim()).forEach(render);
      offset = size;
    } else {
      idle++;
    }
    // Two stop conditions, so this can never poll for ever: the pipe says no
    // run is live, or nothing has grown for two minutes.
    if (!(await isRunLive()) || idle > 240) {
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

function render(line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return;
  }
  const when = (e.t ?? '').slice(11, 19);
  if (e.type === 'run-start') {
    console.log(`[${when}] run ${e.runId} — ${e.text}`);
  } else if (e.type === 'task-start') {
    console.log(`\n[${when}] START  ${e.id} — ${e.title}`);
  } else if (e.type === 'task-end') {
    console.log(
      `[${when}] ${e.status.toUpperCase().padEnd(6)} ${e.id}  ${e.duration}`
    );
    if (e.error) {
      console.log(`          ${e.error}`);
    }
  } else if (e.type === 'tool') {
    console.log(`[${when}]   ${e.name}`);
  } else if (e.type === 'gate') {
    console.log(`[${when}]   gate ${e.ok ? 'pass' : 'FAIL'}: ${e.command}`);
  } else if (e.type === 'commit') {
    console.log(`[${when}]   commit ${e.sha} ${e.subject}`);
  } else if (e.type === 'note') {
    console.log(`[${when}] ${e.text}`);
  } else if (e.type === 'run-end') {
    console.log(`\n[${when}] run finished: ${e.summary}`);
  } else if (e.type === 'run-error') {
    console.log(`\n[${when}] RUN STOPPED: ${e.error}`);
  }
}

// ---------------------------------------------------------------------------
// Git and gates
// ---------------------------------------------------------------------------

function git(cmdArgs) {
  const r = spawnSync('git', cmdArgs, { cwd: REPO, encoding: 'utf8' });
  return {
    code: r.status,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? '').trim()
  };
}

function treeIsClean() {
  return git(['status', '--porcelain']).out === '';
}

function head() {
  return git(['rev-parse', 'HEAD']).out;
}

/**
 * Git commands the task session may not run.
 *
 * "The runner commits, and it never pushes" was enforced only by a sentence in
 * the prompt, while the session itself ran with every permission check off. A
 * session that committed would also be MISREPORTED: the tree is clean again
 * afterwards, so the runner recorded "the session finished but changed nothing"
 * and left an ungated commit on the branch. This denies the commands, and
 * `runTask` compares HEAD before and after as well, because a denial list is
 * only as good as the pattern.
 */
const DENIED_TOOLS = [
  'Bash(git commit:*)',
  'Bash(git push:*)',
  'Bash(git reset:*)',
  'Bash(git checkout:*)',
  'Bash(git stash:*)',
  'Bash(git rebase:*)'
];

/**
 * Run the project gates inside the container.
 *
 * They cannot run on the host: `jlpm` is not installed there, and neither is a
 * Playwright browser. Every gate goes through the compose service that serves
 * the lab on port 8888 inside the container.
 */
function runGates() {
  for (const command of GATES) {
    const r = spawnSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'jupyter',
        'bash',
        '-lc',
        `cd /workspace && ${command}`
      ],
      { cwd: REPO, encoding: 'utf8', timeout: 30 * 60 * 1000 }
    );
    const ok = r.status === 0;
    publish({ type: 'gate', command, ok });
    if (!ok) {
      const tail = ((r.stdout ?? '') + (r.stderr ?? ''))
        .trim()
        .split('\n')
        .slice(-25)
        .join('\n');
      return { ok: false, command, tail };
    }
  }
  return { ok: true };
}

function claudeIsUsable() {
  const r = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

function containerIsUp() {
  const r = spawnSync(
    'docker',
    ['compose', 'ps', '--status', 'running', '-q'],
    {
      cwd: REPO,
      encoding: 'utf8'
    }
  );
  return r.status === 0 && (r.stdout ?? '').trim() !== '';
}

// ---------------------------------------------------------------------------
// One task
// ---------------------------------------------------------------------------

function buildPrompt(task) {
  return [
    `ultracode`,
    ``,
    `You are running unattended as one step of an autonomous queue. Do task ${task.id} from TODO.md, and nothing else.`,
    ``,
    `Task: ${task.title}`,
    ``,
    `Read these first: TODO.md (the task entry and the rules at the top), CLAUDE.md (the working agreement), and the PRD section that the task names in scope/jupyterlab-design-system-prd.md. Read docs/decisions.md for any D-0NN the task cites.`,
    ``,
    `Rules for this run:`,
    `1. Finish the task so that its "Done when" clause is literally true.`,
    `2. Measure the result in a running JupyterLab, in BOTH modes. The container is already up. Follow the browser-probe recipe in CLAUDE.md.`,
    `3. Update the TODO.md entry: tick it, and write down what you measured, not that you measured it.`,
    `4. Record any decision that contradicts the PRD in docs/decisions.md, and reference the id from the code.`,
    `5. DO NOT COMMIT and DO NOT PUSH. The runner commits after it has checked the gates itself.`,
    `6. Leave the dev instance on the Data4Now Light theme, and write no files into the repository that are not part of the task.`,
    `7. If the task turns out to need a person — a decision, a sign-off, an asset you cannot produce — stop, revert what you changed, and say so plainly. Do not invent the answer.`,
    ``,
    `When you are finished, end your reply with one line: DONE ${task.id} — <one sentence on what changed>.`
  ].join('\n');
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

async function runTask(task) {
  const startedAt = new Date();
  const started = Date.now();
  const record = {
    id: task.id,
    title: task.title,
    start: startedAt.toISOString(),
    duration: '',
    status: 'running',
    error: ''
  };

  publish({ type: 'task-start', id: task.id, title: task.title });
  setStatus({ phase: 'task', task: task.id, startedAt: record.start });

  if (!treeIsClean()) {
    record.status = 'blocked';
    record.error =
      'the working tree was dirty before the task started, so a commit could not be attributed to it';
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  const headBefore = head();
  const sessionId = randomUUID();
  const argv = [
    '-p',
    buildPrompt(task),
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    MODEL,
    '--effort',
    EFFORT,
    '--permission-mode',
    'bypassPermissions',
    '--disallowed-tools',
    ...DENIED_TOOLS,
    '--session-id',
    sessionId,
    '--max-turns',
    String(MAX_TURNS)
  ];

  const result = await new Promise(resolve => {
    // `stdio[0] = 'ignore'` is not a style choice. A stdin pipe that has
    // delivered data and is never closed makes the CLI block for ever —
    // reproduced here with zero output after 185 seconds.
    const child = spawn(CLAUDE_BIN, argv, {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let carry = '';
    let final = null;
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        ok: false,
        reason: `timed out after ${fmtDuration(TASK_TIMEOUT_MS)}`
      });
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', chunk => {
      carry += chunk.toString('utf8');
      const lines = carry.split('\n');
      carry = lines.pop();
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.type === 'result') {
          final = e;
        } else if (e.type === 'assistant') {
          for (const block of e.message?.content ?? []) {
            if (block.type === 'tool_use') {
              publish({ type: 'tool', id: task.id, name: block.name });
            }
          }
        }
      }
    });
    child.stderr.on('data', c => {
      stderr += c.toString('utf8');
    });

    child.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, reason: `could not start claude: ${err.message}` });
    });
    child.on('close', code => {
      clearTimeout(timer);
      writeFileSync(
        join(SESSIONS, `${task.id}.json`),
        JSON.stringify({ sessionId, exitCode: code, final, stderr }, null, 2) +
          '\n'
      );
      if (final === null) {
        // A CLI-level error writes plain text to stderr and NOTHING to stdout.
        // Reporting that text is far more useful than a JSON parse error.
        resolve({
          ok: false,
          reason: `claude produced no result object (exit ${code}): ${stderr.trim().split('\n').slice(-3).join(' ')}`
        });
        return;
      }
      // `is_error`, never `subtype`: a 404 from a bad model name came back as
      // subtype "success" with is_error true.
      const ok = code === 0 && final.is_error === false;
      resolve({
        ok,
        reason: ok
          ? ''
          : `${final.terminal_reason ?? 'failed'}: ${(final.errors ?? [final.result ?? 'no detail']).join('; ')}`,
        final
      });
    });
  });

  if (!result.ok) {
    record.status = 'failed';
    record.error = result.reason;
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  // CHECK HEAD BEFORE THE TREE. A session that committed leaves the tree clean
  // again, so the tree check alone reported "changed nothing" — a false verdict
  // that also hid an ungated commit on the branch and, without --keep-going,
  // stopped the rest of the queue for the wrong reason.
  if (head() !== headBefore) {
    record.status = 'session-committed';
    record.error =
      'the session committed by itself, so the gates never ran against it. Inspect and reset that commit before continuing.';
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  if (treeIsClean()) {
    record.status = 'no-change';
    record.error = 'the session finished but changed nothing';
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  const gates = runGates();
  if (!gates.ok) {
    record.status = 'gate-failed';
    record.error = `${gates.command} failed. The work is left in the tree for inspection.\n${gates.tail}`;
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  const subject = `${task.id}: ${task.title}`.slice(0, 72);
  git(['add', '-A']);
  const commit = git([
    'commit',
    '-m',
    subject,
    '-m',
    `Run by scripts/run-tasks.mjs. Session ${sessionId}. Gates: ${GATES.join(', ')}.`,
    '-m',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>'
  ]);
  if (commit.code !== 0) {
    record.status = 'commit-failed';
    record.error = commit.err || commit.out;
    record.duration = fmtDuration(Date.now() - started);
    publish({ type: 'task-end', ...record });
    return record;
  }

  const sha = git(['rev-parse', '--short', 'HEAD']).out;
  publish({ type: 'commit', id: task.id, sha, subject });
  record.status = 'done';
  record.duration = fmtDuration(Date.now() - started);
  publish({ type: 'task-end', ...record });
  return record;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function reportTable(records) {
  const pad = (s, n) => String(s).padEnd(n);
  const rows = [
    ['Task', 'Start', 'Duration', 'Status'],
    ['----', '-----', '--------', '------'],
    ...records.map(r => [r.id, r.start.slice(11, 19), r.duration, r.status])
  ];
  const widths = [0, 1, 2, 3].map(i =>
    Math.max(...rows.map(r => String(r[i]).length))
  );
  const lines = rows.map(
    r =>
      `| ${pad(r[0], widths[0])} | ${pad(r[1], widths[1])} | ${pad(r[2], widths[2])} | ${pad(r[3], widths[3])} |`
  );
  const failures = records.filter(r => !['done', 'skipped'].includes(r.status));
  if (failures.length) {
    lines.push('', 'Problems:');
    for (const f of failures) {
      lines.push(`  ${f.id} (${f.status}): ${f.error.split('\n')[0]}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadQueue() {
  const q = JSON.parse(readFileSync(QUEUE, 'utf8'));
  return q.tasks.sort((a, b) => a.order - b.order);
}

function selectTasks(all) {
  const chosen = [];
  const skipped = [];
  for (const t of all) {
    if (args.only && t.id !== args.only) {
      continue;
    }
    if (!t.runnable) {
      skipped.push({ ...t, why: `${t.blockerKind}: ${t.reason}` });
      continue;
    }
    if (t.risk === 'high' && !args.includeHighRisk) {
      skipped.push({
        ...t,
        why: `high risk, needs --include-high-risk: ${t.riskReason}`
      });
      continue;
    }
    if (chosen.length >= args.max) {
      break;
    }
    chosen.push(t);
  }
  return { chosen, skipped };
}

function printPlan(chosen, skipped) {
  console.log(`\nRun order (${chosen.length} task(s)):\n`);
  for (const t of chosen) {
    console.log(
      `  ${String(t.order).padStart(3)}  ${t.id.padEnd(7)} ${t.risk.padEnd(7)} ${t.title.slice(0, 60)}`
    );
  }
  console.log(`\nNot attempted (${skipped.length}):\n`);
  for (const t of skipped) {
    console.log(`  ${t.id.padEnd(7)} ${t.why.slice(0, 96)}`);
  }
}

async function main() {
  if (!EFFORT_LEVELS.includes(EFFORT)) {
    console.error(
      `EFFORT must be one of ${EFFORT_LEVELS.join(', ')} — an unknown value is ignored silently.`
    );
    process.exit(2);
  }

  if (args.report) {
    console.log(
      existsSync(REPORT) ? readFileSync(REPORT, 'utf8') : 'No report yet.'
    );
    return;
  }
  if (args.status) {
    console.log(
      existsSync(STATUS) ? readFileSync(STATUS, 'utf8') : '{"phase":"idle"}'
    );
    return;
  }
  if (args.follow) {
    const how = await follow();
    if (how === 'no-pipe') {
      tailFile();
    }
    return;
  }

  const all = loadQueue();
  const { chosen, skipped } = selectTasks(all);

  if (!args.yes) {
    printPlan(chosen, skipped);
    console.log('\nThis was a plan only. Add --yes to run it.');
    console.log(
      'Each task runs with --permission-mode bypassPermissions, which turns off every'
    );
    console.log(
      'permission check for that session. The runner commits on success. It never pushes.'
    );
    return;
  }

  const lock = await acquire();
  if (lock.role === 'error') {
    console.error(`Could not take the run lock: ${lock.err.message}`);
    process.exit(1);
  }
  if (lock.role === 'follower') {
    console.log(
      'A run is already live. Attaching to it instead of starting a second one.\n'
    );
    await follow();
    return;
  }

  isLeader = true;
  RUN_ID = randomUUID();

  // A NEW LOG FOR EVERY RUN. The previous one is archived, not appended to.
  // While the log was shared, every follower that attached was replayed the
  // whole history first — including old `run-end` lines, which render as
  // "run finished: 0 done, 1 failed". An agent watching a run it had just
  // started could read last week's failure as this one's outcome.
  mkdirSync(ARCHIVE, { recursive: true });
  if (existsSync(LOG)) {
    try {
      renameSync(
        LOG,
        join(
          ARCHIVE,
          `${statSync(LOG).mtime.toISOString().replace(/[:.]/g, '-')}.ndjson`
        )
      );
    } catch {
      rmSync(LOG, { force: true });
    }
  }

  // Every exit path from here on says WHY in the state files, not only on a
  // console nobody is watching.
  const stopWith = (phase, error, code) => {
    try {
      publish({ type: 'run-error', error });
      setStatus({ phase, error, runId: RUN_ID });
      writeFileSync(
        REPORT,
        reportTable(records) + `\n\nRun stopped: ${error}\n`
      );
    } catch {
      /* we are already failing; do not fail louder */
    }
    console.error(error);
    process.exit(code);
  };

  let records = [];

  const version = claudeIsUsable();
  if (!version) {
    stopWith(
      'blocked',
      `Could not run ${CLAUDE_BIN} --version. Set CLAUDE_BIN to the Claude Code executable.`,
      1
    );
  }
  if (!containerIsUp()) {
    stopWith(
      'blocked',
      'The dev container is not running. Start it with: docker compose up -d',
      1
    );
  }
  if (!treeIsClean()) {
    stopWith(
      'blocked',
      'The working tree is dirty. Commit or stash first, so each commit belongs to one task.',
      1
    );
  }

  writeFileSync(
    LOCK,
    JSON.stringify(
      {
        pid: process.pid,
        runId: RUN_ID,
        startedAt: new Date().toISOString(),
        pipe: PIPE,
        cwd: REPO
      },
      null,
      2
    ) + '\n'
  );
  const release = () => {
    try {
      rmSync(LOCK, { force: true });
    } catch {
      /* the pipe is the real lock; this file is only metadata */
    }
  };
  process.on('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      release();
      stopWith('interrupted', `the run was stopped by ${signal}`, 130);
    });
  }

  publish({
    type: 'run-start',
    runId: RUN_ID,
    text: `${chosen.length} task(s), claude ${version}, model ${MODEL}, effort ${EFFORT}`
  });
  setStatus({
    phase: 'running',
    runId: RUN_ID,
    total: chosen.length,
    completed: 0
  });

  records = skipped.map(t => ({
    id: t.id,
    title: t.title,
    start: '--:--:--',
    duration: '-',
    status: 'skipped',
    error: t.why
  }));
  // Written before the first task starts, so a watcher never reads the previous
  // run's finished table and takes it for this one's.
  writeFileSync(REPORT, reportTable(records) + '\n');

  let stop = false;
  for (const task of chosen) {
    if (stop) {
      records.push({
        id: task.id,
        title: task.title,
        start: '--:--:--',
        duration: '-',
        status: 'skipped',
        error: 'an earlier task failed and --keep-going was not given'
      });
      continue;
    }
    // A `running` row, so the in-flight task is visible in the table too.
    writeFileSync(
      REPORT,
      reportTable([
        ...records,
        {
          id: task.id,
          title: task.title,
          start: new Date().toISOString().slice(11, 19),
          duration: '…',
          status: 'running',
          error: ''
        }
      ]) + '\n'
    );
    const record = await runTask(task);
    records.push(record);
    setStatus({ completed: records.filter(r => r.status === 'done').length });
    writeFileSync(REPORT, reportTable(records) + '\n');
    if (record.status !== 'done' && !args.keepGoing) {
      stop = true;
    }
  }

  const table = reportTable(records);
  writeFileSync(REPORT, table + '\n');
  const done = records.filter(r => r.status === 'done').length;
  const failed = records.filter(
    r => !['done', 'skipped'].includes(r.status)
  ).length;
  const summary = `${done} done, ${failed} failed, ${records.filter(r => r.status === 'skipped').length} skipped`;
  publish({ type: 'run-end', summary });
  setStatus({ phase: 'finished', summary });

  console.log('\n' + table + '\n');
  console.log(summary);
  if (logFd !== null) {
    closeSync(logFd);
  }
  lock.server.close();
  release();
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  const message = err && err.stack ? err.stack : String(err);
  try {
    publish({ type: 'run-error', error: message.split('\n')[0] });
    setStatus({ phase: 'crashed', error: message.split('\n')[0] });
  } catch {
    /* nothing left to do but print */
  }
  console.error(message);
  process.exit(1);
});
