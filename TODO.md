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
- **Clean up after a browser probe, and check the server, not the disk.** A
  probe that opens a terminal or a notebook leaves a live session behind. The
  server keeps it after the browser closes, and deleting the notebook file does
  **not** end its kernel. The status-bar snapshot counts live kernels and
  terminals, so the debris makes `test:galata` flaky instead of failing, which
  is harder to notice. Check with `curl -s .../api/terminals` and
  `.../api/kernels`. The DELETE endpoints need an auth token, so the reliable
  cleanup is `docker compose restart jupyter`. This has now cost two sessions.
- **The container needs GitHub to START, and fails hard without it.** The
  entrypoint runs `pip install -e .`, whose isolated build environment runs
  `jupyter labextension build`; that resolves `@jupyterlab/core-meta` on the
  network — npm answers "no published versions match '4.5.x'", so it falls back
  to the `jupyterlab/jupyterlab` GitHub repository. With GitHub unreachable the
  install aborts and `set -euo pipefail` takes the container with it. A plain
  `jlpm build` in the workspace needs no network, because it uses the workspace's
  own `@jupyterlab/builder`. The escape is
  `docker compose run -d --service-ports -e SKIP_JUPYTER_BUILDER=1 jupyter`,
  which skips only the JavaScript build that has already been done on disk.
- **The Playwright browsers live in the container LAYER, not a volume.** Recreate
  the container and they are gone. Restoring them needs BOTH
  `npx playwright install chromium` and `npx playwright install-deps chromium` —
  without the second, Chromium dies on `libnspr4.so: cannot open shared object
file` and Playwright reports it as "browser has been closed", which does not
  look like a missing package.
- **A probe that types into a notebook gets autosaved.** JupyterLab's autosave
  wrote a probe's typing into `notebooks/fixture.ipynb` and it appeared in
  `git status`. The file is committed, so this dirties the tree rather than
  losing anything, but it is silent. Check the notebook and `git checkout` it
  after any probe that edits a cell.
- **Never run `jlpm build` while `test:galata` is running either, and this is
  the one that produced the confusing failures.** The build rewrites
  `jupyterlab_d4n/labextensions/@d4n/theme-light/themes/@d4n/theme-light/index.css`
  in place, which is the exact file the browser fetches, so a page loading in
  that window gets a 404 and JupyterLab raises **"Neither theme Data4Now Light
  nor default Data4Now Light loaded"**. Every test that waits for a themed body
  then times out, and the status bar never settles long enough to screenshot.
  Measured on 2026-09-05: two runs with a background build failed on
  `application frame` and `status bar`; the same suite, same tree, nothing else
  running, passed 14 of 14. An earlier note blamed a cold server and worker
  contention, then a startup race. All three were wrong. `jlpm watch` is NOT the
  culprit — its log showed no rebuild for eleven minutes before a failing run.
  Treat the suite as needing exclusive use of the WORKING TREE, not just of the
  server.
- **Never run a browser probe while `test:galata` is running.** This is the same
  hazard as the one above and it is the one that actually bit. A probe that
  opens a terminal changes the status bar, which the suite screenshots, so the
  suite fails on a surface the probe never touched. Measured: three runs at
  `--workers=1` while probes were running gave 14 passed, then 3 failed, then
  2 failed, on different surfaces each time. The same suite on a quiet server
  passes 14 of 14. An earlier note here blamed a cold server and worker
  contention. Both were wrong. Treat the suite as needing exclusive use.
- **Galata itself flakes, and it does not look like a snapshot failure.** On a
  clean, exclusive server the theme-pin test failed with
  `apiResponse.json: Response has been disposed` at
  `node_modules/@jupyterlab/galata/src/galata.ts:675`. That is Galata reading an
  API response after the context began closing. It is not an assertion, not a
  picture, and no CSS change can cause it. `retries` is 0, so it is reported as
  a hard failure. Read the error before you read a failure as a regression.
- **`test:selectors` drops one entry on a cold server.** The
  `notebook-error-output` state needs a kernel to execute a traceback, and the
  first run after `docker compose restart` is slow enough to miss it: 102
  matched instead of 103, `0 broken` either way. It comes back on the next run.

---

## Status

| Phase | Scope                    | State                                           |
| ----- | ------------------------ | ----------------------------------------------- |
| P0    | Audit & contract         | **Done.** Exit gate signed 2026-09-03.          |
| P1    | Token pipeline & themes  | **Done**                                        |
| P2    | Chrome & navigation      | **Done except P2-14, P2-16, P2-17** (all human) |
| P3    | Notebook & editor        | Scaffolded                                      |
| P4    | Forms, settings, dialogs | Scaffolded                                      |
| P5    | Icons, motion, density   | Scaffolded                                      |
| P6    | Hardening & release      | Not started                                     |

Measured in a running JupyterLab 4.6.3, in both modes:

- `jlpm test:selectors` — **102 matched, 0 broken**, 191 skipped. The harness
  cannot drive those 191 states yet. A skipped selector is reported, never
  passed.
- `jlpm test:contrast` — 529 pairings, 0 failures.
- `jlpm test:galata` — **14 tests green**, 12 committed baselines over 6
  surfaces × {light, dark}. Run it from the container with
  `JUPYTER_URL=http://localhost:8888`.
- `jlpm lint:design` — eight gates green. `jlpm lint:check` green. `pytest` 5
  passed.

P2 has **no engineering left**. P2-15 landed on 2026-09-05, so every T3 swap the
phase scopes is done; P2-14, P2-16 and P2-17 all wait on a person.

Two swaps are complete: the splash screen (P2-09) and the launcher (P2-15). The status bar and
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

**The gate is closed.** Aristide signed `mapping/jp-adapter.yaml` on 2026-09-03
(P0-10), and the completeness check has been green since P0-03. Every task in
this phase is done. Read P0-10 for what the sign-off did and did not cover: one
reviewer, and 214 of the 233 rows accepted in bulk.

- [x] **P0-01** Import the design system from Claude Design into
      `design-reference/data4now/`.
      _Done when:_ the token source, both logos and the icon set are on disk.
      **Caveat closed on 2026-09-02.** The first import stopped at exactly
      262 144 bytes, the 256 KiB limit of DesignSync `get_file`. P0-02 replaced
      the file with a complete copy.
- [x] **P0-02** Recover the missing tail of `JupyterLab Theme.html`.
      _Done on 2026-09-02._ Aristide exported the design page as a standalone
      HTML file. The file on disk now ends with `</body></html>`.
      _Why the export needed work._ A standalone export is a bundle, not a
      document. The page sits inside a `<script type="__bundler/template">`
      block as one JSON string. Three of its lines are larger than 300 KB, so
      `grep` and line numbers do not work on it. The bundler also inlines the
      linked foundation stylesheet, and it replaces every external reference
      with an opaque asset id.
      _The rebuild._ `scripts/decode-standalone-export.mjs` undoes all three
      rewrites. The export stays in the tree beside the document, as
      `JupyterLab Theme (standalone export).html`. Run this when a new export
      arrives:
      `node scripts/decode-standalone-export.mjs "design-reference/data4now/JupyterLab Theme (standalone export).html" "design-reference/data4now/JupyterLab Theme.html"`
      _What was measured, not assumed._ The rebuilt file has 7158 lines and
      270 426 bytes. Against the old truncated copy, lines 1 to 6962 differ in
      40 places. Every difference is a same-line substitution. The bundler
      expanded self-closing SVG tags, escaped `>` as `&gt;`, and wrote
      `selected=""`. No CSS line changed. Line numbering matches the old copy
      exactly, so every `L####` reference written before today still points at
      the same rule.
      _What the tail added._ `NotifHost` at L6928 is complete. `OverlayHost` at
      L6988 and `TooltipHost` at L7077 are present for the first time. They
      hold the connection-lost markup, the splash markup and the tooltip
      markup. No CSS came back, because none was lost.
      _Still missing._ Two screenshots never imported:
      `screenshots/01-launcher.png` and `01-menu.png`. Neither one blocks a
      task.
      _Turned up by this task:_ `COMPONENT-INDEX.md` is stale. Read P0-11.
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
- [x] **P0-06** Decide the icon coverage for menus: every icon in a menu or none
      of them, or only the high-frequency ones (PRD §7.8.3, **Q10**).
      _Decided by Aristide on 2026-09-02:_ **all**. Every row that runs a command
      carries an icon. Recorded as **D-020**, and in the census section of
      `docs/icon-manifest.md`.
      _Measured with `jlpm test:menu-icons`, which this task added._ The menu bar
      has 340 actionable rows across 8 dropdowns and 14 submenus. 160 of them are
      command rows and must carry an icon. They run 152 distinct commands. 164
      rows sit in 7 value-picker sections and are exempt, because each section
      runs one command with a different argument. 141 of those are the syntax
      highlighting language list. 14 rows are submenu parents, which have no icon
      slot. 2 rows render with no label at all.
      _The constraint that shaped the rule._ `MenuSvg.Renderer.renderIcon` in
      `@jupyterlab/ui-components` substitutes the check mark **into the icon
      slot** on a toggled row. A toggleable command therefore loses its icon
      while the option is on. Showing both needs a replacement `Menu.IRenderer`,
      which is T3 or T4. D-020 records that as out of scope.
      _Found while measuring._ Only 6 real command icons exist in the whole menu
      bar today, all in File ▸ New. The other 15 glyphs are check marks.
      `hub:control-panel` and `hub:logout` render as two blank rows at the foot
      of the File menu, because this image is not behind a JupyterHub.
      _Cost for P5-01._ This backlog is not the 65 `NEEDS AUTHORING` names. Most
      of the 152 commands have no `LabIcon` to override, so the work is
      declaring icons through `overrides.json` and the plugin, not swapping
      registry entries.
