#!/usr/bin/env node
/**
 * Copy the root install.json into every built federated extension directory.
 *
 * `jupyter labextension list` reads install.json to tell a user how to uninstall
 * an extension; without it, all eight D4N extensions report as installed by an
 * unknown manager and `jupyter labextension uninstall` gives unhelpful advice.
 *
 * This is a build step rather than a `shared-data` mapping in pyproject.toml
 * because eight destinations need the same source file, and TOML has no way to
 * express that — the key would have to repeat.
 *
 * Idempotent; safe to run on every build.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, 'install.json');
const SCOPE_DIR = join(ROOT, 'jupyterlab_d4n', 'labextensions', '@d4n');

if (!existsSync(SOURCE)) {
  console.error(`stamp-install-json: missing ${SOURCE}`);
  process.exit(1);
}

if (!existsSync(SCOPE_DIR)) {
  // Nothing has been built yet. Not an error — `clean` then `stamp` is a valid
  // sequence, and failing here would break the clean build.
  console.log('stamp-install-json: no built labextensions yet, skipping.');
  process.exit(0);
}

const payload = readFileSync(SOURCE, 'utf8');
let count = 0;

for (const entry of readdirSync(SCOPE_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const target = join(SCOPE_DIR, entry.name, 'install.json');
  writeFileSync(target, payload);
  count += 1;
}

console.log(
  `stamp-install-json: wrote install.json into ${count} extension(s).`
);
