# jupyterlab-d4n

The Data4Now design system, applied to JupyterLab.

**This is not a theme.** A theme swaps `--jp-*` values and reaches maybe half the
interface. This is a distribution: it replaces components, restructures chrome,
overrides core plugins, owns the icon set, and drives the JavaScript-rendered
surfaces that CSS cannot reach at all — the terminal, both Lumino DataGrids, the
CodeMirror editor. The theme extension is one of the eight packages it ships.

Requirements and rationale live in [`scope/jupyterlab-design-system-prd.md`](scope/jupyterlab-design-system-prd.md).
Work is tracked in [`TODO.md`](TODO.md). Decisions that are load-bearing or that
depart from the PRD are in [`docs/decisions.md`](docs/decisions.md).

---

## Quick start

```bash
docker compose up -d
docker compose logs -f jupyter
```

JupyterLab is at <http://localhost:8890/lab>, no token, with live reload on both
the frontend and the backend. There is no image to build. See
[`docker/README.md`](docker/README.md).

To boot stock JupyterLab instead — the fastest way to tell one of our bugs from
an upstream one:

```bash
JUPYTERLAB_D4N=0 docker compose up -d
```

---

## What's here

```
packages/
  tokens/          the four-tier token source + build -> CSS, typed TS, JSON
  theme-light/     IThemeManager registration (light)
  theme-dark/      IThemeManager registration (dark)
  ui-overrides/    structural CSS for every T2 surface; ships the token CSS
  icons/           LabIcon overrides
  editor-theme/    CodeMirror 6 theme + HighlightStyle + debug decorations
  settings-forms/  IFormRendererRegistry renderers + the RJSF global pass
  shell-chrome/    status bar, splash, launcher, terminal + DataGrid bridges
  compat-shim/     third-party extension patch layer
mapping/
  jp-adapter.yaml  THE CONTRACT — every --jp-* variable, mapped, with rationale
jupyterlab_d4n/    the Python distribution + the small server extension
tests/
  contrast/        automated WCAG audit over the token set
  lint/            the CI gates PRD §7.4 and AC4 describe
  galata/          visual regression + selector integrity
design-reference/  the design system as imported from Claude Design
```

Eight federated extensions, one Python wheel, one `pip install`.

## The architecture in one page

### Tokens are four tiers, and only one of them knows about JupyterLab

```
TIER 1  PRIMITIVE     --d4n-color-palette-navy-500: #0F3D6E     mode-independent
TIER 2  SEMANTIC      --d4n-color-surface-canvas: var(...)      mode-SCOPED
TIER 3  COMPONENT     --d4n-button-primary-bg: var(...)         mode-independent
TIER 4  ADAPTER       --jp-layout-color0: var(--d4n-...)        generated
```

Tier 4 is the only place `--jp-*` names appear, and nobody hand-edits it — it is
generated from `mapping/jp-adapter.yaml`, where every row carries a `rationale`
field the build refuses to skip.

That mapping is the highest-leverage artifact in the project. JupyterLab's
variables are **positional** (`--jp-layout-color0..4` is a lightness ramp); a
design system speaks in `surface.canvas`, `border.subtle`. Mapping one onto the
other by intuition produces a UI that looks right on one screen and wrong on the
next, because the same `--jp-layout-color2` means "sunken input background" in
one core component and "hovered menu item" in another.

### One stylesheet, both modes, no fetch on switch

Both modes ship in one stylesheet, scoped by the attributes JupyterLab writes
onto `<body>`. Switching is an attribute swap — a repaint, not a stylesheet
fetch, which is what makes the < 100 ms no-FOUC requirement achievable.

Everything is additionally gated on `[data-jp-theme-name^='Data4Now']`, so
selecting a stock JupyterLab theme gives you stock JupyterLab back. See
`docs/decisions.md` D-001, D-003, D-005 — all three are easy to "simplify" into
a silent bug.

### The surfaces CSS cannot reach

The terminal renders to canvas. Lumino DataGrid styles are a JavaScript object.
CodeMirror 6 highlighting is a `HighlightStyle`. None of them read CSS custom
properties, so `packages/tokens` also emits a **typed TypeScript module with
fully resolved values**, and the bridges read the same numbers the CSS does.

This is the part most redesigns skip, and it is why most redesigns have a
terminal that is one shade off from the notebook.

---

## Working on it

```bash
jlpm build:tokens      # regenerate CSS/TS/JSON from src/*.tokens.json + the mapping
jlpm test:contrast     # the WCAG audit — currently 478 pairings, both modes
jlpm lint:design       # the five CI gates from PRD §7.4 / AC4 / I2 / M1
jlpm build             # build all nine packages in dependency order
```

The generated token files **are committed**. A token change should arrive as a
reviewable CSS diff on a PR — designers never touch CSS, but somebody still has
to see what their change did.

### Accessibility is a gate, not a phase

`jlpm test:contrast` parses the resolved token set and asserts a WCAG ratio for
every foreground/background pairing the design actually produces — before a line
of CSS exists. On its first run it found 49 real violations, including a text
field whose outline measured **1.43:1** (invisible) and a dark-mode type
annotation at 3.65:1 on the surface a debugger user stares at.

Both modes now pass at 0 failures. If you change a colour and it goes red, the
palette is wrong — not the test.

`jlpm lint:vars` is the companion gate, and it is worth knowing why it exists.
An undefined CSS custom property is **not an error** — it becomes the
guaranteed-invalid value, the declaration is dropped, and the property silently
falls back to its initial value. In a shorthand that means:

```css
outline: var(--d4n-focusRing-width) var(--d4n-focusRing-style)
  var(--d4n-focusRing-color);
/*            ^ one wrong name takes the WHOLE declaration invalid  */
```

…which computes to `outline: none` and looks exactly like a design that simply
has no focus ring. Renaming the CSS convention mid-project broke 56 references
this way, several of them focus rings. Nothing else in the toolchain — not
stylelint, not `tsc`, not review — resolves a custom property name.

Two narrowings of the PRD's literal wording are documented and still need
sign-off: see D-002 and `TODO.md` P0-09.

---

## Status

The token pipeline, the adapter contract, the contrast audit, both themes and
the dev environment are done. Chrome (P2), notebook/editor (P3), forms (P4) and
icons (P5) are scaffolded with working mechanisms and empty implementations.

`TODO.md` has the task-by-task breakdown, with the ids that code comments
reference.

## License

BSD-3-Clause.
