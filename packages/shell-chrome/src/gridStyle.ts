import { CellRenderer, DataGrid, TextRenderer } from '@lumino/datagrid';
import { tokensFor } from '@d4n/tokens';

/**
 * The one Lumino DataGrid bridge (PRD §7.9, §8.6.2).
 *
 * Two unrelated-looking surfaces are the same technology: the CSV/TSV viewer and
 * the debugger's variables grid view. §7.9 is blunt about what happens if each
 * gets its own factory — "writing this bridge twice is how the two grids end up
 * one shade apart" — so both consume these two functions and neither owns a
 * colour of its own.
 *
 * A grid style is a plain JS object read at paint time. There is no CSS path into
 * it, and none into the cell text either, which is the trap D2 names. (§8.6.2
 * calls the type `DataGrid.IStyle`; Lumino 2 names it `DataGrid.Style`.)
 */

/** Matches Lumino's own shadow depth; the spec fixes the colour, not the size. */
const SCROLL_SHADOW_SIZE = 10;

/**
 * `IStyle` covers the frame: void area, backgrounds, grid lines, selection.
 *
 * Sourced from the `color.grid.*` token group rather than the `color.surface.*`
 * mapping sketched in the §8.6.2 table. The grid group exists precisely because
 * canvas-painted surfaces need values chosen against each other — striping a
 * canvas with `surface.raised` (identical to `surface.canvas` in light mode)
 * produces no stripe at all.
 */
export function buildGridStyle(isLight: boolean): DataGrid.Style {
  const g = tokensFor(isLight).color.grid;
  const shadow = buildScrollShadow(g.scrollShadow);

  return {
    voidColor: g.void,
    backgroundColor: g.background,
    // Zebra striping. Index 0 is the grid background so the first row sits flush
    // with the header rather than starting on a stripe.
    rowBackgroundColor: index => (index % 2 === 0 ? g.background : g.rowStripe),
    gridLineColor: g.line,
    headerBackgroundColor: g.headerBackground,
    headerGridLineColor: g.headerLine,
    selectionFillColor: g.selectionFill,
    selectionBorderColor: g.selectionBorder,
    headerSelectionFillColor: g.headerSelectionFill,
    headerSelectionBorderColor: g.selectionBorder,
    cursorFillColor: g.cursorFill,
    cursorBorderColor: g.cursorBorder,
    ...(shadow ? { scrollShadow: shadow } : {})
  };
}

/**
 * The renderer carries cell text — PRD §8.6.2 D2.
 *
 * "Styling the grid and forgetting the renderer produces a themed frame around
 * stock-black text, which reads as a bug in dark mode." Lumino's default
 * `TextRenderer` hardcodes `#000000` and a 12px sans font, so a grid with only
 * `buildGridStyle` applied looks correct in light mode and broken in dark, which
 * is exactly the failure that survives review.
 */
export function buildTextRenderer(isLight: boolean): TextRenderer {
  const t = tokensFor(isLight);
  const g = t.color.grid;

  const isHeader = (config: CellRenderer.CellConfig) =>
    config.region !== 'body';

  return new TextRenderer({
    // Canvas font shorthand — `weight size family`. Body cells are mono so that
    // numeric columns align digit-for-digit and so a value reads the same here as
    // it does in the editor and the variables tree (D1, D5).
    font: config =>
      isHeader(config)
        ? `${t.font.weight.semibold} ${t.font.size.ui.sm} ${t.font.family.ui}`
        : `${t.font.weight.regular} ${t.font.size.code} ${t.font.family.mono}`,
    textColor: config => (isHeader(config) ? g.headerText : g.text),
    // backgroundColor is left unset on purpose: the renderer paints per cell and
    // would overpaint the row striping and the selection fill from the style above.
    verticalAlignment: 'center',
    horizontalAlignment: 'left',
    elideDirection: 'right',
    wrapText: false
  });
}

/**
 * Lumino's scroll shadow is a three-stop gradient, and §8.6.2 gives one token.
 * Deriving the ramp by scaling that token's alpha keeps the shadow tied to the
 * palette instead of introducing a literal the CI lint would (rightly) reject.
 */
function buildScrollShadow(
  token: string
): { size: number; color1: string; color2: string; color3: string } | null {
  const parsed = /^rgba?\(([^)]+)\)$/i.exec(token.trim());
  if (!parsed) {
    // Not an rgb()/rgba() token. Omitting the key leaves Lumino's own shadow,
    // which is neutral enough to be unremarkable in either mode.
    return null;
  }
  const parts = parsed[1].split(',').map(part => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) {
    return null;
  }
  const [r, gr, b] = parts;
  const alpha = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
  const at = (factor: number) =>
    `rgba(${r}, ${gr}, ${b}, ${(alpha * factor).toFixed(3)})`;

  return {
    size: SCROLL_SHADOW_SIZE,
    color1: at(1),
    color2: at(0.3),
    color3: at(0)
  };
}
