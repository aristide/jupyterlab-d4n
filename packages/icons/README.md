# `@d4n/icons`

Replaces JupyterLab's built-in `LabIcon` glyphs with the Data4Now icon set
(PRD §7.8).

The plugin declares `autoStart: true` and **no `requires`**, so it runs before
the first render — PRD §7.8 "Timing". Adding a dependency here, even an optional
one that gets promoted later, reintroduces the frame of stock icons the timing
rule exists to prevent.

---

## Regenerating `svg/`

`svg/` is generated. Do not hand-edit it.

```bash
yarn workspace @d4n/icons run icons:import   # rewrite svg/ from design-reference/
yarn workspace @d4n/icons run icons:check    # verify, no writes (CI)
```

The source of truth is `design-reference/data4now/icons/**/*.svg`. The importer
enforces PRD §7.8.4:

| Rule                         | Behaviour                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| No literal colour            | `fill`/`stroke`/`stop-color`/`flood-color`/`lighting-color`/`color`, as attributes and inside `style="…"`, are rewritten to `currentColor` |
| No `<style>` blocks          | stripped — they leak across every icon inlined into the same document                                                                      |
| No `id` attributes           | stripped — they collide once two icons are inlined                                                                                         |
| `<title>` on every icon (I5) | inserted from the filename when absent                                                                                                     |
| Geometry untouched           | path data, `viewBox`, `stroke-width` and `stroke-linecap` are never modified                                                               |

The importer **fails the build rather than guessing**. A value in a paint
position that is neither theme-safe nor a recognisable colour literal is
reported and the process exits non-zero. That covers `url(#gradient)`,
`<linearGradient>`/`<mask>`/`<use>` (all of which either bake colour or depend
on the `id`s being stripped), and unrecognised keywords — including
`var(--something)`, which happens to work but is outside the §7.8.4 contract and
should be an explicit decision, not a silent pass.

`--check` additionally fails if the committed `svg/` tree has drifted from what
the current sources would produce, so a hand-edit cannot survive CI.

The current export needs no colour rewriting at all — all 120 icons already ship
`stroke="currentColor"` / `fill="none"` — so the only change on import today is
the added `<title>`. The colour machinery is there for the next export.

---

## Coverage

`src/manifest.ts` holds three lists.

**`OVERRIDES`** — applied at activation. 53 names, every one read out of
`@jupyterlab/ui-components`'s generated `lib/icon/iconimports.js` rather than
recalled. Covers the sidebar rail, the notebook and file-browser toolbars, the
directional/control set, and the common file types.

**`LANGUAGE_MARKS`** — registered, real, and deliberately **not** applied:
`ui-components:python`, `:julia`, `:r-kernel`. PRD §7.8.2 recommends accepting
stock third-party language marks, because redrawing the Python, R and Julia
marks in house style is a trademark question before it is a design one. The
assets are imported and normalised; spreading this map into `OVERRIDES` is a
one-line change once criterion **I6** is signed off at P0.

**`PENDING`** — candidate names that could **not** be verified from source,
because they live in `@jupyterlab/*-extension` packages (shipped with the
application, not the libraries) or in third-party labextensions. They are never
applied. A wrong name is a silent no-op, so an unverified guess is worse than an
omission.

### Why a wrong name is silent

`LabIcon.resolve({ icon: 'typo:name' })` does not throw. It _creates_ a
placeholder icon under that name. So the `try`/`catch` in the PRD §7.8 code
sketch never fires, and worse, the placeholder it leaves behind is marked
`_loading`, which makes the `LabIcon` constructor hand the name to whichever
extension registers it next — the opposite of an override.

This plugin therefore looks names up in `LabIcon`'s registry (`_instances`, a
private static `Map`) instead of resolving them, and only writes to icons that
are genuinely there. If a future JupyterLab renames that field the plugin
degrades to `resolve()`, which is safe for the core `ui-components:` names in
`OVERRIDES` because those are registered eagerly on import.

### The P0 audit (TODO P5-01)

Only a running lab can enumerate the real registry. From the browser console:

```js
jupyterapp.commands.execute('d4n-icons:audit-registry');
```

It prints the registered names we do not cover, the deferred language marks, any
`OVERRIDES` key missing from this build, and each `PENDING` candidate annotated
with whether its name actually exists. That output is the P0 manifest.

---

## Asset gaps

Names that exist in `ui-components` and are **intentionally left stock** because
the design set has no equivalent asset. Each is design work, not code work, and
each is a visible stock glyph counting against criterion **I1**:

- Directional: `caret-up`, `caret-left`, `caret-up-empty-thin`,
  `caret-down-empty`, `caret-down-empty-thin`, `move-up`, `move-down` — the
  export ships `chevron-down` and `chevron-right` only.
- Paired expand/collapse: `expand`, `collapse`, `expand-all`, `collapse-all`.
  `actions/expand.svg` and `actions/fullscreen.svg` are near-identical corner
  brackets and neither reads as "collapse"; mapping one half of a pair and
  leaving the other stock is exactly the ragged result PRD §7.8.3 warns about.
- Cell insertion: `add-above`, `add-below` — `toolbar/add-cell.svg` carries no
  direction, so both would collapse to one glyph.
- Trust: `not-trusted` (`trusted` maps to `identity/shield.svg`).
- Docking: `dock-top`, `dock-bottom`, `dock-left`, `dock-right` — four related
  icons, and the export has only the two sidebar ones.
- Debugger stepping: `step-into`, `step-out`, `step-over`, `breakpoint`,
  `selected-breakpoint`, `view-breakpoint`, `exceptions`, `jump-back`,
  `jump-forward`, `fast-forward`, `pause`.
- Search modifiers: `regex`, `case-sensitive`, `word`.
- Miscellaneous file types and marks: `pdf`, `image`, `video`, `audio`, `html5`,
  `react`, `vega`, `mermaid`, `home`, `bell`, `tag`, `keyboard`, `build`.

Brand marks (`jupyter`, `jupyter-favicon`, `jupyterlab-wordmark`) are out of
scope here — they belong to PRD §8.9.

Unused assets in the export, kept because they are the obvious targets once the
runtime audit lands: `sidebar/git.svg`, `sidebar/comments.svg`,
`sidebar/sidebar-left.svg`, `sidebar/sidebar-right.svg`, `sidebar/wrap.svg`, all
of `compute/`, and most of `data/`.

---

## Notes

- No CSS. This package ships no stylesheet and therefore no `styleModule` — the
  `body[data-jp-theme-name^='Data4Now']` scoping rule in the CSS conventions
  does not apply to anything here.
- Overrides are **not** theme-scoped. `LabIcon.svgstr` is global state, so
  selecting a stock JupyterLab theme keeps the Data4Now glyphs. Every icon is
  `currentColor`, so they inherit the stock theme's colour correctly; if AC10
  ("stock theme gets stock JupyterLab back") is read as covering icons too, this
  plugin needs an `IThemeManager` dependency — which conflicts with the §7.8
  timing rule above. Flagged for P0.
- `deactivate` disconnects the `MutationObserver` and restores each icon's
  original `svgstr`.