- [x] **P0-07** Decide how to deliver the logo (**Q12**).
      _Decided by Aristide on 2026-09-03:_ a **compact brand mark** for the bar,
      not the lockup. Recorded as **D-021**. The asset is
      `packages/ui-overrides/style/images/logo-mark.svg`.
      _Both listed options were closed, and measuring showed why._ The PNG route
      needs a T3 plugin: `#jp-MainLogo` holds a `LabIcon`, measured live as
      `<svg data-icon="ui-components:jupyter">` at 17×22, and `LabIcon` takes an
      SVG string. A single `currentColor` SVG cannot draw the mark either,
      because the mark is three colours.
      _The real problem was size._ The design system ships one lockup, as two
      960×675 PNG files. **No SVG of the logo exists in the repo.** The lockup
      is a two-line stack, and `screenshots/fixed-logo-dark.png` shows it
      illegible at the 22px the bar gives it.
      _The mark._ The pie-chart "O" from the logo's own NOW. Sector angles were
      sampled off the source artwork at 0.6r and 0.85r, which agree:
      letterforms 45°–135°, open notch 136°–180°, magenta 181°–44°. Drawn on a
      24×24 viewBox, centre (12, 12), r 10.5.
      _Verified in the running instance, in both modes._ It renders 22×22 with a
      12px inset in Data4Now Light and in Data4Now Dark. `currentColor` resolves
      to `rgb(244, 246, 250)` in both, and the wedge to `rgb(230, 53, 88)` in
      both. `jlpm lint:icons` passes at 121 SVGs.
      _Recorded, not fixed._ The wedge measures 2.62:1 against the light-mode
      bar. WCAG 1.4.11 exempts logotypes, and the shape is carried by the
      10.15:1 letterform sector. Do not move the brand colour for this.
      _On screen since P0-12._ It is the override for `ui-components:jupyter`,
      and the splash draws the same asset. The asset moved to
      `packages/icons/svg/brand/logo-mark.svg`, which D-021 records.
- [x] **P0-08** Resolve the size conflict in rendered markdown.
      _Decided by Aristide on 2026-09-03:_ **14px**, at every density.
      `font.size.content.1` was already 14px, so no value moved. Recorded as
      **D-022**, and as a `$description` on the token itself.
      _There was no conflict._ The mockup carries **both** numbers. `.jp-md` at
      L495 is 15px / 1.65, and `body.density-compact .jp-md` at L966 is 14px /
      1.55. The mockup's own default is Compact (`TWEAK_DEFAULTS` at L5585), so
      14px is the number its screenshots show. The task text compared the
      comfortable value against our token and read it as a disagreement.
      _Measured in the running instance on `fixture.ipynb`, in both modes._
      `--jp-content-font-size1` 14px, `.jp-RenderedHTMLCommon` 14px, its
      paragraph 14px in a 22.4px line box, `h1` 24px, editor 13px. Identical in
      Data4Now Light and Data4Now Dark, as a size should be.
      _Line height stays 1.6._ That is 22.4 over 14, which is
      `font.lineHeight.relaxed`, and it sits between the mockup's two values.
      Making body type follow density would widen **D-009**, which rejects a
      scale multiplier. One size, both densities.
- [x] **P0-09** Get sign-off from Design and Accessibility on **D-002**.
      _Signed off by Aristide on 2026-09-03._ Both roles are held by one person
      on this project, and D-002 now records that, so a later reader does not
      assume three independent reviews.
      _What was signed._ The measured version, not the argument.
      `jlpm test:contrast` audits **102 T4 pairings**: 90 at the full 4.5:1
      gate, 12 at the 1.5:1 floor. All 17 slots are covered, the 16 ANSI colours
      plus the default foreground. The 12 relaxed pairings are the two slots
      nearest the background in each mode, over three backgrounds each. Worst
      relaxed value 1.60:1. Tightest value still at the full gate 4.52:1.
      _Rejecting it was not available._ PRD T4 as written has no solution: no
      colour has a relative luminance both ≤ 0.179 and ≥ 0.249.
      _Carry forward._ The PRD text is now wrong rather than unmet. Nobody has
      rewritten T4. Correct §8.7.2 and T4 at the next PRD revision.
- [x] **P0-10** Sign off `mapping/jp-adapter.yaml` with Design and Engineering.
      This is **the** P0 exit gate (PRD §11).
      _Signed off by Aristide on 2026-09-03._ The sign-off is recorded in the
      adapter's own header, where a reader of the contract will find it.
      _What was signed._ 233 rows, every one carrying a rationale, plus 158
      excluded variables with their owner named. The completeness check in
      `build.mjs` was active and green: every `--jp-*` the running JupyterLab
      reads is mapped, excluded, or `--jp-private-*`.
      _How it was reviewed, stated plainly._ Design and Engineering are held by
      one person. Sections 1 to 3 (ELEVATION, BORDERS, FOCUS RING — 19 rows)
      were read row by row. Sections 4 to 27 (214 rows) were accepted in bulk,
      after the reviewer was shown the 22 rows that pin a `literal:` value and
      the 5 rows whose rationale records a deliberate departure from the PRD.
      This is one reviewer, not three, and it is not a line-by-line reading of
      all 233. Re-open any row on evidence.
- [x] **P0-11** Re-derive the anchors in
      `design-reference/data4now/COMPONENT-INDEX.md`.
      _Done on 2026-09-03._ Every anchor in the file is now literal and
      measured, and **`jlpm lint:anchors` proves it** — a sixth design lint,
      wired into `jlpm lint:design`.
      _How bad it was._ The file made 38 `anchor` + line claims. **All 38 were
      false.** Two separate faults sat on top of each other. The line numbers
      came from an older revision: every CSS banner after `IPYWIDGETS` (L610)
      was 76 lines low, and every body anchor was 103 lines low. The quoted
      strings were wrong as well. The file wrote banners as
      `/* ===== APP SHELL ===== */` with five equals signs, and the real banners
      carry thirteen. So no anchor in the file could be pasted into `grep -F`,
      which is exactly what its own instructions told the reader to do.
      _The JS column named things that do not exist._ It cited
      `// ===== NOTIFICATIONS =====` at L6550 and four more like it. None of
      those strings is in the file. The React section names its components with
      `function NotifHost() {` and similar, so the rows now cite those, plus the
      data arrays and the mount nodes.
      _Now._ 79 checked anchors, all resolving. The lint was proved to fail: one
      line number moved by one gives `x line 25: :root { — L15 is: /* JupyterLab
tokens, brand-mapped */` and exit 1.
      _Found while doing it._ The JupyterHub section cites **eleven files that
      are not in this repo**. They exist in the design project and nobody
      imported them. `preview-assets/admin-shared.css` and `admin-shared.js` did
      come across, which is how we know the pages are real. They are out of
      scope, so the rows stay, marked "Imported: no".
