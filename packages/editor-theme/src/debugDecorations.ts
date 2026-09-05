import type { Extension, Text } from '@codemirror/state';
import {
  Compartment,
  Prec,
  RangeSet,
  StateEffect,
  StateField
} from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter } from '@codemirror/view';
import { tokensFor } from '@d4n/tokens';

/**
 * Debugger editor decorations — breakpoint gutter and execution line
 * (PRD §8.6.4).
 *
 * WHY THESE LIVE HERE AND NOT IN `ui-overrides`
 * ---------------------------------------------
 * §8.6.4 is blunt about it: "Putting them in CSS is the mistake that makes them
 * stop working on the next CodeMirror bump." A breakpoint is a gutter marker and
 * an execution line is a line decoration; both are CodeMirror state, and a
 * stylesheet that targets whatever DOM the debugger happens to produce is a
 * selector-integrity failure waiting for a minor release.
 *
 * WHY THE COLOURS ARE CSS CUSTOM PROPERTIES AND THE METRICS ARE NOT
 * ----------------------------------------------------------------
 * Unlike `theme.ts`, this module is registered once and shared by both modes:
 * the debugger attaches it to whatever editor is stopped, and D7 requires the
 * decorations to repaint on a mid-session theme switch. Baking a resolved colour
 * in would freeze them at whichever mode was active when the extension was
 * built. So colours are read as `--d4n-*` custom properties, which `tokens.css`
 * already re-resolves on the attribute swap — one repaint, no re-registration.
 *
 * Metrics (spacing, radius, border widths) are read from `@d4n/tokens` directly,
 * because those tiers are identical in both modes — there is nothing to switch.
 *
 * Each colour falls back to the nearest stock `--jp-*` variable, so the markers
 * still render (in stock Jupyter colours) if a user selects a non-Data4Now
 * theme and the `--d4n-*` layer is out of scope (AC10).
 *
 * WIRING
 * ------
 * Nothing here imports `@jupyterlab/debugger`. `debugBridge.ts` does that half
 * (P3-08): it installs {@link debugEditorHost} on every editor, mounts the
 * gutter where the debugger attaches, and maps DAP breakpoints and the stop
 * event onto `setBreakpointsEffect` and `setExecutionLineEffect`. On their own
 * the extensions here are inert: no breakpoints, no execution line, and the
 * gutter swallows no clicks unless an `onToggle` handler is supplied.
 */

/** Breakpoint states distinguishable by glyph shape alone (PRD §8.6.4, D3/A7). */
export type BreakpointState = 'set' | 'disabled' | 'conditional';

/** One breakpoint, addressed by 1-based line number as the DAP protocol does. */
export interface IBreakpointMark {
  line: number;
  state: BreakpointState;
}

export interface IBreakpointGutterOptions {
  /**
   * Called when the user clicks a gutter cell, with the 1-based line number.
   *
   * Omit it and the gutter is display-only: the mousedown handler returns
   * `false`, so CodeMirror's default handling is left untouched. P3-08 supplies
   * the implementation that talks to the debugger service.
   */
  onToggle?: (line: number, view: EditorView) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Mode-invariant tiers only — see the module comment. */
const metrics = tokensFor(true);

const COLOR_BREAKPOINT =
  'var(--d4n-color-debug-breakpoint, var(--jp-error-color1))';
const COLOR_BREAKPOINT_DISABLED =
  'var(--d4n-color-debug-breakpoint-disabled, var(--jp-ui-font-color2))';
const COLOR_BREAKPOINT_CONDITIONAL =
  'var(--d4n-color-debug-breakpoint-conditional, var(--jp-warn-color1))';
const COLOR_EXECUTION_LINE_BG =
  'var(--d4n-color-debug-execution-line-bg, var(--jp-warn-color3))';
const COLOR_EXECUTION_LINE_BORDER =
  'var(--d4n-color-debug-execution-line-border, var(--jp-warn-color1))';
/** Used to punch the notch out of the conditional-breakpoint glyph. */
const COLOR_EDITOR_SURFACE =
  'var(--d4n-color-surface-code, var(--jp-layout-color0))';

function svgRoot(className: string): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', '0 0 12 12');
  root.setAttribute('width', '12');
  root.setAttribute('height', '12');
  root.setAttribute('class', className);
  // Decorative: the state is announced by the debugger's breakpoint list, and a
  // per-line graphic in a gutter is noise for a screen reader (A10).
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  return root;
}

function svgChild(
  parent: SVGSVGElement,
  tag: string,
  attrs: Record<string, string>
): void {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  parent.appendChild(el);
}

/**
 * The three glyphs are filled disc / hollow ring / notched disc. Shape carries
 * the state on its own; colour only reinforces it (D3, A7).
 */
