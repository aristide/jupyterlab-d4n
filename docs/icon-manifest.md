# Icon manifest — the `LabIcon` registry, measured

TODO **P0-04**. Answers PRD **Q4** ("how many icons actually need authoring?").

This file is a record of what is in a running JupyterLab, not an estimate. Every
name below was read out of the live `LabIcon` registry of the container at
`http://localhost:8888/lab` (JupyterLab 4.5, `jupyterlab_d4n` installed), and
every "observed on" entry is a `data-icon` attribute that was actually in the DOM
when that surface was on screen.

That distinction is the whole point of the exercise. `LabIcon.resolve()` does not
throw on an unknown name — it registers a placeholder under it — so a wrong
registry name is a **silent no-op** that also poisons the registry for whichever
extension registers that name next. You cannot test an icon override by looking
at it and thinking it looks right; you have to ask the registry.

---

## How to reproduce this

`@d4n/icons` exports `auditRegistry()`, which reads `LabIcon._instances` and
scores `OVERRIDES` against it. JupyterLab exposes no application global (there
is no `window.jupyterapp` in a 4.5 build), so the way in is the webpack module
federation container that JupyterLab has already initialised:

```js
const mod = (await window._JUPYTERLAB['@d4n/icons'].get('./index'))();
mod.auditRegistry();
```

The load-bearing field is `applied`: not "this name is in `OVERRIDES`", but
"this registered icon's live `svgstr` is byte-identical to our asset". The
per-surface census is the complementary DOM measurement — `LabIcon` writes
`svgElement.dataset.icon = this.name`, so `[data-icon]` in a rendered panel is
the registry name, verbatim, at the point of use.

Two things this method cannot see, and neither is a footnote:

1. **Third-party extensions that are not installed.** A labextension registers
   its icons on activation, so a name's absence here is evidence about _this
   image_, not about the name. That is the entire remaining contents of
   `PENDING`.
2. **The `--jp-icon-*` background-image channel.** `ui-components/style/deprecated.css`
   is loaded in this build and defines ~120 `--jp-icon-<name>` custom properties,
   each a base64 stock SVG with `fill="#616161"` baked in. `LabIcon` overrides do
   not touch them. Right now **zero** elements in the live document consume one
   (measured with `getComputedStyle().backgroundImage` over every node), so this
   is latent rather than broken — but any surface that starts using one renders a
   stock grey glyph that no icon work here can reach and that will not follow the
   theme. Worth a lint if it ever shows up.

---

## Headline numbers

|                                                    |                                            |
| -------------------------------------------------- | ------------------------------------------ |
| Names in the live registry                         | **129**                                    |
| …under `ui-components:`                            | 127                                        |
| …under any other prefix                            | 2 (`completer:inline`, `completer:widget`) |
| …registered by a `@jupyterlab/*-extension` package | **0**                                      |
| Data4Now assets on disk                            | 120                                        |
| Names now overridden and verified applied          | **57** (44%)                               |
| Deferred by decision (language marks, I6)          | 3                                          |
| Excluded — Jupyter trademarks                      | 3                                          |
| Must never be overridden (`blank`)                 | 1                                          |
| **NEEDS AUTHORING**                                | **65**                                     |
| D4N assets used by `OVERRIDES`                     | 55 distinct files                          |
| D4N assets currently unused                        | 62                                         |

**The PRD's "~180 icons" estimate is high.** The real figure for a stock 4.5
build with no third-party extensions is 129. Of those, 57 are done. Counting the
way a user experiences it — icon _slots_ on the sixteen surfaces measured below
— coverage is **78 of 100**, because the covered names are the frequently
rendered ones and the gaps cluster in two panels.

The 65-name authoring backlog is also not 65 pieces of work: it is roughly
**eleven families** (see the brief at the end), and four of them are pairs or
quartets where the missing half is a mirror of something the export already
ships.

---

## What the audit disproved

Five of the seven `PENDING` rows named registry keys that **do not exist**:

