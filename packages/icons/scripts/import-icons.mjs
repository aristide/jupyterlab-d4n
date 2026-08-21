#!/usr/bin/env node
/**
 * Normalise the design system's SVG export into `packages/icons/svg/`.
 *
 *   node scripts/import-icons.mjs            # rewrite svg/ from design-reference/
 *   node scripts/import-icons.mjs --check    # verify only; no writes (CI)
 *
 * Enforces PRD §7.8.4 mechanically, because the requirements there are the ones
 * a human reviewer cannot check by looking: a literal `#333` in one path of one
 * icon is invisible in review and invisible in light mode, and only shows up as
 * a black-on-black glyph for whoever switches to dark mode first.
 *
 * The rule this script exists to protect is that an icon must inherit its colour
 * from CSS. So every literal colour becomes `currentColor` — and, critically,
 * anything that *looks* like a colour but cannot be rewritten that way (a
 * gradient, a `url(#…)` paint server, an unrecognised keyword) is a hard error.
 * Guessing there would produce an icon that renders, passes review, and is wrong.
 *
 * Deliberately dependency-free: this runs in CI before `yarn install` has any
 * reason to have completed, and an icon pipeline that can break on a transitive
 * dependency of an SVG optimiser is a worse trade than 300 lines of regex.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(dirname(PKG));
const SRC = join(ROOT, 'design-reference', 'data4now', 'icons');
const OUT = join(PKG, 'svg');

const check = process.argv.includes('--check');

/* -------------------------------------------------------------------------- */
/* Colour vocabulary                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Paint values that are already theme-safe. Everything else in a paint position
 * is either rewritten to `currentColor` or reported as unsafe — there is no
 * third branch, which is what makes the "no literal colours" guarantee real.
 *
 * `context-fill`/`context-stroke` are included because they mean "inherit from
 * the <use> context", which is the same delegation `currentColor` performs.
 */
const SAFE_PAINTS = new Set([
  'none',
  'currentcolor',
  'transparent',
  'inherit',
  'initial',
  'unset',
  'context-fill',
  'context-stroke'
]);

// The 148 CSS named colours. Present so that `fill="rebeccapurple"` is
// recognised and rewritten rather than falling through to the unsafe branch.
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
   blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
   cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
   darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
   darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
   darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
   firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod
   gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
   lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
   lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
   lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
   lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
   mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
   mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
   navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
   palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
   powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon
   sandybrown seagreen seashell sienna silver skyblue slateblue slategray
   slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
   wheat white whitesmoke yellow yellowgreen`
    .split(/\s+/)
    .filter(Boolean)
);

const FUNCTIONAL_COLOUR =
  /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\()/i;

// Unanchored twin of the above, for scanning a whole file rather than one value.
const LITERAL_COLOUR_ANYWHERE =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i;

/** Attributes whose value is a paint or a colour. */
const PAINT_ATTRS = [
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
  'color'
];

/**
 * Constructs that cannot survive normalisation and must not be silently kept:
 * every one of them either carries baked colour (`<linearGradient>`) or depends
 * on an `id` we are about to strip (`url(#…)`, `<use href="#…">`). Rewriting any
 * of them to `currentColor` would be the guess this script refuses to make.
 */
const UNSAFE_ELEMENTS =
  /<(linearGradient|radialGradient|pattern|filter|mask|clipPath|use|image|foreignObject)\b/i;

/* -------------------------------------------------------------------------- */
/* Titles (PRD I5)                                                            */
/* -------------------------------------------------------------------------- */

const ACRONYMS = new Set([
  'csv',
  'json',
  'yaml',
  'md',
  'cpu',
  'gpu',
  'mfa',
  'toc',
  'r',
  'ui'
]);

/** `chevron-down` -> `Chevron down`; `yaml-config` -> `YAML config`. */
function titleFor(name) {
  const words = name
    .split('-')
    .map(w => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Classify one paint value.
 *
 * @returns `'safe'`, `'rewrite'`, or `'unsafe'`. The caller turns `'unsafe'`
 *   into a build failure — never into a value.
 */
function classifyPaint(value) {
  const v = value.trim();
  if (v === '') {
    return 'safe';
  }
  if (SAFE_PAINTS.has(v.toLowerCase())) {
    return 'safe';
  }
  if (FUNCTIONAL_COLOUR.test(v) || NAMED_COLOURS.has(v.toLowerCase())) {
    return 'rewrite';
  }
  return 'unsafe';
}

/**
 * Rewrite the colour declarations inside a `style="…"` attribute.
 *
 * Non-colour declarations (`stroke-width`, `opacity`) are preserved untouched —
 * they are geometry and PRD §7.8.4 only bans baked *colour*.
 */
function normaliseStyleAttr(decls, report, unsafe, file) {
  return decls
    .split(';')
    .map(decl => {
      const idx = decl.indexOf(':');
      if (idx < 0) {
        return decl;
      }
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1);
      if (!PAINT_ATTRS.includes(prop)) {
        return decl;
      }
      const verdict = classifyPaint(value);
      if (verdict === 'safe') {
        return decl;
      }
      if (verdict === 'unsafe') {
        unsafe.push(`${file}: style declaration "${prop}:${value.trim()}"`);
        return decl;
      }
      report.push(`${prop}:${value.trim()} -> currentColor (inline style)`);
      return `${decl.slice(0, idx)}:currentColor`;
    })
    .join(';');
}

/**
 * @returns `{ svg, changes, unsafe }` — the normalised source, a human-readable
 *   change list for the console report, and any findings that must fail the run.
 */
function normalise(source, name, file) {
  const changes = [];
  const unsafe = [];
  let svg = source.trim();

  // <style> blocks first: their rules are invisible to the attribute pass below,
  // and once the icon is inlined into the page they leak into every other inlined
  // icon on it (PRD §7.8.4).
  const withoutStyle = svg.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  if (withoutStyle !== svg) {
    changes.push('stripped <style> block');
    svg = withoutStyle;
  }

  const badElement = UNSAFE_ELEMENTS.exec(svg);
  if (badElement) {
    unsafe.push(
      `${file}: <${badElement[1]}> cannot be normalised — it carries baked ` +
        `colour or depends on an id, and rewriting it would be a guess`
    );
  }
  if (/url\(#/.test(svg)) {
    unsafe.push(
      `${file}: url(#…) paint reference survives id stripping broken`
    );
  }

  for (const attr of PAINT_ATTRS) {
    const re = new RegExp(`(\\s${attr}=")([^"]*)(")`, 'gi');
    svg = svg.replace(re, (match, open, value, close) => {
      const verdict = classifyPaint(value);
      if (verdict === 'safe') {
        return match;
      }
      if (verdict === 'unsafe') {
        unsafe.push(`${file}: ${attr}="${value}" is not a recognised paint`);
        return match;
      }
      changes.push(`${attr}="${value}" -> currentColor`);
      return `${open}currentColor${close}`;
    });
  }

  svg = svg.replace(/\sstyle="([^"]*)"/gi, (_match, decls) => {
    const next = normaliseStyleAttr(decls, changes, unsafe, file);
    return ` style="${next}"`;
  });

  // ids collide the moment two icons are inlined into the same document, and
  // LabIcon inlines every icon it renders.
  let idCount = 0;
  svg = svg.replace(/\sid="[^"]*"/gi, () => {
    idCount += 1;
    return '';
  });
  if (idCount > 0) {
    changes.push(`stripped ${idCount} id attribute${idCount === 1 ? '' : 's'}`);
  }

  // PRD I5: the <title> is what a screen reader announces for an icon-only
  // control, so it is required rather than nice to have.
  const rootEnd = svg.indexOf('>');
  if (rootEnd < 0 || !svg.startsWith('<svg')) {
    unsafe.push(`${file}: does not start with an <svg> root element`);
    return { svg, changes, unsafe };
  }
  if (!/<title\b/i.test(svg)) {
    const title = titleFor(name);
    svg = `${svg.slice(0, rootEnd + 1)}<title>${title}</title>${svg.slice(rootEnd + 1)}`;
    changes.push(`added <title>${title}</title>`);
  }

  return { svg: `${svg}\n`, changes, unsafe };
}

