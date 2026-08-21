# Third-party extension compatibility matrix

Implementation status of PRD §10.4. The first three columns are the PRD table
verbatim; the last three are what `@d4n/compat-shim` actually ships today.

**How to read the confidence column.** Every selector in this package was taken
from the upstream extension's published stylesheet, not from a running install.
"High" means the selector belongs to a package whose class names are a stable
public surface (`@codemirror/lint`, nbdime's `--jp-diff-*`). "Medium" means it
is the extension's own class name, plausible and current as of the version
listed, but unverified. The §10.3 selector-integrity run is what turns a medium
into a fact — it boots each supported JupyterLab and asserts every selector
matches at least one element, so a stale guess fails loudly instead of quietly
doing nothing.

| Extension                           | Priority | PRD treatment                                   | Shipped today                                                                                                                                                              | Still unstyled                                                                                                                                                                                                                                           | Confidence                                                |
| ----------------------------------- | -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `jupyterlab-git`                    | P0       | Full compat CSS in `compat-shim`                | `vendor/jupyterlab-git.css` — nbdime's four `--jp-diff-*` variables remapped; diff root, banner, and error container                                                       | CodeMirror 6 merge decorations used for text (non-notebook) diffs in 0.51+                                                                                                                                                                               | High (nbdime vars) / Medium (`.jp-git-diff-*`)            |
| `jupyterlab-lsp`                    | P0       | Full compat CSS                                 | `vendor/jupyterlab-lsp.css` — diagnostic squiggles retinted via `underline wavy`, lint tooltip and panel, diagnostics listing, status-bar item                             | Hover box, signature help, and completer documentation panel — all read `--jp-*` and are covered by the Tier-4 adapter, so nothing is shipped for them by design                                                                                         | High (`.cm-lint*`, `.cm-diagnostic*`) / Medium (`.lsp-*`) |
| `jupyterlab_widgets` (ipywidgets)   | P0       | Token mapping + CSS                             | `vendor/ipywidgets.css` — the `--jp-widgets-*` map, nouislider track/handle/tooltip/pips, widget buttons and file upload, dropdown chevron                                 | Widget-specific dimensions (`--jp-widgets-inline-width`, `-vertical-height`, `-progress-thickness`, `-slider-handle-size`, `-slider-track-thickness`, `-horizontal-tab-width`, `-radio-item-height*`) — no token behind them; ipywidgets' defaults stand | High                                                      |
| `jupyterlab-execute-time`           | P1       | Token mapping                                   | `vendor/jupyterlab-execute-time.css` — tabular numerals and the UI type ramp on the timestamp                                                                              | Nothing. The extension already reads `--jp-*`; the adapter covers it                                                                                                                                                                                     | Medium                                                    |
| `jupyterlab-variableinspector`      | P1       | Compat CSS                                      | `vendor/jupyterlab-variableinspector.css` — panel, table header, rows, hover, delete button, styled from `color.grid.*` so it matches the CSV viewer and the debugger grid | Matrix/array preview popouts                                                                                                                                                                                                                             | Medium                                                    |
| `jupytext`                          | P1       | Token mapping                                   | `vendor/jupytext.css` — **no rules, by design**                                                                                                                            | Nothing. The extension contributes only menu commands, already styled by `@d4n/ui-overrides`                                                                                                                                                             | n/a                                                       |
| `jupyterlab-drawio` / diagram tools | P2       | Best-effort                                     | Nothing                                                                                                                                                                    | Everything. The drawio canvas is an embedded iframe app with its own theme; CSS from the host document does not reach it                                                                                                                                 | n/a                                                       |
| `dask-labextension`                 | P2       | Best-effort                                     | Nothing                                                                                                                                                                    | Everything. Dashboards are Bokeh documents rendered in iframes                                                                                                                                                                                           | n/a                                                       |
| Long tail                           | P3       | Documented "may not match" + contribution guide | Nothing, but `@d4n/compat-shim:plugin` logs any installed package with no vendor file, so the gap is discoverable from the console rather than from a screenshot           | Everything                                                                                                                                                                                                                                               | n/a                                                       |

## What a P0/P1 row owes

Per PRD §10.4, P0 and P1 rows get dedicated Galata snapshots in both modes.
`SHIMMED_PACKAGES` in `src/index.ts` is the list those snapshots should be
driven from; keeping it and this table in sync is the whole maintenance
contract for this package.

## Adding an extension

1. Install it and find what actually breaks in **dark** mode. Light mode rarely
   exposes a hardcoded colour — that is what it was hardcoded against.
2. Check whether it reads `--jp-*`. If it does, the Tier-4 adapter already
   reaches it and the answer is a row in this table saying so, not a CSS file.
   `jupytext` and `jupyterlab-execute-time` are both this case.
3. If it defines its own `--jp-<name>-*` variables, map them in the vendor file.
   They do **not** go in `mapping/jp-adapter.yaml` — Appendix A excludes
   third-party variables from the generated adapter on purpose.
4. Write `style/vendor/<extension>.css` with a header naming the package, the
   version range, and what it hardcodes. Import it from `style/index.css`, add
   the package name to `SHIMMED_PACKAGES`, and add the row here.
5. Scope every rule under `body[data-jp-theme-name^='Data4Now']`, use only
   `var(--d4n-*)` values, and keep the rule set small where you are guessing.
   A wrong selector is not neutral — it is maintenance owed forever on
   something that never worked.
