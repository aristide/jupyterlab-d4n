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

**`OVERRIDES`** — applied at activation. 57 names, every one confirmed against
the **live** registry of a running JupyterLab 4.5, not recalled and not inferred
from source. Covers the sidebar rail, the notebook and file-browser toolbars, the
directional/control set, and the common file types.

The full evidence — all 129 registered names, what each maps to or needs, and a
per-surface census — is `docs/icon-manifest.md` (TODO P0-04). Read that before
adding a row here.

**`LANGUAGE_MARKS`** — registered, real, and deliberately **not** applied:
`ui-components:python`, `:julia`, `:r-kernel`. PRD §7.8.2 recommends accepting
stock third-party language marks, because redrawing the Python, R and Julia
marks in house style is a trademark question before it is a design one. The
assets are imported and normalised; spreading this map into `OVERRIDES` is a
one-line change once criterion **I6** is signed off at P0.

**`PENDING`** — candidate names that **cannot** be verified in this image,
because the third-party labextension that would register them is not installed.
They are never applied. A wrong name is a silent no-op, so an unverified guess is
worse than an omission.

The runtime audit shrank this list from seven to two, and not by confirming five
— by **disproving** them. `filebrowser:filter`, `filebrowser:new-directory`,
`notebook:restart-kernel`, `notebook:restart-and-run-all` and
`notebook:interrupt-kernel` are not registry names at all; those buttons render
`ui-components:` icons. No `@jupyterlab/*-extension` package registers an icon of
its own, so the only unverifiable class left is genuine third-party extensions.

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

### The runtime audit (TODO P0-04)

Only a running lab can enumerate the real registry. `auditRegistry()` is exported
for that, and returns structured data rather than only printing:

```js
const mod = (await window._JUPYTERLAB['@d4n/icons'].get('./index'))();
mod.auditRegistry();
```

The federated container is the route because **a 4.5 build has no
`window.jupyterapp`** — there is no application global to hang
`commands.execute('d4n-icons:audit-registry')` off from a headless harness. That
command still exists and now returns the same object, for when you do have an
`app` handle.

The field that settles anything is `applied`: not "this name is in `OVERRIDES`"
but "this registered icon's live `svgstr` is byte-identical to our asset".
`uncovered`, `absentFromBuild`, `notApplied` and `pending[].registered` are the
rest of the manifest.

---

## Asset gaps

**65 of the 129 registered names have no Data4Now equivalent.** The enumerated
list, grouped into eleven authoring families and ordered by cost, is the
"Authoring brief" section of `docs/icon-manifest.md`; it is not duplicated here,
because two copies of a 65-row list diverge.

The part worth knowing without opening that file: the gaps are not evenly spread.
The chrome is complete (left rail 5/5, notebook toolbar 12/12, dock tab bar 4/4),
and the shortfall is concentrated in the **debugger panel** (6 of 12) and the
**cell toolbar** (2 of 6).

Four gaps are worse than "stock", because we override one half of a pair core
renders together and the halves then ship at different weights:

- `caret-up` vs `caret-down` — the file-browser sort header, swapping on click.
- `not-trusted` vs `trusted` — the same status-bar slot, alternating.
- `filter-dot` vs `filter` — the same file-browser slot, alternating.
- `bug-dot` vs `bug` — the debugger rail icon and its breakpoint variant.

Each is one mirrored path or one added dot. They are the first thing to author.

Brand marks (`jupyter`, `jupyter-favicon`, `jupyterlab-wordmark`) are out of
scope here — they belong to PRD §8.9 / P0-07.

62 of the 120 exported assets are unused, most of them legitimately: `compute/`,
eleven of the thirteen `data/` VCS glyphs and six of `identity/` are Data4Now
product icons with no JupyterLab counterpart. `sidebar/git.svg` and
`data/branch.svg` are what `PENDING` is holding for.

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