/* -------------------------------------------------------------------------- */
/* Drive                                                                      */
/* -------------------------------------------------------------------------- */

if (!existsSync(SRC)) {
  console.error(`Icon source not found: ${SRC}`);
  process.exit(2);
}

const groups = readdirSync(SRC, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort();

if (groups.length === 0) {
  console.error(`No icon groups found under ${SRC}`);
  process.exit(2);
}

// A full rebuild rather than an overwrite, so that an icon deleted upstream also
// disappears here. `--check` never touches the tree.
if (!check && existsSync(OUT)) {
  rmSync(OUT, { recursive: true });
}

const unsafeFindings = [];
const drifted = [];
let total = 0;
let changed = 0;

for (const group of groups) {
  const groupDir = join(SRC, group);
  const files = readdirSync(groupDir)
    .filter(f => f.endsWith('.svg'))
    .sort();
  if (files.length === 0) {
    continue;
  }

  console.log(`\n── ${group}/`);
  if (!check) {
    mkdirSync(join(OUT, group), { recursive: true });
  }

  for (const file of files) {
    const rel = `${group}/${file}`;
    const name = basename(file, '.svg');
    const source = readFileSync(join(groupDir, file), 'utf8');
    const { svg, changes, unsafe } = normalise(source, name, rel);

    total += 1;
    unsafeFindings.push(...unsafe);
    if (changes.length > 0) {
      changed += 1;
    }

    console.log(
      `   ${rel.padEnd(34)} ${changes.length ? changes.join('; ') : 'unchanged'}`
    );

    const dest = join(OUT, group, file);
    if (check) {
      const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      if (current !== svg) {
        drifted.push(rel);
      }
    } else {
      writeFileSync(dest, svg, 'utf8');
    }
  }
}

console.log(
  `\n${total} icons across ${groups.length} groups; ${changed} normalised.`
);

if (unsafeFindings.length > 0) {
  console.error(
    `\n${unsafeFindings.length} value(s) could not be safely rewritten to ` +
      `currentColor. Fix the source asset — this script will not guess:`
  );
  for (const finding of unsafeFindings) {
    console.error(`   ${finding}`);
  }
  process.exit(1);
}

if (check && drifted.length > 0) {
  console.error(
    `\npackages/icons/svg is stale for ${drifted.length} file(s). ` +
      `Run: yarn workspace @d4n/icons run icons:import`
  );
  for (const rel of drifted) {
    console.error(`   ${rel}`);
  }
  process.exit(1);
}

if (!check) {
  // Sanity check the tree we just wrote, so a regex that silently stopped
  // matching cannot ship a literal colour (PRD I2).
  const offenders = [];
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.endsWith('.svg')) {
        const body = readFileSync(path, 'utf8');
        if (LITERAL_COLOUR_ANYWHERE.test(body)) {
          offenders.push(`${path} (literal colour)`);
        }
        if (!/<title\b/i.test(body)) {
          offenders.push(`${path} (no <title>)`);
        }
      }
    }
  };
  walk(OUT);
  if (offenders.length > 0) {
    console.error('\nPost-write verification failed:');
    for (const o of offenders) {
      console.error(`   ${o}`);
    }
    process.exit(1);
  }
  console.log(`Wrote ${total} icons to ${OUT}`);
}