- [x] **P0-12** Put the D-021 mark on screen, and close the B5 gap.
      _Done on 2026-09-03._ Both halves landed together, because either alone
      leaves the product showing two different brand marks.
      _Wired._ `ui-components:jupyter` is overridden in
      `packages/icons/src/manifest.ts`. Measured live: the bar renders
      `<svg data-icon="ui-components:jupyter">` at 22×22, 12px inset, in both
      modes. The console reports `applied 58/58 icon overrides`.
      _B5 holds, and the code enforces it._ `@d4n/icons` now exports
      `LOGO_MARK_SVG`, the same string the override uses, and `splash.ts`
      imports it. Sameness is a property of the import, not of memory. Measured
      on both surfaces in both modes: identical `d` on both paths, identical
      wedge `rgb(230, 53, 88)`, identical `<title>`. Splash 52px inside the 96px
      plate, bar 22px. The letterform sector differs on purpose, because
      `currentColor` takes each surface's foreground: splash
      `rgb(255, 255, 255)`, bar `rgb(244, 246, 250)`.
      The mockup's separate magenta dot on the plate is gone. Its own comment
      said it echoed the pie wedge, and the wedge is there now. `splash.dot`
      survives, because the loader gradient still ends on it. `splash.dotSize`
      is deleted, and `splash.markGlyphSize` (52px) replaces it.
      _The asset moved_ to `packages/icons/svg/brand/logo-mark.svg`. P0-07 put it
      in `packages/ui-overrides/style/images/`, but the manifest imports from
      `../svg/`, and one copy beats two that drift. `lint:icons` scans both
      directories, so it stays linted. Recorded in D-021.
      _The failure this turned up._ The first attempt left the bar **empty**.
      `LabIcon` logged `SVG HTML was malformed` and drew nothing. The cause was
      the B6 comment itself: it named `--d4n-color-palette-magenta-400`, and a
      double hyphen is illegal inside an XML comment. `LabIcon` rejects the whole
      asset rather than the comment. **`lint:icons` now catches it**, proved by
      putting the hyphens back: one problem, exit 1.

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
- [x] **P1-07** Galata harness and snapshot baseline.
      _Done on 2026-09-03._ `jlpm test:galata` runs green, twice in a row, and
      **12 baselines are committed** — 6 surfaces × {light, dark}.
      _The harness is plain Playwright, not `galata.test`, and that is the one
      real decision here._ Galata's page helpers talk to `window.galata`, which
      `@jupyterlab/galata-extension` injects. That extension is **not installed
      in our image**, and installing it would put a test-only labextension
      inside the application these snapshots photograph. The suite takes from
      Galata only the two pieces that do not touch the running app:
      `galata.Mock.mockSettings` and `galata.DEFAULT_SETTINGS`. Revisit when a
      test needs to drive a notebook.
      _The theme is pinned through mocked settings, never toggled._ Verified
      against the running instance that `overrides.json` merges into the schema
      **defaults**, not the user layer, so mocking clears leftover user state
      without losing an override. `adaptive-theme` is forced off, because its
      schema default is `true` and the OS colour-scheme would override the pin.
      A non-visual test asserts `data-jp-theme-name` per project, so a broken
      pin cannot produce a full set of plausible snapshots in the wrong mode.
      _Six surfaces, not ninety._ PRD §10.1 sizes the finished matrix at ~180.
      A baseline nobody has looked at is worse than none: it gets approved as a
      block and the real diff hides inside it. Surfaces join `shell.spec.ts` as
      their task lands.
      _Two flakes found and fixed, not retried away._ `retries: 0` stands. 1. `galata.Mock.mockSettings` fetches the real settings from inside its
      route handler. Once per test raced page teardown and threw
      `apiResponse.json: Response has been disposed`. The seed is now fetched
      once per worker, so the handler never fetches. 2. Playwright refuses to let a worker fixture depend on a test-scoped one,
      which ruled out the builtin `baseURL`. `tests/galata/base-url.js` is
      now the single definition, read by the config and the fixture.
      _The 8890 trap, written down at last._ CI starts JupyterLab on **8890**;
      the dev container serves **8888**. Run the suite from the container as
      `JUPYTER_URL=http://localhost:8888 jlpm test:galata`. `test:selectors` has
      the same default and the same trap. `base-url.js` says so.
      _Also added:_ `tests/tsconfig.json`, so typed ESLint rules cover
      `tests/**/*.ts`. Without it eslint refused the files as "not included in
      the project". Proved it lints by injecting an unused variable.
      _Hardened during P2-05, 2026-09-03._ The suite was not deterministic and
      the theme-pin test is what exposed it. Three causes, all now fixed: 1. **The theme attribute is not the theme.** `data-jp-theme-name` is set
      when the theme manager STARTS applying; its stylesheet loads after.
      Snapshots caught half-styled frames, so a DIFFERENT surface failed each
      run. `settle` now waits past it. 2. **The menu-bar overflow plugin settles last**, after `app.restored` and
      after its own font wait. The two snapshots that still flaked were
      exactly the two containing the menu bar. `settle` now waits for
      `body[data-d4n-menubar-overflow]`. 3. **Contention.** Two browsers boot JupyterLab against one server, so the
      30s waits were too short. They are 60s.
      Three consecutive runs are now 14/14. A first attempt polled computed
      colours until they repeated: that turned image mismatches into 60s
      timeouts inside the helper, which is worse, and it was reverted.
      _And the suite depends on server state nobody was guarding._ The P2-05
      agents left two `untitled.txt` files, five terminals and a kernel behind,
      which moved the file browser and status bar snapshots. Removed, and the
      container restarted. A probe that creates files or sessions must clean up,
      or the next baseline run blames the wrong change.
- [x] **P1-08** Favicon delivery (**Q11**).
      _Decided by Aristide and done on 2026-09-03._ A frontend link rewrite,
      one authored asset, busy variant refused in writing. Recorded as **D-023**.
      _The task inherited a PRD error._ §8.9.2 says a labextension cannot reach
      the favicon. Measured on the running instance, that is wrong at runtime:
      the page template emits ordinary `<link class="idle favicon">` and
      `<link class="busy favicon">` elements, and rewriting `href` from
      JavaScript works. §8.9.2 is right only about the first paint — the stock
      mark is in the first byte of HTML, so this route flashes it briefly.
      _Verified in the running instance._ Both links resolve to
      `/lab/extensions/@d4n/shell-chrome/static/*.png`, the response is 200
      `image/png`, and the browser decoded it at 64×64.
      _Busy swapping is upstream's, and it is refused._ Core flips `rel` between
      the two elements on kernel activity, and `jupyter_server` ships seven
      icons for it. We author **one**. But both links get it, because a busy
      link still pointing at `favicon-busy-1.ico` would show the Jupyter mark
      for as long as a cell runs — failing **B3** exactly when a user is
      watching the tab.
      _A PNG, not the vector._ PRD §4.2 puts Safari 17 in scope, and Safari does
      not render an SVG `rel="icon"`.
      `packages/icons/svg/brand/favicon.svg` is the source;
      `jlpm build:favicon` rasterises it to 64×64. Measured legible at 16px on
      white and on `#202124`.
      _Two consequences carried forward._ The server extension no longer needs
      to exist for the favicon — its docstring said it did, and is corrected.
      And `document.title` is still "JupyterLab": B3 covers the mark, not the
      words, so a branded icon now sits beside a stock name.
      _The first attempt broke the whole package, and the canary caught it._
      Importing the PNG normally makes `@jupyterlab/builder` load it as
      `asset/resource`, so webpack resolves a runtime public path. Inside a
      **federated** module that produced a bare directory URL: the browser
      refused `…/@d4n/shell-chrome/static` as a script with MIME type
      `text/html`, and **every plugin in `@d4n/shell-chrome` stopped loading** —
      splash, terminal bridge, adaptive theme, menu-bar overflow.
      `jlpm test:selectors` reported it as one broken selector,
      `body[data-d4n-menubar-overflow] #jp-menu-panel`, three runs out of three.
      That entry was registered as exactly this canary, and it earned its place.
      The fix removes the asset import: `jlpm build:favicon` now emits the PNG
      **and** a generated `FAVICON_DATA_URL` module, so webpack never sees it.
      Selectors are back to 97 matched, 0 broken, three runs running, and the
      favicon costs zero network requests.
- [x] **P1-09** Decide the scope of JupyterLite (**Q7**).
      _Decided by Aristide on 2026-09-03:_ **not supported for v1, and not
      tested.** Recorded as **D-024**, and stated for users in the "Deployment
      surfaces" section of `README.md`. PRD §14 R7 allows either ending. A
      best-effort claim with no CI job behind it ages without anyone finding
      out, and this one has a real failure mode under it.
      _Measured from what the wheel installs, not guessed._ Lite reads
      `share/jupyter/labextensions`, so the CSS, both themes, the icons and the
      frontend plugins load. It reads **none** of
      `share/jupyter/lab/settings/overrides.json`,
      `etc/jupyter/labconfig/page_config.json` or
      `etc/jupyter/jupyter_server_config.d`. So the look loads and the
      configuration around it does not: the build would not start on our theme,
      and two plugins would provide `ISplashScreen`.
      _The favicon survives._ D-023 put it inside the labextension as a data
      URL, so the tab icon works in Lite even with no server.
      _Turned up by this task, and it contradicts P2-15._ Read P2-15's caveat
      below and the last section of D-024. `PluginRegistry.registerPlugin`
      throws on a duplicate plugin **id** only; a duplicate provided token is a
      silent overwrite. The claim that two providers "make JupyterLab refuse to
      start" is not what the source says.
- [x] **P1-10** CI: token freshness check. Rebuild the tokens and assert a clean
      tree, so that a hand-edit of a generated file cannot merge. This is the
      `design-gates` job in `.github/workflows/build.yml`.
