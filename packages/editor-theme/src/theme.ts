import { syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tokensFor } from '@d4n/tokens';
import { buildHighlightStyle } from './highlight';

/**
 * Build one of the two Data4Now CodeMirror 6 themes (PRD §7.5).
 *
 * WHY A REAL CM6 THEME RATHER THAN THE `--jp-mirror-editor-*` SHORTCUT
 * -------------------------------------------------------------------
 * §7.5 spells out the trap: the legacy variables only reach token colours. The
 * gutter, line numbers, active line, selection, bracket match, completion popup
 * and search decorations are CM6's own theme surface and stay stock-Jupyter
 * unless a theme claims them — which is how you end up with a Data4Now notebook
 * whose completion popup is a different grey from every other popup in the app.
 *
 * Every value below is read from `@d4n/tokens`, resolved, at build time. That is
 * the §7.2 single-origin rule: CodeMirror cannot read CSS custom properties from
 * JavaScript, so it reads the same numbers `tokens.css` writes instead of a
 * hand-maintained parallel palette.
 */
export function buildEditorTheme(isLight: boolean): Extension {
  const tk = tokensFor(isLight);
  const c = tk.color;
  const thin = tk.border.width.thin;
  const thick = tk.border.width.thick;
  const ring = tk.focusRing;

  const base = EditorView.theme(
    {
      '&': {
        color: c.text.primary,
        backgroundColor: c.surface.code,
        fontFamily: tk.font.family.mono,
        fontSize: tk.font.size.code
      },

      // Notebook and console cells paint their own background — that is how an
      // active cell is told apart from an idle one (PRD §8.2). An opaque editor
      // background would sit on top of it and erase the distinction.
      '.jp-Notebook &, .jp-CodeConsole &': {
        backgroundColor: 'transparent'
      },

      // `.cm-scroller` sets its own font-family; without `inherit` the rule on
      // `&` above is silently ignored for the actual text.
      '.cm-scroller': {
        fontFamily: 'inherit',
        lineHeight: tk.font.lineHeight.code
      },

      '.cm-content': { caretColor: c.action.default },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: c.action.default,
        borderLeftWidth: thick
      },
      '.cm-placeholder': { color: c.text.muted },

      // ── Selection ────────────────────────────────────────────────────────
      // Two states, because an unfocused editor holding a selection (the other
      // half of a split view, a cell you just left) must read as inactive.
      '.cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: c.selection.inactive
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        {
          backgroundColor: c.selection.active
        },
      '&.cm-focused .cm-content ::selection': {
        backgroundColor: c.selection.active
      },
      // `highlightSelectionMatches` — other occurrences of the selected word.
      '.cm-selectionMatch': { backgroundColor: c.selection.inactive },

      '.cm-activeLine': { backgroundColor: c.surface.codeActive },

      // ── Gutters ──────────────────────────────────────────────────────────
      '.cm-gutters': {
        backgroundColor: c.surface.code,
        color: c.text.muted,
        border: 'none',
        borderRight: `${thin} solid ${c.border.subtle}`
      },
      // Same argument as the editor background: inside a cell the gutter must
      // let the cell's own surface through, and a per-cell vertical rule turns a
      // notebook into a ladder.
      '.jp-Notebook & .cm-gutters, .jp-CodeConsole & .cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none'
      },
      '.cm-gutter': { backgroundColor: 'inherit' },
      '.cm-lineNumbers .cm-gutterElement': {
        color: c.text.muted,
        padding: `0 ${tk.space['2']} 0 ${tk.space['1']}`
      },
      '.cm-activeLineGutter': {
        backgroundColor: c.surface.codeActive,
        color: c.text.primary
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: c.text.muted,
        cursor: 'pointer'
      },
      '.cm-foldGutter .cm-gutterElement:hover': { color: c.text.primary },
      '.cm-foldPlaceholder': {
        backgroundColor: c.surface.active,
        color: c.text.secondary,
        border: `${thin} solid ${c.border.default}`,
        borderRadius: tk.radius.sm,
        padding: `0 ${tk.space['1']}`,
        margin: `0 ${tk.space['1']}`
      },

      // ── Bracket matching ─────────────────────────────────────────────────
      // `@codemirror/language` only applies these classes while the editor has
      // focus, and its own baseTheme claims the same selectors — the `&.cm-focused`
      // prefix is what lets this rule outrank it without `!important`.
      // Matching and non-matching get different colours *and* a different fill,
      // because a red-vs-teal outline alone is not an A7-safe signal.
      //
      // BOTH MUST RESTATE THE GLYPH COLOUR, and that is not belt-and-braces.
      // CodeMirror does not ADD this class to the syntax-highlighted span, it
      // REPLACES it: measured on a JSON file, a brace under the cursor carries
      // class="cm-matchingBracket" alone, where the same brace one keystroke
      // later carries the highlight class and the bracket colour. So a rule that
      // sets only a background and an outline leaves the glyph itself falling
      // through to the default text colour — the one thing PRD 7.5 calls a bug —
      // for as long as the cursor sits beside it. It is not a JSON problem:
      // every language with brackets hits it (P3-05).
      //
      // text.secondary is exactly what the bracket would have been. The
      // decoration now adds the fill and the outline instead of costing a colour.
      '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
        color: c.text.secondary,
        backgroundColor: c.syntax.bracketMatchBg,
        outline: `${thin} solid ${c.syntax.bracketMatchBorder}`,
        outlineOffset: `calc(-1 * ${thin})`
      },
      '&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket': {
        color: c.text.secondary,
        backgroundColor: c.danger.faint,
        outline: `${thin} solid ${c.danger.default}`,
        outlineOffset: `calc(-1 * ${thin})`
      },

      // ── Search matches (PRD §8.8.2) ──────────────────────────────────────
      // JupyterLab's own search provider marks matches `.cm-searching` /
      // `.jp-current-match`; CodeMirror's built-in panel search (vim, Ctrl-F in a
      // bare editor) uses `.cm-searchMatch`. Both are covered.
      //
      // An unselected match keeps its syntax colour — only the background moves.
      // `color: inherit` is what hands the foreground back to the HighlightStyle,
      // because @jupyterlab/codemirror 4.6 `style/base.css` forces one onto
      // `.cm-searching span` specifically to beat syntax highlighting.
      '.cm-searching, .cm-searchMatch': {
        backgroundColor: c.search.unselectedMatchBg
      },
      '.cm-searching span, .cm-searchMatch span': { color: 'inherit' },

      '.cm-searching.jp-current-match, .jp-current-match > .cm-searching, .cm-searching > .jp-current-match, .cm-searchMatch.cm-searchMatch-selected':
        {
          backgroundColor: c.search.selectedMatchBg
        },
      // The selected match is the one case where the foreground *must* override
      // the syntax colour, so it stays legible on the solid warning fill.
      // `!important` beats two rules that tie with this one on specificity: the
      // `.ͼ*` class HighlightStyle generates, and
      // `@jupyterlab/codemirror` 4.6 `style/base.css`
      // `.jp-current-match > .cm-searching span` (which upstream also marks
      // `!important` for the same reason).
      '.cm-searching.jp-current-match, .cm-searching.jp-current-match span, .jp-current-match > .cm-searching, .jp-current-match > .cm-searching span, .cm-searching > .jp-current-match, .cm-searching > .jp-current-match span, .cm-searchMatch.cm-searchMatch-selected, .cm-searchMatch.cm-searchMatch-selected span':
        {
          color: `${c.search.selectedMatchFg} !important`
        },

      // ── Tooltips, completion popup, hover ────────────────────────────────
      '.cm-tooltip': {
        backgroundColor: c.surface.overlay,
        color: c.text.primary,
        border: `${thin} solid ${c.border.subtle}`,
        borderRadius: tk.radius.md,
        boxShadow: tk.elevation['3']
      },
      // The arrow is drawn as two stacked borders: the `:before` triangle is the
      // outline, the `:after` triangle is the fill that covers it.
      '.cm-tooltip .cm-tooltip-arrow:before': {
        borderTopColor: c.border.subtle,
        borderBottomColor: c.border.subtle
      },
      '.cm-tooltip .cm-tooltip-arrow:after': {
        borderTopColor: c.surface.overlay,
        borderBottomColor: c.surface.overlay
      },
      '.cm-tooltip.cm-tooltip-autocomplete': {
        fontFamily: tk.font.family.mono,
        fontSize: tk.font.size.code
      },
      '.cm-tooltip-autocomplete > ul > li': {
        color: c.text.primary,
        padding: `0 ${tk.space['2']}`,
        lineHeight: tk.density.comfortable.rowHeight
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: c.surface.selected,
        color: c.text.strong
      },
      '.cm-completionIcon': { color: c.text.muted },
      // Underline stays: it is the non-colour half of the "this is why the entry
      // matched" signal (A7).
      '.cm-completionMatchedText': {
        color: c.action.default,
        fontWeight: tk.font.weight.semibold,
        textDecoration: 'underline'
      },
      '.cm-completionDetail': { color: c.text.muted, fontStyle: 'italic' },
      '.cm-completionInfo': {
        backgroundColor: c.surface.overlay,
        color: c.text.primary,
        border: `${thin} solid ${c.border.subtle}`,
        borderRadius: tk.radius.md,
        boxShadow: tk.elevation['3'],
        padding: tk.space['2']
      },

      // ── Lint diagnostics ─────────────────────────────────────────────────
      '.cm-diagnostic': {
        color: c.text.primary,
        borderLeftWidth: thick,
        borderLeftStyle: 'solid',
        padding: `${tk.space['1']} ${tk.space['2']}`
      },
      '.cm-diagnostic-error': { borderLeftColor: c.danger.default },
      '.cm-diagnostic-warning': { borderLeftColor: c.warning.default },
      '.cm-diagnostic-info': { borderLeftColor: c.info.default },
      '.cm-specialChar': { color: c.danger.default },

      // ── CodeMirror's own panels ──────────────────────────────────────────
      // Rarely surfaced in JupyterLab, but the vim/emacs keymap extensions and
      // bare-editor Ctrl-F put them on screen, and unstyled they are the one
      // place stock CodeMirror grey leaks into the app.
      '.cm-panels': {
        backgroundColor: c.surface.raised,
        color: c.text.primary
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: `${thin} solid ${c.border.subtle}`
      },
      '.cm-panels.cm-panels-bottom': {
        borderTop: `${thin} solid ${c.border.subtle}`
      },
      '.cm-panel.cm-search label': { color: c.text.secondary },
      '.cm-button': {
        // CodeMirror's baseTheme paints buttons with a linear-gradient; a flat
        // background alone would leave the gradient showing through.
        backgroundImage: 'none',
        backgroundColor: tk.button.secondary.bg,
        color: tk.button.secondary.fg,
        border: `${thin} solid ${tk.button.secondary.border}`,
        borderRadius: tk.button.radius
      },
      '.cm-button:hover': { backgroundColor: tk.button.secondary.bgHover },
      '.cm-button:active': { backgroundColor: tk.button.secondary.bgActive },
      '.cm-textfield': {
        backgroundColor: tk.input.bg,
        color: tk.input.fg,
        border: `${thin} solid ${tk.input.border}`,
        borderRadius: tk.input.radius
      },
      '.cm-textfield:focus-visible': {
        outline: `${ring.width} ${ring.style} ${ring.color}`,
        outlineOffset: ring.offset
      },

      // ── Focus ────────────────────────────────────────────────────────────
      // CodeMirror's baseTheme puts a dotted black outline on a focused editor.
      // Replacing rather than deleting it keeps A5/A6 satisfied for standalone
      // editors (file editor, settings JSON view, debugger source viewer).
      // The offset is negative so the ring sits inside the panel and cannot be
      // clipped by the surrounding scroll container.
      '&.cm-editor.cm-focused': {
        outline: `${ring.width} ${ring.style} ${ring.color}`,
        outlineOffset: `calc(-1 * ${ring.width})`
      },
      // Inside a notebook or console the cell's own active-cell indicator is the
      // focus affordance (PRD §8.2), so this is a relocation of the indicator,
      // not a removal of it — A6 stays satisfied.
      '.jp-Notebook &.cm-editor.cm-focused, .jp-CodeConsole &.cm-editor.cm-focused':
        {
          outline: 'none'
        }
    },
    { dark: !isLight }
  );

  return [base, syntaxHighlighting(buildHighlightStyle(tk))];
}
