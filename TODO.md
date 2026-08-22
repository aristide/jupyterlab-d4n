# TODO — JupyterLab interface replatform (codename `SURFACE`)

Task breakdown derived from `scope/jupyterlab-design-system-prd.md`. Phases and
exit criteria follow PRD §11; task ids are stable and referenced from code
comments, so **do not renumber them** — mark a task `dropped` instead.

## How to work this file

1. Pick the lowest-numbered task whose **Blocked by** column is clear.
2. Read the PRD section named in the task before writing anything. The task line
   is a pointer, not a specification.
3. Change `[ ]` → `[x]` only when the **Done when** clause is literally true.
   "Code written" is not "done when"; every task states a checkable condition.
4. Run `jlpm build:tokens && jlpm test:contrast && jlpm lint:check` before
   marking anything done. Tasks that touch CSS also need `jlpm test:selectors`.
5. If a task turns out to be wrong or impossible, **do not silently redefine
   it** — add a note under it and raise it in `docs/decisions.md`.

**Ground rules that apply to every task** (they are the ones this project dies
without — PRD §7.4, AC4, AC10):

- Zero hardcoded colour / font / spacing / radius literals in shipped CSS.
  Everything is `var(--d4n-*)`. CI lints it.
- Every rule scoped under `body[data-jp-theme-name^='Data4Now']` (D-003).
- Never target a `--jp-private-*` variable or a class containing `-private-`.
- `!important` requires an inline comment naming the upstream rule it beats.
- Every `:hover` rule on a Lumino menu needs a matching `.lm-mod-active` rule
  (D-002 of the menu world — PRD M1, R12; `jlpm lint:menus` enforces it).
- Both modes, every time. A task is not done if it was only checked in one.

---

## Status

| Phase | Scope                    | State                                        |
| ----- | ------------------------ | -------------------------------------------- |
| P0    | Audit & contract         | machine-verified; open items need a human    |
| P1    | Token pipeline & themes  | **done**                                     |
| P2    | Chrome & navigation      | most surfaces styled; P2-15 is the last swap |
| P3    | Notebook & editor        | scaffolded                                   |
| P4    | Forms, settings, dialogs | scaffolded                                   |
| P5    | Icons, motion, density   | scaffolded                                   |
| P6    | Hardening & release      | not started                                  |

Verified in a running JupyterLab 4.6.3, both modes:

- `jlpm test:selectors` — **90 matched, 0 broken**, 165 skipped (states the
  harness cannot yet drive; skipped is reported, never passed).
- `jlpm test:contrast` — 478 pairings, 0 failing.
- `jlpm lint:design` — five gates green. `jlpm lint:check` green. `pytest` 5 passed.

P2 has one **T3 plugin swap** left — P2-15, the launcher's behaviour — and it has
to land in the same change that disables the core plugin it replaces, or the
application loses that surface entirely. The splash (P2-09) is the only swap that
has shipped. The status bar and the launcher's presentation both landed as T2
after their §8.5.1/§8.11 "impossible in CSS" claims were audited against a
running build (D-015, D-016).

Not every plugin in this project is a swap: `@d4n/shell-chrome:menu-bar-overflow`
(P2-02) provides no token and replaces nothing — it exists because the widget
JupyterLab already ships has a feature that does not work (D-017).

What already exists and works:

- The four-tier token pipeline, both modes, 133 primitives / 159 semantic ×2 /
  256 component tokens (`packages/tokens/`).
- `mapping/jp-adapter.yaml` — 233 mapped `--jp-*` variables, every one with a
  rationale, and completeness now machine-verified against the 385 non-private
  variables a running JupyterLab 4.6.3 actually defines or references.
- The contrast audit: **478 pairings, 0 failures, both modes**
  (`jlpm test:contrast`).