| retired guess                  | what actually renders there                       |
| ------------------------------ | ------------------------------------------------- |
| `filebrowser:filter`           | `ui-components:filter` — already overridden       |
| `filebrowser:new-directory`    | `ui-components:new-folder` — no D4N asset         |
| `notebook:restart-kernel`      | `ui-components:refresh` — already overridden      |
| `notebook:restart-and-run-all` | `ui-components:fast-forward` — **now overridden** |
| `notebook:interrupt-kernel`    | `ui-components:stop` — already overridden         |

Every one of them is plausible. Every one of them would have been a silent
no-op, and two of them would have left a `_loading` placeholder in the registry
under a name core does not use. This is the result the `PENDING` list existed to
produce, and it is the reason none of these were shipped on plausibility.

What remains in `PENDING` is only the class the method cannot settle:
`jupyterlab-git:git` and `jupyterlab-git:branch`, whose extension is not
installed in this image.

---

## What was promoted, and the evidence

Four names moved into `OVERRIDES`. Each was confirmed present in the registry;
the first three were then confirmed by comparing the rendered `<svg>`'s path data
against the asset file on disk.

| name                             | asset                          | evidence                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-components:fast-forward`     | `svg/toolbar/run-all.svg`      | Rendered in `.jp-NotebookPanel-toolbar`; live `d="M5 5l7 7-7 7V5Z"` + second path both match the asset exactly, `stroke-width="1.6"` present.                                                                                                                       |
| `ui-components:exceptions`       | `svg/status/warning.svg`       | Rendered in `#jp-debugger-sidebar`; live `d="M12 3.5 21 19H3L12 3.5Z"` + bang path match. Core's glyph is a triangle-with-bang, so this is the same idea, not a substitute.                                                                                         |
| `ui-components:caret-down-empty` | `svg/actions/chevron-down.svg` | Rendered in the notebook toolbar's cell-type `HTMLSelect` and every debugger section twisty; live `d="m6 9 6 6 6-6"` matches. Core draws this one as an outline chevron, which is literally our asset's shape.                                                      |
| `ui-components:dots`             | `svg/actions/more-v.svg`       | Registry-confirmed only. Core's `dots.svg` is `ellipses.svg` under `transform="rotate(90,12,12)"`, and we already own `ellipses`. **Nothing in core 4.5 renders it** (its only consumers are `--jp-icon-dots` and third-party code), so there is no pixel to check. |

`ui-components:caret-down-empty` and `caret-down` now share `chevron-down.svg`.
That is deliberate: core's filled/outline distinction carries no meaning at 16px,
and the precedent already exists (`file` and `text-editor` share `text-file.svg`).

---

## Defects this audit found

These are not gaps, they are _asymmetries_ — cases where we override one half of
a pair that core renders together, so the two halves ship at different weights.
Each is more visible than a fully stock icon would be.

1. **`caret-up` / `caret-down` in the file-browser sort header.** `caret-down` is
   ours, `caret-up` is stock. They sit in the same column header and swap on
   click, so the glyph changes weight as you sort. Highest-priority authoring
   item in the whole list, and it is one mirrored path.
2. **`trusted` / `not-trusted` in the status bar.** `trusted` is our
   `identity/shield.svg`; `not-trusted` is a stock stroked shield. They occupy
   the _same_ status-bar slot and alternate with the notebook's trust state.
3. **`filter` / `filter-dot` in the file-browser filter box.** Same slot,
   alternating on whether a filter is active.
4. **`bug` / `bug-dot`** — the debugger rail icon and its "has breakpoints"
   variant.
5. **The cell toolbar is 2 of 6.** `delete` and `duplicate` are ours;
   `add-above`, `add-below`, `move-up`, `move-down` are stock. Six icons, one
   row, 24px apart — this is the most concentrated visible inconsistency in the
   product.

Deciding to leave a family stock is fine (PRD §7.8.3, and P0-06 is exactly that
decision). Leaving _half_ a family stock is not.

---

## Per-surface census

Sixteen surfaces, driven in a real browser. `blank` is excluded from the counts —
it is a deliberate empty glyph, not a gap. "deferred" is the language marks plus
the Jupyter trademarks.