- [x] **P1-11** The five design lints (`jlpm lint:design`). Lint 1: no hardcoded values (AC4). Lint 2: every menu `:hover` is paired with `.lm-mod-active` (M1). Lint 3: no literal color in an SVG (I2). Lint 4: every `!important` is annotated (§7.4(4)). Lint 5: **every `var(--d4n-*)` resolves to a declared property**. P0-11 later added a sixth, `lint:anchors`, and queue housekeeping a seventh, `lint:queue`. An eighth, `lint:decisions`, landed on 2026-09-05 after three separate pieces of work each cited the same unwritten decision id (D-035).
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
- [x] **P2-03** Menu dropdowns (`.lm-Menu`) — all of PRD §8.4.3, M1 to M8.
      _Done on 2026-09-03._ Verified by driving a real browser, one probe per
      criterion, both modes, with the theme pinned through mocked settings so no
      global state was written. **M6 failed and is fixed. M1 to M5, M7 and M8
      pass.** The fix is recorded as **D-025**.
      _What M6 found, and it was not small._ Every submenu and every context
      menu was `overflow: hidden`. Three rules land on a menu node:
      Lumino gives `.lm-Menu` a 0,1,0 rule with `overflow: hidden auto`.
      JupyterLab gives `.jp-ThemedContainer` a 0,1,0 rule with
      `overflow: hidden`, and its sheet is inserted later, so it wins.
      JupyterLab then rescues menu-bar dropdowns only, with a 0,2,0 rule on
      `.lm-MenuBar-menu.jp-ThemedContainer`. **116 of the 141
      rows** in View ▸ Text Editor Syntax Highlighting, including the last one,
      were unreachable by wheel, keyboard or mnemonic. This file's own comment
      asserted the opposite; it is corrected.
      _The PRD's height cap had never been implemented._ There was no
      `menu.maxHeight` token. It now exists at 60vh and sits on
      `.lm-Menu-content`, not on the menu node — Lumino writes an inline
      `max-height` on the node, and `openRootMenu` uses `ch - y` under `forceY`,
      so a node cap would need `!important` and would push a low context menu
      off-screen. Capping the content lets the node shrink-wrap and the `min()`
      falls out for free.
      _Measured after the change, both modes, identical._ The 141-row submenu is
      442px at 34–476 instead of 720px at 0–720, so the elevation edge has 34px
      above and 244px below where it had none. The wheel takes the content from
      0 to 3516 (= max) and "Z80" lands fully visible at 443–471. No regression:
      root View 34–476, context menu low 508–686, context menu high 196–638, all
      inside the viewport.
      _Two things this turned up that are not menu bugs._ 1. **The scroll cue cannot be verified in this container.** Our
      `::-webkit-scrollbar` rule matches and nothing hides it, yet no bar
      paints at 4× during an active scroll. A control in a blank page shows a
      plain `div` and a plain `ul` behaving identically, so this headless
      Chromium paints overlay scrollbars. **`scrollbars.css` has therefore
      never been visually verified here and cannot be.** Read D-025. 2. **Two upstream keyboard defects**, both reproducing in stock JupyterLab
      Light: the Edit menu opens with no active item although one item is
      enabled, and Escape at root drops focus to `<body>` so the menu bar
      needs 13 Tabs to re-enter. Neither is caused by our CSS.
      _Recorded, not fixed:_ the keyboard indicator is the hover wash and
      measures 1.144:1 light and 1.104:1 dark against the menu surface, with
      `outline: none`. WCAG 2.2 SC 1.4.11 asks 3:1 for a state indicator.
      Raising it alone would break the M1 pairing that keeps `:hover` and
      `.lm-mod-active` in one declaration block, so it is a token question for
      Design rather than a local fix.
- [x] **P2-04** Sidebar rails and panel headers, dark in both modes (D-007).
      The rail was already styled. The work was finding what the styling did not
      reach.
      **Three upstream rules draw the rail from the canvas ramp.** Each is
      invisible in stock JupyterLab, where the rail is nearly the same colour as
      them. On a navy rail all three are high contrast: a white rectangle around
      the current icon (`::after` at `--jp-layout-color1`), hairlines between
      tabs in two different greys, and a grey seam at the rail's outer edge. The
      mockup draws none of them. All three are now removed, and the separators
      are ZEROED rather than made transparent, because the border is in the box
      model — transparency left the first tab 52px and the rest 53px.
      **The hover wash came back the moment the pointer arrived.** The resting
      rule set `background: transparent` at (0,3,1), which loses to core's hover
      rule at (0,4,0). Restated on the hover rule at (0,5,1).
      **The icon-size token decided nothing.** It sized the wrapper, not the
      glyph. `LabIcon` sizes the SVG from a typestyle class it generates at
      runtime, whose name is a content hash. Its 20px agreed with our token by
      coincidence. `sidebar.css` now sizes the SVG, so the token is load-bearing.
      **The rail width had a third consumer, and it is not on the rail.** In
      single-document mode core indents `#jp-menu-panel` by the PRIVATE
      `--jp-private-sidebar-tab-width`, which stays at 32px however wide we make
      the rail — so a 48px rail left the menu bar indented 33px against a 49px
      rail. Restated here beside the other two.
      _Two PRD corrections, both recorded:_ §7.8.4 asks for rail icons authored
      at 20px. **They are not.** All 120 assets are `viewBox="0 0 24 24"` with
      `stroke-width="1.6"`, so a rail glyph is a 24px drawing shown at 20 and its
      stroke renders at 1.33px. It ships scaled and says so (**D-018**); authoring
      at 20px is a design deliverable, not a CSS or manifest change. And §6.1
      scopes rail "tooltip positioning" as T2, which it cannot be: Lumino's
      renderer sets a native `title` attribute on the tab, so there is no element
      to style. That is **P2-16** below (**D-019**).
      _Measured in both modes:_ rail 49px (48 + 1), plate `#0B1F38` light and
      `#050F1D` dark, all four tabs 52px, current glyph teal on a 4% white wash,
      SVG 20×20 from the token, and every one of the three canvas decorations
      gone. Panel header 32px with a 12px inset, and its `h2` now starts at 12px
      — core's un-scoped debugger rule had been adding `padding: 4px 10px` and
      putting the label at 22px. Selecting _JupyterLab Light_ brings all of it
      back: a 33px grey rail, tabs at 52 **and** 53px again, the white rectangle
      and the grey seam returned (AC10).
- [ ] **P2-16** Rail tooltips (split out of P2-04, **D-019**). PRD §6.1 lists
      "tooltip positioning" as the third T2 item for the rails. It is not
      reachable at that tier. Lumino's default `TabBar` renderer sets
      `title = data.title.caption` on the tab — a native browser tooltip, which
      owns its own placement and delay. Measured: the first left-rail tab carries
      `title="File Browser (Ctrl+Shift+F)"`, and `LabShell` builds those bars
      with no custom renderer.
      Reaching it means a custom renderer or a hover widget, so a plugin. The
      same shape as D-017: add the missing behaviour over a public API rather
      than restyle something that was never there.
      _Done when:_ rail tooltips use the `.lm-Menu` surface tokens with a decided
      placement, delay, dismissal and screen-reader behaviour — or the task is
      dropped with a reason.
- [x] **P2-05** Dock tab bar. A 2px teal top border on the current tab, a
      dirty-state dot, and a close affordance. The split handle gets an 8px hit
      area over a 1px visual.
      _Done on 2026-09-03._ Five verification agents drove it in both modes and
      **all five failed**. The surface looked finished and almost nothing it
      claimed to do worked. Six root causes: four fixed, two recorded. See
      **D-026**.
      _The headline._ The tab was 32px inside a 26px bar, and Lumino's
      `contain: strict` on the bar threw the top 6px away. The 2px teal accent
      was **never painted** — zero pixels of the token colour in a 970×46 scan,
      while `getComputedStyle` reported a correct 2px teal band. The 4px radius
      and the 1px top border were never painted either, and the top 6px of every
      tab was not clickable. A stock-JupyterLab control measured overshoot 0, so
      it was ours. `bottom-dock.css:82-86` already carried the fix for its own
      bar and its comment describes this exact trap; the main dock had never
      been given the line. After: overshoot 0, top clickable, accent
      photographed at 4× in both modes.
      _The dirty dot never existed._ Core's mechanism reveals `.jp-icon-busy`
      inside the close SVG. `packages/icons` overrides that icon with a stroked
      path carrying neither class, so core's swap and our fill override both
      selected nothing — a dirty tab was pixel-identical to a clean one. The
      mockup never wanted the swap: it puts a separate 7px dot between the label
      and the ×. That is what this sheet now draws, in the flow, which also
      un-orphans `--d4n-tab-dirty-dot-size`.
      _Two smaller repairs._ The close hit target was 16×16, the glyph size with
      no padding; it is now 24px with `cursor: pointer`. Tabs shrank without a
      floor until labels hit 0px; `--d4n-tab-min-width` is 120px, which is a
      judgement rather than a measured constant.
      _Method note worth keeping._ My first check after fixing the height used a
      hand-rolled PNG decoder and said the accent was still missing. The
      screenshot showed it plainly. Where a pixel claim decides a verdict, look
      at the image as well.
      _Not fixed, and tracked as P2-17:_ the 8px split-handle hit area, and the
      close affordance's keyboard reachability.
