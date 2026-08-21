#!/usr/bin/env node
/**
 * Run one npm script across every workspace package, in dependency order.
 *
 *   node scripts/run-workspaces.mjs build:lib
 *   node scripts/run-workspaces.mjs --parallel watch:labextension
 *
 * Why not `yarn workspaces foreach`: that command lives in the `workspace-tools`
 * plugin, which is NOT guaranteed to be present in the yarn build that ships
 * inside `jlpm`. `yarn workspace <name> run <script>` is core yarn and works
 * everywhere, so this script drives the fan-out itself.
 *
 * Ordering is topological over intra-repo (`@d4n/*`) dependencies, which is
 * load-bearing: `@d4n/tokens` generates the CSS and the typed `tokens.ts` that
 * every other package imports, so a package built before it compiles against a
 * stale — or missing — dist. Packages with no ordering relationship still run
 * sequentially, because a parallel `tsc` fan-out interleaves its output into an
 * unreadable mess; pass --parallel for the watch scripts, where that is the
 * point.
 *
 * Packages that do not define the requested script are skipped silently — that
 * is how `@d4n/tokens` (a plain library, not a labextension) sits out
 * `build:labextension` without needing a stub.
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES_DIR = join(ROOT, 'packages');

const args = process.argv.slice(2);
const parallel = args.includes('--parallel');
const script = args.find(a => !a.startsWith('--'));

if (!script) {
  console.error(
    'usage: node scripts/run-workspaces.mjs [--parallel] <npm-script>'
  );
  process.exit(2);
}

/** Read every workspace package.json under packages/. */
function readPackages() {
  const out = new Map();
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = join(PACKAGES_DIR, entry.name, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    out.set(manifest.name, {
      name: manifest.name,
      dir: entry.name,
      scripts: manifest.scripts ?? {},
      deps: Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
        ...(manifest.peerDependencies ?? {})
      })
    });
  }
  return out;
}

/**
 * Depth-first topological sort. Throws on a cycle rather than silently
 * producing an order that builds something against a stale dist — a cycle
 * between these packages is a design error, not a condition to route around.
 */
function topoSort(packages) {
  const sorted = [];
  const state = new Map(); // name -> 'visiting' | 'done'

  const visit = (name, trail) => {
    if (state.get(name) === 'done') {
      return;
    }
    if (state.get(name) === 'visiting') {
      throw new Error(
        `Dependency cycle between workspace packages: ${[...trail, name].join(' -> ')}`
      );
    }
    state.set(name, 'visiting');
    for (const dep of packages.get(name).deps) {
      if (packages.has(dep)) {
        visit(dep, [...trail, name]);
      }
    }
    state.set(name, 'done');
    sorted.push(packages.get(name));
  };

  // Sort the roots by name so the order is deterministic across machines,
  // rather than inheriting readdir order.
  for (const name of [...packages.keys()].sort()) {
    visit(name, []);
  }
  return sorted;
}

function run(pkg) {
  return new Promise((resolve, reject) => {
    const label = `${pkg.name} :: ${script}`;
    console.log(`\n── ${label}`);
    const child = spawn('yarn', ['workspace', pkg.name, 'run', script], {
      cwd: ROOT,
      stdio: 'inherit',
      // Needed on Windows, where `yarn` resolves to yarn.cmd and cannot be
      // exec'd directly; harmless on Linux/macOS.
      shell: true
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} failed with exit code ${code}`))
    );
  });
}

const packages = readPackages();
if (packages.size === 0) {
  console.error(`No workspace packages found under ${PACKAGES_DIR}`);
  process.exit(1);
}

const targets = topoSort(packages).filter(p => p.scripts[script]);

if (targets.length === 0) {
  console.log(`No workspace package defines "${script}" — nothing to do.`);
  process.exit(0);
}

try {
  if (parallel) {
    await Promise.all(targets.map(run));
  } else {
    for (const pkg of targets) {
      await run(pkg);
    }
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
