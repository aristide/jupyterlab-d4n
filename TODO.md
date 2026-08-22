# TODO — JupyterLab interface replatform (codename `SURFACE`)

The tasks come from `scope/jupyterlab-design-system-prd.md`. The phases and the
exit criteria follow PRD §11. Code comments point at the task ids, so **do not
renumber them**. Mark a task `dropped` instead.

This file is written in Simplified Technical English (ASD-STE100), pragmatic
mode. Keep new entries in the same style: short sentences, active voice, one
name for one thing, `must` and `can` in place of `should` and `may`.

**Three notes are exempt on purpose: P2-02, P2-07 and P2-08.** Each one carries
an argument, not a result. They explain why a tier moved, why we did not replace
a plugin, and why upstream code is left asleep. The argument is the useful part.
It reads better in the original longer form. Do not rewrite those three.
`docs/decisions.md` D-015, D-016 and D-017 hold the full versions.

## How to work this file

1. Pick the lowest-numbered task that nothing blocks.
2. Read the PRD section that the task names before you write code. The task line
   is a pointer, not a specification.
3. The **Done when** clause must be true before you change `[ ]` to `[x]`. "Code
   written" is not "done when". Every task gives a condition that you can
   measure.
4. Run `jlpm build:tokens && jlpm test:contrast && jlpm lint:check` before you
   mark a task done. If the task changes CSS, also run `jlpm test:selectors`.
5. If a task is wrong or impossible, **do not change its definition quietly**.
   Add a note below it. Then put the problem in the **Still open** table of
   `docs/decisions.md`, where somebody else decides it.
6. **Write down what you measured**, not that you measured it. "Checked in both
   modes" tells the next reader nothing. "112px cards, 6 columns at 1600px,
   plate `#F4F6FA` on `#122A47`" is still true one year later.
7. **Code on disk does not make a task started.** Several tasks below have a
   stylesheet and nothing else. Each one says so under _On disk_. Extend that
   file. Do not start a new one, and do not read a long stylesheet as proof
   that the task is complete.

**Ground rules for every task** (PRD §7.4, AC4, AC10). The project fails without
them:

- Use no hardcoded color, font, spacing or radius values in shipped CSS. Use
  `var(--d4n-*)` for all of them. CI lints this.
- Put every rule in the scope `body[data-jp-theme-name^='Data4Now']` (D-003).
- Never target a `--jp-private-*` variable, or a class name that contains
  `-private-`.
- Give every `!important` an inline comment that names the upstream rule it
  beats.
- Give every `:hover` rule on a Lumino menu a matching `.lm-mod-active` rule
  (PRD M1, R12). `jlpm lint:menus` enforces this.
- Test both modes every time. A task that you tested in one mode is not done.

---

## Status

| Phase | Scope                    | State                                         |
| ----- | ------------------------ | --------------------------------------------- |
| P0    | Audit & contract         | Machine-measured. Open items need a person.   |
| P1    | Token pipeline & themes  | **Done**                                      |
| P2    | Chrome & navigation      | Most surfaces styled. P2-15 is the last swap. |
| P3    | Notebook & editor        | Scaffolded                                    |
| P4    | Forms, settings, dialogs | Scaffolded                                    |
| P5    | Icons, motion, density   | Scaffolded                                    |
| P6    | Hardening & release      | Not started                                   |

Measured in a running JupyterLab 4.6.3, in both modes:

- `jlpm test:selectors` — **90 matched, 0 broken**, 165 skipped. The harness
  cannot drive those 165 states yet. A skipped selector is reported, never
  passed.
- `jlpm test:contrast` — 478 pairings, 0 failures.
- `jlpm lint:design` — five gates green. `jlpm lint:check` green. `pytest` 5
  passed.

P2 has one **T3 plugin swap** left. It is P2-15, the behavior of the launcher.
It must go in the same change that disables the core plugin it replaces. If it
does not, the application loses that surface completely.