- [ ] **P2-17** Dock split handles and the close affordance (split out of P2-05,
      **D-026**). Two things P2-05 measured and deliberately did not fix.
      _The 8px hit area does not exist._ Lumino sets `contain: strict` inline on
      every `DockLayout` handle, and `contain: style` on `SplitLayout` handles
      with the comment "Do not use size containment to allow the handle to fill
      the available space". So the identical rule pair measures **8.0px on
      `.lm-SplitPanel-handle` and 5.0px on `.lm-DockPanel-handle`**. Real
      pointer drags 1px outside 739–743 do not move the split.
      Worse, `tab-bar.css:130-144` restates a `min-width: 8px` that
      `@lumino/widgets/style/dockpanel.css:51-59` already ships, so it changes
      nothing: our hit area equals stock JupyterLab's, and the comment claiming
      the token "tracks the design rather than Lumino's default" is describing
      Lumino's default. Delete it or make it real.
      _The close affordance is keyboard-unreachable_ and has no accessible name:
      upstream renders a bare `<div title="Close …">` with no role and no tab
      stop. That is a renderer replacement, not a stylesheet change.
      _Done when:_ the handle's hit area is measured, not asserted — either by
      overriding `contain` with the cost measured, or by widening the handle in
      JS, or by recording that stock is accepted and deleting the dead rule. And
      the close affordance is operable from the keyboard with a name, or that is
      refused in writing.
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
- [ ] **P2-14** Status bar overflow — BLOCKED, and the stub's premise is
      disproven. This entry used to say the shape was "settled by precedent":
      follow D-017 and drive `IStatusBar` the way P2-02 drives the menu bar.
      **Measured on 2026-09-04: that API does not exist.**
      _`IStatusBar` exposes exactly one method_, `registerStatusItem(id, item)`.
      It does not expose the items it holds. `StatusBar` keeps `_leftRankItems`
      and `_rightRankItems` **private**. D-017 worked because Lumino's `MenuBar`
      has public `menus`, `addMenu`, `clearMenus` and `overflowMenu`. There is
      no equivalent here, so "add the missing behaviour over the public API" is
      not available.
      _What core actually does._ `_refreshItem` shows an item when
      `isActive() && !(priority === 0 && _isWindowNarrow())`, else hides it.
      `_isWindowNarrow` is `window.innerWidth <= 630`, with core's own comment:
      "The value for 630px was chosen by trial and error." So only `priority: 0`
      items participate, the threshold is private, and the drop has no
      affordance — a hidden item is simply gone.
      _1024px is the wrong number, as the stub predicted._ Measured with
      `fixture.ipynb` open: 8 of 14 items render, totalling **708px**. The bar
      fits at 800px and overflows at 700px. At 1024px there is 316px to spare,
      so collapsing there would hide items with plenty of room — the same lesson
      the menu bar taught, and by a similar factor.
      _The concrete harm, and it is narrow._ Between **630px and ~708px** the
      content exceeds the bar and is clipped, because core's drop has not fired
      yet. Below 630px core hides four items and the rest fit.
      _Why it is blocked rather than done._ Every route contradicts something
      already decided: 1. **Own `IStatusBar`** — a T3 swap. **D-015 decided against exactly
      this**, and `statusBar.ts` says in as many words: do not register a
      plugin that provides `IStatusBar`. 2. **Move core's item nodes into a popover** — real DOM manipulation of
      another plugin's widgets, and the only way to keep them interactive.
      Several status items are controls, not readouts: a popover that merely
      lists their text loses the kernel picker. 3. **Reach into `_leftRankItems` / `_isWindowNarrow`** — private fields,
      the same class §7.4(3) forbids for variables. 4. **Accept core's behaviour** and refuse §8.5.2's ⋯ trigger in writing,
      optionally fixing only the 630–708px clipping in CSS.
      _Done when:_ a person picks one of those four, or §8.5.2 is rewritten. If
      the answer is 4, the CSS half is small and this becomes a one-hour task.
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
- [x] **P2-15** **T3: launcher behavior.** The second half of P2-08. Four parts
      of §8.11 that CSS cannot reach: a fixed section order, the root-directory
      text, the no-kernels state, and search above about 12 kernels.
      _Done on 2026-09-05._ `@d4n/shell-chrome:launcher` provides `ILauncher`
      and `@jupyterlab/launcher-extension:plugin` is disabled in the same
      change. Full reasoning and every measurement in **D-033**.
      **The headline, and it reverses D-015.** D-015 said a disabled plugin's
      settings schema SURVIVES, and warned that a swap missing the command id
      would leave an affordance pointing at nothing. The opposite happened here.
      The command id was kept, and disabling the core plugin took its SCHEMA
      away — so `File ▸ New Launcher`, the `Accel Shift L` shortcut and the file
      browser `+` button all disappeared, while the command itself kept working.
      Nothing threw and nothing logged. Measured on the first probe:
      `fileMenuHasNewLauncher: false`, `fbPlusCount: 0`, and `Control+Shift+L`
      adding no tab. `packages/shell-chrome/schema/launcher.json` re-declares
      the same three blocks and all four affordances came back. **The rule for
      the next swap: enumerate what the disabled plugin's schema declared.**
      **JupyterLab cannot report zero kernels.** `validateSpecModels` in
      `@jupyterlab/services` 7.6.3 throws `No valid kernelspecs found` on an
      empty map, so `KernelSpecManager.specs` stays NULL and never becomes an
      empty object. Measured against a second server on :8899 with
      `--KernelSpecManager.ensure_native_kernel=False` and the kernelspec moved
      aside: the API answered `{"default":"python3","kernelspecs":{}}` and
      `specs` was still null after `ready`. `ready` never rejects, and
      `connectionFailure` is a signal nothing emits. So the empty test is a null
      `specs` after `isReady`.
      **The markup keeps core's class names**, so the whole P2-08 stylesheet
      applies unchanged and `selectors.json` keeps asserting something real.
      What that manifest asserts changed with the ownership: it now proves OUR
      markup survives, not upstream's.
      _Measured in both modes:_ section order Notebook, Console, Other; 7 cards;
      "New files will be created in the root directory" at the root and the leaf
      directory in JetBrains Mono, left-truncated, elsewhere. Cards 112px
      `border-box`, 164.45px wide, 6px radius, 6 columns at 1600px, 12px gap,
      `#FFFFFF` on `#E4E9F0` light and `#122A47` on `#142E50` dark. Kernel plate
      `#F4F6FA` in both modes. All 7 cards `role="button"` with `tabindex=0` and
      a name; focus ring `2px #167C7C` light, `2px #4FD1D1` dark, both at a 2px
      offset; Enter opened Contextual Help. No-kernels block `role="alert"` on
      `#FBEFD8`/`#E0A04A` light and `#3D2E10`/`#C97C0A` dark. Filter verified
      with the threshold lowered to 3: 28px input, label bound by `for`/`id`,
      the caret stays in the input, and empty sections collapse.
      _Two things the next person needs._ **Skeleton cards are not built** —
      §8.11.5's "slow kernel discovery" row wants them, the launcher opens after
      `app.restored` so there is nothing to wait for, and panel loading states
      are P5-05. **AC10 changes shape here:** presentation reverts completely
      under a stock theme (100px `content-box` cards, 2px radius, `flex`, no
      plate, system-ui) but behaviour does not, because behaviour is a plugin.
      The section order and the root copy stay. Same as the splash (P2-09), and
      inherent to every T3 swap.
      _P1-09's caveat, carried forward and still unreproduced._ Two `ILauncher`
      providers do NOT make JupyterLab refuse to start.
      `PluginRegistry.registerPlugin` throws on a duplicate plugin **id** only;
      for a provided token it runs `this._services.set(data.provides, data.id)`,
      a silent overwrite. So the disable in `page_config.json` is the only
      guard, not a second one (D-024). Not reproduced here, because the
      container locks the disabled set on every start.
- [x] **P2-09** **T3: splash screen.** Replace it through `ISplashScreen`.
      **P0-02 does not block this.** An earlier note here said that the markup
      was lost, and that we must recover the file first. That was too strong. The
      splash specification is CSS, and all of it survived the truncation.
      `.jp-Splash` at L2952 to L3103 of `JupyterLab Theme.html` gives the plate and the `::before` wash. It also gives the geometry of `-lockup`, `-mark` and `-wordmark`, with `body.is-dark` overrides beside it. Write our own markup
      against that, which is what an `ISplashScreen` replacement does.
      The splash is the one surface where the light/dark logo question does not
      occur. D-007 makes the frame dark in both modes. Stub:
      `packages/shell-chrome/src/splash.ts`.
      _2026-09-02._ P0-02 recovered the file. `OverlayHost` at L6988 holds the
      reference markup for this surface. Compare it with what we shipped.
- [x] **P2-10** Bottom dock area (`'down'`). This is new work, because core ships
      it unstyled. Never render an empty bottom bar (PRD §8.5.3).
- [x] **P2-11** Log console level badges. They use the `color.log.*` tokens,
      which exist. Use badges, not tinted body text. Tinted 11px text fails A1.
- [x] **P2-12** Declarative restructuring of toolbars and menus through
      `overrides.json` (PRD §7.6).
      _Done on 2026-09-04._ Recorded as **D-027**. The mechanism is established,
      the dead separator rule is alive, and the integrity job now guards it.
      _The PRD names the wrong key._ `jupyter.lab.toolbars` is schema metadata
      contributed by plugins and merged across them; it is not writable from
      `overrides.json`. The settable property is `toolbar` on the **aggregator**
      plugin — the one carrying `jupyter.lab.transform: true`. Ten of the twelve
      plugins that declare a toolbar are aggregators. **Two are contributors
      only** and have no settable properties at all, so writing under
      `@jupyterlab/launcher-extension:plugin` or
      `@jupyterlab/workspaces-extension:indicator` is a silent no-op.
      _Merge is by `name`, shallow._ An override carries deltas only; unknown
      names are appended; order is `rank` with default 50 and a stable sort. The
      six rank-less `Cell` toolbar items therefore keep declaration order, and
      reordering them needs ranks on all six.
      _`jp-Toolbar-separator` never existed._ The string appears nowhere in
      4.6.3 — not in `node_modules`, not in the served bundle. It came from the
      mockup's `.jp-tb-sep`, renamed into something that looks like a Jupyter
      class. The item type universe is exactly `command` and `spacer`, with
      `additionalProperties: false`, and `"type": "separator"` does not fail
      quietly: it **discards the whole plugin's toolbar list**. Menus get a
      separator type; toolbars deliberately do not.
      _So a separator is a spacer we name._ Two are declared at ranks 25 and 35,
      the grouping the mockup draws at L4336-4347, and `toolbar.css` styles them
      through `[data-jp-item-name^='d4n-sep']` — (0,4,0) against upstream's
      (0,3,0), no `!important`. Measured in both modes: correct order, 1×16,
      `flex-grow: 0`. `selectors.json` carries the selector as **not optional**,
      so a silently dropped override fails the integrity job. 97 matched → 98.
      _Turned up while verifying:_ the notebook toolbar is collapsed. Read
      **P2-18**. It is not caused by this task.
