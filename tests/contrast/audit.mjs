#!/usr/bin/env node
/**
 * Automated contrast audit (PRD §10.2).
 *
 * Parses the resolved token dump and asserts a WCAG ratio for every
 * foreground/background pairing the design actually produces. It runs on token
 * changes, pre-merge, and it is the cheapest possible place to catch a contrast
 * failure — before a single line of CSS is written, let alone screenshotted.
 *
 * Gates implemented: A1 (body text 4.5:1), A2 (large text 3:1), A3 (UI
 * boundaries and state indicators 3:1), A4 (syntax tokens 4.5:1 against the
 * editor background — "this is where most dark themes fail").
 *
 *   node tests/contrast/audit.mjs           # fail on any violation
 *   node tests/contrast/audit.mjs --report  # print the full table, always exit 0
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DUMP = join(REPO, 'packages', 'tokens', 'dist', 'tokens.json');

const reportOnly = process.argv.includes('--report');

if (!existsSync(DUMP)) {
  console.error(
    `Token dump not found at ${DUMP}. Run \`jlpm build:tokens\` first.`
  );
  process.exit(1);
}
const { resolved } = JSON.parse(readFileSync(DUMP, 'utf8'));

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

function parse(value) {
  if (!value || value === 'transparent' || value === 'none') {
    return null;
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split('')
            .map(c => c + c)
            .join('')
        : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1
    };
  }
  const rgba =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(
      value.trim()
    );
  if (rgba) {
    return {
      r: +rgba[1],
      g: +rgba[2],
      b: +rgba[3],
      a: rgba[4] === undefined ? 1 : +rgba[4]
    };
  }
  return null;
}

/** Composite a possibly-translucent colour over an opaque backdrop. */
function over(fg, bg) {
  if (fg.a >= 1) {
    return fg;
  }
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  };
}

const channel = v => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = c =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

