#!/usr/bin/env node
/**
 * Token build. Reads the four Tier 1-3 source files plus mapping/jp-adapter.yaml
 * and emits everything downstream consumes:
 *
 *   style/generated/tokens.css      Tiers 1-3, mode-scoped
 *   style/generated/jp-adapter.css  Tier 4 - the --jp-* surface
 *   style/generated/ansi.css        the 32-selector rendermime ANSI block
 *   src/generated/tokens.ts         typed, FULLY RESOLVED values per mode
 *   dist/tokens.json                resolved dump, for the contrast audit + docs
 *
 * The outputs are COMMITTED, not gitignored. PRD 7.2 wants a token change to
 * arrive as a reviewable CSS diff on a PR - designers never touch CSS, but
 * somebody still has to see what their change did. CI enforces freshness by
 * rebuilding and asserting a clean tree, which is stronger than a lint rule
 * against hand-editing.
 *
 * ============================================================================
 * TWO STRUCTURAL DECISIONS ARE ENCODED HERE. Both are easy to "simplify" back
 * into a bug, so they are spelled out. See docs/decisions.md D-001 and D-003.
 * ============================================================================
 *
 * (1) TIERS 2, 3 AND 4 EMIT ONTO `body`, NOT `:root`.
 *
 *     PRD 5.2 sketches ":root { Tier 1, Tier 3, Tier 4 }". Taken literally that
 *     produces a stylesheet where nothing resolves. A custom property whose
 *     value contains var() is substituted at computed-value time ON THE ELEMENT
 *     WHERE IT IS DECLARED. Tier 2 is mode-scoped onto <body> (it has to be:
 *     JupyterLab sets data-jp-theme-light there, and menus portal to
 *     document.body so a shell-scoped selector would miss them entirely - PRD
 *     8.4.1(1), R13). So a Tier-3 property declared on :root, referencing a
 *     Tier-2 property that exists only on body, resolves against nothing,
 *     becomes the guaranteed-invalid value, and inherits down as garbage.
 *
 *     Tier 1 stays on :root - it is all literals, nothing to resolve. Tiers 2,
 *     3 and 4 go on body, where Tier 2 lives.
 *
 * (2) EVERY TIER 2/3/4 RULE IS GATED ON `[data-jp-theme-name^='Data4Now']`.
 *
 *     PRD AC10 requires that a user can still switch to a stock JupyterLab
 *     theme. Tier 4 assigns --jp-* on body; body wins over the :root where core
 *     themes declare theirs. Without the gate, our adapter would keep
 *     overriding JupyterLab Light after the user explicitly selected it - the
 *     redesign would be unremovable, which AC10 calls a bug.
 *
 *     JupyterLab writes the ACTIVE theme's registered name into
 *     data-jp-theme-name, so the gate is pure CSS with no JS and no flash.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE));
const SRC = join(HERE, 'src');
const DIST = join(HERE, 'dist');
const GEN_CSS = join(HERE, 'style', 'generated');
const GEN_TS = join(HERE, 'src', 'generated');
const MAPPING = join(REPO, 'mapping', 'jp-adapter.yaml');
const MANIFEST = join(REPO, 'mapping', 'jp-variables.manifest.json');

const PREFIX = '--d4n';
/** Matches both registered theme names, and nothing a stock theme sets. */
const GATE = "body[data-jp-theme-name^='Data4Now']";
const GATE_DARK = `${GATE}[data-jp-theme-light='false']`;

const errors = [];
const warnings = [];
const fail = m => errors.push(m);
const warn = m => warnings.push(m);

// ---------------------------------------------------------------------------
// Load + flatten
// ---------------------------------------------------------------------------

const read = name => JSON.parse(readFileSync(join(SRC, name), 'utf8'));

/**
 * Flatten a DTCG tree into path -> {value, description}. Keys beginning with
 * `$` are metadata, not tokens; a node is a token exactly when it carries
 * `$value`.
 */
function flatten(tree, prefix = [], out = new Map()) {
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith('$')) {
      continue;
    }
    if (node && typeof node === 'object' && '$value' in node) {
      out.set([...prefix, key].join('.'), {
        value: String(node.$value),
        description: node.$description ?? '',
        type: node.$type ?? 'other'
      });
    } else if (node && typeof node === 'object') {
      flatten(node, [...prefix, key], out);
    }
  }
  return out;
}

const tier1 = flatten(read('primitives.tokens.json'));
const light = flatten(read('semantic-light.tokens.json'));
const dark = flatten(read('semantic-dark.tokens.json'));
const tier3 = flatten(read('components.tokens.json'));

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