- [x] **P2-18** The notebook toolbar is invisible (found during P2-12).
      _Fixed on 2026-09-04._ Recorded as **D-028**. The toolbar now measures
      32px in both modes with 31px items, identical to a stock theme in the same
      build, and the P2-12 separators are visible in it.
      _The cause was D-001, not a toolbar rule._ Core computes
      `--jp-private-toolbar-height` at **`:root`** from `var(--jp-border-width)`.
      D-001 puts our adapter on `body` so AC10 holds, and a `:root` rule cannot
      see a `body`-scoped variable — the `calc()` is invalid at computed-value
      time and the property is discarded entirely, not defaulted.
      _Why nothing found it earlier._ The value is written into an **inline**
      style on every `<jp-toolbar>`. A scan of every rule in
      `document.styleSheets` setting `height` or `min-height` and matching the
      element returned one rule, core's own, whose variable resolves to `8px` in
      both themes. Only CDP `getMatchedStylesForNode`, which reports the inline
      style, showed the real declaration.
      _It was not one variable._ Enumerating core's `:root` rules that compose a
      `--jp-*` into another property found four. Two are broken for us —
      `--jp-private-toolbar-height` and `--jp-private-code-span-padding`, both
      UNSET against stock's real values. Two are fine and are deliberately not
      bridged, because they compose values core also defines at `:root`.
      _The fix is scoped, not global._ `private-bridges.css` restates core's own
      formulas at our `body` scope. Defining the inputs at `:root` instead would
      have fixed the calc and left the values behind under a stock theme, which
      AC10 forbids. Verified after: both variables are still UNSET at `:root`,
      resolve on `body`, and the stock theme is unchanged.
      _Open, and deliberately not taken here._ The mockup draws the notebook
      toolbar at **36px**; `--d4n-toolbar-height` is 32px for stock parity so
      that this repair changed only where the value is computed. Moving to 36px
      is a design change for the notebook work.
      _Standing risk._ Writing a private name means upstream can rename it and
      this file goes stale silently. No lint can catch it — `lint:vars` follows
      only `--d4n-*`. The check is comparing each bridged variable against a
      stock theme in the same build, and it belongs in the Appendix C upgrade
      playbook (P6-04).
      more.
      _Done when:_ `jlpm test:selectors` fails loudly on a selector that you
      break on purpose.

---

## P3 — Notebook & editor

Critical path (PRD §11 — staff this first). Exit: syntax validation in 11
languages, the terminal and both DataGrids repaint on a theme switch, and A4 is
green including D4.

- [x] **P3-01** Cell container, active-cell indicator, prompts, and a 24px hit
      area for the collapser.
      _Done on 2026-09-04._ Two pieces the file's own comments sent back here,
      plus a defect the verification found.
      _The 24px collapser hit area needed no markup change._ The comment claimed
      it did. Measured instead: the collapser is already `position: relative`,
      its `overflow` is `visible`, it has no containment, and neither does
      `.jp-Cell-inputWrapper`. A pseudo-element widens the target without
      touching the 4px line. Measured after: visual 4px, hit **24px** (x 648 to
      671), both modes.
      The extra 20px goes **entirely to the left**, and that is measured rather
      than tidy: an `elementFromPoint` sweep shows `.jp-InputPrompt` starting
      2px to the collapser's RIGHT and the editor beyond it, so growing
      symmetrically would have made a click on the prompt collapse the cell.
      _The active-cell treatment was not rendering at all._ Both halves were
      overridden in the state a user is actually in — command mode, selected,
      focused. Read with CDP `getMatchedStylesForNode`, because a
      `document.styleSheets` scan does not rank the cascade:
      `.jp-Notebook.jp-mod-commandMode .jp-Cell.jp-mod-active.jp-mod-selected:not(…)`
      forces `background: transparent` at (0,6,0), and
      `.jp-Cell.jp-mod-active:focus-visible` replaces the indicator with a 1px
      ring on all four sides at (0,5,0). Ours was (0,4,1). Restated at (0,6,1),
      no `!important`. Measured after: surface `#FFFFFF` light and `#122A47`
      dark, indicator `2px 0 0 0 inset` in `#167C7C` / `#4FD1D1`.
      Taking the focus ring's `box-shadow` is safe: `focus.css` gives every
      `:focus-visible` element an `outline` from the one focus spec, so core's
      shadow was a second ring for the same state.
      _Split out, and confirmed from source rather than inherited:_ the
      running-cell prompt pulse. Read P3-15.
- [ ] **P3-15** Running-cell prompt state (split out of P3-01). PRD §8.2 wants a
      distinct treatment while a cell is executing, and
      `--d4n-notebook-prompt-running-fg` exists for it. **There is no CSS hook,
      and that is verified in the 4.6.3 source rather than assumed.**
      `@jupyterlab/cells/lib/widget.js` `_updatePrompt()` reads
      `this.model.executionState == 'running'` and sets the prompt **text** to
      `'*'`. It adds no class and no attribute, so nothing selectable changes.
      `.jp-mod-dirty` is a different state — stale output, not execution.
      _So it needs a plugin,_ watching `model.executionState` and toggling a
      class the stylesheet can reach. That is notebook behaviour over a public
      model signal, the same shape as D-017, and it provides no token.
      _Done when:_ a running cell is distinguishable from an idle one without
      reading the prompt text, in both modes, and the treatment respects
      `prefers-reduced-motion` (A8) if it animates.
- [x] **P3-02** Output area, stream output, error output, and the 2px danger left
      border.
      _Verified on 2026-09-04, and the entry above it was stale in both
      directions._ It said "the error output treatment is not there yet" — it is
      there and it works — and that the file styles
      `.jp-OutputArea-promptOverlay`, which it does not; that class appears only
      in a comment.
      _How it was verified._ A notebook fixture carrying **stored** outputs, so
      no kernel was needed and the states are deterministic: a stdout stream, a
      stderr stream, and an error traceback. Written into the server root,
      measured, and deleted afterwards.
      _Measured, both modes:_ - stdout — canvas background, no left border. Plain, as intended. - stderr stream — plate `rgb(252,227,233)` light and `rgb(61,20,32)` dark,
      left border **2px solid** `rgb(196,39,74)` / `rgb(255,107,134)`. - traceback — the same treatment, because JupyterLab tags tracebacks with
      the same `application/vnd.jupyter.stderr` mime type. The file's comment
      predicted that and it holds.
      So the signal is structural as well as chromatic, which is what A7 asks
      for: a stderr block is identifiable without relying on the red wash.
      _`.jp-OutputArea-promptOverlay` is not ours to fix._ It measures 0px wide
      with a transparent background — **and does the same under a stock theme in
      the same build**, so it is upstream behaviour, not a defect this task
      introduced or should paper over.
- [x] **P3-03** Rendered markdown (`.jp-RenderedHTMLCommon`).
      _Done 2026-09-04, and it was not the largest surface in scope._ The entry
      called it "the full type ramp, tables, code, blockquote, lists and hr". The
      ramp needed nothing at all: core routes it through variables the Tier-4
      adapter already feeds. Measured on a fixture carrying every construct,
      both modes, before a line was written — body 14px / 22.4px, `h1`..`h6` at
      24 20 18 16 14 13px, which is `content.5` down to `content.0` exactly, and
      heading weight 600. Links, alerts, list markers, list indents and heading
      margins were all correct too. Writing any of that again would have given
      every value two owners.
      _Four real defects, all in `style/surfaces/markdown.css` (new):_ 1. **A fenced block was not a block.** `<pre>` computed to the canvas
      colour — the same as the page behind it — with no padding and no
      radius, while _inline_ code did get a plate. The emphasis was
      inverted. It now sits on `surface.sunken`, the same plate the inline
      span uses, so the two forms of code agree. 2. **The blockquote bar was `5px`**, a hardcoded upstream literal no
      variable reaches. Now `border.width.thick`, the same structural weight
      the stderr block uses, with secondary text. 3. **Tables were centred in the text column.** A 137px table sat 382px
      right of the paragraph above it. Now left-aligned, and the header cell
      is left too — it had kept the browser default of `center` while every
      body cell was left. 4. **`kbd` carried a hardcoded black inset shadow into dark mode**, where
      it reads as a smudge rather than a key edge. Also an off-scale `3px`
      radius, and no font-family at all — so the one element that is by
      definition a key legend fell through to the browser's monospace.
      _A fifth defect was worse, and was not CSS._ **Light-mode tables had no
      striping whatsoever.** Core stripes odd rows with `surface.canvas` and even
      rows with `--jp-rendermime-table-row-background`, which the adapter pointed
      at `color.surface.raised` — and in light mode that IS `surface.canvas`,
      both being `palette.neutral.0`. Two identical colours. Dark mode looked
      correct, which is why it survived. Fixed in `mapping/jp-adapter.yaml`
      (D-029).
      _The audit could not have caught it, so the audit changed too._ The
      `canvas` vs `sunken` gate ran in dark mode only, because light-mode
      elevation is carried by borders. That is right for `overlay` and `raised`
      and wrong for this pair, which is the only thing separating one table row
      from the next. It now runs in both modes, and it was verified by putting
      the bug back: the audit fails with `1.00:1 (min 1.04) #FFFFFF on #FFFFFF`.
      _The committed fixture grew a table, a blockquote, a fenced block and a
      `kbd`_, because a selector the CSS depends on has to match a real element.
      They went into `notebooks/fixture.ipynb` rather than a second file: the
      server root is that directory, so a new file would move the
      `file-browser` snapshot.
