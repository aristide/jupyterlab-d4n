import { IThemeManager } from '@jupyterlab/apputils';
import { ITerminalTracker } from '@jupyterlab/terminal';
import { tokensFor } from '@d4n/tokens';

import { isD4nTheme, isLightTheme } from './adaptiveTheme';
import { D4nDensity, density } from './density';

/**
 * The xterm.js bridge (PRD §7.9, §8.7).
 *
 * xterm renders the cell grid to canvas. Nothing inside the viewport is styleable
 * — no CSS rule, no `!important`, no `compat-shim` entry reaches a single
 * character (PRD §8.7.1). Every colour, the font, the cursor: options object or
 * it does not happen.
 */

/**
 * The subset of the xterm.js `Terminal` we touch.
 *
 * Deliberately structural rather than `import type { Terminal } from '@xterm/xterm'`.
 * We reach this object through a private field of JupyterLab's wrapper (see
 * `resolveTerminal`), so the type we would import is not the type we are
 * guaranteed to get; a structural shape degrades to "no properties applied"
 * instead of to a compile-time lie.
 */
interface IXterm {
  options: Record<string, unknown>;
}

/**
 * The subset of `@jupyterlab/terminal`'s `Terminal` widget we touch.
 */
interface IJupyterTerminal {
  setOption?: (option: string, value: unknown) => void;
  _term?: IXterm;
  term?: IXterm;
}

/**
 * The xterm `ITheme` object, built from the one Tier-2 `color.ansi` group that
 * also generates the rendermime ANSI stylesheet (PRD §8.7.2 / AC T1). Same
 * sixteen values in the terminal, in `%%bash` output and in tracebacks.
 */
export function buildTerminalTheme(isLight: boolean): Record<string, string> {
  const a = tokensFor(isLight).color.ansi;
  return {
    foreground: a.foreground,
    background: a.background,
    cursor: a.cursor,
    cursorAccent: a.cursorAccent,
    selectionBackground: a.selectionBackground,
    // selectionForeground is deliberately absent (PRD §8.7.3). Setting it flattens
    // syntax-coloured output to a single colour for as long as it is selected,
    // which is worst exactly when someone is selecting a traceback to copy it.
    black: a.black,
    red: a.red,
    green: a.green,
    yellow: a.yellow,
    blue: a.blue,
    magenta: a.magenta,
    cyan: a.cyan,
    white: a.white,
    brightBlack: a.brightBlack,
    brightRed: a.brightRed,
    brightGreen: a.brightGreen,
    brightYellow: a.brightYellow,
    brightBlue: a.brightBlue,
    brightMagenta: a.brightMagenta,
    brightCyan: a.brightCyan,
    brightWhite: a.brightWhite
  };
}

/**
 * Locate the JupyterLab widget and the xterm instance behind a tracker entry.
 *
 * `ITerminalTracker` tracks `MainAreaWidget<ITerminal.ITerminal>`, so the widget
 * with `setOption` is `widget.content` — but terminals embedded by other
 * extensions are sometimes the bare `Terminal`, so we accept either.
 *
 * The xterm instance itself is a private field. That is not an oversight we are
 * routing around for convenience: JupyterLab's `setOption('theme', …)` takes the
 * string union `'light' | 'dark' | 'inherit'` and maps it through its own
 * `getXTermTheme`, so there is no public path for a sixteen-colour palette. If a
 * future release renames the field we get `null` here and fall back to core's
 * inherited theme — wrong shade, not a broken terminal.
 */
function resolveTerminal(widget: unknown): {
  jl: IJupyterTerminal | null;
  xterm: IXterm | null;
} {
  const outer = widget as { content?: unknown } | null;
  const candidate = (outer?.content ?? outer) as IJupyterTerminal | null;
  if (!candidate) {
    return { jl: null, xterm: null };
  }
  const xterm = candidate._term ?? candidate.term ?? null;
  return { jl: candidate, xterm: xterm?.options ? xterm : null };
}

/**
 * xterm's options object rejects keys the bundled version does not know. Applying
 * them one at a time means a JupyterLab pinned to an older xterm loses
 * `cursorInactiveStyle` rather than losing the palette that follows it.
 */
function setXtermOption(xterm: IXterm, key: string, value: unknown): void {
  try {
    xterm.options[key] = value;
  } catch {
    /* option not supported by this xterm build */
  }
}

function setJupyterOption(
  jl: IJupyterTerminal,
  option: string,
  value: unknown
): void {
  if (typeof jl.setOption !== 'function') {
    return;
  }
  try {
    jl.setOption(option, value);
  } catch {
    /* option not in this JupyterLab's ITerminal.IOptions */
  }
}

const toNumber = (value: string): number => parseFloat(value);

