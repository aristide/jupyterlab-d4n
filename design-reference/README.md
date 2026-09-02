# Design reference

The Data4Now design system, imported from the Claude Design project
[`019e1221-825f-7189-a6ef-20715b9d78a2`](https://claude.ai/design/p/019e1221-825f-7189-a6ef-20715b9d78a2)
via the `claude_design` MCP.

**This directory is reference material, not source.** Nothing here is built,
imported or shipped. The implementation lives in `packages/`; this is what it
was derived from, kept in-tree so a future reader can check the derivation
without needing access to the design project.

## What's here

| Path | What it is |
| --- | --- |
| `data4now/JupyterLab Theme.html` | The primary mockup — the full JupyterLab interface as designed. Complete, 7158 lines. |
| `data4now/JupyterLab Theme (standalone export).html` | The bundle the file above was rebuilt from. Do not read it. See below. |
| `data4now/Form Controls.html` | Form control specimens |
| `data4now/Icon Set.html` | Icon specimen sheet |
| `data4now/Status Pages.html` | JupyterHub status pages (out of scope here) |
| `data4now/COMPONENT-INDEX.md` | Index of components across the mockups |
| `data4now/README.md` | The design system's own integration guide |
| `data4now/assets/colors_and_type.css` | The brand token foundation — colours, type, spacing, radii, motion |
| `data4now/preview-assets/` | Logos and the shared preview CSS |
| `data4now/icons/` | **120 SVG icons** in ten groups, plus `index.json` and `sprite.svg` |
| `data4now/jupyterlab-data4now-theme/` | An earlier, hand-written draft theme (see below) |
| `data4now/screenshots/` | Rendered previews |

## Two things to know before you use this

### 1. The main mockup was truncated, and is now complete

The first import stopped at exactly **262 144 bytes** — the 256 KiB cap on
`DesignSync get_file`. It ended mid-JSX, without the tail of `NotifHost` and
without `TooltipHost` or `OverlayHost`.

On 2026-09-02 the page was exported again, as a **standalone HTML file**, and
the document was rebuilt from it. `JupyterLab Theme.html` is now 7158 lines and
ends with `</body></html>`.

**The export is a bundle, not a document.** The page sits inside a
`<script type="__bundler/template">` block as one JSON string, three of its
lines are larger than 300 KB, and every external reference is replaced by an
opaque asset id. `grep` and line numbers do not work on it. Read
`JupyterLab Theme.html` instead. To rebuild it after a new export:

```
node scripts/decode-standalone-export.mjs \
  "design-reference/data4now/JupyterLab Theme (standalone export).html" \
  "design-reference/data4now/JupyterLab Theme.html"
```

That script undoes the three bundler rewrites: it extracts the page, puts back
the `<link>` to `preview-assets/colors_and_type.css` that the bundler inlined,
and restores each external reference. It fails loudly on an asset id that it
does not know.

**The rebuilt file keeps the old line numbering.** Lines 1 to 6962 differ from
the truncated copy in 40 places, and every one is a same-line substitution:
expanded self-closing SVG tags, `&gt;` escaping, and `selected=""`. No CSS line
moved. An `L####` reference written against the truncated copy still points at
the same rule.

Two screenshots still failed to import: `01-launcher.png` and `01-menu.png`.

### 2. `jupyterlab-data4now-theme/` is a draft, and we did not adopt it

It is a hand-written JupyterLab theme that predates this project: two
`variables*.css` files assigning `--jp-*` directly, plus structural CSS. It was
the starting point for the token work and it is genuinely useful — most of the
palette came from it.

But it is exactly what PRD §5.2 rule 1 forbids: a hand-maintained Tier 4. Our
`mapping/jp-adapter.yaml` replaces it, and every departure from the draft's
values is recorded either in a `$description` on the token or in
`docs/decisions.md`.

The notable departures:

- **Text and border ramps moved.** The draft's values failed the contrast audit
  in eleven places. Every change carries a `$description` naming the measured
  ratio that forced it.
- **Search highlighting changed hue.** The draft tinted matches teal and the
  current match magenta; PRD §8.8.2 specifies warning for both, and magenta is
  already the danger intent — a search hit is not an error.
- **Elevation.** The draft expresses dark-mode elevation as shadow opacity. PRD
  §9 requires surface lightness instead; shadows are near-invisible on dark
  surfaces and a shadow-only system reads flat.
- **`@import` of Google Fonts.** Both draft files fetch Montserrat, Roboto and
  JetBrains Mono from a CDN. PRD §4.2 requires the interface to render fully
  offline with no network, so the fonts are bundled instead (`TODO.md` P0-05).

## What the design system did not supply

Found while deriving the tokens, and worth knowing because each one was authored
here rather than adopted:

- **A 16-colour ANSI palette.** The mockup has 11 single-intensity `.ansi-*`
  classes, no black, no normal/bright pairs, and `.ansi-magenta` is a duplicate
  of `.ansi-red`. PRD §8.7.2 requires one token group generating both the
  terminal and the notebook output; that group is new.
- **A Lumino DataGrid style.** Completely absent. The only tabular design is the
  rendermime `.jp-df` pandas table.
- **A CodeMirror 6 `HighlightStyle`.** The draft supplies legacy CM5-era
  `--jp-mirror-editor-*` variables and nine preview-only `.tok-*` classes. No
  Lezer tag mapping, no editor chrome.
- **Heading levels 4–6 in the table of contents.** Three levels are designed;
  PRD §8.10.1 needs six.
- **Empty / loading / error / permission-denied states.** Essentially none, for
  any panel. PRD §6.7 calls this out as net-new design work rather than
  restyling, and it is.
- **A `prefers-reduced-motion` guard.** Nine keyframe animations, no guard.
- **A focus treatment for most surfaces.** Only buttons, dialog buttons and a
  few inputs define one. PRD A5 requires every focusable element.

These are gaps in the reference, not defects — the design was drawn for a
mockup, and a mockup does not have to survive a keyboard user or a canvas
renderer. They are all tracked in `TODO.md`.

## Refreshing this

Re-import through the `claude_design` MCP (`DesignSync`, `method: get_file`)
after authenticating with `/design-login`. Keep the directory a faithful mirror:
if a file needs changing, change it in the design project and re-import, so the
two do not silently diverge.