- [x] **P3-04** Wire the generated ANSI block into rendermime, and check PRD T2.
      _Done 2026-09-04. The wiring already existed_ — `generated/ansi.css` is
      imported at `packages/tokens/style/index.css:27`, and the xterm half is
      registered as `@d4n/shell-chrome:terminal`. So the task was the check it
      names, and the check found something.
      _T2 holds, measured in both modes, two independent halves compared._ - **rendermime** — a notebook fixture carrying **stored** ANSI output, so
      no kernel and no timing. All 16 computed colours equal the `color.ansi`
      tokens exactly. - **terminal** — a real terminal session, `printf` over all 16 background
      codes, screenshotted and decoded pixel by pixel **through the browser's
      own PNG decoder**, not a hand-rolled one. All 16 appear as real pixels.
      The terminal image holds exactly **17 distinct colour blocks** — the 16
      plus the background — so nothing falls back to an xterm default. Each
      block is exactly 1440px. In dark mode cyan reads 1455: the extra 15 pixels
      are the cursor, which confirms `cursor` resolves from the same group.
      _T2 was passing by luck, and now is not (D-030)._ `ls --color=always` does
      not emit a plain colour. It emits **bold plus colour**, and the two halves
      resolve that pair by unrelated routes: rendermime maps bold+blue onto
      `.ansi-blue-intense-fg`, while xterm reaches `brightBlue` only if
      `drawBoldTextInBrightColors` is on. The bridge set nine terminal options
      and not that one, so the agreement was an xterm default nobody had written
      down. It is now a token, set explicitly.
      _Proved by breaking it._ With the token at `false`, all four `ls` colours
      diverge in both modes — eight mismatches out of eight. So the option
      really does reach xterm rather than being swallowed by the try/catch in
      `setXtermOption`, and T2 really does rest on it.
      _T2 is not automated._ It needs a live terminal session, a canvas
      screenshot and a pixel decode. The next person to touch xterm must re-run
      it by hand; D-030 records exactly how.
- [x] **P3-05** CodeMirror 6 theme and `HighlightStyle`, tested against all
      eleven languages.
      _Done 2026-09-04. Zero tags fall through, in both modes._ One fixture per
      language, opened in the editor, every token span read back with its
      computed colour, weight and style. Both paths covered as the entry
      demanded: five Lezer grammars (Python, SQL, Markdown, JSON, TypeScript)
      and six `StreamLanguage` modes (R, Julia, YAML, TOML, Bash, LaTeX).
      _Distinct colours per language, light / dark:_ Python 8/9, R 6/6,
      Julia 7/7, SQL 7/7, Markdown 6/6, JSON 4/4, YAML 4/4, TOML 4/4, Bash 7/7,
      TypeScript 9/10, LaTeX 6/6. The two modes agree span for span, which is
      expected — the tag coverage is structural, only the palette changes.
      _The aliased stream tags resolve._ R colours `function`/`if`, `<-`, `42L`
      and `TRUE`; Bash colours `if`/`then`/`fi` and `$s`; TOML colours
      `[section]` as metadata. A Lezer-only tag list would have missed all of
      them, exactly as the entry warned.
      _One real bug, and it was not language-specific (D-031)._ A bracket beside
      the cursor rendered at **the default text colour**. CodeMirror does not add
      `cm-matchingBracket` to the syntax span — it **replaces** it — and the rule
      set a background and an outline but no `color`. Read off the live element:
      cursor beside the brace gives `class="cm-matchingBracket"` at
      `rgb(44,62,85)`, cursor one keystroke away gives the highlight class at
      `rgb(70,86,109)`. JSON only showed it first because a JSON file opens with
      `{` on line 1 and the cursor lands on it. Both rules now restate
      `text.secondary`, and the two new pairings are gated at 4.5:1.
      _Two things the next person needs._ 1. **`.json` never opens in the editor.** It opens in the JSON viewer, and
      `?factory=Editor` in the URL does not change that. Reaching CodeMirror
      needs `defaultViewers: { json: 'Editor' }` in the settings mock. Whether
      `.jp-RenderedJSON` itself is styled is a separate question that no task
      currently covers. 2. **`editor-theme` is outside the selector harness.** It has no `style/`
      directory, because it generates its CSS through `EditorView.theme()`.
      So `test:selectors` cannot see that it depends on `.cm-matchingBracket`,
      `.cm-focused` and the rest. If upstream renames one, nothing fails.
- [x] **P3-06** Terminal bridge, all four triggers and T1 to T10.
      _Done 2026-09-04. Nine of ten hold. T3 does not, and the reason is not
      ours to fix alone (D-032, Still-open Q9)._
      _The trigger the entry warned about does not reproduce._ **T6**, the
      theme-then-open order, was checked by switching to dark through the
      command palette and only then opening a terminal: dominant background
      `#0E2542`, our dark ANSI background, not core's inherited one.
      _Criterion by criterion:_ - **T1** one generated source for both halves — held, `lint:tokens` and
      the clean-tree job enforce it. - **T2** `ls --color=always` identical — done in P3-04, both modes. - **T3** **FAILS.** IPython 9.16.1 paints tracebacks with **256-colour**
      codes, `38;5;28` and `38;5;167`, which a sixteen-slot theme does not
      reach. They are `#008700` and `#D75F5F`, and three of the four
      mode pairings fall below 4.5:1 — worst `3.28:1`. See D-032. - **T4** all 16 against both backgrounds — settled in P0. The audit covers
      it and the PRD text is the thing that is wrong. - **T5** box drawing — 30 `│` glyphs measured at **one** distinct pitch of
      12px, spread 0. No shear. - **T6** terminal opened after a switch — held, see above. - **T7** blink off under reduced motion — **not observable in this
      harness.** A stock theme behaves identically, so the cursor does not
      blink headless at all and no pixel test can separate the two states. The
      option path is proven live by other means: the terminal renders at the
      JetBrains Mono pitch, and `fontFamily` reaches xterm through the same
      `setJupyterOption` that carries `cursorBlink`. Needs a human with a real
      browser. - **T8** twenty consecutive switches — held. Ends on dark with our
      `#0E2542`, not core's inherited palette. - **T9** viewport scrollbar matches the app spec — **held after a fix.** - **T10** `FitAddon` at any width — held at 800, 1024, 1280 and 1600. The
      screen never overflows the panel.
      _The T9 fix, and the comment that was wrong._ `scrollbars.css` said that
      `scrollbar-color` and `scrollbar-width` both inherit, so one declaration on
      `<body>` reaches every scroller. Only the first does. Measured: with
      `body` at `thin`, `.xterm-viewport` computed the body `scrollbar-color`
      and `scrollbar-width: auto`. On Firefox, which has no
      `::-webkit-scrollbar` fallback, every inner scroller kept the default
      width. The width now uses the same descendant form the WebKit rules use,
      and `.xterm-viewport` computes `thin`.
- [x] **P3-07** Autocomplete popup, inline signature, tooltip and console panel.
      _Done 2026-09-04._ Three new files — `completer.css`, `console.css`,
      `tooltip.css` — plus 17 selector registrations and 26 new contrast
      pairings. The audit goes from 483 to 509, 0 failing.
      _Measured in both modes, with a live kernel:_ - **completer popup** radius 6px, 1px border, elevation shadow, plate
      `#FFFFFF` / `rgb(18,42,71)`. - **items, 5 of them** — at rest transparent, active
      `rgb(214,239,239)` / `rgb(18,55,69)`. - **matched substring** the `<mark>` renders at weight **700** in the
      strong text colour, so the match reads without relying on hue. - **monogram** an inverse plate, navy on white in light and near-white on
      navy in dark, weight 600. - **type badge** secondary colour, so it recedes behind the name. - **tooltip** radius 6px, max-width 750px, `pre` in JetBrains Mono. - **console** input on the raised plate with a 1px top border and
      `8px 12px` padding, content on canvas.
      _Two selectors are registered but were never on screen._
      `.jp-CodeConsole-banner` and `.jp-Completer-docpanel` both exist in the
      served bundle — checked there rather than in `node_modules`, because
      **`@jupyterlab/completer` is not in `node_modules` at all** and a search
      there returns zero for classes that plainly exist. JupyterLab 4 does not
      render the banner by default, and the doc panel needs a completion that
      carries documentation.
      _All 17 new selectors are SKIPPED by `test:selectors`, not matched._ The
      harness has no automation for the completer, tooltip or console states, so
      nothing guards them. 0 broken, but that number means less than it looks
      here. Driving them needs a kernel: open a console, run `import os`, type
      `os.pa` and press Tab. A first attempt with `pri` returned an empty
      completer ten times in a row — the namespace was too thin, not the styling.