function applyToWidget(
  widget: unknown,
  isLight: boolean,
  reducedMotion: boolean,
  currentDensity: D4nDensity
): void {
  const { jl, xterm } = resolveTerminal(widget);
  if (!jl) {
    return;
  }
  const t = tokensFor(isLight);
  const compact = currentDensity === 'compact';

  // Routed through JupyterLab because it caches these in its own `_options` and
  // re-runs `FitAddon` afterwards. Writing them straight onto xterm would leave
  // the widget's cached copy stale and the grid unfitted (AC T10).
  setJupyterOption(jl, 'fontFamily', t.font.family.mono);
  setJupyterOption(
    jl,
    'fontSize',
    toNumber(compact ? t.terminal.fontSizeCompact : t.terminal.fontSize)
  );
  setJupyterOption(jl, 'lineHeight', toNumber(t.terminal.lineHeight));
  setJupyterOption(jl, 'scrollback', toNumber(t.terminal.scrollback));
  // PRD §8.7.3: a blinking cursor is motion.
  setJupyterOption(jl, 'cursorBlink', !reducedMotion);

  if (!xterm) {
    return;
  }
  setXtermOption(xterm, 'letterSpacing', toNumber(t.terminal.letterSpacing));
  setXtermOption(xterm, 'cursorStyle', t.terminal.cursorStyle);
  setXtermOption(xterm, 'cursorInactiveStyle', t.terminal.cursorInactiveStyle);
  // Left at 1, i.e. off (PRD §8.7.3). xterm's auto-contrast would distort every
  // designed colour differently on every background; the sixteen values are
  // designed to pass and verified by the §10.2 audit instead.
  setXtermOption(
    xterm,
    'minimumContrastRatio',
    toNumber(t.terminal.minimumContrastRatio)
  );
  // The token is a string because it is generated into CSS as well; `String()`
  // keeps the comparison off the literal type, which today is only ever 'false'.
  setXtermOption(
    xterm,
    'allowTransparency',
    String(t.terminal.allowTransparency) === 'true'
  );
  // PRD T2 rests on this one option, so it is stated rather than inherited.
  // `ls --color=always` emits bold+colour (SGR 1;3N), and the two halves of the
  // single ANSI source resolve that pair by different routes: rendermime maps
  // bold+blue onto the `.ansi-blue-intense-fg` class, while xterm reaches
  // `brightBlue` only when this is on. Both land on the same token today because
  // xterm defaults it to true, which means T2 was passing by luck. Verified in
  // both modes for all four colours `ls` uses (P3-04).
  setXtermOption(
    xterm,
    'drawBoldTextInBrightColors',
    String(t.terminal.drawBoldTextInBrightColors) === 'true'
  );
  setXtermOption(xterm, 'theme', buildTerminalTheme(isLight));
}

/**
 * Wire the bridge to all four triggers PRD §8.7.4 requires.
 */
export function activateTerminalBridge(
  themeManager: IThemeManager,
  tracker: ITerminalTracker | null
): void {
  if (!tracker) {
    // Terminal extension disabled or absent (JupyterLite, kernel-only images).
    return;
  }

  const motion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

  let frame = 0;

  const repaint = () => {
    // AC10 / PRD §8.7.5. Core's terminal plugin re-derives its `inherit` theme
    // from CSS on every `themeChanged`, synchronously. By declining to write when
    // a stock theme is active we let that value stand, which is how a user who
    // picks JupyterLab Dark gets JupyterLab Dark's terminal and not ours.
    if (!isD4nTheme(themeManager)) {
      return;
    }
    const isLight = isLightTheme(themeManager);
    const reducedMotion = motion?.matches ?? false;
    const currentDensity = density.current;
    tracker.forEach(widget => {
      applyToWidget(widget, isLight, reducedMotion, currentDensity);
    });
  };

  /**
   * PRD §8.7.5: we must land *after* core's `inherit` handler, and connection
   * order between two independent plugins is not something either of us controls.
   * Deferring one frame sidesteps the race entirely — every synchronous slot on
   * the emission has run by then, whoever connected first — and it coalesces the
   * burst that AC T8's twenty consecutive switches produces into one repaint.
   */
  const schedule = () => {
    if (typeof requestAnimationFrame !== 'function') {
      repaint();
      return;
    }
    if (frame) {
      cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      repaint();
    });
  };

  // (1) Existing terminals repaint on a theme switch.
  themeManager.themeChanged.connect(schedule);

  // (2) Terminals opened *after* a switch. Without this, switch-to-dark then
  // open-a-terminal yields a light terminal — the most commonly shipped bug in
  // this class of work, and the one manual QA scenario 5 exists to catch.
  tracker.widgetAdded.connect((_, widget) => {
    schedule();
    // A widget added into a background tab may not have laid out yet; re-apply
    // once it is revealed so the fit happens against real dimensions.
    const revealed = (widget as { revealed?: Promise<void> }).revealed;
    if (revealed?.then) {
      void revealed.then(schedule).catch(() => undefined);
    }
  });

  // (3) Density: terminal font size is density-dependent (PRD §8.7.3).
  density.changed.connect(schedule);

  // (4) Reduced motion, live — cursor blink follows without a reload (AC T7).
  motion?.addEventListener('change', schedule);

  schedule();
}