| surface                         | D4N    | deferred | needs authoring | total   | still stock                                                        |
| ------------------------------- | ------ | -------- | --------------- | ------- | ------------------------------------------------------------------ |
| Top panel                       | 0      | 1        | 0               | 1       | —                                                                  |
| Left rail                       | 5      | 0        | 0               | 5       | —                                                                  |
| Right rail                      | 1      | 0        | 1               | 2       | `build`                                                            |
| Status bar                      | 3      | 0        | 1               | 4       | `bell`                                                             |
| Dock tab bar                    | 4      | 0        | 0               | 4       | —                                                                  |
| Launcher                        | 5      | 1        | 1               | 7       | `console`                                                          |
| File browser                    | 6      | 0        | 2               | 8       | `caret-up` `new-folder`                                            |
| Running sessions                | 10     | 0        | 2               | 12      | `cleaning` `collapse-all`                                          |
| Table of contents               | 2      | 0        | 1               | 3       | `collapse-all`                                                     |
| Extension manager               | 4      | 0        | 0               | 4       | —                                                                  |
| Debugger panel                  | 6      | 0        | 6               | 12      | `close-all` `pause` `step-into` `step-out` `step-over` `tree-view` |
| Notebook toolbar                | 12     | 0        | 0               | 12      | —                                                                  |
| Cell toolbar                    | 2      | 0        | 4               | 6       | `add-above` `add-below` `move-down` `move-up`                      |
| Menu dropdowns                  | 2      | 0        | 0               | 2       | —                                                                  |
| Context menu (file browser)     | 15     | 1        | 1               | 17      | `new-folder`                                                       |
| Command palette                 | 1      | 0        | 0               | 1       | —                                                                  |
| **all surfaces (with repeats)** | **78** | **3**    | **19**          | **100** |                                                                    |

Reading it:

- **The chrome is done.** Left rail 5/5, dock tab bar 4/4, notebook toolbar
  12/12, extension manager 4/4, command palette 1/1, menu dropdowns 2/2.
- **The debugger is half.** 6 of 12, and the six missing ones are the stepping
  controls — the icons a debugging user looks at continuously. This is the
  single biggest concentration of work and it blocks nothing until P3-09/P3-10.
