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
| P0    | Audit & contract         | **Done.** Exit gate signed 2026-09-03.        |
| P1    | Token pipeline & themes  | **Done**                                      |
| P2    | Chrome & navigation      | Most surfaces styled. P2-15 is the last swap. |
| P3    | Notebook & editor        | Scaffolded                                    |
| P4    | Forms, settings, dialogs | Scaffolded                                    |
| P5    | Icons, motion, density   | Scaffolded                                    |
| P6    | Hardening & release      | Not started                                   |

Measured in a running JupyterLab 4.6.3, in both modes:

- `jlpm test:selectors` — **97 matched, 0 broken**, 168 skipped. The harness
  cannot drive those 168 states yet. A skipped selector is reported, never
  passed.
- `jlpm test:contrast` — 478 pairings, 0 failures.
- `jlpm test:galata` — **14 tests green**, 12 committed baselines over 6
  surfaces × {light, dark}. Run it from the container with
  `JUPYTER_URL=http://localhost:8888`.
- `jlpm lint:design` — seven gates green. `jlpm lint:check` green. `pytest` 5
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
- [x] **P1-11** The five design lints (`jlpm lint:design`). Lint 1: no hardcoded values (AC4). Lint 2: every menu `:hover` is paired with `.lm-mod-active` (M1). Lint 3: no literal color in an SVG (I2). Lint 4: every `!important` is annotated (§7.4(4)). Lint 5: **every `var(--d4n-*)` resolves to a declared property**. P0-11 later added a sixth, `lint:anchors`, and queue housekeeping a seventh, `lint:queue`.
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
      plugin is disabled **in the same change**. Stub:
      `packages/shell-chrome/src/launcher.ts`.
      _Caveat added by P1-09, and read it before you rely on the old wording._
      This entry used to say "Two `ILauncher` providers make JupyterLab refuse
      to start". **The source does not say that.**
      `PluginRegistry.registerPlugin` in `@lumino/coreutils` throws on a
      duplicate plugin **id** only; for a provided token it runs
      `this._services.set(data.provides, data.id)`, a silent overwrite, and
      `@jupyterlab/application` adds no guard. So two providers leave the winner
      to registration order. That is **worse** than a refusal, because a crash
      is visible and this is not. Not reproduced: the container locks the core
      splash (`docker/entrypoint.sh` rewrites `page_config.json` on every start
      and lists it under `lockedExtensions`), so the experiment could not run
      here. Run it before treating "it would crash" as a safety net. See D-024.
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
      _Not started._ `.jp-RenderedHTMLCommon` appears in no stylesheet. **P0-08
      is settled:** 14px body, 1.6 line height, at every density (D-022). Build
      the ramp on `font.size.content.*`, which is 13/14/16/18/20/24.
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