// PRD 5.2 rule 4: every Tier-2 token has a light value and a dark value.
// Missing either fails the build - a half-defined semantic token is a surface
// that renders correctly in one mode and is invisible in the other, which is
// exactly the class of bug G2 exists to prevent.
for (const key of light.keys()) {
  if (!dark.has(key)) {
    fail(`Tier 2 asymmetry: "${key}" is defined in light but not dark.`);
  }
}
for (const key of dark.keys()) {
  if (!light.has(key)) {
    fail(`Tier 2 asymmetry: "${key}" is defined in dark but not light.`);
  }
}

const REF = /\{([^}]+)\}/g;
const refsIn = value => [...String(value).matchAll(REF)].map(m => m[1]);

/** Resolve {refs} recursively against a chain of lookup maps. */
function resolve(value, maps, trail = []) {
  return String(value).replace(REF, (_, path) => {
    if (trail.includes(path)) {
      fail(`Token reference cycle: ${[...trail, path].join(' -> ')}`);
      return 'CYCLE';
    }
    for (const map of maps) {
      if (map.has(path)) {
        return resolve(map.get(path).value, maps, [...trail, path]);
      }
    }
    fail(
      `Unresolved token reference "{${path}}"${trail.length ? ` (via ${trail.join(' -> ')})` : ''}`
    );
    return 'UNRESOLVED';
  });
}