- [x] **P3-08** Breakpoint gutter, wired to the debugger. The execution-line
      half is **P3-16**.
      _Done on 2026-09-05._ The gutter was already committed and had never been
      on screen. It works. Full record and every measurement in **D-035**.
      _Measured in both modes:_ `.cm-d4n-breakpointGutter` mounts at 16px in
      gutter order `cm-breakpoint-gutter` (hidden), ours, `cm-lineNumbers` — so
      `Prec.high` really does put it left of the line numbers. Upstream's column
      computes `display: none`, width 0, 0 markers. The `set` glyph is a filled
      disc r=4.5 on a 12×12 canvas, `#C4274A` light and `#FF6B86` dark; the hover
      ghost is an 8px pill at opacity 0.5 and stays off lines that already carry
      a breakpoint.
      **One gap found and closed: a blank line was not a blank line to us.**
      Upstream's `_getEffectiveClickedLine` walks back from a blank line to the
      nearest non-blank line above and sets nothing when there is none. Our
      `toggleBreakpoint` did not, so clicking blank space asked the kernel for a
      breakpoint upstream would never have requested. `effectiveLine()` now makes
      the same choice, with a range guard beside it. After the fix, clicking the
      blank line under a breakpointed line toggles that line off — identical to
      upstream, zero console errors.
      **`disabled` is unreachable, and the reason is new.** The old wording here
      said `glyphState()` maps `verified === false` onto `disabled` because
      debugpy returns an unbindable breakpoint unverified. **It does not.**
      Measured: a breakpoint on a comment line comes back with **line 0**, and
      the debugger panel then holds `Cell [1] 0` beside `Cell [1] 3`. So that
      branch never runs against debugpy, exactly as `conditional` never runs
      against a 4.6 that has no interface to set a condition. Both glyphs stay:
      they are the correct reading of the protocol, and another adapter may use
      them.
      **The line-0 breakpoint crashes UPSTREAM, not us.**
      `@jupyterlab/debugger/src/handlers/editor.ts:410` calls
      `doc.line(b.line!)` with no range guard, so it throws on line 0.
      Ours filters it and paints correctly. Attribution was
      measured, not assumed: with every `@d4n` extension disabled through
      `JUPYTERLAB_D4N=0`, the same `RangeError` fired four times **before any
      click**, while upstream restored the stale breakpoint from the kernel.
      _Two hazards for the next person._ **Typing into `fixture.ipynb` gets
      autosaved.** JupyterLab's autosave wrote the probe's typing to disk and it
      turned up in `git status`; check the notebook and `git checkout` it after
      any probe that edits a cell. And **`JUPYTERLAB_D4N=0` boots behind an
      "Error Loading Theme" dialog**, because the shipped `overrides.json` still
      pins `Data4Now Light` while the theme extensions are off — dismiss it
      before the probe touches anything.
      _The sequence, and the last step is the one that bites._ The notebook
      toolbar carries a debugger toggle from the start, but its title reads
      "Select a kernel that supports debugging to enable debugger" until the
      kernel advertises support. Waiting for `/debug/i` in a title matches that
      string and clicks a dead button. Wait for the title to be exactly
      **"Enable Debugger"**, and check it before clicking — a restored session
      can leave it reading "Disable Debugger", in which case a click turns the
      debugger OFF and no gutter ever mounts.
      _Budget the boot._ One browser start is ~70s in this container, whose
      steady state is eight `build-labextension --watch` processes at ~170% CPU.
      Reuse one page across the measurements rather than launching per step.
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

- [x] **P3-16** Execution-line decoration, wired to the debugger (split out of
      P3-08). The line the program is stopped on, plus upstream's own
      `jp-DebuggerEditor-highlight` suppressed so there is one highlight rather
      than two.
      _Done on 2026-09-05._ Full record and every measurement in **D-035**.
      _Measured in both modes,_ with a five-statement cell, a breakpoint on
      `b = a + 1`, and a step over afterwards: line background `#FBEFD8` light
      and `#3D2E10` dark, left bar an inset `2px 0 0 0` box-shadow in `#8C5807`
      and `#E0A04A`, gutter cell tinted to match, arrow glyph 12px in the same
      amber. Upstream's `outline` and `text-shadow` both compute `none` while its
      class sits on the very same line. Continuing cleared both.
      **Both gutter markers were reached, and they differ on purpose.** Stopped
      ON the breakpointed line the cell is tinted and the breakpoint glyph stays.
      Stepped onto a line with no breakpoint, the same cell draws the arrow.
      **The four tokens that had never been on screen are now on screen.** The
      measured values are the Data4Now tokens, not the `--jp-*` fallbacks.
      **Three defects came from an adversarial review of the same path, and two
      are fixed here.** `EditorView.decorations.compute` listed only the state
      field, so the decoration kept a stale character offset and an edit above
      the stopped line dropped the band while the arrow stayed — `'doc'` is now
      in the dependency list, verified by typing above a stopped line twice. And
      the hover ghost fired on the stopped line's own cell, putting an 8px red
      dot beside the 12px arrow in a 16px cell — now excluded, isolated and
      measured on a cell whose classes were exactly
      `cm-gutterElement cm-d4n-executionGutter`.
      **One limitation measured and deliberately not fixed: the selection is
      invisible on the stopped line.** Photographed at 3x. The mechanism is
      CodeMirror's `.cm-selectionLayer { z-index: -2 }` under an opaque
      `.cm-line` background, and **stock JupyterLab does the same** — its own
      highlight sets `background-color: var(--md-brown-100)` on that element.
      A fix means a semi-transparent tint, which diverges from §8.6.4 and moves
      the A4 gate onto a blend. Not invented here.
      _Two survivors became tasks:_ **P3-17** (AC10) and **P3-18** (Sources).
      _Nothing was re-audited, because nothing moved._
      `color.debug.executionLineBg` is still one of the six `CODE_BACKDROPS` the
      A4 block gates at 4.5:1 against all fifteen syntax tokens.
- [ ] **P3-17** The debugger decorations do not honour AC10 (found by the P3-16
      review). Every colour in `debugDecorations.ts` is
      `var(--d4n-…, var(--jp-…))`, and on a stock theme the `--d4n-*` layer is
      out of scope, so the fallback is what paints.
      **The fallbacks are not mode-relative.** Measured in the 4.6.3 container:
      `theme-light-extension` and `theme-dark-extension` BOTH declare
      `--jp-warn-color3: var(--md-orange-100, #ffe0b2)`. So on stock **dark** the
      execution line is a near-white band under a light syntax ramp. The 2px bar
      falls back to `--jp-warn-color1` — `#f57c00` light, `#ff9800` dark — which
      measures 2.13:1 and 1.70:1 on that tint, both under the 3:1 the Data4Now
      path is held to by `audit.mjs`.
      **No gate can see this.** `tests/contrast/audit.mjs` reads
      `packages/tokens/dist/tokens.json` only, so it measures our token values
      and never a `--jp-*` fallback.
      _Done when:_ either the decorations go inert outside a Data4Now theme —
      the AC10-true answer, and the one D-003 implies — or the fallbacks are
      chosen deliberately and gated. Either way the choice is recorded.
- [ ] **P3-18** The Sources panel never gets our execution line (found by the
      P3-16 review).
      `executionLineFor()` compares `frame.source?.path` with
      `service.getCodeId(doc)`, a content hash. That is right for a dumped cell
      and wrong everywhere else: upstream matches with
      `this._path || getCodeId(…)`, and `SourcesBody._showSource` builds its
      handler with `path: currentFrame?.source?.path` — by path, never by hash.
      So stepping into library code shows upstream's own highlight, rendered
      whole, because our suppression only applies where OUR class is present.
      _The same mismatch has a second symptom._ `codeId` is recomputed from the
      LIVE document on every sweep, so editing a paused cell makes
      `frame.source.path !== codeId` and the next debugger signal clears the
      execution line for the rest of the stop.
      _Done when:_ an execution line renders in the Sources panel in both modes,
      and an edit to a paused cell does not silently clear it — or each is
      refused in writing.
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
      _D-020 sets the menu half of this task._ 160 menu rows must carry an icon,
      across 152 distinct commands. Most of those commands have no `LabIcon`, so
      that part is not a registry override. It is a declaration through
      `overrides.json` and the plugin, and it therefore waits on P2-12. Run
      `jlpm test:menu-icons --json` for the classified rows.
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