function breakpointGlyph(state: BreakpointState): SVGSVGElement {
  const root = svgRoot(`cm-d4n-breakpoint cm-d4n-breakpoint-${state}`);

  if (state === 'disabled') {
    svgChild(root, 'circle', {
      cx: '6',
      cy: '6',
      r: '4',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5'
    });
    return root;
  }

  svgChild(root, 'circle', {
    cx: '6',
    cy: '6',
    r: '4.5',
    fill: 'currentColor'
  });

  if (state === 'conditional') {
    // A wedge in the editor's own background colour, cut from the right side of
    // the disc. Painting the notch rather than clipping it keeps the glyph a
    // single path in every renderer.
    svgChild(root, 'path', {
      d: 'M6 6 L10.5 3.6 L10.5 8.4 Z',
      fill: COLOR_EDITOR_SURFACE
    });
  }

  return root;
}

function executionArrowGlyph(): SVGSVGElement {
  const root = svgRoot('cm-d4n-executionArrow');
  svgChild(root, 'path', {
    d: 'M3.5 2 L9.5 6 L3.5 10 Z',
    fill: 'currentColor'
  });
  return root;
}

class BreakpointGutterMarker extends GutterMarker {
  /** Suppresses the hover preview on a line that already has a breakpoint. */
  readonly elementClass = 'cm-d4n-hasBreakpoint';

  constructor(private readonly _breakpoint: BreakpointState) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof BreakpointGutterMarker &&
      other._breakpoint === this._breakpoint
    );
  }

  toDOM(): Node {
    return breakpointGlyph(this._breakpoint);
  }
}

/** One instance per state so `eq` short-circuits on identity in the common case. */
const BREAKPOINT_MARKERS: Record<BreakpointState, BreakpointGutterMarker> = {
  set: new BreakpointGutterMarker('set'),
  disabled: new BreakpointGutterMarker('disabled'),
  conditional: new BreakpointGutterMarker('conditional')
};

class ExecutionArrowMarker extends GutterMarker {
  readonly elementClass = 'cm-d4n-executionGutter';

  eq(other: GutterMarker): boolean {
    return other instanceof ExecutionArrowMarker;
  }

  toDOM(): Node {
    return executionArrowGlyph();
  }
}

/**
 * Used when the stopped line already carries a breakpoint glyph: the cell is
 * tinted, but the breakpoint stays visible instead of being replaced by an
 * arrow the user cannot dismiss.
 */
class ExecutionTintMarker extends GutterMarker {
  readonly elementClass = 'cm-d4n-executionGutter';

  eq(other: GutterMarker): boolean {
    return other instanceof ExecutionTintMarker;
  }
}

const EXECUTION_ARROW = new ExecutionArrowMarker();
const EXECUTION_TINT = new ExecutionTintMarker();

/** Replace the full breakpoint set for a document. */
export const setBreakpointsEffect =
  StateEffect.define<readonly IBreakpointMark[]>();

/**
 * Move (or clear, with `null`) the current execution line, as a 1-based line
 * number.
 *
 * The line number is stored as given rather than as a mapped position: while a
 * kernel is stopped the document does not change, and the debugger re-sends the
 * location on every stop event. An edit made while stopped therefore leaves the
 * highlight where it was rather than dragging it — deliberate, and preferable to
 * a highlight that silently drifts onto an unrelated statement.
 */
export const setExecutionLineEffect = StateEffect.define<number | null>();

function buildBreakpointSet(
  doc: Text,
  marks: readonly IBreakpointMark[]
): RangeSet<GutterMarker> {
  const ranges = marks
    // A stale breakpoint past the end of a shortened document is dropped rather
    // than thrown on: the debugger and the editor are not always in step.
    .filter(
      mark =>
        Number.isInteger(mark.line) &&
        mark.line >= 1 &&
        mark.line <= doc.lines &&
        mark.state in BREAKPOINT_MARKERS
    )
    .map(mark =>
      BREAKPOINT_MARKERS[mark.state].range(doc.line(mark.line).from)
    );

  return RangeSet.of(ranges, /* sort */ true);
}

/** The breakpoints currently shown, keyed by document position. */
export const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setBreakpointsEffect)) {
        marks = buildBreakpointSet(tr.state.doc, effect.value);
      }
    }
    return marks;
  }
});

/** The 1-based execution line, or `null` when the kernel is not stopped here. */
export const executionLineField = StateField.define<number | null>({
  create: () => null,
  update(line, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setExecutionLineEffect)) {
        line = effect.value;
      }
    }
    return line;
  }
});

const executionLineDecoration = Decoration.line({
  class: 'cm-d4n-executionLine'
});