The splash screen (P2-09) is the only swap that is complete. The status bar and
the presentation half of the launcher are both T2. Their §8.5.1 and §8.11 claims
of "impossible in CSS" were measured against a running build and found false
(D-015, D-016).

Not every plugin in this project is a swap. `@d4n/shell-chrome:menu-bar-overflow`
(P2-02) provides no token and replaces nothing. It exists because a widget that
JupyterLab already ships has a feature that does not work (D-017).

What exists and works today:

- The four-tier token pipeline, both modes: 133 primitives, 159 semantic tokens
  for each mode, and 256 component tokens (`packages/tokens/`).
- `mapping/jp-adapter.yaml` — 233 mapped `--jp-*` variables. Every row has a
  rationale. A machine measures the completeness against the 385 non-private
  variables that a running JupyterLab 4.6.3 defines or reads.
- The contrast audit: **478 pairings, 0 failures, both modes**
  (`jlpm test:contrast`).
- The docker-compose development environment (`docker compose up -d` →
  <http://localhost:8890/lab>).
- The design system in `design-reference/data4now/` (120 icons, both logo
  assets, the theme draft, the mockups).

---

## P0 — Audit & contract

Hard gate. PRD §11: engineering cannot claim the P1 exit until a person signs
off the mapping table and no `--jp-*` variable is unmapped.

- [x] **P0-01** Import the design system from Claude Design into
      `design-reference/data4now/`.
      _Done when:_ the token source, both logos and the icon set are on disk.
      **Open caveat:** `JupyterLab Theme.html` stops at exactly 262 144 bytes.
      This is the 256 KiB limit of DesignSync `get_file`. The tail is missing:
      the rest of `NotifHost`, all of `TooltipHost`, and all of `OverlayHost`.
      `OverlayHost` holds the connection-lost markup and the splash markup. The
      CSS for those surfaces _is_ present. Read P0-02.
- [ ] **P0-02** Recover the missing tail of `JupyterLab Theme.html`.
      **This changed from blocking to useful.** Both read routes are closed.
      `DesignSync get_file` stops at 256 KiB and has no range parameter. Our copy
      is exactly 262 144 bytes, or 6962 lines. WebFetch on the design URL returns
      403, because it has no first-party session. A person must export the file,
      or split it in the design project so that each part is under the limit.
      Two screenshots also failed: `screenshots/01-launcher.png` and
      `01-menu.png`.
      _Done when:_ the file on disk ends with `</html>`.
      _What is lost, measured and not assumed:_ only the React demo scaffolding.
      The tail of `NotifHost`, all of `OverlayHost` and all of `TooltipHost` sit
      after the cut. Their `// ===== … =====` banners have zero matches.
      _What survived:_ every CSS specification, which is the part we port.
      `.jp-Tooltip` gives 17 rules from L2728. `.jp-ConnLost` gives 14 from
      L2850, with dark overrides. `.jp-Splash` gives 16 from L2952, with
      `-lockup`, `-mark` and `-wordmark`. `.jp-Notification` gives 40 from L3520.
      P2-09 was built from exactly this. The tail adds only the DOM and the text
      strings for surfaces whose markup we write ourselves. If you can, recover it. Do not block on it.
- [x] **P0-03** Generate `mapping/jp-variables.manifest.json`. Boot the target
      JupyterLab and list every `--jp-*` custom property that it reads. Write
      `tests/galata/extract-jp-variables.mjs` to do this.
      _Done when:_ the manifest exists and `jlpm build:tokens` passes with the
      completeness check ACTIVE. (When this line was written the check only
      warned.) PRD AC5.
- [x] **P0-04** Do the icon gap analysis. List the `LabIcon` registry at runtime
      in the target build. Compare it with `design-reference/data4now/icons/`
      (120 assets), and with the ~180 estimates in PRD §7.8.1.
      _Done when:_ `docs/icon-manifest.md` lists every registry name, its D4N
      replacement or `NEEDS AUTHORING`, and a count for each surface. This
      answers **Q4**.
- [x] **P0-05** Make sure that the monospace ramp is real. The design system
      names JetBrains Mono. PRD §5.1 and **Q1** ask whether a real ramp exists.
      Make sure that it has a true fixed advance (R16). Put the woff2 file in
      `packages/tokens/fonts/`. PRD §4.2 forbids CDN fonts, because the interface
      must render offline.
      _Done when:_ the font is committed, `@font-face` is generated, and a
      terminal that runs `htop` shows no shear in the box-drawing characters
      (PRD T5).
- [ ] **P0-06** Decide the icon coverage for menus: every icon in a menu or none
      of them, or only the high-frequency ones (PRD §7.8.3, **Q10**). Either
      answer is good. The partial coverage that core gives by default is not.
      _Done when:_ the decision is in `docs/decisions.md` and in the icon
      manifest.
- [ ] **P0-07** Decide how to deliver the logo: one SVG with `currentColor`, or
      the two imported PNG files (**Q12**). D-007 already removes the light/dark
      swap. The frame is dark in both modes, so one asset can be enough.
      _Done when:_ the decision is recorded, and the chosen asset is in
      `packages/ui-overrides/style/images/`.
- [ ] **P0-08** Resolve the size conflict in rendered markdown. The mockup styles
      `.jp-md` at 15px with a line height of 1.65. `--jp-content-font-size1` is
      14px.
      _Done when:_ one value wins and `font.size.content.1` has that value.
- [ ] **P0-09** Get sign-off from Design and Accessibility on **D-002**. D-002
      narrows PRD T4 ("all 16 ANSI colours pass 4.5:1"), which arithmetic cannot
      satisfy as written.
      _Done when:_ the decision is signed off, or the criterion in the PRD is
      rewritten.
- [ ] **P0-10** Sign off `mapping/jp-adapter.yaml` with Design and Engineering.
      This is **the** P0 exit gate (PRD §11).
      _Done when:_ a person reviews it row by row and approves it on a PR.

---

## P1 — Token pipeline & themes

Exit: both themes install and switch, the contrast audit is green, and the
snapshot baseline exists.

- [x] **P1-01** Four-tier token architecture, both modes, W3C DTCG source.
      _Done when:_ `jlpm build:tokens` writes CSS, TS and JSON. It must fail on
      an asymmetry between light and dark, on an unresolved reference, or on a
      Tier-1 color that leaks into Tier 3. All three checks exist and run.
- [x] **P1-02** `mapping/jp-adapter.yaml` and the code generator that makes
      Tier 4.
      _Done when:_ every row has a rationale, which the build enforces, and no
      row targets a private variable.
- [x] **P1-03** The 16-color ANSI token group. One source generates both the
      xterm theme object and the 32-selector rendermime block (PRD §8.7.2, R15).
      **The design system did not have this.** The imported mockup has 11
      single-intensity classes. Magenta duplicates red, black is missing, and
      there are no normal/bright pairs. We wrote this group here.
- [x] **P1-04** Automated contrast audit (PRD §10.2). It gates A1, A2, A3, A4
      and T4.
      _Done when:_ `jlpm test:contrast` exits 0 and measures both modes.
- [x] **P1-05** Register `theme-light` and `theme-dark` with `IThemeManager`.
- [x] **P1-06** Convert `.devcontainer/` to `docker-compose.yml` and `docker/`.
      _Done when:_ `docker compose up -d` serves JupyterLab on port 8890, with
      live reload in both directions and no image build.
- [ ] **P1-07** Galata harness and snapshot baseline. `tests/galata/` has only
      the configuration today. It needs the fixture wiring, the deterministic
      font container, and the first baseline run.
      _Done when:_ `jlpm test:galata` runs green and the baseline is committed.
      _Blocked by:_ P2-01. There is little to snapshot before the chrome exists.
- [ ] **P1-08** Favicon delivery (**Q11**). The favicon is a server-side asset,
      and a labextension cannot reach it (PRD §8.9.2). The `jupyterlab_d4n`
      server extension is the hook, and it exists.
      _Done when:_ the D4N mark shows in the browser tab. Busy-state swapping is
      either implemented or refused in writing.
- [ ] **P1-09** Decide the scope of JupyterLite (**Q7**).
      _Done when:_ the decision is recorded, and either a CI job exists or the
      documentation says that JupyterLite is not supported.
- [x] **P1-10** CI: token freshness check. Rebuild the tokens and assert a clean
      tree, so that a hand-edit of a generated file cannot merge. This is the
      `design-gates` job in `.github/workflows/build.yml`.
- [x] **P1-11** The five design lints (`jlpm lint:design`). Lint 1: no hardcoded values (AC4). Lint 2: every menu `:hover` is paired with `.lm-mod-active` (M1). Lint 3: no literal color in an SVG (I2). Lint 4: every `!important` is annotated (§7.4(4)). Lint 5: **every `var(--d4n-*)` resolves to a declared property**.
      The last lint is not in the PRD. We added it after a rename broke 56
      references in the middle of the project. Several of them were focus rings
      that collapsed to `outline: none`. Read `docs/decisions.md` D-013. Nothing
      else in the toolchain resolves a custom property name.

---

## P2 — Chrome & navigation

Exit: all surfaces in §6.1 and §6.2 are at specification in both modes, and
Galata is green.

- [x] **P2-01** Top panel. Dark frame per D-007, 32px, the logo lockup and a 2px
      teal pillar, and the right-side cluster. Attach the pillar to the logo. Do
      **not** use a hardcoded `left: 230px`. The imported draft does this. It breaks when the logo width changes.
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
- [ ] **P2-03** Menu dropdowns (`.lm-Menu`) — all of PRD §8.4.3. The four-column
      grid is **fixed-width, not derived from content**. A grid derived from
      content breaks the alignment across items with and without icons or
      shortcuts (M4). Make sure that M1 to M8 hold.
      _On disk:_ `surfaces/menu.css`, 248 lines, written against the three
      structural facts in §8.4.1. Menus portal into `body`. Every `:hover` has
      its `.lm-mod-active` pair. Lumino ships the item as a `display: table-row`. This file re-declares the rows as grids with one identical template. The columns then line up without the table.
      _The verification is what remains, and it is most of the task._ A lint
      covers M1. It does not cover M2 to M8. M4 needs items side by side with an
      icon only, a shortcut only, both, neither, and a submenu. M6 needs a menu
      longer than the viewport. M7 needs submenus at all four edges at 1280×720.
      M8 needs all of it from the menu bar, from a context menu, and from the
      overflow trigger, in both modes.
- [ ] **P2-04** Sidebar rails and panel headers. The rails are dark in both modes
      (D-007). The icons are 20px and authored at 20px, not scaled from 16px
      (PRD §7.8.4).
      _On disk:_ `surfaces/sidebar.css`, 165 lines. It has the rail plate on the chrome ramp, the resting and active tab states, and the panel headers. It takes the rail width from `--d4n-sidebar-rail-width`, because the core variable is `--jp-private-*`.
      _What remains:_ browser measurement in both modes, and the icons.
      Authored-at-20px is the manifest work in P5-01, not a CSS change. Decide
      there whether this task waits for P5-01, or ships scaled icons and says so.
- [ ] **P2-05** Dock tab bar. A 2px teal top border on the current tab, a dirty-state dot, and a close affordance. The split handle gets an 8px hit area over a 1px visual.
      _On disk:_ `surfaces/tab-bar.css`, 179 lines. It is scoped through
      `.lm-DockPanel-tabBar` and `.lm-TabPanel-tabBar`, so it cannot leak into
      the sidebar rails.
      _What remains:_ browser measurement in both modes. Test the split handle
      with a pointer, not by reading the rule. An 8px hit area over a 1px visual
      can measure correctly and still feel wrong.
- [x] **P2-06** Command palette, file browser listing and toolbar, running panel,
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
- [ ] **P2-14** Status bar overflow. This is the one part of P2-07 that needs
      JavaScript. Core hides `priority: 0` items below **630px** with a private
      `_isWindowNarrow`. §8.5.2 asks for **1024px** and a `⋯` trigger that
      collapses items from right to left into a popover.
      Decide this task on its own merits. To override a private field is fragile
      across minor versions. A real `⋯` trigger needs measurement and a popover,
      which is most of a plugin replacement.
      **P2-02 is the precedent for a third option.** It is a plugin that provides
      no token, replaces nothing, and does the missing work over the public API
      (`docs/decisions.md` D-017). `IStatusBar` exposes the items it holds, so
      the same shape can apply. D-015 already decided that the swap does not
      happen, so `packages/shell-chrome/src/statusBar.ts` is the stub for this
      task, not for a T3 replacement.
      Expect this breakpoint to move as the menu bar breakpoint did. 1024px is a viewport
      number for a bar whose room depends on what is registered in it.
      _Done when:_ items collapse at 1024px and the trigger opens a popover on
      the `.lm-Menu` surface tokens. Or the task is dropped, with a reason.
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
- [ ] **P2-15** **T3: launcher behavior.** This is the second half of P2-08. Four
      parts of §8.11 that CSS cannot reach.
      **Fixed section order.** Core orders the sections by the category rank that
      other plugins pass to `ILauncher.add`.
      **The root-directory text.** Core renders the cwd string. At root that
      string is empty, so the heading renders blank. §8.11.4 is wrong that the
      readout is new work. Only this case is new.
      **The no-kernels error state.** Core renders an empty section, not a
      message.
      **Search above about 12 kernels.**
      Weigh this task honestly first. `launcher:create` is wired to four places. They are the `+` button in the file browser toolbar, File ▸ New Launcher, the `+` tab button of the dock panel, and the palette. All four resolve the command
      **by id**. A replacement that provides `ILauncher` but has no such id leaves
      four dead affordances in four places. None of them look like a fault of the
      launcher.
      _Done when:_ L1 to L9 hold with the four behaviors above, and the core
      plugin is disabled **in the same change**. Two `ILauncher` providers make
      JupyterLab refuse to start. Stub:
      `packages/shell-chrome/src/launcher.ts`.
- [x] **P2-09** **T3: splash screen.** Replace it through `ISplashScreen`.
      **P0-02 does not block this.** An earlier note here said that the markup
      was lost, and that we must recover the file first. That was too strong. The
      splash specification is CSS, and all of it survived the truncation.
      `.jp-Splash` at L2952 to L3103 of `JupyterLab Theme.html` gives the plate and the `::before` wash. It also gives the geometry of `-lockup`, `-mark` and `-wordmark`, with `body.is-dark` overrides beside it. Write our own markup
      against that, which is what an `ISplashScreen` replacement does.
      The splash is the one surface where the light/dark logo question does not
      occur. D-007 makes the frame dark in both modes. Stub:
      `packages/shell-chrome/src/splash.ts`.
- [x] **P2-10** Bottom dock area (`'down'`). This is new work, because core ships
      it unstyled. Never render an empty bottom bar (PRD §8.5.3).
- [x] **P2-11** Log console level badges. They use the `color.log.*` tokens,
      which exist. Use badges, not tinted body text. Tinted 11px text fails A1.
- [ ] **P2-12** Declarative restructuring of toolbars and menus through
      `overrides.json` (PRD §7.6). **No DOM manipulation. No reordering with a
      MutationObserver.** Anything that you cannot express declaratively becomes
      a T3 replacement.
      _Not started._ `jupyter-config/lab-settings/overrides.json` holds only the
      theme, the CodeMirror and the terminal settings. It has no
      `jupyter.lab.toolbars` key and no `jupyter.lab.menus` key.
      _One rule already waits for it._ `toolbar.css` styles a
      `jp-Toolbar-separator` that **does not exist in 4.6.3**. The string appears
      nowhere in the bundle. That rule receives the item that this task adds.
      `selectors.json` marks the selector optional, so the integrity job does not
      report it as broken markup before then.
- [x] **P2-13** The `selectors.json` integrity job (PRD §10.3). Boot each
      supported JupyterLab and assert that every selector matches one element or
      more.
      _Done when:_ `jlpm test:selectors` fails loudly on a selector that you
      break on purpose.

---

## P3 — Notebook & editor

Critical path (PRD §11 — staff this first). Exit: syntax validation in 11
languages, the terminal and both DataGrids repaint on a theme switch, and A4 is
green including D4.

- [ ] **P3-01** Cell container, active-cell indicator, prompts, and a 24px hit
      area for the collapser. The indicator is a full-height 2px bar and a
      surface change, not only the left bar that core draws.
      _Partly on disk:_ `surfaces/notebook.css` (102 lines) covers the cell
      container, `.jp-InputPrompt`, `.jp-OutputPrompt`, `.jp-Collapser`,
      `.jp-mod-active` and `.jp-mod-dirty`. Its own comments send two pieces back here. The first is the **24px collapser hit area**, which core still draws at 4px. The second is the dirty prompt treatment.
- [ ] **P3-02** Output area, stream output, error output, and the 2px danger left
      border.
      _Partly on disk:_ the same file styles `.jp-OutputArea-output`,
      `.jp-OutputArea-promptOverlay` and `.jp-RenderedText`. The error output
      treatment is not there yet. It needs a `danger.subtle` plate and a 2px
      `danger.default` left border.
- [ ] **P3-03** Rendered markdown (`.jp-RenderedHTMLCommon`). This is the largest
      single CSS surface in scope: the full type ramp, tables, code, blockquote,
      lists and hr.
      _Not started._ `.jp-RenderedHTMLCommon` appears in no stylesheet. Settle
      **P0-08** first. The mockup wants 15px with a line height of 1.65, and
      `--jp-content-font-size1` is 14px. The whole ramp depends on the winner.
- [ ] **P3-04** Wire the generated ANSI block into rendermime. Then make sure
      that PRD T2 holds: `ls --color=always` renders identically in a terminal
      and in a notebook cell, in both modes.
- [ ] **P3-05** CodeMirror 6 theme and `HighlightStyle`. It is scaffolded in
      `packages/editor-theme/` with 78 distinct Lezer tags. This covers the whole
      tag set, not the 13-item sample in the PRD. **Test it against all eleven
      languages** that PRD §7.5 lists. A tag that falls through to the default
      color is a bug.
      **This is not obvious, and it changes how you test.** Only five of the
      eleven have a Lezer grammar in JupyterLab 4.5. R, Julia, YAML, TOML, Bash
      and LaTeX run through `StreamLanguage`. `StreamLanguage` resolves CM5 style
      names to tags through about a dozen legacy aliases. The aliases are
      `variable-2` → `special(variableName)`, `def` →
      `definition(variableName)`, `builtin` → `standard(variableName)`, `error` →
      `invalid`, `header` → `heading`, and `string-2` → `special(string)`.
      `src/highlight.ts` lists those aliased forms. A tag list that covers only
      Lezer misses every one of them, and it does so silently. **Test both
      paths.**
      _Done when:_ a fixture notebook in each of the eleven languages renders
      with zero unstyled tokens, in both modes.
- [ ] **P3-06** Terminal bridge. It is scaffolded. **Test all four triggers**
      (PRD §8.7.4). Trigger (b) matters most: terminals that you open _after_ a
      theme switch. This is the most common shipped bug in this class of work,
      and it appears only in the order theme-then-open.
      _Done when:_ T1 to T10 hold, including T8, which is 20 switches one after
      the other.
- [ ] **P3-07** Autocomplete popup, inline signature and tooltip, and console
      panel.
- [ ] **P3-08** Wire the CM6 breakpoint gutter and the execution-line decorations
      to the debugger. They are already built in
      `packages/editor-theme/src/debugDecorations.ts`. They live in the editor
      theme, **not** in CSS. In CSS they break on the next CodeMirror version.
- [ ] **P3-09** Debugger panel shell, callstack, breakpoints and sources. Every
      section gets a designed empty state. No section body is blank (D6).
- [ ] **P3-10** Debugger variables **tree** view. The value colors must match the
      CM6 `HighlightStyle` for the same types (D5). They already share the
      `color.syntax.*` tokens, so use those tokens instead of new choices.
- [ ] **P3-11** **T3/T4: DataGrid.** Apply the shared `buildGridStyle()` and
      `buildTextRenderer()` from `packages/shell-chrome/src/gridStyle.ts` to BOTH
      the CSV/TSV viewer and the debugger variables grid.
      _Done when:_ D1 and D2 hold. The two grids are identical in chrome, pixel
      for pixel, and **the renderer themes the cell text**, not only the frame. A
      themed frame around stock black text is the failure here.
      Disable `@jupyterlab/csvviewer-extension:csv` in the same change.
- [ ] **P3-12** Notebook search overlay (PRD §8.8.2) and the other five search
      mounts. One component, six configurations. S1 requires no search styling of
      its own.
- [ ] **P3-13** ipywidgets. The `--jp-widgets-*` mapping lives in `compat-shim`.
      We excluded it from the adapter on purpose, because those variables belong
      to ipywidgets and not to core. Sliders and file-upload need CSS beyond the
      variables. Make sure that widgets rendered _before_ a theme switch repaint
      with no stale inline styles.
- [ ] **P3-14** Decide the opt-in helper for matplotlib and Vega (**Q5**).
      Content is an explicit non-goal (PRD §3.2). The helper only exposes the
      palette.

---

## P4 — Forms, settings, dialogs

- [ ] **P4-01** RJSF global CSS pass against the stable class names. PRD §7.7
      estimates about 85% coverage. It is scaffolded in
      `packages/settings-forms/`.
      _The state of that scaffold:_ `style/settings-forms.css` and an `index.ts`
      exist. `src/renderers/` holds **a README and nothing else**. So P4-03 to
      P4-07 below are not started, and not partly built.
- [ ] **P4-02** Settings editor shell, plugin list and JSON view.
- [ ] **P4-03** `fieldRenderer`: keybinding capture.
- [ ] **P4-04** `fieldRenderer`: theme picker.
- [ ] **P4-05** `fieldRenderer`: editor settings.
- [ ] **P4-06** `fieldRenderer`: font picker.
- [ ] **P4-07** `fieldRenderer`: color picker.
- [ ] **P4-08** All form controls: input, select, checkbox, radio, switch.
      `.jp-HTMLSelect` is a native `<select>`, so the operating system renders
      its popup. Accept this for low-traffic selects. Replace the kernel picker
      and the cell-type picker with a custom listbox (PRD R5).
      _Partly on disk:_ `surfaces/inputs.css` covers `.jp-mod-styled` inputs,
      `.jp-select-wrapper`, `.jp-InputGroup` and the six search mounts (S1).
      **Checkbox, radio and switch have no styles at all.** Neither custom
      listbox exists.
- [ ] **P4-09** Dialogs, toasts (`.jp-Notification-*`), tooltips and progress.
      Focus is trapped, `Escape` closes the dialog, and focus returns to the
      trigger.
      _Partly on disk:_ `surfaces/dialog.css` covers §8.3, which is the backdrop,
      the surface, the header, the body and the footer buttons.
      `surfaces/notifications.css` covers the Toastify host. **Tooltips and
      progress have no styles.** The focus contract is behavior and nobody has
      tested it. Core can satisfy it already. Test that before you write
      anything.
- [ ] **P4-10** **Decision point.** Does the settings editor reach the
      specification through P4-01 and P4-03 to P4-07? Or does it need a full T3
      replacement of `settingeditor-extension:form-ui`? This is scoped as a
      contingency, not as the baseline (PRD R2). Decide it at the P4 exit, not at
      ship.

---

## P5 — Icons, motion, density

- [ ] **P5-01** Complete the icon override manifest from the P0-04 audit.
      `packages/icons/src/manifest.ts` ships only the mappings that we measured.
      The rest are in a PENDING list. A wrong registry name does nothing
      and reports nothing, so a guess is worse than an omission.
      _Done when:_ I1 holds. No stock glyph is left on a surface that we own.
- [ ] **P5-02** Review the icon contact sheet for consistent optical weight (I3).
      Review it as a sheet, not icon by icon.
- [ ] **P5-03** Apply the motion tokens, with a `prefers-reduced-motion` branch
      on every consumer. The imported mockup has **nine keyframe animations and
      no reduced-motion guard**. Treat none of them as safe (A8).
      _On disk:_ `surfaces/motion.css` (45 lines) is imported last, so it can
      override the animation of any surface rule without `!important`. Individual
      surfaces already carry their own guards, for example `launcher.css` and
      `splash.ts`. So this task is the sweep that proves no unguarded consumer is
      left. A lint serves that better than a stylesheet.
- [ ] **P5-04** Compact density (D-009). Wire `density.compact.*` through the
      chrome. When the density changes, make the terminal bridge fit again. This is trigger (c). Stub: `packages/shell-chrome/src/density.ts`.
- [ ] **P5-05** Empty, loading, error, permission-denied and offline states for
      **every** panel (PRD §6.7). This is new design work, not restyling. The
      imported design has almost none of it. The highest-traffic case is the
      empty TOC state on a notebook that holds only code.
- [ ] **P5-06** Table of contents panel (PRD §8.10). The six-level depth ramp
      already exists as tokens (`toc.level1..6`). The imported design defines
      only three levels, so levels 4 to 6 are ours. Neutralize the inline heading
      content — code spans, links, **and rendered math** — or the rows go ragged
      (TC3).

---

## P6 — Hardening & release

- [ ] **P6-01** Full accessibility audit, A1 to A13. A1 to A4 are automated and
      green. A5 to A13 are manual and not started. The accessibility owner must
      sign off (AC7).
- [ ] **P6-02** Third-party compatibility matrix, the P0 and P1 rows, both modes,
      with dedicated Galata snapshots. It is scaffolded in
      `packages/compat-shim/`.
- [ ] **P6-03** Performance budgets (PRD §10.5) gated in CI. §10.5 wants these
      gates **from P1 onward**, not a measurement at the end. This task is only
      the final check.
- [ ] **P6-04** Upgrade playbook (Appendix C). Document it, and rehearse it
      against a real JupyterLab minor version bump (AC11).
- [ ] **P6-05** Manual QA scenarios 1 to 9, both modes (PRD §10.6). Scenario 5
      finds the T4 bridge bugs.
- [ ] **P6-06** Packaging check: `pip install jupyterlab_d4n && jupyter lab`
      gives the full redesign with no manual configuration (AC1).
- [ ] **P6-07** Test AC10 from end to end. A user can switch to a stock theme and
      install any extension. No extension is blocked. The theme-name gate of
      D-003 makes this work. Test it. Do not assume it.
- [ ] **P6-08** Decide whether to send the accessibility contrast fixes upstream
      to JupyterLab core (**Q8**).
- [ ] **P6-09** Pilot: 20 daily users or more, one week, zero P0 bugs (AC13).

---

## Deferred / explicitly out of scope

Recorded here so that they do not return later as "while we are in there":

- Launcher recency, pinning and favorites. These are features, not chrome
  (PRD §8.11.4).
- Notebook output _content_ (matplotlib, Plotly and Vega figures) — §3.2. Only
  the opt-in palette helper, P3-14.
- Notebook Classic and `nbclassic` — §3.2.
- A fork of JupyterLab, a rewrite of Lumino, a redesign of third-party extension
  internals, and a new information architecture — all §3.2.
- The Data4Now _commands_ that the menu arrays of the mockup imply, for example
  `d4n:promote-gold` and "Medallion SDK reference". These are product features.
  They belong in a separate extension. This project restyles chrome. It does not
  add commands.