- The docker-compose dev environment (`docker compose up -d` →
  <http://localhost:8890/lab>).
- The design system imported to `design-reference/data4now/` (120 icons, both
  logo assets, the theme draft, the mockups).

---

## P0 — Audit & contract

Hard gate. PRD §11: engineering cannot claim P1 exit until the mapping table is
signed off and there are zero unmapped `--jp-*` variables.

- [x] **P0-01** Import the design system from Claude Design into
      `design-reference/data4now/`.
      _Done when:_ the token source, both logos and the icon set are on disk.
      **Caveat, still open:** `JupyterLab Theme.html` is truncated at exactly
      262 144 bytes — the DesignSync `get_file` 256 KiB cap. The tail is missing:
      the rest of `NotifHost`, all of `TooltipHost`, and all of `OverlayHost`
      (which holds the actual connection-lost and splash markup). The CSS for
      those surfaces _is_ present. See P0-02.
- [ ] **P0-02** Recover the truncated tail of `JupyterLab Theme.html`.
      **Downgraded from blocking to nice-to-have.** Both read routes are closed:
      `DesignSync get_file` caps at 256 KiB with no range parameter (our copy is
      exactly 262 144 bytes / 6962 lines), and WebFetch on the design URL returns
      403 for want of a first-party session. Needs a human to export it, or to
      split the file in the design project so each part clears the cap.
      Two screenshots (`screenshots/01-launcher.png`, `01-menu.png`) also failed.
      _Done when:_ the file on disk ends with `</html>`.
      _What is lost, audited not assumed:_ only the React demo scaffolding —
      `NotifHost`'s tail, `OverlayHost` and `TooltipHost` all sit past the cut
      (verified: zero matches for their `// ===== … =====` banners).
      _What survived:_ every CSS spec, which is the part we port —
      `.jp-Tooltip` (17 rules from L2728), `.jp-ConnLost` (14 from L2850 with
      dark overrides), `.jp-Splash` (16 from L2952, `-lockup`/`-mark`/`-wordmark`),
      `.jp-Notification` (40 from L3520). P2-09 was built from exactly that.
      So the tail would only add their DOM and copy strings for surfaces whose
      markup we write ourselves regardless. Worth recovering; not worth blocking.
- [x] **P0-03** Generate `mapping/jp-variables.manifest.json` by booting the
      target JupyterLab and enumerating every `--jp-*` custom property actually
      consumed. Write `tests/galata/extract-jp-variables.mjs` to do it.
      _Done when:_ the manifest exists and `jlpm build:tokens` passes with the
      completeness check ACTIVE (it currently only warns). PRD AC5.
- [x] **P0-04** Icon gap analysis. Enumerate the `LabIcon` registry at runtime
      in the target build, diff against `design-reference/data4now/icons/`
      (120 assets) and against the ~180 PRD §7.8.1 estimates.
      _Done when:_ `docs/icon-manifest.md` lists every registry name, its D4N
      replacement or `NEEDS AUTHORING`, and a per-surface count. Answers **Q4**.
- [x] **P0-05** Confirm the monospace ramp. The design system nominates
      JetBrains Mono; PRD §5.1 and **Q1** ask whether a real ramp exists.
      Verify it has a true fixed advance (R16) and bundle the woff2 into
      `packages/tokens/fonts/` — PRD §4.2 forbids CDN fonts, the interface must
      render offline.
      _Done when:_ the font is committed, `@font-face` is generated, and a
      terminal running `htop` shows no box-drawing shear (PRD T5).
- [ ] **P0-06** Decide menu icon coverage: all-or-nothing per menu, or
      high-frequency only (PRD §7.8.3, **Q10**). Either is fine; inheriting
      core's partial coverage by default is not.
      _Done when:_ recorded in `docs/decisions.md` and reflected in the icon
      manifest.
- [ ] **P0-07** Decide logo delivery: one SVG with `currentColor`, or the two
      imported PNGs (**Q12**). Note D-007 already removes the light/dark swap —
      the frame is dark in both modes, so one asset may be enough.
      _Done when:_ recorded, and the chosen asset is in
      `packages/ui-overrides/style/images/`.
- [ ] **P0-08** Resolve the rendered-markdown size conflict: the mockup styles
      `.jp-md` at 15px/1.65, `--jp-content-font-size1` is 14px.
      _Done when:_ one value wins and `font.size.content.1` matches it.
- [ ] **P0-09** Get Design + Accessibility sign-off on **D-002** — the
      narrowing of PRD T4 ("all 16 ANSI colours pass 4.5:1"), which is
      arithmetically unsatisfiable as written.
      _Done when:_ signed off, or the criterion is rewritten in the PRD.
- [ ] **P0-10** Sign off `mapping/jp-adapter.yaml` with Design + Eng. This is
      **the** P0 exit gate (PRD §11).
      _Done when:_ reviewed row by row and approved on a PR.

---

## P1 — Token pipeline & themes

Exit: both themes install and switch, contrast audit green, snapshot baseline
captured.

- [x] **P1-01** Four-tier token architecture, both modes, W3C DTCG source.
      _Done when:_ `jlpm build:tokens` emits CSS + TS + JSON and fails on a
      light/dark asymmetry, an unresolved reference, or a Tier-1 colour leaking
      into Tier 3. All three checks are implemented and exercised.
- [x] **P1-02** `mapping/jp-adapter.yaml` + codegen → Tier 4.
      _Done when:_ every row has a rationale (build-enforced) and no row targets
      a private variable.
- [x] **P1-03** The 16-colour ANSI token group, generating BOTH the xterm theme
      object and the 32-selector rendermime block from one source (PRD §8.7.2,
      R15). **This did not exist in the design system** — the imported mockup
      has 11 single-intensity classes with magenta duplicating red, no black,
      and no normal/bright pairs. Authored here.
- [x] **P1-04** Automated contrast audit (PRD §10.2), gates A1/A2/A3/A4 + T4.
      _Done when:_ `jlpm test:contrast` exits 0 with both modes measured.
- [x] **P1-05** `theme-light` / `theme-dark` `IThemeManager` registration.
- [x] **P1-06** Convert `.devcontainer/` → `docker-compose.yml` + `docker/`.
      _Done when:_ `docker compose up -d` serves JupyterLab on :8890 with live
      reload both ways and no image build.
- [ ] **P1-07** Galata harness + snapshot baseline. `tests/galata/` currently
      has only the config. Needs the fixture wiring, the deterministic font
      container, and the first baseline run.
      _Done when:_ `jlpm test:galata` runs green and the baseline is committed.
      _Blocked by:_ P2-01 (there is little to snapshot until chrome lands).
- [ ] **P1-08** Favicon delivery (**Q11**). Server-side asset — a labextension
      cannot reach it (PRD §8.9.2). The `jupyterlab_d4n` server extension
      already exists as the hook.
      _Done when:_ the D4N mark shows in the browser tab, and busy-state
      swapping is either implemented or explicitly declined.
- [ ] **P1-09** Decide JupyterLite scope (**Q7**).
      _Done when:_ recorded, and either a CI job exists or it is documented as
      unsupported.
- [x] **P1-10** CI: token freshness check. Rebuild tokens and assert a clean
      tree, so a hand-edit of a generated file cannot merge. Implemented as the
      `design-gates` job in `.github/workflows/build.yml`.
- [x] **P1-11** The five design lints (`jlpm lint:design`): no hardcoded
      literals (AC4), every menu `:hover` paired with `.lm-mod-active` (M1), no
      literal colour in an SVG (I2), every `!important` annotated (§7.4(4)), and
      **every `var(--d4n-*)` resolving to a declared property**.
      That last one is not in the PRD and was added after a mid-project rename
      broke 56 references — several of them focus rings that collapsed to
      `outline: none`. See `docs/decisions.md` D-013. Nothing else in the
      toolchain resolves a custom property name.

---

## P2 — Chrome & navigation

Exit: all §6.1–6.2 surfaces at spec in both modes, Galata green.

- [x] **P2-01** Top panel. Dark frame per D-007, 32px, logo lockup + 2px teal
      pillar, right-side cluster. Hang the pillar off the logo — **not** at a
      hard-coded `left: 230px`, which the imported draft does and which breaks
      the moment the logo width changes.
- [x] **P2-02** Menu bar (`.lm-MenuBar`) on the dark frame, mnemonics, overflow.
      The frame and the states were already in `menu-bar.css`; the overflow was
      the task, and it turned out to need a plugin — Lumino 2.9 ships one and it
      does not work. It measures its item widths once, while the widget is still
      detached, caches eight zeros and never invalidates them, so the trigger
      appears at no width at all, in our theme or in stock, with nothing logged.
      Waking that cache up is worse than leaving it asleep (a runaway collapse to
      a 29px bar, a `RangeError` on every render, two triggers, a trigger that
      opens the Help menu, and a permanently transposed menu order — all
      measured). So `@d4n/shell-chrome:menu-bar-overflow` does the collapse over
      the public API and Lumino's stays asleep. Reasoning in
      `docs/decisions.md` D-017.
      _Two PRD corrections there:_ §8.4.2's "below 900px" is off by about half
      (the collapse is driven by available width, so the first menu goes near
      460px; `menu.bar.overflowBreakpoint` was removed rather than left asserting
      900px), and its "weight 450" has no support in the design system, which
      uses 400/500/600/700/800 and never 450.
      _Also measured:_ `.lm-MenuBar-itemMnemonic` matches **nothing** on stock
      4.6.3 — JupyterLab's main menus declare no mnemonics — so **M3 holds
      vacuously**. Whether the product should have them is a design question,
      raised in D-017 and not decided here.
      _Verified in both modes:_ `Help` collapses at 460px and `Settings` at
      420px, widening restores both in order, the trigger opens a `.lm-Menu` on
      the menu tokens holding exactly the collapsed menus as submenus, arrow keys
      walk into them (M2, M8), and the trigger takes the inset focus ring.
      Selecting a stock theme stands the collapse down entirely (AC10).
- [ ] **P2-03** Menu dropdowns (`.lm-Menu`) — PRD §8.4.3 in full. The
      four-column grid is **fixed-width, not content-derived**, or alignment
      breaks across items with and without icons/shortcuts (M4). Verify M1–M8.
- [ ] **P2-04** Sidebar rails + panel headers. Rails are dark in both modes
      (D-007); 20px icons authored at 20px, not scaled from 16 (PRD §7.8.4).
- [ ] **P2-05** Dock tab bar. 2px teal top border on the current tab, dirty-state
      dot, close affordance, 8px split-handle hit area over a 1px visual.
- [x] **P2-06** Command palette, file browser listing + toolbar, running panel,
      extension manager.
- [x] **P2-07** Status bar — done as **T2**, not the T3 swap §8.5.1 specifies.
      Audited against a running 4.6.3: all four of §8.5.1's justifications are
      reachable from CSS, including the one it calls out as needing a wrapper —
      the DOM already distinguishes controls from readouts. Replacing the plugin
      would mean reproducing the shell mount, `statusbar:toggle`, the
      `application:reset-layout` interplay, the settings sync and the palette
      entry; and core's schema survives the disable, so a swap that missed the
      command id would leave a View ▸ Appearance item pointing at nothing.
      Full reasoning and measurements in `docs/decisions.md` D-015.
      _Verified:_ 24px, surface.raised, 1px top border, Montserrat 11px,
      tabular figures, separators, and the passive/interactive split measured
      item by item in both modes.
      **Core's plugin stays enabled** — nothing added to `page_config.json`.
- [ ] **P2-14** Status bar overflow (split out of P2-07 — the one part that
      genuinely needs JS). Core hides `priority: 0` items below **630px** via a
      private `_isWindowNarrow`; §8.5.2 asks for **1024px** and a `⋯` trigger
      that collapses items right-to-left into a popover.
      Decide on its own merits, and note the options honestly: overriding a
      private field is fragile across minors; a real `⋯` trigger needs
      measurement and a popover, which is most of a plugin replacement anyway.
      _Done when:_ items collapse at 1024px and the trigger opens a popover on
      the `.lm-Menu` surface tokens, or the task is dropped with a reason.
- [x] **P2-08** Launcher — **presentation half, done as T2**. The audit landed
      the opposite way from P2-07: here the T2/T3 split is real, so the task
      split with it rather than being reclassified. Card geometry, the responsive
      grid, the kernel plate (D-010) and the launch-target readout are all
      reachable from CSS and are done; the four behavioural requirements are
      **P2-15** below. Reasoning in `docs/decisions.md` D-016.
      _Verified in both modes:_ 112px cards (core is on `content-box`, so the
      spec height needed `box-sizing`), 6 columns at 1600px and never fewer than
      2, hover on background + border with `transform: none`, and the plate at
      `#F4F6FA` on a `#122A47` card — it had been pointed at a mode-scoped
      surface and was reinstating the dark-mode halo it exists to remove.
      Selecting a stock theme restores core's launcher (AC10).
      **Core's plugin stays enabled** — nothing added to `page_config.json`.
- [ ] **P2-15** **T3: launcher behaviour** (split out of P2-08). The four parts
      of §8.11 that CSS cannot reach: **fixed section order** (core orders by the
      category rank other plugins pass to `ILauncher.add`), the **root-directory
      copy** (core renders the cwd string, and at root that string is empty, so
      the heading renders blank — §8.11.4 is wrong that the readout is net-new;
      only this case is), the **no-kernels error state** (core renders an empty
      section, not a message), and **search above ~12 kernels**.
      Weigh it honestly first: `launcher:create` is wired to the file browser
      toolbar `+`, File ▸ New Launcher, the dock panel `+` tab button and the
      palette, all resolving the command **by id**. A replacement that provides
      `ILauncher` but misses that id leaves four dead affordances in four
      places, none of which look like the launcher's fault.
      _Done when:_ L1–L9 hold with the four behaviours above, and the core plugin
      is disabled **in the same change** (two `ILauncher` providers and
      JupyterLab refuses to start). Stub: `packages/shell-chrome/src/launcher.ts`.
- [x] **P2-09** **T3: splash screen.** Replace via `ISplashScreen`.
      **Not blocked by P0-02** — an earlier note here said the markup was lost
      and to recover the file first. That overstated it: the splash SPEC is
      CSS, and all of it survived the truncation. `.jp-Splash` at
      `JupyterLab Theme.html` L2952-3103 gives the plate, the `::before` wash,
      and `-lockup` / `-mark` / `-wordmark` geometry, with `body.is-dark`
      overrides alongside. Write our own markup against it, which is what a
      `ISplashScreen` replacement does anyway.
      Note the splash is the one surface where the light/dark logo question
      does not arise (D-007 makes the frame dark in both modes).
      Stub: `packages/shell-chrome/src/splash.ts`.
- [x] **P2-10** Bottom dock area (`'down'`). Net-new — core ships it unstyled.
      Never render an empty bottom bar (PRD §8.5.3).
- [x] **P2-11** Log console level badges. Uses the `color.log.*` tokens, which
      already exist. Badges, not tinted body text — tinted 11px text fails A1.
- [ ] **P2-12** Declarative toolbar/menu restructuring via `overrides.json`
      (PRD §7.6). **Zero DOM manipulation, zero MutationObserver reordering.**
      Anything not expressible declaratively escalates to a T3 replacement.
- [x] **P2-13** `selectors.json` integrity job (PRD §10.3). Boot each supported
      JupyterLab and assert every selector matches ≥1 element.
      _Done when:_ `jlpm test:selectors` fails loudly on a deliberately broken
      selector.

---

## P3 — Notebook & editor

Critical path (PRD §11 — staff this first). Exit: 11-language syntax validation,
terminal + both DataGrids repaint on switch, A4 green including D4.

- [ ] **P3-01** Cell container, active-cell indicator (full-height 2px bar +
      surface change, not core's left-bar-only), prompts, collapser 24px hit area.
- [ ] **P3-02** Output area, stream/error output, the 2px danger left border.
- [ ] **P3-03** Rendered markdown (`.jp-RenderedHTMLCommon`) — the largest single
      CSS surface in scope. Full type ramp, tables, code, blockquote, lists, hr.
- [ ] **P3-04** Wire the generated ANSI block into rendermime and verify PRD T2:
      `ls --color=always` renders identically in a terminal and a notebook cell,
      both modes.
- [ ] **P3-05** CodeMirror 6 theme + `HighlightStyle`. Scaffolded in
      `packages/editor-theme/` with 78 distinct Lezer tags — exhaustive over the
      tag set, not the PRD's 13-item sample. **Validate against all eleven
      languages** PRD §7.5 lists; any tag falling through to the default colour
      is a bug.
      **Non-obvious, and it changes how you test this:** only five of the eleven
      have a Lezer grammar in JupyterLab 4.5. R, Julia, YAML, TOML, Bash and
      LaTeX run through `StreamLanguage`, which resolves CM5 style names to tags
      via a dozen legacy aliases (`variable-2` → `special(variableName)`,
      `def` → `definition(variableName)`, `builtin` → `standard(variableName)`,
      `error` → `invalid`, `header` → `heading`, `string-2` → `special(string)`).
      Those aliased forms are enumerated in `src/highlight.ts`; a Lezer-only tag
      list silently misses every one of them. **Test both paths.**
      _Done when:_ a fixture notebook in each of the eleven renders with zero
      unstyled tokens, both modes.
- [ ] **P3-06** Terminal bridge. Scaffolded. **Verify all four triggers**
      (PRD §8.7.4) — especially (b), terminals opened _after_ a theme switch,
      which is the most commonly shipped bug in this class of work and only
      appears in the order theme-then-open.
      _Done when:_ T1–T10 hold, including T8 (20 consecutive switches).
- [ ] **P3-07** Autocomplete popup, inline signature/tooltip, console panel.
- [ ] **P3-08** Wire the CM6 breakpoint gutter and execution-line decorations
      (already built in `packages/editor-theme/src/debugDecorations.ts`) to the
      debugger. These live in the editor theme, **not** in CSS — putting them in
      CSS is what makes them break on the next CodeMirror bump.
- [ ] **P3-09** Debugger panel shell + callstack + breakpoints + sources.
      Every section gets a designed empty state; no blank section bodies (D6).
- [ ] **P3-10** Debugger variables **tree** view. Value colours must match the
      CM6 `HighlightStyle` for the same types (D5) — they already share the
      `color.syntax.*` tokens, so use them rather than re-picking.
- [ ] **P3-11** **T3/T4: DataGrid.** Apply the shared `buildGridStyle()` +
      `buildTextRenderer()` from `packages/shell-chrome/src/gridStyle.ts` to
      BOTH the CSV/TSV viewer and the debugger variables grid.
      _Done when:_ D1 and D2 hold — the two grids are pixel-identical in chrome,
      and **cell text is themed via the renderer**, not just the frame. A themed
      frame around stock-black text is the failure mode here.
      Disable `@jupyterlab/csvviewer-extension:csv` in the same change.
- [ ] **P3-12** Notebook search overlay (PRD §8.8.2) and the other five search
      mounts. One component, six configurations — S1 requires zero bespoke
      search styling.
- [ ] **P3-13** ipywidgets. `--jp-widgets-*` mapping lives in `compat-shim`
      (deliberately excluded from the adapter — those variables are ipywidgets',
      not core's). Sliders and file-upload need CSS beyond the variables.
      Verify widgets rendered _before_ a theme switch repaint with no stale
      inline styles.
- [ ] **P3-14** Decide the matplotlib/Vega opt-in helper (**Q5**). Content is an
      explicit non-goal (PRD §3.2); the helper only exposes the palette.

---

## P4 — Forms, settings, dialogs

- [ ] **P4-01** RJSF global CSS pass against the stable class names. PRD §7.7
      estimates ~85% coverage. Scaffolded in `packages/settings-forms/`.
- [ ] **P4-02** Settings editor shell + plugin list + JSON view.
- [ ] **P4-03** `fieldRenderer`: keybinding capture.
- [ ] **P4-04** `fieldRenderer`: theme picker.
- [ ] **P4-05** `fieldRenderer`: editor config.
- [ ] **P4-06** `fieldRenderer`: font picker.
- [ ] **P4-07** `fieldRenderer`: colour picker.
- [ ] **P4-08** All form controls: input, select, checkbox, radio, switch.
      `.jp-HTMLSelect` is a native `<select>`, so its popup is OS-rendered —
      accept for low-traffic selects, replace the kernel picker and cell-type
      picker with a custom listbox (PRD R5).
- [ ] **P4-09** Dialogs, toasts (`.jp-Notification-*`), tooltips, progress.
      Focus trapped, `Escape` closes, focus restored to trigger.
- [ ] **P4-10** **Decision point:** does the settings editor reach spec through
      P4-01 + P4-03..07, or does it need a full T3 replacement of
      `settingeditor-extension:form-ui`? Scoped as a contingency, not baseline
      (PRD R2). Decide at P4 exit, not at ship.

---

## P5 — Icons, motion, density

- [ ] **P5-01** Complete the icon override manifest from the P0-04 audit.
      `packages/icons/src/manifest.ts` currently ships only the mappings we could
      verify, with the rest in a PENDING list — a wrong registry name is a
      **silent no-op**, so an unverified guess is worse than an omission.
      _Done when:_ I1 holds (zero stock glyphs on owned surfaces).
- [ ] **P5-02** Icon contact-sheet review for optical weight consistency (I3).
      Reviewed as a sheet, not icon by icon.
- [ ] **P5-03** Motion tokens applied, with a `prefers-reduced-motion` branch on
      every consumer. The imported mockup has **nine keyframe animations and no
      reduced-motion guard at all** — treat none of them as safe (A8).
- [ ] **P5-04** Compact density (D-009). Wire `density.compact.*` through the
      chrome, and make the terminal bridge re-fit on the change (trigger (c)).
      Stub: `packages/shell-chrome/src/density.ts`.
- [ ] **P5-05** Empty / loading / error / permission-denied / offline states for
      **every** panel (PRD §6.7). This is net-new design work, not restyling —
      the imported design has essentially none of it. Highest-traffic case is
      the TOC empty state on a code-only notebook.
- [ ] **P5-06** Table of contents panel (PRD §8.10). The six-level depth ramp
      already exists as tokens (`toc.level1..6`); the imported design defines
      only three levels, so 4–6 are ours. Neutralise inline heading content —
      code spans, links, **and rendered math** — or rows go ragged (TC3).

---

## P6 — Hardening & release

- [ ] **P6-01** Full a11y audit A1–A13. A1–A4 are automated and green; A5–A13
      are manual and unstarted. Needs the accessibility owner's sign-off (AC7).
- [ ] **P6-02** Third-party compat matrix, P0 + P1 rows, both modes, with
      dedicated Galata snapshots. Scaffolded in `packages/compat-shim/`.
- [ ] **P6-03** Performance budgets (PRD §10.5) gated in CI. Note §10.5 wants
      these gated **from P1 onward**, not measured at the end — this task is
      only the final verification.
- [ ] **P6-04** Upgrade playbook (Appendix C) documented and rehearsed against a
      real JupyterLab minor bump (AC11).
- [ ] **P6-05** Manual QA scenarios 1–9, both modes (PRD §10.6). Scenario 5 is
      the one that catches the T4 bridge bugs.
- [ ] **P6-06** Packaging verification: `pip install jupyterlab_d4n && jupyter lab`
      produces the full redesign with zero manual configuration (AC1).
- [ ] **P6-07** Verify AC10 end to end — a user can switch to a stock theme and
      install arbitrary extensions. D-003's theme-name gate is what makes this
      work; test it, do not assume it.
- [ ] **P6-08** Decide whether to upstream the a11y contrast fixes to JupyterLab
      core (**Q8**).
- [ ] **P6-09** Pilot: ≥20 daily users, one week, zero P0 bugs (AC13).

---

## Deferred / explicitly out of scope

Recorded so they do not arrive later as "while we're in there":

- Launcher recency, pinning, favourites — features, not chrome (PRD §8.11.4).
- Notebook output _content_ (matplotlib, Plotly, Vega figures) — §3.2. Only the
  opt-in palette helper, P3-14.
- Notebook Classic / `nbclassic` — §3.2.
- Forking JupyterLab; rewriting Lumino; redesigning third-party extension
  internals; a new information architecture — all §3.2.
- The Data4Now-specific _commands_ the mockup's menu arrays imply
  (`d4n:promote-gold`, "Medallion SDK reference"). Those are product features
  that belong in a separate extension; this project restyles chrome, it does not
  add commands.