// PRD 5.2 rule 3: component CSS consumes Tier 3, never Tier 1. A Tier-1
// reference from Tier 3 means a component hardcoded a palette step and will not
// follow a mode switch.
for (const [key, token] of tier3) {
  for (const ref of refsIn(token.value)) {
    const isTier1 = tier1.has(ref);
    const isTier2 = light.has(ref);
    // font/space/radius/motion/density/border primitives are structural, not
    // colour, and Tier 3 is where sizes legitimately live - the rule is about
    // COLOUR leaking past the semantic layer.
    const structural = /^(font|space|radius|border|motion|density)\./.test(ref);
    if (isTier1 && !isTier2 && !structural) {
      fail(
        `Tier 3 "${key}" references the Tier 1 colour "{${ref}}" directly. ` +
          `Route it through a Tier 2 semantic token so it can differ per mode.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Emit CSS
// ---------------------------------------------------------------------------

/**
 * Token path -> CSS custom property name.
 *
 * Dots become dashes AND camelCase becomes kebab-case, so `color.ansi.brightRed`
 * is `--d4n-color-ansi-bright-red`, not `--d4n-color-ansi-brightRed`. Custom
 * properties are case-SENSITIVE, so a half-kebab convention means every author
 * has to remember which segments came from a camelCase token path — and a
 * misremembered name is not an error, it is a silently unstyled surface.
 *
 * NOTE the asymmetry, because it catches people: the TypeScript export in
 * `src/generated/tokens.ts` keeps the ORIGINAL camelCase (`t.color.ansi.brightRed`),
 * because that is idiomatic JS and the property names are checked by the
 * compiler anyway. Only the CSS side is kebab-cased. Nothing checks a CSS
 * custom property name at build time, which is exactly why
 * `tests/lint/lint-var-names.mjs` exists — it resolves every `var(--d4n-*)`
 * against what is actually declared. That lint was added after this rename
 * silently broke 56 references, including focus rings that collapsed to
 * `outline: none`.
 */
const cssName = path =>
  `${PREFIX}-${path
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()}`;

/** Rewrite {refs} into var() so the CSS keeps the indirection at runtime. */
const cssValue = value =>
  String(value).replace(REF, (_, path) => `var(${cssName(path)})`);

function block(selector, entries, { literal = false } = {}) {
  const lines = [...entries]
    .map(([key, token]) => {
      const value = literal
        ? resolve(token.value, [tier1])
        : cssValue(token.value);
      return `  ${cssName(key)}: ${value};`;
    })
    .join('\n');
  return `${selector} {\n${lines}\n}\n`;
}

const header = `/* GENERATED by packages/tokens/build.mjs - DO NOT EDIT.
 * Source: packages/tokens/src/*.tokens.json + mapping/jp-adapter.yaml
 * Edit those, then run \`jlpm build:tokens\`.
 * tests/contrast/lint-literals.mjs fails CI if this file is hand-edited.
 */\n\n`;

const tokensCss =
  header +
  '/* ---- TIER 1: primitives. Literals, mode-independent. ---- */\n' +
  block(':root', tier1, { literal: true }) +
  '\n/* ---- TIER 2: semantic, LIGHT. ---- */\n' +
  block(GATE, light) +
  '\n/* ---- TIER 2: semantic, DARK. Higher specificity, so it wins. ---- */\n' +
  block(GATE_DARK, dark) +
  '\n/* ---- TIER 3: component. Mode-independent; same scope as Tier 2 (see D-001). ---- */\n' +
  block(GATE, tier3);

// ---------------------------------------------------------------------------
// Tier 4 - the adapter
// ---------------------------------------------------------------------------

let adapterCss =
  header + '/* ---- TIER 4: the --jp-* adapter surface. ---- */\n';
let mappingRows = [];

if (!existsSync(MAPPING)) {
  warn(`mapping/jp-adapter.yaml not found - Tier 4 will be empty.`);
  adapterCss += `${GATE} {\n  /* no mapping file */\n}\n`;
} else {
  const doc = parseYaml(readFileSync(MAPPING, 'utf8'));
  mappingRows = doc?.mappings ?? [];
  const excluded = new Set(doc?.excluded ?? []);
  const seen = new Set();
  const lines = [];

  for (const row of mappingRows) {
    if (!row?.jp || !row?.token) {
      fail(`mapping row missing "jp" or "token": ${JSON.stringify(row)}`);
      continue;
    }
    // PRD 7.2: every entry requires a rationale. The mapping table is the
    // contract between design and engineering; an unexplained row is a
    // decision nobody can review or revisit.
    if (!row.rationale) {
      fail(`mapping row "${row.jp}" has no rationale.`);
    }
    if (seen.has(row.jp)) {
      fail(`mapping defines "${row.jp}" twice.`);
    }
    seen.add(row.jp);
    // PRD Appendix A: --jp-private-* is explicitly not public API.
    if (row.jp.startsWith('--jp-private-')) {
      fail(`mapping targets the private variable "${row.jp}". Not public API.`);
    }
    const known =
      tier1.has(row.token) || light.has(row.token) || tier3.has(row.token);
    if (!known && !row.literal) {
      fail(`mapping "${row.jp}" points at unknown token "${row.token}".`);
      continue;
    }
    const value = row.literal ? row.token : `var(${cssName(row.token)})`;
    lines.push(`  ${row.jp}: ${value};`);
  }

  adapterCss += `${GATE} {\n${lines.join('\n')}\n}\n`;

  // PRD 7.2 / AC5: unmapped --jp-* variables fail the build with a list. The
  // manifest is produced by booting the target JupyterLab and enumerating the
  // computed --jp-* set (tests/galata/extract-jp-variables.mjs); it is absent
  // on a fresh clone, which downgrades this to a warning rather than blocking
  // a first build.
  if (existsSync(MANIFEST)) {
    const all = JSON.parse(readFileSync(MANIFEST, 'utf8')).variables ?? [];
    const missing = all.filter(
      v => !seen.has(v) && !excluded.has(v) && !v.startsWith('--jp-private-')
    );
    if (missing.length) {
      fail(
        `${missing.length} --jp-* variable(s) consumed by JupyterLab have no ` +
          `mapping entry (PRD AC5):\n    ${missing.join('\n    ')}`
      );
    }
  } else {
    warn(
      'mapping/jp-variables.manifest.json not found - adapter COMPLETENESS is ' +
        'unverified. Generate it with `jlpm test:selectors --extract-vars` ' +
        'against the target JupyterLab (TODO P0-03).'
    );
  }
}

// ---------------------------------------------------------------------------
// Resolved values, per mode - for the T4 bridges and the contrast audit
// ---------------------------------------------------------------------------

function resolveAll(semantic) {
  const chain = [semantic, tier1, tier3];
  const out = {};
  for (const [key, token] of semantic) {
    out[key] = resolve(token.value, chain);
  }
  for (const [key, token] of tier3) {
    out[key] = resolve(token.value, chain);
  }
  for (const [key, token] of tier1) {
    out[key] = resolve(token.value, [tier1]);
  }
  return out;
}

const resolved = { light: resolveAll(light), dark: resolveAll(dark) };

/** Turn a dotted path map into a nested object with camelCase leaves. */
function nest(flatMap) {
  const root = {};
  for (const [path, value] of Object.entries(flatMap)) {
    const parts = path.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part];
    }
    node[parts.at(-1)] = value;
  }
  return root;
}

const tsPayload = { light: nest(resolved.light), dark: nest(resolved.dark) };

const tokensTs = `${header.replace(/\/\*|\*\//g, m => (m === '/*' ? '/*' : '*/'))}
/**
 * Fully RESOLVED token values, per mode.
 *
 * This is the bridge that stops the terminal being one shade off from the
 * notebook (PRD 7.2). The JS-driven surfaces - xterm.js, both Lumino DataGrids,
 * the CodeMirror 6 theme - cannot read CSS custom properties, so they read the
 * same numbers from here that tokens.css writes into CSS.
 */
export type D4nMode = 'light' | 'dark';

export const d4n = ${JSON.stringify(tsPayload, null, 2)} as const;

export type D4nTokens = (typeof d4n)['light'];

/** Pick the palette for a mode. \`IThemeManager.isLight(name)\` supplies the flag. */
export function tokensFor(isLight: boolean): D4nTokens {
  return (isLight ? d4n.light : d4n.dark) as D4nTokens;
}
`;

// ---------------------------------------------------------------------------
// The rendermime ANSI block - generated, never hand-written (PRD 8.7.2 / T1)
// ---------------------------------------------------------------------------

const ANSI_SLOTS = [
  ['black', 'black'],
  ['red', 'red'],
  ['green', 'green'],
  ['yellow', 'yellow'],
  ['blue', 'blue'],
  ['magenta', 'magenta'],
  ['cyan', 'cyan'],
  ['white', 'white']
];

function ansiBlock() {
  const rules = [];
  // Flat descendant selectors, NOT native CSS nesting. Nesting is supported by
  // every browser in PRD §4.2's target list, but this stylesheet also has to
  // survive css-loader in the labextension build and stylelint-csstree-validator
  // in CI, and neither is guaranteed to understand it. There is no upside here
  // worth that risk.
  for (const [slot, tokenName] of ANSI_SLOTS) {
    const base = cssName(`color.ansi.${tokenName}`);
    const bright = cssName(
      `color.ansi.bright${tokenName[0].toUpperCase()}${tokenName.slice(1)}`
    );
    rules.push(`${GATE} .ansi-${slot}-fg { color: var(${base}); }`);
    rules.push(`${GATE} .ansi-${slot}-bg { background-color: var(${base}); }`);
    rules.push(`${GATE} .ansi-${slot}-intense-fg { color: var(${bright}); }`);
    rules.push(
      `${GATE} .ansi-${slot}-intense-bg { background-color: var(${bright}); }`
    );
  }
  const bg = cssName('color.ansi.background');
  const fg = cssName('color.ansi.foreground');
  rules.push(`${GATE} .ansi-default-inverse-fg { color: var(${bg}); }`);
  rules.push(
    `${GATE} .ansi-default-inverse-bg { background-color: var(${fg}); }`
  );
  return rules.join('\n');
}

const ansiCss =
  header +
  `/* The rendermime half of the single ANSI source (PRD 8.7.2, R15). The other
 * half - the xterm.js theme object - is built from the SAME token group in
 * packages/shell-chrome/src/terminalBridge.ts, out of src/generated/tokens.ts.
 * Neither is hand-written, so they cannot drift.
 *
 * These sit inside the theme gate so selecting a stock theme restores stock
 * ANSI colours along with everything else (AC10).
 */\n` +
  `${ansiBlock()}\n`;

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

if (errors.length) {
  console.error('\nToken build FAILED:\n');
  for (const e of errors) {
    console.error(`  x ${e}`);
  }
  console.error('');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
mkdirSync(GEN_CSS, { recursive: true });
mkdirSync(GEN_TS, { recursive: true });
writeFileSync(join(GEN_CSS, 'tokens.css'), tokensCss);
writeFileSync(join(GEN_CSS, 'jp-adapter.css'), adapterCss);
writeFileSync(join(GEN_CSS, 'ansi.css'), ansiCss);
writeFileSync(join(GEN_TS, 'tokens.ts'), tokensTs);
writeFileSync(
  join(DIST, 'tokens.json'),
  JSON.stringify(
    {
      generated: 'packages/tokens/build.mjs',
      tiers: {
        primitives: Object.fromEntries(
          [...tier1].map(([k, v]) => [k, v.value])
        ),
        components: Object.fromEntries([...tier3].map(([k, v]) => [k, v.value]))
      },
      resolved,
      mappingCount: mappingRows.length
    },
    null,
    2
  )
);

for (const w of warnings) {
  console.warn(`  ! ${w}`);
}
console.log(
  `tokens: ${tier1.size} primitives, ${light.size} semantic x2 modes, ` +
    `${tier3.size} component, ${mappingRows.length} adapter rows -> dist/`
);