const executionLineDecorations = EditorView.decorations.compute(
  [executionLineField],
  state => {
    const line = state.field(executionLineField);
    if (line === null || line < 1 || line > state.doc.lines) {
      return Decoration.none;
    }
    return Decoration.set([
      executionLineDecoration.range(state.doc.line(line).from)
    ]);
  }
);

const decorationTheme = EditorView.baseTheme({
  '.cm-d4n-breakpointGutter': {
    minWidth: metrics.space['4'],
    cursor: 'pointer'
  },
  '.cm-d4n-breakpointGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: metrics.space['4'],
    padding: '0'
  },
  // PRD §8.6.4: at rest the gutter is empty, and hovering an empty cell previews
  // the breakpoint a click would set. `:not(.cm-d4n-hasBreakpoint)` keeps the
  // ghost off lines that already have one.
  '.cm-d4n-breakpointGutter .cm-gutterElement:hover:not(.cm-d4n-hasBreakpoint)::after':
    {
      content: '""',
      width: metrics.space['2'],
      height: metrics.space['2'],
      borderRadius: metrics.radius.pill,
      backgroundColor: COLOR_BREAKPOINT,
      opacity: '0.5'
    },
  '.cm-d4n-breakpoint-set': { color: COLOR_BREAKPOINT },
  '.cm-d4n-breakpoint-disabled': { color: COLOR_BREAKPOINT_DISABLED },
  '.cm-d4n-breakpoint-conditional': { color: COLOR_BREAKPOINT_CONDITIONAL },
  // The tint runs into the gutter so the stopped line reads as one band. It is
  // also the only signal left when the stopped line already has a breakpoint and
  // the glyph slot is taken.
  //
  // `.cm-gutterElement` is here for the same reason `.cm-line` is below: the
  // stopped line is usually the active line, and `highlightActiveLineGutter()`
  // puts `.cm-activeLineGutter` — styled in the mode themes — on this very
  // element.
  '.cm-gutterElement.cm-d4n-executionGutter': {
    color: COLOR_EXECUTION_LINE_BORDER,
    backgroundColor: COLOR_EXECUTION_LINE_BG
  },

  // The redundant `.cm-line` is load-bearing: the stopped line is almost always
  // also the active line, and `.cm-activeLine` (styled in the mode themes) would
  // otherwise tie with this rule on specificity and win on source order.
  //
  // The left bar is an inset box-shadow rather than a border because a border
  // would add 2px to the line box and shift every character on the stopped line.
  '.cm-line.cm-d4n-executionLine': {
    backgroundColor: COLOR_EXECUTION_LINE_BG,
    boxShadow: `inset ${metrics.border.width.thick} 0 0 0 ${COLOR_EXECUTION_LINE_BORDER}`
  },

  // ---------------------------------------------------------------------
  // The two upstream decorations we replace (P3-08, D-035).
  //
  // `@jupyterlab/debugger`'s own `EditorHandler` stays attached to every editor
  // it manages, and it injects a `cm-breakpoint-gutter` column and a
  // `jp-DebuggerEditor-highlight` line class of its own. We keep that handler —
  // it owns the whole DAP round trip — and hide only its two visuals, or the
  // user sees two breakpoint columns and a brown `--md-brown-100` band under
  // our warning-tinted one.
  //
  // Both rules are in this base theme rather than a stylesheet so that they
  // live and die with the extension that replaces them. If upstream renames
  // either class the rules stop matching, upstream repaints in stock colours
  // and nothing breaks (AC10). `test:selectors` cannot see them, because
  // `editor-theme` generates its CSS through `EditorView.baseTheme()` and has
  // no `style/` directory.
  //
  // The `!important` beats `.cm-gutter { display: flex !important }` in
  // `@codemirror/view`'s own base theme, which is the only reason a plain
  // `display: none` did not work: measured, the column stayed `flex` and
  // survived at 0px width by accident of its markers having no intrinsic size.
  // Both declarations are in the same generated stylesheet and ours is written
  // later, so at equal weight and equal specificity ours wins.
  '.cm-breakpoint-gutter': { display: 'none !important' },
  // Only `outline` and `text-shadow`, and only where OUR line decoration is
  // also present. Upstream's `background-color` needs no answer: its rule is
  // `body[data-jp-theme-light='…'] .jp-DebuggerEditor-highlight`, (0,2,1)
  // against the (0,3,0) of the rule above, so ours already wins.
  //
  // The first version of this rule said `background: none` and blanked our own
  // execution line, because at (0,3,0) it tied with the rule above and came
  // later in the sheet. The left bar survived and the tint did not, which is
  // exactly as confusing as it sounds.
  //
  // Restricting it to lines that carry both classes also keeps the degraded
  // path honest: if upstream renames the gutter class we never mount, our line
  // class is never set, and upstream's highlight renders whole rather than
  // half-suppressed.
  '.cm-line.cm-d4n-executionLine.jp-DebuggerEditor-highlight': {
    outline: 'none',
    textShadow: 'none'
  }
});