function contrast(fgValue, bgValue) {
  const bg = parse(bgValue);
  const fgRaw = parse(fgValue);
  if (!bg || !fgRaw) {
    return null;
  }
  const fg = over(fgRaw, over(bg, { r: 255, g: 255, b: 255, a: 1 }));
  const opaqueBg = over(bg, { r: 255, g: 255, b: 255, a: 1 });
  const l1 = luminance(fg);
  const l2 = luminance(opaqueBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// The pairings
// ---------------------------------------------------------------------------

/**
 * Which surfaces each text role can actually land on.
 *
 * This is per-ROLE rather than one blanket matrix, because a blanket matrix
 * audits pairings the design never produces and then pressures the palette to
 * satisfy them. `surface.active` is a momentary pressed fill: what sits on it
 * is a control label (primary) or an icon — never a timestamp or a placeholder.
 * Auditing muted-on-active would force the muted token dark enough to stop
 * reading as muted, to fix a combination that does not occur.
 *
 * The rule for adding a row here: if you can point at a surface in the running
 * application where this role's text renders, it belongs. If you cannot, it
 * does not.
 */
const TEXT_ROLE_SURFACES = {
  // Titles and control labels — these genuinely appear everywhere.
  strong: [
    'canvas',
    'raised',
    'sunken',
    'overlay',
    'hover',
    'active',
    'selected'
  ],
  primary: [
    'canvas',
    'raised',
    'sunken',
    'overlay',
    'hover',
    'active',
    'selected'
  ],
  // Inactive tab labels, sidebar section headers, TOC levels 4-6.
  secondary: ['canvas', 'raised', 'sunken', 'overlay', 'hover', 'selected'],
  // Placeholders, timestamps, menu shortcut hints, type badges.
  muted: ['canvas', 'raised', 'sunken', 'overlay', 'hover'],
  link: ['canvas', 'raised', 'sunken', 'overlay', 'hover']
};

const SYNTAX = [
  'keyword',
  'controlKeyword',
  'name',
  'function',
  'property',
  'type',
  'number',
  'string',
  'regexp',
  'operator',
  'comment',
  'meta',
  'heading',
  'link',
  'invalid'
].map(k => `color.syntax.${k}`);

/**
 * ANSI slots 1-6 and 9-14 carry the full 4.5:1 gate. Slots 0/7/8/15 are the
 * ACHROMATIC ANCHORS: they are supposed to sit near the background — that is
 * what makes `ls --color` and `git diff` read correctly — so they are audited
 * at an advisory 3:1 and reported, not hard-gated.
 *
 * This is a deliberate, documented narrowing of PRD T4 ("all 16 must pass
 * 4.5:1"), which is arithmetically unsatisfiable in BOTH modes: ANSI black
 * cannot clear 4.5:1 against a dark terminal background, and ANSI white cannot
 * clear it against a light one. See docs/decisions.md D-002 and the open
 * question in TODO.md.
 */
const ANSI_CHROMATIC = [
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan'
];
/**
 * The four achromatic slots split by mode. The pair NEAREST the background is
 * supposed to sit near it — ANSI white in a light terminal, ANSI black in a
 * dark one — so it gets a "not literally invisible" floor of 1.5:1. The pair at
 * the FAR end is real foreground text and carries the full 4.5:1 gate.
 */
const ANSI_ANCHORS = {
  light: { near: ['white', 'brightWhite'], far: ['black', 'brightBlack'] },
  dark: { near: ['black', 'brightBlack'], far: ['white', 'brightWhite'] }
};

function buildChecks(mode, t) {
  const checks = [];
  const add = (gate, min, fg, bg, label, advisory = false) =>
    checks.push({ mode, gate, min, fg, bg, label, advisory });

  // --- A1: body text on every surface it can land on ---------------------
  for (const [role, surfaces] of Object.entries(TEXT_ROLE_SURFACES)) {
    for (const surface of surfaces) {
      add(
        'A1',
        4.5,
        t[`color.text.${role}`],
        t[`color.surface.${surface}`],
        `text.${role} on surface.${surface}`
      );
    }
  }

  // --- A1: foreground/intent pairs ---------------------------------------
  add(
    'A1',
    4.5,
    t['color.text.onAction'],
    t['color.action.default'],
    'text.onAction on action.default'
  );
  add(
    'A1',
    4.5,
    t['color.text.onBrand'],
    t['color.brand.default'],
    'text.onBrand on brand.default'
  );
  add(
    'A1',
    4.5,
    t['color.text.onDanger'],
    t['color.danger.default'],
    'text.onDanger on danger.default'
  );
  add(
    'A1',
    4.5,
    t['color.text.onWarning'],
    t['color.warning.default'],
    'text.onWarning on warning.default'
  );
  add(
    'A1',
    4.5,
    t['color.text.onSuccess'],
    t['color.success.default'],
    'text.onSuccess on success.default'
  );
  add(
    'A1',
    4.5,
    t['color.search.selectedMatchFg'],
    t['color.search.selectedMatchBg'],
    'search.selectedMatchFg on selectedMatchBg'
  );

  // --- A1: the dark application frame, in BOTH modes ---------------------
  // The top panel and rails do not follow the mode (see color.chrome). That
  // makes them the easiest surface in the design to leave unaudited, because
  // they are not part of either mode's text ramp.
  add(
    'A1',
    4.5,
    t['color.chrome.topPanelFg'],
    t['color.chrome.topPanelBg'],
    'chrome.topPanelFg on topPanelBg'
  );
  add(
    'A1',
    4.5,
    t['color.chrome.topPanelFgMuted'],
    t['color.chrome.topPanelBg'],
    'chrome.topPanelFgMuted (menu-bar items at rest) on topPanelBg'
  );
  add(
    'A1',
    4.5,
    t['color.chrome.railFg'],
    t['color.chrome.railBg'],
    'chrome.railFg on railBg'
  );
  add(
    'A1',
    4.5,
    t['color.chrome.railFgHover'],
    t['color.chrome.railBg'],
    'chrome.railFgHover on railBg'
  );
  // The rail's active icon is a state indicator carrying meaning, and it is
  // also the only always-visible, never-labelled control in the product.
  add(
    'A3',
    3,
    t['color.chrome.railFgActive'],
    t['color.chrome.railBg'],
    'chrome.railFgActive (active rail icon) on railBg'
  );
  add(
    'A3',
    3,
    t['color.chrome.topPanelAccent'],
    t['color.chrome.topPanelBg'],
    'chrome.topPanelAccent (teal pillar) on topPanelBg'
  );

  // --- A1: inverse surfaces (tooltips, drag image) -----------------------
  add(
    'A1',
    4.5,
    t['color.text.inverse0'],
    t['color.surface.inverse0'],
    'text.inverse0 on surface.inverse0'
  );
  add(
    'A1',
    4.5,
    t['color.text.inverse1'],
    t['color.surface.inverse0'],
    'text.inverse1 on surface.inverse0'
  );

  // --- A1: log console level badges (PRD §8.5.3) -------------------------
  for (const level of ['critical', 'error', 'warning', 'info', 'debug']) {
    add(
      'A1',
      4.5,
      t[`color.log.${level}`],
      t['color.surface.raised'],
      `log.${level} on surface.raised`
    );
  }

  // --- A1: intent text used as foreground on chrome ----------------------
  for (const intent of ['danger', 'warning', 'success', 'info']) {
    add(
      'A1',
      4.5,
      t[`color.${intent}.default`],
      t['color.surface.raised'],
      `${intent}.default on surface.raised`
    );
    add(
      'A1',
      4.5,
      t[`color.${intent}.default`],
      t['color.surface.canvas'],
      `${intent}.default on surface.canvas`
    );
  }
  // Error output renders danger-coloured text on the danger-faint block.
  add(
    'A1',
    4.5,
    t['color.text.primary'],
    t['color.danger.faint'],
    'text.primary on danger.faint (error output)'
  );

  // The launcher's "No kernels found" block (PRD 8.11.5, TODO P2-15) is the
  // only surface that prints three kinds of text on `warning.faint`: a title,
  // a hint and a documentation link. None of the three is covered by the
  // TEXT_ROLE_SURFACES loop above, because `warning.faint` is an intent tint
  // and not a `surface.*`. The glyph beside them is non-text, so it takes A3.
  add(
    'A1',
    4.5,
    t['color.text.primary'],
    t['color.warning.faint'],
    'text.primary on warning.faint (launcher no-kernels title)'
  );
  add(
    'A1',
    4.5,
    t['color.text.muted'],
    t['color.warning.faint'],
    'text.muted on warning.faint (launcher no-kernels hint)'
  );
  add(
    'A1',
    4.5,
    t['color.text.link'],
    t['color.warning.faint'],
    'text.link on warning.faint (launcher no-kernels link)'
  );
  add(
    'A3',
    3,
    t['color.warning.default'],
    t['color.warning.faint'],
    'warning.default on warning.faint (launcher no-kernels glyph)'
  );
  // VIS, not A3, and the reason is the one stated at the A3 block below: 1.4.11
  // gates the boundary that IDENTIFIES a component. The no-kernels block is
  // identified by its tint, its glyph and its title, all three of which carry a
  // real gate above. The border only has to be separable from the canvas.
  add(
    'VIS',
    1.04,
    t['color.warning.subtle'],
    t['color.surface.canvas'],
    'warning.subtle border vs surface.canvas (launcher no-kernels block)'
  );

  // --- A1: the completer type badge monogram (PRD §6.4) ------------------
  // `.jp-Completer-monogram` is a LETTER printed on the type badge, and the
  // badge takes one of ten `color.syntax.*` hues so the swatch beside a
  // completion is the colour the editor will paint it (mapping/jp-adapter.yaml).
  //
  // That ramp inverts with the mode, so the letter has to invert with it too.
  // Core hardcodes `color: white`, which measured 1.08:1 on the dark-mode badge
  // — see docs/decisions.md D-034. `text.inverse0` is the one token defined to
  // flip, and these ten pairings are what make that claim checkable rather than
  // asserted: nothing else in this audit puts inverse0 on a syntax hue.
  const COMPLETER_BADGE_HUES = [
    'function',
    'name',
    'type',
    'meta',
    'keyword',
    'string',
    'number',
    'property',
    'regexp',
    'comment'
  ];
  for (const hue of COMPLETER_BADGE_HUES) {
    add(
      'A1',
      4.5,
      t['color.text.inverse0'],
      t[`color.syntax.${hue}`],
      `text.inverse0 on syntax.${hue} (completer type badge monogram)`
    );
  }

  // --- A1: text on the selection plate -----------------------------------
  // `selection.active` is audited as a code BACKDROP further down, for the
  // syntax ramp sitting on a selected line. It is also a ROW plate — the
  // command palette, the file browser listing and now the completer all put UI
  // text on it — and that half was never gated. Three roles land there: the row
  // label (primary), its trailing metadata (secondary) and the matched
  // substring (strong).
  for (const role of ['primary', 'secondary', 'strong']) {
    add(
      'A1',
      4.5,
      t[`color.text.${role}`],
      t['color.selection.active'],
      `text.${role} on selection.active (selected row)`
    );
  }

  // --- A3: boundaries and state indicators -------------------------------
  // WCAG 1.4.11 gates the boundary that IDENTIFIES a component at 3:1. It does
  // not gate decoration, and a "subtle" separator that clears 3:1 is not
  // subtle. So border.control — the input/select/checkbox outline — carries the
  // real gate, while the decorative ramp is only checked for VISIBILITY below.
  for (const surface of [
    'color.surface.canvas',
    'color.surface.raised',
    'color.surface.sunken'
  ]) {
    const label = surface.replace('color.surface.', 'surface.');
    add(
      'A3',
      3,
      t['color.border.control'],
      t[surface],
      `border.control (input outline) on ${label}`
    );
  }
  // VIS is NOT a WCAG gate. It catches a separator that is literally identical
  // to its surface — a real bug that a 3:1 gate would hide behind a wall of
  // false failures.
  for (const surface of [
    'color.surface.canvas',
    'color.surface.raised',
    'color.surface.sunken'
  ]) {
    const label = surface.replace('color.surface.', 'surface.');
    for (const role of ['strong', 'default', 'subtle', 'faint']) {
      add(
        'VIS',
        1.02,
        t[`color.border.${role}`],
        t[surface],
        `border.${role} visible on ${label}`
      );
    }
  }
  // The focus ring is the single most important A3 pairing: PRD A5 requires a
  // visible indicator on EVERY focusable element, against adjacent colours.
  for (const surface of [
    'color.surface.canvas',
    'color.surface.raised',
    'color.surface.overlay',
    'color.surface.sunken',
    'color.surface.hover'
  ]) {
    add(
      'A3',
      3,
      t['color.action.focus'],
      t[surface],
      `action.focus (focus ring) on ${surface.replace('color.surface.', 'surface.')}`
    );
  }
  add(
    'A3',
    3,
    t['color.action.default'],
    t['color.surface.canvas'],
    'action.default (active-cell bar) on surface.canvas'
  );
  add(
    'A3',
    3,
    t['color.action.default'],
    t['color.surface.raised'],
    'action.default (tab indicator) on surface.raised'
  );
  add(
    'A3',
    3,
    t['color.debug.breakpoint'],
    t['color.surface.code'],
    'debug.breakpoint glyph on surface.code'
  );
  // The other five debugger glyph pairings (P3-08). They went ungated while the
  // decorations were inert; they are on screen now. Two backdrops, because the
  // gutter cell of the stopped line is tinted `executionLineBg` and the glyph
  // on it is still a breakpoint whenever the stopped line has one.
  add(
    'A3',
    3,
    t['color.debug.breakpointDisabled'],
    t['color.surface.code'],
    'debug.breakpointDisabled glyph on surface.code'
  );
  add(
    'A3',
    3,
    t['color.debug.breakpointConditional'],
    t['color.surface.code'],
    'debug.breakpointConditional glyph on surface.code'
  );
  add(
    'A3',
    3,
    t['color.debug.breakpoint'],
    t['color.debug.executionLineBg'],
    'debug.breakpoint glyph on the tinted execution gutter'
  );
  add(
    'A3',
    3,
    t['color.debug.breakpointDisabled'],
    t['color.debug.executionLineBg'],
    'debug.breakpointDisabled glyph on the tinted execution gutter'
  );
  // Carries both the arrow glyph in the gutter and the 2px bar down the left of
  // the stopped line, and both sit on the tint.
  add(
    'A3',
    3,
    t['color.debug.executionLineBorder'],
    t['color.debug.executionLineBg'],
    'debug.executionLineBorder (arrow and left bar) on debug.executionLineBg'
  );
  add(
    'A3',
    3,
    t['color.scrollbar.thumb'],
    t['color.surface.canvas'],
    'scrollbar.thumb on surface.canvas'
  );
  // Dark-mode elevation is a surface LIGHTNESS step (PRD §9). If overlay and
  // raised are not separable, menus float on nothing and the interface reads
  // flat — the R10 failure. Checked in dark ONLY: light mode deliberately
  // paints canvas, raised and overlay the same white and carries separation on
  // borders instead, so a lightness gate there would fail by design.
  if (mode === 'dark') {
    add(
      'VIS',
      1.04,
      t['color.surface.overlay'],
      t['color.surface.raised'],
      'surface.overlay vs surface.raised (dark elevation step)'
    );
    add(
      'VIS',
      1.04,
      t['color.surface.raised'],
      t['color.surface.canvas'],
      'surface.raised vs surface.canvas (dark elevation step)'
    );
  } else {
    add(
      'VIS',
      1.15,
      t['color.border.subtle'],
      t['color.surface.raised'],
      'border.subtle carries light-mode panel separation'
    );
  }
  // canvas vs sunken runs in BOTH modes, which is the one elevation step that
  // does. The others are dark-only because light-mode elevation is carried by
  // borders, so a lightness gate on them would fail by design. This pair is
  // different: it is not decoration in light mode, it is the ONLY thing
  // separating the two row colours of a rendered table. Core stripes odd rows
  // with surface.canvas and even rows with surface.sunken, so if the two ever
  // converge the striping disappears silently.
  //
  // That is not hypothetical. It is what P3-03 found: the adapter pointed
  // table striping at surface.raised, which in light mode IS surface.canvas —
  // both are palette.neutral.0 — and every light-mode table had been shipping
  // with no striping at all while dark mode looked correct. Nothing caught it,
  // because no gate ran in light mode. This is that gate (D-029).
  add(
    'VIS',
    1.04,
    t['color.surface.canvas'],
    t['color.surface.sunken'],
    'surface.canvas vs surface.sunken (rendered-table striping, both modes)'
  );

  // Selection must be visible against the code background, or the user cannot
  // see what they selected. The other half of this constraint — the syntax ramp
  // staying legible ON the selection — is in the A4 block below.
  add(
    'VIS',
    1.12,
    t['color.selection.active'],
    t['color.surface.code'],
    'selection.active vs surface.code'
  );

  // --- A4: syntax tokens against every background code can sit on --------
  // Including the two warning-tinted highlights: PRD S3 and D4 both require
  // the syntax ramp to survive on top of them, and that is the tightest
  // constraint in the whole editor theme.
  const CODE_BACKDROPS = [
    ['color.surface.code', 'surface.code'],
    ['color.surface.codeActive', 'surface.codeActive'],
    ['color.search.unselectedMatchBg', 'search.unselectedMatchBg'],
    ['color.debug.executionLineBg', 'debug.executionLineBg'],
    ['color.selection.active', 'selection.active'],
    ['color.selection.inactive', 'selection.inactive']
  ];
  for (const [bgKey, bgLabel] of CODE_BACKDROPS) {
    for (const tok of SYNTAX) {
      add(
        'A4',
        4.5,
        t[tok],
        t[bgKey],
        `${tok.replace('color.', '')} on ${bgLabel}`
      );
    }
  }

  // --- the bracket-matching glyph -----------------------------------------
  // Both decorations restate `text.secondary` on the glyph, because CodeMirror
  // REPLACES the syntax span class rather than adding to it — without the
  // restatement a bracket under the cursor falls through to the default text
  // colour (P3-05, docs/decisions.md D-031). That puts body-weight text on two
  // backdrops nothing else in this audit covers, so they are gated here at the
  // A4 threshold: a bracket you cannot read is worse than one with no fill.
  add(
    'A4',
    4.5,
    t['color.text.secondary'],
    t['color.syntax.bracketMatchBg'],
    'text.secondary on syntax.bracketMatchBg (matched bracket glyph)'
  );
  add(
    'A4',
    4.5,
    t['color.text.secondary'],
    t['color.danger.faint'],
    'text.secondary on danger.faint (unmatched bracket glyph)'
  );

  // --- ANSI (PRD T3/T4) ---------------------------------------------------
  // Gated against BOTH the terminal background and the notebook output
  // background. They are the same colour here by design (D-002), but the audit
  // checks both so the guarantee survives if that ever changes.
  const ANSI_BACKDROPS = [
    ['color.ansi.background', 'terminal bg'],
    ['color.surface.canvas', 'notebook output bg'],
    // PRD §8.7.3 leaves xterm's `selectionForeground` unset so selected cells
    // keep their own colour — overriding it flattens syntax-coloured output to
    // one colour while selected. The price is that the selection backdrop has
    // to hold the whole palette, so it is audited as a third background.
    ['color.ansi.selectionBackground', 'terminal selection']
  ];
  for (const [bgKey, bgLabel] of ANSI_BACKDROPS) {
    for (const slot of ANSI_CHROMATIC) {
      add(
        'T4',
        4.5,
        t[`color.ansi.${slot}`],
        t[bgKey],
        `ansi.${slot} on ${bgLabel}`
      );
    }
    for (const slot of ANSI_ANCHORS[mode].far) {
      add(
        'T4',
        4.5,
        t[`color.ansi.${slot}`],
        t[bgKey],
        `ansi.${slot} (far anchor) on ${bgLabel}`
      );
    }
    for (const slot of ANSI_ANCHORS[mode].near) {
      add(
        'T4',
        1.5,
        t[`color.ansi.${slot}`],
        t[bgKey],
        `ansi.${slot} (near anchor) on ${bgLabel}`
      );
    }
    add(
      'T4',
      4.5,
      t['color.ansi.foreground'],
      t[bgKey],
      `ansi.foreground on ${bgLabel}`
    );
  }

  // --- DataGrid (PRD D1/D2) ----------------------------------------------
  add(
    'A1',
    4.5,
    t['color.grid.text'],
    t['color.grid.background'],
    'grid.text on grid.background'
  );
  add(
    'A1',
    4.5,
    t['color.grid.text'],
    t['color.grid.rowStripe'],
    'grid.text on grid.rowStripe'
  );
  add(
    'A1',
    4.5,
    t['color.grid.headerText'],
    t['color.grid.headerBackground'],
    'grid.headerText on grid.headerBackground'
  );
  add(
    'A1',
    4.5,
    t['color.grid.text'],
    t['color.grid.selectionFill'],
    'grid.text on grid.selectionFill'
  );
  add(
    'VIS',
    1.02,
    t['color.grid.line'],
    t['color.grid.background'],
    'grid.line visible on grid.background'
  );
  add(
    'VIS',
    1.02,
    t['color.grid.rowStripe'],
    t['color.grid.background'],
    'grid.rowStripe visible on grid.background'
  );

  // --- Launcher kernel plate (PRD Q9, D-010) -----------------------------
  // The plate is DECORATIVE — nothing is read off it, so 1.4.11 does not
  // apply and VIS is the right gate. It is checked in both modes because the
  // bug it guards against is mode-specific: the plate was pointed at a
  // mode-scoped surface and computed to #0B1F38 on a #122A47 card, a ratio of
  // ~1.2 that is technically "visible" and practically a dark square on a dark
  // square — with a white-matted PNG haloing on top of it.
  add(
    'VIS',
    1.02,
    t['launcher.kernelPlateBg'],
    t['launcher.cardBg'],
    'launcher.kernelPlateBg visible on launcher.cardBg'
  );

  // --- TOC depth ramp (PRD TC2) ------------------------------------------
  // Levels 4-6 drop to text.secondary; this is exactly where a colour-decay
  // ramp fails, so it is checked against both TOC row states.
  for (const bg of [
    'color.surface.raised',
    'color.surface.hover',
    'color.surface.selected'
  ]) {
    add(
      'A1',
      4.5,
      t['color.text.secondary'],
      t[bg],
      `toc h4-h6 (text.secondary) on ${bg.replace('color.surface.', 'surface.')}`
    );
  }

  // --- Menus (PRD §8.4) ---------------------------------------------------
  add(
    'A1',
    4.5,
    t['color.text.primary'],
    t['color.surface.overlay'],
    'menu item label on menu surface'
  );
  add(
    'A1',
    4.5,
    t['color.text.muted'],
    t['color.surface.overlay'],
    'menu shortcut on menu surface'
  );
  add(
    'A1',
    4.5,
    t['color.text.primary'],
    t['color.surface.hover'],
    'menu item label on hover/.lm-mod-active'
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const rows = [];
for (const mode of ['light', 'dark']) {
  for (const check of buildChecks(mode, resolved[mode])) {
    const ratio = contrast(check.fg, check.bg);
    rows.push({ ...check, ratio });
  }
}

const unmeasurable = rows.filter(r => r.ratio === null);
const failures = rows.filter(
  r => r.ratio !== null && r.ratio < r.min && !r.advisory
);
const advisories = rows.filter(
  r => r.ratio !== null && r.ratio < r.min && r.advisory
);

const fmt = r =>
  `[${r.mode.padEnd(5)}] ${r.gate}  ${(r.ratio ?? 0).toFixed(2).padStart(6)}:1 ` +
  `(min ${r.min})  ${r.label}   ${r.fg} on ${r.bg}`;

if (reportOnly) {
  for (const r of rows.sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))) {
    console.log(fmt(r));
  }
}

if (unmeasurable.length) {
  console.warn(`\n${unmeasurable.length} pairing(s) could not be measured:`);
  for (const r of unmeasurable.slice(0, 20)) {
    console.warn(`  ? ${r.mode} ${r.label}  (fg=${r.fg} bg=${r.bg})`);
  }
}

if (advisories.length) {
  console.warn(
    `\n${advisories.length} ADVISORY below target (ANSI achromatic anchors — see D-002):`
  );
  for (const r of advisories) {
    console.warn(`  ~ ${fmt(r)}`);
  }
}

console.log(
  `\nContrast audit: ${rows.length - unmeasurable.length} pairings measured, ` +
    `${failures.length} failing, ${advisories.length} advisory.`
);

if (failures.length && !reportOnly) {
  console.error(`\n${failures.length} CONTRAST FAILURE(S):\n`);
  for (const r of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.error(`  x ${fmt(r)}`);
  }
  console.error('');
  process.exit(1);
}