- **The cell toolbar is the worst ratio** (2/6) and the smallest fix.
- The menu bar renders **no** icons at all, and top-level menus render only
  `caret-right` (submenu indicator) and `check` (toggle state). JupyterLab's
  menus are essentially icon-free; the icons live in **context** menus (17
  distinct in the file browser's). That is a material input to **P0-06** — the
  "inherit core's partial coverage" failure mode the task warns about barely
  exists in the menu bar, because core's coverage there is _zero_.

---

## Full registry

Status legend: **OVERRIDDEN** (applied and verified) · **DEFERRED — I6**
(asset ready, held for the trademark decision, D-010) · **EXCLUDED — trademark**
(belongs to the logo work, PRD §8.9 / P0-07) · **NEVER OVERRIDE** ·
**NEEDS AUTHORING**.

| #   | registry name                         | status               | Data4Now asset                           | observed on                                                                         |
| --- | ------------------------------------- | -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `completer:inline`                    | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 2   | `completer:widget`                    | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 3   | `ui-components:add`                   | OVERRIDDEN           | `svg/actions/plus.svg`                   | Dock tab bar, File browser, Notebook toolbar, Context menu (file browser)           |
| 4   | `ui-components:add-above`             | NEEDS AUTHORING      | —                                        | Cell toolbar                                                                        |
| 5   | `ui-components:add-below`             | NEEDS AUTHORING      | —                                        | Cell toolbar                                                                        |
| 6   | `ui-components:audio`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 7   | `ui-components:bad`                   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 8   | `ui-components:bell`                  | NEEDS AUTHORING      | —                                        | Status bar                                                                          |
| 9   | `ui-components:blank`                 | NEVER OVERRIDE       | — _(deliberate empty glyph)_             | Running sessions                                                                    |
| 10  | `ui-components:breakpoint`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 11  | `ui-components:bug`                   | OVERRIDDEN           | `svg/sidebar/debugger.svg`               | Right rail, Notebook toolbar                                                        |
| 12  | `ui-components:bug-dot`               | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 13  | `ui-components:build`                 | NEEDS AUTHORING      | —                                        | Right rail                                                                          |
| 14  | `ui-components:caret-down`            | OVERRIDDEN           | `svg/actions/chevron-down.svg`           | Running sessions, Extension manager, Debugger panel                                 |
| 15  | `ui-components:caret-down-empty`      | OVERRIDDEN           | `svg/actions/chevron-down.svg`           | Debugger panel, Notebook toolbar                                                    |
| 16  | `ui-components:caret-down-empty-thin` | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 17  | `ui-components:caret-left`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 18  | `ui-components:caret-right`           | OVERRIDDEN           | `svg/actions/chevron-right.svg`          | Menu dropdowns, Context menu (file browser)                                         |
| 19  | `ui-components:caret-up`              | NEEDS AUTHORING      | —                                        | File browser                                                                        |
| 20  | `ui-components:caret-up-empty-thin`   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 21  | `ui-components:case-sensitive`        | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 22  | `ui-components:check`                 | OVERRIDDEN           | `svg/status/check.svg`                   | Running sessions, Menu dropdowns                                                    |
| 23  | `ui-components:circle`                | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 24  | `ui-components:circle-empty`          | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 25  | `ui-components:cleaning`              | NEEDS AUTHORING      | —                                        | Running sessions                                                                    |
| 26  | `ui-components:clear`                 | OVERRIDDEN           | `svg/toolbar/clear.svg`                  | —                                                                                   |
| 27  | `ui-components:close`                 | OVERRIDDEN           | `svg/actions/close.svg`                  | Dock tab bar, Running sessions, Context menu (file browser)                         |
| 28  | `ui-components:close-all`             | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 29  | `ui-components:code`                  | OVERRIDDEN           | `svg/notebook/cell-code.svg`             | Debugger panel                                                                      |
| 30  | `ui-components:code-check`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 31  | `ui-components:collapse`              | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 32  | `ui-components:collapse-all`          | NEEDS AUTHORING      | —                                        | Running sessions, Table of contents                                                 |
| 33  | `ui-components:console`               | NEEDS AUTHORING      | —                                        | Launcher                                                                            |
| 34  | `ui-components:copy`                  | OVERRIDDEN           | `svg/toolbar/copy.svg`                   | Notebook toolbar, Context menu (file browser)                                       |
| 35  | `ui-components:copyright`             | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 36  | `ui-components:cut`                   | OVERRIDDEN           | `svg/toolbar/cut.svg`                    | Notebook toolbar, Context menu (file browser)                                       |
| 37  | `ui-components:delete`                | OVERRIDDEN           | `svg/actions/trash.svg`                  | Running sessions, Cell toolbar                                                      |
| 38  | `ui-components:dock-bottom`           | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 39  | `ui-components:dock-left`             | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 40  | `ui-components:dock-right`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 41  | `ui-components:dock-top`              | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 42  | `ui-components:dots`                  | OVERRIDDEN           | `svg/actions/more-v.svg`                 | —                                                                                   |
| 43  | `ui-components:download`              | OVERRIDDEN           | `svg/actions/download.svg`               | Context menu (file browser)                                                         |
| 44  | `ui-components:duplicate`             | OVERRIDDEN           | `svg/actions/duplicate.svg`              | Cell toolbar                                                                        |
| 45  | `ui-components:edit`                  | OVERRIDDEN           | `svg/actions/edit.svg`                   | Context menu (file browser)                                                         |
| 46  | `ui-components:ellipses`              | OVERRIDDEN           | `svg/actions/more-h.svg`                 | Table of contents, Notebook toolbar                                                 |
| 47  | `ui-components:error`                 | OVERRIDDEN           | `svg/status/error-x.svg`                 | —                                                                                   |
| 48  | `ui-components:exceptions`            | OVERRIDDEN           | `svg/status/warning.svg`                 | Debugger panel                                                                      |
| 49  | `ui-components:expand`                | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 50  | `ui-components:expand-all`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 51  | `ui-components:extension`             | OVERRIDDEN           | `svg/sidebar/extensions.svg`             | Left rail                                                                           |
| 52  | `ui-components:fast-forward`          | OVERRIDDEN           | `svg/toolbar/run-all.svg`                | Notebook toolbar                                                                    |
| 53  | `ui-components:file`                  | OVERRIDDEN           | `svg/file-types/text-file.svg`           | Context menu (file browser)                                                         |
| 54  | `ui-components:file-upload`           | OVERRIDDEN           | `svg/actions/upload.svg`                 | File browser                                                                        |
| 55  | `ui-components:filter`                | OVERRIDDEN           | `svg/actions/filter.svg`                 | File browser                                                                        |
| 56  | `ui-components:filter-dot`            | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 57  | `ui-components:filter-list`           | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 58  | `ui-components:folder`                | OVERRIDDEN           | `svg/file-types/folder.svg`              | Left rail, File browser, Context menu (file browser)                                |
| 59  | `ui-components:folder-favorite`       | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 60  | `ui-components:history`               | OVERRIDDEN           | `svg/data/history.svg`                   | —                                                                                   |
| 61  | `ui-components:home`                  | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 62  | `ui-components:html5`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 63  | `ui-components:image`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 64  | `ui-components:info`                  | OVERRIDDEN           | `svg/status/info.svg`                    | Extension manager                                                                   |
| 65  | `ui-components:inspector`             | OVERRIDDEN           | `svg/sidebar/inspector.svg`              | Launcher                                                                            |
| 66  | `ui-components:json`                  | OVERRIDDEN           | `svg/file-types/json.svg`                | Context menu (file browser)                                                         |
| 67  | `ui-components:julia`                 | DEFERRED — I6        | `svg/kernels/julia.svg` _(not applied)_  | —                                                                                   |
| 68  | `ui-components:jump-back`             | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 69  | `ui-components:jump-forward`          | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 70  | `ui-components:jupyter`               | EXCLUDED — trademark | — _(PRD §8.9 / P0-07)_                   | Top panel                                                                           |
| 71  | `ui-components:jupyter-favicon`       | EXCLUDED — trademark | — _(PRD §8.9 / P0-07)_                   | —                                                                                   |
| 72  | `ui-components:jupyterlab-wordmark`   | EXCLUDED — trademark | — _(PRD §8.9 / P0-07)_                   | —                                                                                   |
| 73  | `ui-components:kernel`                | OVERRIDDEN           | `svg/sidebar/kernel.svg`                 | Status bar, Running sessions                                                        |
| 74  | `ui-components:keyboard`              | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 75  | `ui-components:launch`                | OVERRIDDEN           | `svg/actions/external.svg`               | —                                                                                   |
| 76  | `ui-components:launcher`              | OVERRIDDEN           | `svg/notebook/launcher.svg`              | Dock tab bar, Running sessions                                                      |
| 77  | `ui-components:line-form`             | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 78  | `ui-components:link`                  | OVERRIDDEN           | `svg/actions/link.svg`                   | Context menu (file browser)                                                         |
| 79  | `ui-components:list`                  | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 80  | `ui-components:lock`                  | OVERRIDDEN           | `svg/identity/lock.svg`                  | —                                                                                   |
| 81  | `ui-components:markdown`              | OVERRIDDEN           | `svg/file-types/markdown.svg`            | Launcher                                                                            |
| 82  | `ui-components:mermaid`               | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 83  | `ui-components:move-down`             | NEEDS AUTHORING      | —                                        | Cell toolbar                                                                        |
| 84  | `ui-components:move-up`               | NEEDS AUTHORING      | —                                        | Cell toolbar                                                                        |
| 85  | `ui-components:new-folder`            | NEEDS AUTHORING      | —                                        | File browser, Context menu (file browser)                                           |
| 86  | `ui-components:not-trusted`           | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 87  | `ui-components:notebook`              | OVERRIDDEN           | `svg/file-types/notebook.svg`            | Dock tab bar, Launcher, File browser, Running sessions, Context menu (file browser) |
| 88  | `ui-components:numbering`             | OVERRIDDEN           | `svg/sidebar/line-numbers.svg`           | Table of contents                                                                   |
| 89  | `ui-components:offline-bolt`          | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 90  | `ui-components:open-kernel-source`    | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 91  | `ui-components:palette`               | OVERRIDDEN           | `svg/sidebar/commands.svg`               | Left rail                                                                           |
| 92  | `ui-components:paste`                 | OVERRIDDEN           | `svg/toolbar/paste.svg`                  | Notebook toolbar, Context menu (file browser)                                       |
| 93  | `ui-components:pause`                 | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 94  | `ui-components:pdf`                   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 95  | `ui-components:python`                | DEFERRED — I6        | `svg/kernels/python.svg` _(not applied)_ | Launcher, Context menu (file browser)                                               |
| 96  | `ui-components:r-kernel`              | DEFERRED — I6        | `svg/kernels/r-lang.svg` _(not applied)_ | —                                                                                   |
| 97  | `ui-components:react`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 98  | `ui-components:redo`                  | OVERRIDDEN           | `svg/actions/redo.svg`                   | —                                                                                   |
| 99  | `ui-components:refresh`               | OVERRIDDEN           | `svg/actions/refresh.svg`                | File browser, Running sessions, Extension manager, Notebook toolbar                 |
| 100 | `ui-components:regex`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 101 | `ui-components:run`                   | OVERRIDDEN           | `svg/toolbar/run.svg`                    | Notebook toolbar                                                                    |
| 102 | `ui-components:running`               | OVERRIDDEN           | `svg/sidebar/running.svg`                | Left rail                                                                           |
| 103 | `ui-components:save`                  | OVERRIDDEN           | `svg/toolbar/save.svg`                   | Notebook toolbar                                                                    |
| 104 | `ui-components:search`                | OVERRIDDEN           | `svg/actions/search.svg`                 | Extension manager, Command palette                                                  |
| 105 | `ui-components:selected-breakpoint`   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 106 | `ui-components:settings`              | OVERRIDDEN           | `svg/sidebar/settings.svg`               | —                                                                                   |
| 107 | `ui-components:share`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 108 | `ui-components:spreadsheet`           | OVERRIDDEN           | `svg/file-types/csv.svg`                 | —                                                                                   |
| 109 | `ui-components:step-into`             | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 110 | `ui-components:step-out`              | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 111 | `ui-components:step-over`             | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 112 | `ui-components:stop`                  | OVERRIDDEN           | `svg/toolbar/stop.svg`                   | Debugger panel, Notebook toolbar, Context menu (file browser)                       |
| 113 | `ui-components:tab`                   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 114 | `ui-components:table-rows`            | OVERRIDDEN           | `svg/file-types/table.svg`               | Running sessions, Debugger panel                                                    |
| 115 | `ui-components:tag`                   | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 116 | `ui-components:terminal`              | OVERRIDDEN           | `svg/file-types/terminal-file.svg`       | Status bar, Launcher, Running sessions                                              |
| 117 | `ui-components:text-editor`           | OVERRIDDEN           | `svg/file-types/text-file.svg`           | Launcher, Context menu (file browser)                                               |
| 118 | `ui-components:toc`                   | OVERRIDDEN           | `svg/sidebar/toc.svg`                    | Left rail                                                                           |
| 119 | `ui-components:tree-view`             | NEEDS AUTHORING      | —                                        | Debugger panel                                                                      |
| 120 | `ui-components:trusted`               | OVERRIDDEN           | `svg/identity/shield.svg`                | Status bar                                                                          |
| 121 | `ui-components:undo`                  | OVERRIDDEN           | `svg/actions/undo.svg`                   | —                                                                                   |
| 122 | `ui-components:user`                  | OVERRIDDEN           | `svg/identity/user.svg`                  | —                                                                                   |
| 123 | `ui-components:users`                 | OVERRIDDEN           | `svg/identity/users.svg`                 | —                                                                                   |
| 124 | `ui-components:variable`              | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 125 | `ui-components:vega`                  | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 126 | `ui-components:video`                 | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 127 | `ui-components:view-breakpoint`       | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 128 | `ui-components:word`                  | NEEDS AUTHORING      | —                                        | —                                                                                   |
| 129 | `ui-components:yaml`                  | OVERRIDDEN           | `svg/file-types/yaml-config.svg`         | —                                                                                   |

---

## Authoring brief — the 65, grouped

Ordered by what it costs to fix, not alphabetically.

**Mirrors of assets we already ship (7).** `caret-up`, `caret-left`,
`caret-up-empty-thin`, `caret-down-empty-thin`, `move-up`, `move-down`,
`collapse`. The export has `chevron-down` and `chevron-right`; every one of these
is a rotation or reflection at the same stroke weight. Fixing `caret-up` alone
clears defect 1 above.

**Directional variants of assets we ship (4).** `add-above`, `add-below` (the
export's `toolbar/add-cell.svg` carries no direction), `expand`, `expand-all` /
`collapse-all`.

**"Same glyph plus a state dot" (3).** `filter-dot`, `bug-dot`,
`selected-breakpoint`. Each is an existing D4N glyph with one added circle.

**Negations (1).** `not-trusted` — `identity/shield.svg` with a slash.

**Debugger (10).** `step-into`, `step-out`, `step-over`, `jump-back`,
`jump-forward`, `pause`, `breakpoint`, `view-breakpoint`, `open-kernel-source`,
`variable`. `exceptions` is done. This is a coherent family and should be
authored as one.

**Docking (4).** `dock-top`, `dock-bottom`, `dock-left`, `dock-right`.
`sidebar/sidebar-left.svg`, `sidebar/sidebar-right.svg`,
`notebook/split-down.svg` and `notebook/split-right.svg` are close but not the
same idea (a rail vs a dock zone), and the family has no top variant at all —
map all four or none.

**File types and renderers (8).** `image`, `audio`, `video`, `pdf`, `html5`,
`react`, `vega`, `mermaid`.

**Search modifiers (3).** `regex`, `case-sensitive`, `word`. These are
letterform glyphs (`.*`, `Aa`, `ab|`), not pictograms — they need type, not
drawing.

**Status bar and chrome (7).** `bell`, `build`, `home`, `keyboard`, `list`,
`line-form`, `offline-bolt`. `bell` is always on screen; `build` is always on the
right rail. Both are higher priority than their family size suggests.

**File-browser actions (3).** `new-folder` (folder + plus — the export's
`file-types/folder-open.svg` is an open folder, which is a different verb),
`folder-favorite`, `cleaning`.

**Everything else (15).** `console`, `tab`, `share`, `tag`, `tree-view`,
`close-all`, `collapse-all`, `code-check`, `circle`, `circle-empty`, `bad`,
`copyright`, `completer:inline`, `completer:widget`, `filter-list`.

### Assets available but not mapped

Where a D4N asset is a _plausible_ match and I did not wire it, because the
choice is a design call rather than a factual one:

| registry name              | plausible asset                                  | why it is not wired                                                                                      |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `line-form`                | `actions/chevron-right.svg`                      | Shapes match (core's is a large `>`), but it is a decorative separator in the status bar, not a chevron. |
| `dock-left` / `dock-right` | `sidebar/sidebar-left.svg` / `sidebar-right.svg` | Half a family; `dock-top` has no candidate at all.                                                       |
| `dock-bottom`              | `notebook/split-down.svg`                        | A 50/50 split, not a bottom dock zone.                                                                   |
| `new-folder`               | `file-types/folder-open.svg`                     | Loses the `+`, which is the affordance.                                                                  |
| `code-check`               | `notebook/output.svg`                            | Lines-plus-check reads as "output", not "diagnostics".                                                   |
| `expand` / `collapse`      | `actions/expand.svg` / `actions/fullscreen.svg`  | Corner brackets; core's are the output collapser's up/down arrows.                                       |

### Unused assets (62)

The export is a Data4Now product icon set, not a JupyterLab one, so a third of it
has no JupyterLab counterpart: all eight of `compute/`, eleven of the thirteen
`data/` VCS glyphs, six of `identity/`. These are not waste — they are the input
for the surfaces the platform adds later (and `sidebar/git.svg` +
`data/branch.svg` are what `PENDING` is holding for). The ones that _are_
JupyterLab-shaped and still unused are listed as "plausible" above, plus
`toolbar/restart.svg` and `toolbar/interrupt.svg` — core routes both of those
buttons through `refresh` and `stop`, which we already own, so the dedicated
assets have no registry name to attach to.