/**
 * The gutter on its own, without the fields it reads.
 *
 * Split out so that {@link debugEditorHost} can mount and unmount it per editor
 * through a compartment while the fields stay installed for the whole life of
 * the editor.
 */
function breakpointGutterExtension(
  options: IBreakpointGutterOptions
): Extension {
  return Prec.high(
    gutter({
      class: 'cm-d4n-breakpointGutter',
      // Empty cells still have to render, or there is nothing to hover or
      // click on a line without a breakpoint.
      renderEmptyElements: true,
      markers: view =>
        view.state.field(breakpointField, false) ?? RangeSet.empty,
      lineMarker: (view, line, otherMarkers) => {
        const executionLine = view.state.field(executionLineField, false);
        // Two different absences, both meaning "no arrow here": `undefined`
        // when the field is not installed on this editor (the `false` above
        // asks for that instead of throwing), and `null` when it is installed
        // but no line is currently executing.
        if (executionLine === undefined || executionLine === null) {
          return null;
        }
        const doc = view.state.doc;
        if (executionLine < 1 || executionLine > doc.lines) {
          return null;
        }
        if (doc.line(executionLine).from !== line.from) {
          return null;
        }
        return otherMarkers.length ? EXECUTION_TINT : EXECUTION_ARROW;
      },
      lineMarkerChange: update =>
        update.startState.field(executionLineField, false) !==
        update.state.field(executionLineField, false),
      domEventHandlers: {
        mousedown: (view, line, event) => {
          const onToggle = options.onToggle;
          if (!onToggle || (event as MouseEvent).button !== 0) {
            return false;
          }
          onToggle(view.state.doc.lineAt(line.from).number, view);
          return true;
        }
      }
    })
  );
}

/**
 * Breakpoint gutter, including the execution-line arrow that shares it.
 *
 * `Prec.high` puts it to the left of the line-number gutter: gutter order
 * follows extension precedence, and JupyterLab installs `lineNumbers()` first.
 */
export function breakpointGutter(
  options: IBreakpointGutterOptions = {}
): Extension {
  return [
    breakpointField,
    // The arrow shares this gutter, so the field it reads must be present even
    // when `executionLineHighlight()` was not added. Extensions dedupe by
    // identity, so including it twice costs nothing.
    executionLineField,
    breakpointGutterExtension(options),
    decorationTheme
  ];
}

/** Current-execution-line background and left bar. */
export function executionLineHighlight(): Extension {
  return [executionLineField, executionLineDecorations, decorationTheme];
}

/** Both §8.6.4 decorations, installed unconditionally. */
export function debugDecorations(
  options: IBreakpointGutterOptions = {}
): Extension {
  return [breakpointGutter(options), executionLineHighlight()];
}

/**
 * Holds the gutter half of the decorations, so that one editor can mount it
 * while another leaves it out.
 *
 * A `Compartment` is a marker object, not per-editor state, so one module-level
 * instance serves every editor: each `EditorState` applies the reconfiguration
 * to its own copy. The rule a compartment does impose — one use per
 * configuration — holds, because {@link debugEditorHost} is added once.
 */
const gutterCompartment = new Compartment();

/**
 * Everything §8.6.4 needs, in the form P3-08 installs it: on EVERY editor, with
 * the gutter left out until the debugger attaches (`debugBridge.ts`).
 *
 * WHY THE GUTTER IS NOT SIMPLY ALWAYS ON
 * --------------------------------------
 * A CodeMirror gutter renders its column whether or not it has markers, so an
 * always-on breakpoint gutter would put an empty 16px strip down the left of
 * every editor in the application — including files nobody is debugging. The
 * fields and the line decoration have no such cost: both are inert until an
 * effect sets them, so they stay installed and only the gutter moves.
 */
export function debugEditorHost(): Extension {
  return [
    breakpointField,
    executionLineField,
    executionLineDecorations,
    gutterCompartment.of([]),
    decorationTheme
  ];
}

/**
 * Mount or unmount the breakpoint gutter on one editor.
 *
 * Pass the click handler to mount it, `null` to take it away again. Dispatch
 * the result as a transaction effect.
 */
export function setBreakpointGutterEffect(
  options: IBreakpointGutterOptions | null
): StateEffect<unknown> {
  return gutterCompartment.reconfigure(
    options ? breakpointGutterExtension(options) : []
  );
}
