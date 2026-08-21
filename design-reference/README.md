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
| `data4now/JupyterLab Theme.html` | The primary mockup — the full JupyterLab interface as designed. **Truncated, see below.** |
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

### 1. The main mockup is truncated

`JupyterLab Theme.html` is exactly **262 144 bytes** — the 256 KiB cap on the
design API's file read. It ends mid-JSX. Missing from the end:

- the rest of `NotifHost`,
- all of `TooltipHost`,
- all of `OverlayHost`, which contains the actual connection-lost banner and
  splash screen markup.

The **CSS** for those surfaces is present (around L2728–3103), so they are
partially recoverable, but the markup and copy are not. Tracked as `TODO.md`
**P0-02**; two screenshots (`01-launcher.png`, `01-menu.png`) also failed to
import.

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
