# Decision record

Decisions that are load-bearing, non-obvious, or a deliberate departure from the
PRD. Each one is referenced by id from the code that depends on it, so a future
reader who finds a surprising line can get to the reason without archaeology.

Format: what was decided, what it rules out, and what would make us revisit.

---

## D-001 — Tiers 2, 3 and 4 are declared on `body`, not `:root`

**Decided.** `packages/tokens/build.mjs` emits Tier 1 onto `:root` and Tiers 2,
3 and 4 onto `body`.

PRD §5.2 sketches `:root { Tier 1, Tier 3, Tier 4 }`. Taken literally that
produces a stylesheet where nothing resolves, and it fails silently.

A custom property whose value contains `var()` is substituted **at
computed-value time on the element where it is declared**. Tier 2 has to live on
`<body>` — that is where JupyterLab writes `data-jp-theme-light`, and menus
portal to `document.body` so a shell-scoped selector misses them entirely
(§8.4.1(1), R13). A Tier-3 property declared on `:root` that references a Tier-2
property existing only on `body` therefore resolves against nothing, becomes the
guaranteed-invalid value, and inherits down as garbage.

Tier 1 stays on `:root` because it is all literals with nothing to resolve.

**Revisit if:** JupyterLab moves the theme attributes off `<body>`.

---

## D-002 — The ANSI palette: mode-following terminal, and four exempt anchors

**Decided.** Two narrowings of PRD §8.7 / T4, both forced by arithmetic.

**(a) The terminal background follows the mode.** PRD §8.7.2 requires all 16
ANSI colours to clear 4.5:1 against _both_ the terminal background and the
notebook output background, "gated on the tighter of the two". If the terminal
were dark in light mode, that gate is unsatisfiable: 4.5:1 against `#FFFFFF`
requires relative luminance ≤ 0.179, and 4.5:1 against a near-black requires
≥ 0.249. No colour satisfies both. Making the terminal background equal to the
notebook output background collapses the two gates into one, and the constraint
becomes achievable.

**(b) ANSI slots 0/7/8/15 are anchors, not foregrounds.** PRD T4 says all 16
must pass 4.5:1. That cannot hold in either mode — ANSI black cannot clear
4.5:1 against a dark terminal background, and ANSI white cannot clear it against
a light one — and it should not, because those slots are _supposed_ to sit near
the background. That is what makes `ls --color` and `git diff` read correctly.

`tests/contrast/audit.mjs` implements the honest version: the twelve chromatic
slots plus the default foreground carry the full 4.5:1 gate; the two anchors at
the far end from the background also carry it; the two nearest the background
carry a 1.5:1 "not literally invisible" floor.

### Signed off, 2026-09-03, by Aristide (P0-09)

**Design and Accessibility are held by one person on this project.** Record
that here rather than let a later reader assume three independent reviews.

What was signed is the measured version, not the argument. `jlpm test:contrast`
audits **102 T4 pairings**:

|                                              | pairings |
| -------------------------------------------- | -------- |
| At the full 4.5:1 gate                       | **90**   |
| At the 1.5:1 "not literally invisible" floor | **12**   |

All 17 slots are covered — the 16 ANSI colours plus the default foreground. The
12 relaxed pairings are the two slots nearest the background in each mode, over
three backgrounds each: `ansi.black` and `ansi.brightBlack` in dark,
`ansi.white` and `ansi.brightWhite` in light. The two anchors at the far end
from the background keep the full gate.

Worst relaxed value: **1.60:1**, `ansi.black` on the dark terminal selection.
Tightest value still meeting the full gate: 4.52:1.

Rejecting the narrowing was not an available answer. PRD T4 as written has no
solution, and the reason is stated above: no colour has a relative luminance
both ≤ 0.179 and ≥ 0.249.

**The PRD text is now wrong rather than unmet.** Nobody has rewritten T4. Treat
this decision as the authority, and correct §8.7.2 and T4 at the next PRD
revision.

---

## D-003 — Every D4N rule is gated on `[data-jp-theme-name^='Data4Now']`

**Decided.** Tiers 2-4, all structural CSS, the ANSI block and the compat shim
are scoped under `body[data-jp-theme-name^='Data4Now']`.

PRD AC10 requires that a user can still select a stock JupyterLab theme. Tier 4
assigns `--jp-*` on `body`, and `body` wins over the `:root` where core themes
declare theirs — so without the gate, our adapter would keep overriding
JupyterLab Light after the user explicitly chose it. AC10 calls that a bug, and
it is the kind that only shows up when somebody tries to leave.

JupyterLab writes the active theme's registered name into
`data-jp-theme-name`, so the gate is pure CSS: no JavaScript, no flash, and it
disengages the instant the theme changes.

Side benefit: it raises specificity enough to beat core without `!important`.

---

## D-004 — `terminal:plugin` stays on `theme: 'inherit'`, and we apply after

**Decided.** `overrides.json` ships `theme: 'inherit'`; the bridge connects to
`themeChanged` and overwrites core's inherited object with the full 16-colour
palette.

PRD R14 describes the race: core's `inherit` handler and our bridge both write
the xterm theme, and which one wins depends on signal connection order. Pinning
the setting removes the _variability_ even though it does not remove the second
writer, and applying after core makes the outcome deterministic.

Verified by an explicit test that switches themes twenty times and asserts our
palette survives (PRD T8).

**Revisit if:** the ordering proves unstable across a JupyterLab minor. The
fallback is a T3 replacement of the terminal plugin, scoped as a contingency at
P3 exit.

---

## D-005 — The token stylesheet ships once, from `ui-overrides`

**Decided.** `@d4n/ui-overrides` imports the generated token CSS. The two theme
packages ship a near-empty stylesheet that only sets `color-scheme`.

PRD §7.3 has both theme packages `@import` the combined token stylesheet. That
would ship the same bytes twice as two federated bundles — webpack cannot dedupe
across them — and, worse, it puts the tokens behind `IThemeManager.loadCSS()`,
which performs a fetch on every switch. That fetch is precisely the unstyled
frame G4 forbids.

With the tokens already in the document and both modes scoped by attribute,
switching is an attribute swap: a repaint, not a fetch.

The theme packages still exist and still register, because two things need a
registered theme: the theme picker in Settings, and the `data-jp-theme-*`
attributes every rule is gated on. Several extensions also branch on
`themeManager.isLight()` (§5.3).

---

## D-006 — JupyterLab pinned to `>=4.5.0,<5`

**Decided.** Resolves PRD §16 **Q6** toward "track current".

The PRD drafted against 4.2–4.4. The dev environment already installs 4.5, the
T3/T4 surfaces the PRD describes (bottom dock area, notifications,
`adaptive-theme`) are all present in 4.5, and 4.4 is behind.

The §5.4 `matchMedia` fallback stays implemented regardless — PRD §5.4 requires
it independent of version so the settings layer needs no conditional logic.

---

## D-007 — The application frame is dark in both modes

**Decided.** `color.chrome.*` — the top panel and both sidebar rails are navy
(`#0F3D6E` / `#0B1F38`) in light mode and near-black in dark mode. They do not
follow the mode; dark mode _deepens_ them rather than flipping them.

Taken from `JupyterLab Theme.html`, which paints an inverted frame around a
light content area — the same move the Data4Now web product makes with its
header.

Consequences worth knowing:

- The logo lockup is **always** the light-letterform asset. That removes the
  light/dark logo swap and the flash it causes (PRD §8.9.1, B1) — a
  problem the design solved by accident.
- The frame needs its own foreground ramp. White-on-navy has nothing to do with
  the text ramp that runs on canvas, so `chrome.topPanelFg` / `railFg` are
  separate tokens and separately audited.
- The menu **bar** sits on the frame; the menu **dropdowns** do not. Getting
  that backwards is very visible in either direction.

---

## D-008 — Decorative borders and control borders are different tokens

**Decided.** `border.strong|default|subtle|faint` are decorative separators.
`border.control` is the boundary that identifies a component, and it is the only
one gated at 3:1.

WCAG 1.4.11 gates the boundary needed to _identify_ a control; it exempts pure
decoration. Auditing the whole border ramp at 3:1 produced 14 failures that were
all false — and hid a real one: `border.default` (the design system's mist)
measured **1.43:1** against the input surface, so a text field's outline was not
perceivable at all. That defect was invisible behind a token name that sounded
right.

---

## D-009 — Compact density is a set of control heights, not a scale multiplier

**Decided.** Resolves PRD §16 **Q2**. `density.comfortable.*` and
`density.compact.*` are seven explicit dimensions each.

A global multiplier rescales type and spacing together, lands on fractional
pixels, and breaks the 4px grid. The imported mockup's `body.density-compact`
has only six declarations, all notebook-scoped, with hard-coded values and no
token indirection — which is why the compact variant has to be authored rather
than adopted.

---

## D-010 — Kernel logos: leave stock, behind a neutral plate

**Decided.** Resolves PRD §16 **Q9** toward the §8.11.3 recommended default.

Kernel logos are server-served rasters and cannot follow the theme. Rather than
replacing them (trademark exposure on the Python/R/Julia marks) or adding a
server extension to intercept kernelspec resources, launcher kernel cards get a
`launcher.kernelPlateBg` rounded plate behind the logo.

That kills the dark-mode halo, works for kernels installed at any time, and
reframes the raster/vector difference as a deliberate "a language vs an action"
distinction rather than an inconsistency. It costs nothing.

**Revisit if:** the deployment ships internal/custom kernels whose marks we own —
those get replacement assets in the image (§7.8.2 option 1).

---

## D-011 — One warning tint serves search matches and the execution line

**Decided.** `search.unselectedMatchBg` and `debug.executionLineBg` hold the same
value in each mode.

PRD S3 and D4 impose the identical constraint — hold 4.5:1 against _every_
syntax token — and the palette supports exactly one warning-tinted highlight
that satisfies it in each mode. Two separate values would be tuned twice and
drift, and the PRD itself suggests sharing if only one is supportable.

Note this is why the value is a pale amber in light and a _deep_ amber in dark
rather than one tint at low alpha: the constraint is about the syntax ramp
surviving on top, and the ramp runs dark in one mode and light in the other.

---

## D-012 — Radius normalises onto the five-step scale

**Decided.** Everything maps to `radius.sm|md|lg|xl|pill` (4/6/10/16/999px).

The mockup uses 3, 4, 5, 6, 8, 10, 12 and 999px, chosen per surface rather than
tokenised. Eight radii is not a scale, it is eight decisions, and it guarantees
drift the first time somebody adds a surface. Mapping: 3→sm, 5→md, 8→lg, 12→xl.

**Revisit if:** a design review finds a specific surface where the rounding
change is visible enough to matter.

---

## D-013 — CSS custom properties are kebab-case; the TypeScript export is not

**Decided.** `packages/tokens/build.mjs` kebab-cases every token path on the way
into CSS (`color.ansi.brightRed` → `--d4n-color-ansi-bright-red`) and leaves the
TypeScript export in camelCase (`t.color.ansi.brightRed`).

The asymmetry is deliberate — camelCase is idiomatic JS, kebab is idiomatic CSS,
and the compiler checks the TS side anyway — but it is a trap, and it sprang
once. The convention was changed mid-project, after two packages had already
been written against the camelCase spelling, and **56 references silently
stopped resolving**.

Silently is the operative word. An undefined custom property is not a CSS error:
it becomes the guaranteed-invalid value, the declaration is dropped, and the
property falls back to its initial value. Several of the 56 were inside

```css
outline: var(--d4n-focusRing-width) var(--d4n-focusRing-style)
  var(--d4n-focusRing-color);
```

where one bad name takes the entire shorthand invalid and computes to
`outline: none` — a WCAG 2.4.7 failure indistinguishable from a design that
never had a focus ring. Stylelint does not catch it. `tsc` does not see it.
Review did not catch it in two of the four files.

**The fix is the lint, not the discipline.** `tests/lint/lint-var-names.mjs`
resolves every `var(--d4n-*)` against what is actually declared, and it is in the
`lint:design` chain.

**Amended by P3-08 (D-035): a fallback no longer exempts a reference.** This
entry used to say one did, because a fallback is a deliberate "this may not
exist". P3-08 found four camelCase names in `debugDecorations.ts` that had
survived the rename and were silently resolving to their `--jp-*` fallbacks, so
the decorations had never once painted in Data4Now colours. A fallback answers
"this layer can be out of scope", which is the AC10 case. It does not answer
"this name is misspelled". The lint now reads `.ts` as well as `.css`.

**Revisit if:** a reason appears to make the two sides agree. Kebab-casing the TS
export would mean `t.color.ansi['bright-red']`, which is worse; camelCasing the
CSS would mean case-sensitive property names, which is what caused this.

---

## D-014 — The token build is ~300 dependency-free lines, not Style Dictionary

**Decided.** `packages/tokens/build.mjs` uses only `node:` builtins plus `yaml`.
PRD §7.2 specifies Style Dictionary v4; this is a deliberate departure.

**What the PRD actually needs from the pipeline**, and how each is met:

| Requirement                                             | How                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Designers export from Tokens Studio and never touch CSS | Unaffected — `src/*.tokens.json` **is** W3C DTCG, which is exactly what Tokens Studio emits. A designer's export drops straight in. |
| Build runs in CI on every token change                  | `jlpm build:tokens`, plus the freshness gate in `build.yml`                                                                         |
| CSS + typed TS + JSON from one source                   | All three, from the same flatten pass                                                                                               |
| Adapter codegen from `jp-adapter.yaml`                  | Same script                                                                                                                         |

Style Dictionary would have been a wrapper around custom formats anyway: the
four-block mode-scoped output (§5.3), the `body`-scoped tier split (D-001), the
theme-name gate (D-003), the generated ANSI block (§8.7.2) and the adapter
codegen are all bespoke. None of them is an SD built-in, so SD would contribute
its file-walking and reference resolver — about 60 lines here — in exchange for
a dependency, a version-drift surface, and a layer between the token source and
the CSS that somebody has to learn before they can debug the output.

The validation is the part that earns its keep, and it is ours either way:
light/dark key symmetry, unresolved references, reference cycles, Tier-1 colour
leaking past Tier 2, missing rationales, private-variable targeting, and adapter
completeness against the runtime manifest. Every one of those fails the build.

`style-dictionary` and `svgo` were declared as devDependencies and never
imported — both removed. A declared-but-unused dependency is a false claim about
how the project works.

**Revisit if:** the design team's toolchain grows a hard SD dependency (a
transform set, a shared preset), or the token source stops being plain DTCG.

---

## D-015 — The status bar is T2, not the T3 replacement §8.5.1 specifies

**Decided.** `packages/ui-overrides/style/surfaces/status-bar.css` styles core's
status bar. `@jupyterlab/statusbar-extension:plugin` stays **enabled**.

PRD §8.5.1 classifies the status bar T3 and gives four reasons `IStatusBar`
cannot deliver §8.5.2. Audited against a running JupyterLab 4.6.3, all four are
reachable from CSS:

| §8.5.1 claim                                        | Reality on 4.6.3                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| cannot enforce a consistent item shape              | `.jp-StatusBar-Item` is on **every** item — core adds it in `registerStatusItem`                           |
| cannot provide separators or grouping               | `::after` on the item                                                                                      |
| cannot restyle a third-party item's internals       | descendant selectors                                                                                       |
| cannot distinguish a passive readout from a control | **the DOM already does.** Controls carry `jp-mod-highlighted` or a focusable child; readouts carry neither |

That last row is the one that decides it — it is the reason the PRD gives for
needing a _wrapper_, and the wrapper turns out to be unnecessary because the
distinction is already in the markup.

**What replacing the plugin would actually cost.** Core's plugin does far more
than provide the token: it constructs the widget and gives it `#jp-main-statusbar`,
adds it to the shell's `bottom` area, connects `labShell.layoutModified`,
registers the `statusbar:toggle` command with `isToggled` and `describedBy`,
re-shows the bar on `application:reset-layout`, adds a command-palette entry,
and loads and syncs a `visible` setting.

And there is a trap. The plugin's **settings schema survives the disable** —
verified, the settings API still answers 200 for
`@jupyterlab/statusbar-extension:plugin`. That schema carries a
`jupyter.lab.menus` block placing `statusbar:toggle` in View ▸ Appearance at
rank 15. So disabling the plugin without re-registering that exact command id
leaves a **menu item pointing at a command that does not exist** — a failure
that appears nowhere near its cause.

Reproducing all of that to change one number is the wrong trade. Appendix C
argues the same principle in the other direction ("a structural override that
keeps breaking is a plugin replacement that hasn't happened yet"); the converse
holds here.

**What genuinely still needs JS**, and is the only thing that does: the overflow
breakpoint. Core hides `priority: 0` items below **630px** from a private
`_isWindowNarrow`, and §8.5.2 asks for **1024px** plus a `⋯` trigger. Split out
as TODO `P2-14`, to be decided on its own merits rather than smuggled in as a
justification for a token swap.

**Revisit if:** P2-14 concludes the `⋯` trigger is worth a replacement, or an
upstream change drops `jp-mod-highlighted` — `selectors.json` asserts that class
specifically so the integrity job reports it rather than the bar quietly losing
its passive/interactive split.

---

## D-016 — The launcher splits: presentation is T2 now, behaviour is T3 later

**Superseded in part by D-033 on 2026-09-05.** The "later" arrived: P2-15
landed, `@d4n/shell-chrome:launcher` provides `ILauncher` and core's plugin is
disabled. Everything below about the T2/T3 split and the measurements behind the
stylesheet is still true and is why the split was drawn where it was. Only the
sentences saying core's plugin stays enabled are out of date.

**Decided.** `packages/ui-overrides/style/surfaces/launcher.css` styles the
launcher. `@jupyterlab/launcher-extension:plugin` stayed **enabled** under this
decision. The four behavioural requirements of §8.11 that CSS genuinely cannot
reach were TODO.md **P2-15**, and they were the only thing that would justify
re-providing `ILauncher`.

This lands the opposite way from D-015, and the difference is the point: for the
status bar, all four of §8.5.1's "impossible in CSS" claims turned out to be
reachable, so the tier was simply wrong. Here the split is real. Audited against
a running 4.6.3:

| §8.11 requirement                                  | Reachable from CSS?                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| card geometry, radius, border, hover/active/focus  | yes                                                                              |
| responsive column count, never single-column       | yes — `auto-fill` + `minmax`, no media query                                     |
| the kernel-logo plate (Q9 / D-010)                 | yes — `.jp-LauncherCard-icon > img`                                              |
| launch-directory readout styling and truncation    | yes                                                                              |
| **fixed section order** (Notebook, Console, Other) | **no** — core orders by the category rank other plugins pass to `ILauncher.add`  |
| **the root-directory copy**                        | **no** — core renders the cwd string; when it is empty the heading renders blank |
| **the no-kernels error state**                     | **no** — core renders an empty section, not a message                            |
| **search above ~12 kernels**                       | **no** — there is no input to style                                              |

**Why not re-provide `ILauncher` now.** `launcher:create` is wired to every `+`
affordance in the application: the file browser toolbar button, File ▸ New
Launcher, the dock panel's own `+` tab button, and the command palette. Those
call sites live in other plugins and resolve the command **by id, not by token**
— so a replacement that provides `ILauncher` but misses the command id leaves
four visible affordances doing nothing, in four different places, none of which
look like the launcher's fault. That is the same shape as the surviving settings
schema D-015 found in the status bar, and it is why both decisions land on
"style it now, replace it deliberately."

**Two corrections to the PRD, found while implementing.**

1. §8.11.4 says the launch directory is "invisible in stock" and calls the
   readout net-new. Not on 4.6 — core already renders a `.jp-Launcher-cwd`
   heading and puts the path in it. What is actually missing is the **root**
   case, where the path is empty and the heading renders blank. That is the part
   P2-15 has to build; the styling is done.
2. §8.11.2 states the responsive bands in **viewport** widths. The grid keys off
   **content** width — better behaviour, different number: a 1600px window gives
   6 columns, the same window with the file browser open gives 5, and 1280px with
   it open gives 4. Viewport media queries cannot see the sidebar and would get
   all three wrong in the same direction.

**Two things this got wrong first, both caught by measuring rather than reading.**

- The card was set to `height: 112px` per spec and computed to **138px**, because
  core leaves `.jp-LauncherCard` on `content-box` — the spec's card height had
  silently become the card's _content_ height, plus 24px of padding and 2px of
  border. Fixed with `box-sizing: border-box`.
- `--d4n-launcher-kernel-plate-bg` pointed at `{color.surface.sunken}`, which is
  mode-scoped, so in dark mode the plate computed to `#0B1F38` on a `#122A47`
  card — **reinstating the exact halo the plate exists to remove**. It now points
  at `{color.plate.raster}`, a fixed light neutral in _both_ modes (the same move
  `color.chrome.*` makes in the other direction, D-007), and
  `tests/contrast/audit.mjs` carries a VIS pairing for it so it cannot quietly go
  dark again.

A third, smaller one: `.jp-LauncherCard-icon > svg` matched **nothing**. LabIcon
mounts its SVG inside a wrapper `div`, so every non-kernel icon was unsized and
only the raster path was being tested. The manifest entry was wrong in the same
way, which is why the selector job did not catch it — a reminder that
`selectors.json` is only as good as the DOM it was written against.

**Verified in a browser, both modes.** Card 112px; 6 columns at 1600px and never
fewer than 2; hover changes background and border with `transform: none` (§8.11.2
forbids a lift — twenty composited layers on the first surface painted every
session); plate `#F4F6FA` on a `#122A47` card in dark. Selecting _JupyterLab
Light_ returns the launcher to `display: flex`, 102px cards and core greys —
AC10 holds.

## D-017 — The menu bar's overflow is ours, because Lumino's does not work

**Decided.** `@d4n/shell-chrome:menu-bar-overflow` implements the collapse
described in §8.4.2 over `MenuBar`'s public API. Lumino 2.9 ships the same
feature and it stays asleep. Two stylesheet declarations in
`surfaces/top-panel.css` make the bar's width mean "the room the bar has", and
they are gated on an attribute the plugin sets, so the CSS half can never arrive
without the JavaScript half.

Preferring our own implementation over an upstream one is the wrong default and
is only justified by measurement. Here is the measurement.

### Lumino's overflow never runs, and says nothing about it

`MenuBar` records every item's width once — `if (this._menuItemSizes.length == 0)`
— and no method in the class ever empties that array again, `clearMenus()`
included. In JupyterLab the one measurement lands while the widget is detached.
An `offsetWidth` spy installed before boot, reading every access against a
menu-bar node:

```
t=7783ms   node.offsetWidth -> 0
           item.offsetWidth -> 0 0 0 0 0 0 0 0     <- cached, forever
t=9890ms   node.offsetWidth -> 396                  (attached, fallback font)
t=10800ms  node.offsetWidth -> 401                  (Montserrat resolved)
```

Eight zeros can never sum past the bar's width, so the overflow index stays -1
for the life of the page. The trigger does not appear at **any** width, in our
theme or in stock JupyterLab, and nothing is logged. Confirmed independently by
forcing the bar to 200px with all eight menus still rendered and clipped.

### Waking it up is worse than leaving it asleep

Emptying the cache does start the collapse. Then, in the order they were found:

| Symptom                                                              | Cause                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Runaway collapse to a 29px bar showing only the trigger, no recovery | The bar hugged its content, so each collapse shrank the width that decided the next |
| `RangeError: Invalid array length`, thrown before every render       | A zero-width measurement records index 0; `new Array(index - 1)` then throws        |
| The trigger drawn twice, side by side                                | The "is the trigger already rendered" test compares a label to `undefined`          |
| The trigger opens the **Help** menu instead of itself                | Rendered items and the widget's menu list drift out of step                         |
| `Settings` and `Tabs` come back transposed, permanently              | Restore re-inserts at an index counted from the rendered set                        |

The first two we could contain from outside. The last three are the widget's own
bookkeeping, and reaching them means reaching into it. Two private fields were
needed to get that far — `_menuItemSizes` and `_overflowMenuOptions` — and the
result still put a menu order in front of users that was wrong in a way they
would have to reload to fix.

### What ships instead

`MenuBarOverflow` in `packages/shell-chrome/src/menuBarOverflow.ts`, using only
`menus`, `addMenu`, `clearMenus`, `contentNode` and `overflowMenu`:

- keeps the canonical menu order and derives the bar's composition from it every
  time, so the order cannot drift;
- measures item widths from the DOM, and **only while nothing is collapsed** —
  the mistake that makes Lumino's cache wrong is measuring a bar that is showing
  a trigger in place of what it swallowed;
- re-measures on theme change, on density change and once the webfont resolves,
  none of which emits a resize;
- stands down the moment `bar.overflowMenu` is non-null, which is Lumino's own
  trigger and can only exist if its cache ever starts working. If upstream fixes
  this, we stop.

It also stands down when `#jp-menu-panel` is not growing. That guard is not
defensive noise: our rules are gated on the theme name (D-003), so selecting a
stock theme takes `flex-grow` away and the bar goes back to hugging its content.
Measured before the guard existed — switching to _JupyterLab Light_ in a 420px
window ran the bar down to a single 31px `⋯` that never came back, at any width,
because a hugging panel can never be wider than what is left in it. Reading the
computed `flex-grow` rather than the theme name keeps the test on the thing that
actually has to be true.

### Two corrections to §8.4.2

**"Items collapse below 900px" is off by about half.** The collapse is driven by
available width, not viewport width: the bar shares the top panel with the logo
lockup and `#jp-top-bar`, and the first menu collapses near a **460px** window.
This is the same correction D-016 records for the launcher grid and it points the
same way — a viewport media query cannot see either neighbour, and would collapse
a bar with room to spare. `menu.bar.overflowBreakpoint` has been **removed** from
the token source rather than left in every page asserting a number nothing reads.

**"Item typography … weight 450" does not match the design system.** Bundled
Montserrat is variable (100–900), so 450 is renderable — but the imported design
uses 400/500/600/700/800 and never 450 anywhere, and the primitive ramp mirrors
it. `font.weight.medium` (500) is the step it lands on. The table's 450 is a
one-off in the prose with nothing behind it.

### And a note on M3, which is satisfied vacuously

`.lm-MenuBar-itemMnemonic` matches **nothing** on stock 4.6.3. Lumino emits the
span only for a title carrying a mnemonic index, and JupyterLab's main menus set
none — checked, all eight. So M3 ("mnemonic underlines … never suppressed by the
redesign") holds because there is nothing to suppress, and the rule in
`menu-bar.css` is a guard for a deployment that recomposes the menus through
`overrides.json` and does set them. Whether the product should HAVE mnemonics is
a design question — it needs a letter per menu, collision rules and a story for
translation — and it is not a restyle. Raised here rather than decided.

The trigger deliberately carries no mnemonic. Lumino stamps one on its own,
which draws an underline under the first character of the label; M3 is about
mnemonics that mean something, not about underlining an ellipsis.

**Verified in a browser, both modes.** Eight menus at 1600px; `Help` collapses
first at 460px and `Settings` next at 420px; widening restores both, in order;
the trigger opens a `.lm-Menu` on the menu tokens (`#15324F` / 1px `#142E50` /
6px / 200px min-width in dark) holding exactly the collapsed menus as submenus;
`ArrowDown` then `ArrowRight` walks into one (M2, M8); the trigger takes the
inset focus ring (2px `#4FD1D1`, offset -2px). Under _JupyterLab Light_ the bar
is white, system-ui, `flex-grow: 0`, and never collapses — AC10 holds.

## D-018 — The rail glyphs are a 24px drawing shown at 20px

**Decided.** `--d4n-sidebar-rail-icon-size` now sizes the SVG itself, in
`surfaces/sidebar.css`. The assets stay on the 24px grid they were exported on,
and P2-04 ships them scaled instead of waiting for a 20px-native export.

Two things were wrong. Only one of them is fixable here.

**The token decided nothing.** `LabIcon`'s `sideBar` preset
(`@jupyterlab/ui-components/lib/style/icon.js`) emits a typestyle class whose
rule is `.<hash> svg { width: 20px; height: auto }` — measured on 4.6.3 as
`.f19uqevd svg`. Our rule set `min-width`, `min-height` and `background-size` on
the wrapper `div`, none of which sizes an inline SVG. The rail was 20px because
core said 20px. The two agreeing was luck: the class name is a content hash and
the preset is core's to change. Sizing the SVG from the token is what makes the
20 ours (0-3-2 beats the hash's 0-1-1, so no `!important`).

**The grid is not ours to change.** All 120 shipped assets open
`<svg width="24" height="24" viewBox="0 0 24 24" … stroke-width="1.6">`. PRD
§7.8.4 asks for rail icons "authored at 20px, not scaled up from 16px". The set
is neither. The failure the PRD names does not happen — nothing is upscaled, and
a 24px drawing shown at 20 loses no detail. What does happen is a thinner
stroke: 1.6 on a 24 viewBox renders 1.33px at 20, where §7.8.4's "1.5px at 16px"
normalisation implies 1.875px. Rail strokes are about 29% thinner than the PRD
asks for — consistently, across the whole set, which is why nothing looks odd
next to anything else.

Shipping scaled rather than blocking, because nothing in this repo can produce
the alternative. `packages/icons/svg/` is generated from
`design-reference/data4now/icons/`, and the importer refuses to touch `viewBox`,
`stroke-width` or path data by design (`packages/icons/README.md`). A 20px-native
rail set is an export from Design, so it is in **Still open** below.

TODO.md asked whether P2-04 waits for P5-01. It does not. All ten rail names are
already in `OVERRIDES`, so P5-01 changes nothing about the rail — with one
exception: the Property Inspector still renders stock `ui-components:build`, the
only stock glyph left on either rail and a NEEDS AUTHORING row in
`docs/icon-manifest.md`. That is a P5-01 item, not a P2-04 blocker.

`railIconSize`'s `$description` used to assert that the icons were authored at
20px. They never were. It is corrected to say what is on disk.

**Revisit when** Design ships a 20px-native rail export, or when P5-02's contact
sheet finds the rail reading light against the 16px toolbar set — the same 1.6
stroke renders 1.07px there, so the two surfaces are thin by different amounts.

---

## D-019 — Rail tooltips are not reachable from CSS, so §6.1's third rail item is not T2

**Decided.** P2-04 delivers the rail at T2 without tooltip positioning, and
records that the row cannot be finished at that tier.

PRD §6.1 scopes "Left/right sidebar rails" as T2 with "icon-rail width, active
indicator, tooltip positioning". The first two are CSS. The third is not.

Lumino's default `TabBar` renderer sets `title = data.title.caption` on the tab —
a **native browser tooltip**. Measured on the running instance: the left rail's
first tab carries `title="File Browser (Ctrl+Shift+F)"`. `LabShell` builds those
bars with no custom `renderer`, so there is no element to style and no position
to set. The browser owns both, and no `.jp-Tooltip` equivalent is mounted for
rail tabs.

Delivering §6.1's tooltip means replacing the renderer or attaching a hover
widget. That is a plugin, so T3 or T4. It is the same shape as D-017, where the
missing behaviour was added over a public API rather than by restyling something
that was never there.

Not doing that inside P2-04. The task's condition is the dark rail and the 20px
icons, and a tooltip is a surface of its own — placement, delay, dismissal and
screen-reader behaviour all have to be decided before any of it is written.

**Revisit when** the rail tooltip is scoped as its own task.

---

## D-020 — Every command row in a menu carries an icon; value pickers carry none

**Decided by Aristide, 2026-09-02.** This answers PRD **Q10** and closes P0-06.

PRD §7.8.3 offers two positions and forbids a third. The choice is **all**, not
"only where it aids recognition". Every row that runs a command carries an icon.
The exemptions below are not a softening of that rule. They are the rows that
have no icon slot to fill, or that would be filled with the same glyph over and
over.

### The rule, in the order it is applied

Read a menu as the user sees it: a stack of sections, separated by rules.

1. **A submenu parent carries no icon.** Lumino draws its caret into
   `.lm-Menu-itemSubmenuIcon`, a different element from `.lm-Menu-itemIcon`.
   There is no slot to fill. 14 rows.
2. **A value-picker section carries no icon.** A section between two separators
   in which every row runs the **same command** with a different argument is a
   list of values, not a list of actions. An icon there repeats 141 times and
   says nothing. 164 rows in 7 sections — see the table below.
3. **Every other command row carries an icon.** 160 rows, 152 distinct commands.
4. **A toggled row keeps its check mark.** See the constraint below. The icon is
   still declared, and it shows whenever the option is off.

### Why a toggled row cannot show both

`MenuSvg.Renderer.renderIcon` in
`@jupyterlab/ui-components/lib/icon/widgets/menusvg.js` reads:

```js
if (data.item.isToggled) {
  // check mark icon takes precedence
  return h.div({ className }, checkIcon, data.item.iconLabel);
}
return h.div({ className }, data.item.icon, data.item.iconLabel);
```

The check **replaces** the item icon in the same slot. Measured on the running
instance at boot: 21 rows render an icon, and 15 of them are that check mark.
Only 6 real command icons exist in the whole menu bar, all in File ▸ New.

Two consequences that the authoring work must accept:

- An icon on a toggleable command **disappears while the option is on**. Do not
  pick a glyph whose absence reads as a fault.
- Lumino marks only the rows that are toggled on. An unchecked toggle is
  indistinguishable from a plain command in the DOM, so the census cannot count
  toggleable rows. It counts the 10 that were on at boot.

Changing this needs a replacement `Menu.IRenderer` that draws the check in its
own leading column. That is a plugin, so T3 or T4, in the same shape as D-017.
**Not in scope.** Revisit only if the vanishing icon proves to be a real
complaint.

### What the census measured

`jlpm test:menu-icons` reproduces all of it in a real browser.

| kind                            | rows    |
| ------------------------------- | ------- |
| Command rows that carry an icon | **160** |
| Value-picker rows, exempt       | 164     |
| Submenu parents, no slot        | 14      |
| Rows that render with no label  | 2       |
| **Actionable rows, all menus**  | **340** |

Command rows per menu: File 37, Edit 25, View 41, Run 9, Kernel 10, Tabs 6,
Settings 19, Help 13.

The seven exempt sections:

| section                                | rows | the one command              |
| -------------------------------------- | ---- | ---------------------------- |
| View ▸ Text Editor Syntax Highlighting | 141  | `fileeditor:change-language` |
| Settings ▸ Theme (first section)       | 5    | `apputils:change-theme`      |
| Settings ▸ Text Editor Indentation     | 5    | `fileeditor:change-tabs`     |
| Settings ▸ Text Editor Theme           | 4    | `fileeditor:change-theme`    |
| Help (documentation links)             | 4    | `help:open`                  |
| Settings ▸ Terminal Theme              | 3    | `terminal:set-theme`         |
| Settings ▸ Console Run Keystroke       | 2    | `console:interaction-mode`   |

Note that Settings ▸ Theme is **not** exempt as a whole. Its first section is
the five theme names. The eight rows after it are real commands — the font-size
pairs, the scrollbar toggle — and they carry icons.

### Two things this turned up

- **`hub:control-panel` and `hub:logout` render as empty rows** at the foot of
  the File menu. The commands exist and the labels are blank, because this image
  is not behind a JupyterHub. Two blank rows below a separator read as a broken
  menu. Fix belongs with the File menu work, not here.
- The failure mode PRD §7.8.3 warns about — inheriting core's partial coverage —
  **barely exists in the menu bar**, because core's coverage there is 6 rows out
  of 340. It is the context menus that are partial. The file browser's context
  menu already renders 17 distinct icons (P0-04).

**Consequence.** I4 in PRD §7.8.5 now has a number: 160 rows, 152 commands.
The authoring backlog is P5-01, and it is larger than the 65 `NEEDS AUTHORING`
names in `docs/icon-manifest.md`, because most of these 152 commands have no
registry entry to override at all.

**Revisit when** a replacement menu renderer is on the table, or when a menu
grows a section that this rule does not classify cleanly.

---

## D-021 — The top panel gets a compact brand mark, not the lockup

**Decided by Aristide, 2026-09-03.** This answers PRD **Q12** and closes P0-07.
The asset is `packages/ui-overrides/style/images/logo-mark.svg`.

### The question the task asked was already settled by the slot

PRD §8.9.1 offers "one SVG with `currentColor`" against "two imported PNGs".
The second option is not available. Measured live: `#jp-MainLogo` holds a
`LabIcon`, `<svg data-icon="ui-components:jupyter">` at 17×22. `LabIcon` takes
an SVG string. A raster needs a T3 replacement of
`@jupyterlab/application-extension:logo`, and our shipped `top-panel.css`
already styles `#jp-MainLogo svg`.

The first option is also not available as written. The mark is three colours:
navy letterforms, a teal pillar, a magenta pie wedge inside the "O".
`currentColor` gives one colour, so it flattens the brand.

### The real problem was size

The design system ships one lockup, two PNG files, 960×675 RGBA. They are the
whole inventory — **there is no SVG of the logo anywhere in the repo**. The
lockup is a two-line stack, DATA over FOR|NOW, and the mockup renders it at
`height: 22px`. `design-reference/data4now/screenshots/fixed-logo-dark.png`
shows the result: an illegible block. The mockup's own splash avoids the
problem. It draws a CSS tile instead of using the image.

So the decision is a **compact mark for the bar**, and the lockup stays for
surfaces that have room for it.

### The mark

The pie-chart "O" from the logo's own NOW. It is the brand's device, it is
circular, and it survives 22px. Sector angles were measured off the source
artwork rather than eyeballed — sampled around the disc at 0.6r and 0.85r,
which agree:

| sector      | angles       | span |
| ----------- | ------------ | ---- |
| letterforms | 45° to 135°  | 90°  |
| open notch  | 136° to 180° | 45°  |
| magenta     | 181° to 44°  | 225° |

Disc centre in the source is (511, 459) with r 95. The SVG is a 24×24 viewBox,
centre (12, 12), r 10.5, which leaves the 1.5px safe margin §7.8.4 asks for.

Colours follow §8.9.1 exactly. The letterform sector is `currentColor`, so it
inherits `--d4n-top-panel-fg` and needs no swap logic. The wedge is a literal
`#E63558`, commented with `d4n-allow-literal-color` as criterion B6 requires.
It is written literally, not as `var(--d4n-color-palette-magenta-400)`, because
the mark must read the same on surfaces outside the theme scope — the splash
and the About dialog.

### Measured in the running instance, both modes

|                  | Data4Now Light       | Data4Now Dark        |
| ---------------- | -------------------- | -------------------- |
| rendered size    | 22×22                | 22×22                |
| `currentColor`   | `rgb(244, 246, 250)` | `rgb(244, 246, 250)` |
| wedge fill       | `rgb(230, 53, 88)`   | `rgb(230, 53, 88)`   |
| panel background | `rgb(15, 61, 110)`   | `rgb(5, 15, 29)`     |
| left inset       | 12px (`space.3`)     | 12px (`space.3`)     |

B1 holds by construction: one asset, no swap, no flash. B2 holds: it is vector.

**The wedge measures 2.62:1 against the light-mode bar** and 4.59:1 against the
dark-mode bar. That is recorded, not fixed. WCAG 1.4.11 exempts logotypes, and
the wedge is a large solid area whose shape is carried by the 10.15:1
letterform sector beside it. Do not read this row as a contrast failure, and do
not "fix" it by moving the brand colour.

### Three things this leaves open

1. **The mark is authored but not wired.** The bar still shows
   `ui-components:jupyter`. `packages/icons/src/manifest.ts` deliberately parks
   that name, and the two other trademark names, for this decision. Wiring it is
   its own task, because it changes what renders. See P0-12.
2. **B5 is not satisfied.** "Splash screen and top panel logo use the same mark
   and lockup." P2-09 shipped a 96px rounded tile with the letter D and a
   magenta dot, per the mockup. The bar would carry the pie-chart O. The tile's
   own code comment says its dot "echoes the pie-chart wedge inside the logo's
   O", so the O is the source and the tile is the derivative. Unifying onto the
   O is the smaller change. Tracked in P0-12.
3. **§8.9.1 says 20px, we ship 22px.** `--d4n-top-panel-logo-height` is 22px,
   which is what the mockup specifies and what P2-01 built. Left as it is. The
   1:1 aspect of the mark means 22px costs 2px of width, not of legibility.

### What P0-12 closed, on 2026-09-03

1. **Wired.** `ui-components:jupyter` is overridden with the mark. The bar
   renders `<svg data-icon="ui-components:jupyter">` at 22×22 with a 12px inset,
   in both modes.
2. **B5 holds.** The splash carries the same mark. `@d4n/icons` exports
   `LOGO_MARK_SVG`, the same string the override uses, and
   `packages/shell-chrome/src/splash.ts` imports it. Sameness is now a property
   of the import, not of anyone remembering. Measured on both surfaces in both
   modes: identical `d` on both paths, identical wedge `rgb(230, 53, 88)`,
   identical `<title>`. The splash draws it at 52px inside the 96px plate, the
   bar at 22px.
   The one value that differs is the letterform sector, and deliberately:
   `currentColor` takes each surface's own foreground, so the splash gives
   `rgb(255, 255, 255)` and the bar `rgb(244, 246, 250)`. That is what
   `currentColor` is for. Do not pin it.
   The mockup's separate magenta dot on the plate is gone. Its own comment said
   it echoed the pie wedge, and the wedge is now there.
3. **The asset moved to `packages/icons/svg/brand/logo-mark.svg`.** P0-07 put it
   in `packages/ui-overrides/style/images/`, which is where PRD §8.9 files brand
   assets and where `lint:icons` already looked. But the delivery route is a
   `LabIcon` override, and `packages/icons/src/manifest.ts` imports from
   `../svg/`. One copy where the code reads it beats two copies that drift.
   `lint:icons` scans both directories, so the asset stays linted.
4. **§8.9.1's 20px is still 22px.** Unchanged, and still fine.

### The failure this turned up, and the lint that now catches it

The first wiring attempt left the bar **empty**. `LabIcon` logged
`SVG HTML was malformed for LabIcon instance. name: ui-components:jupyter` and
rendered nothing at all.

The cause was the comment that criterion B6 requires. It named the token the
literal mirrors, `--d4n-color-palette-magenta-400`, and **`--` is illegal inside
an XML comment**. `LabIcon` does not report a comment problem — it rejects the
whole asset. So the file that documents the exception is the file that can
destroy the icon, and the failure is silent apart from one console warning.

`lint:icons` now rejects `--` inside any SVG comment, with the reason spelled
out. Proved by putting the double hyphen back: one problem, exit 1.

**Revisit when** the About dialog is built, because that is the first surface
with room for the full lockup, and it needs the lockup as a vector.

---

## D-022 — Rendered markdown is 14px at every density

**Decided by Aristide, 2026-09-03.** This closes P0-08. `font.size.content.1`
stays at **14px** and `--jp-content-line-height` stays at
`font.lineHeight.relaxed`, 1.6.

### There was no conflict to resolve

P0-08 was written as "the mockup says 15px, the tokens say 14px". The mockup
says both. `JupyterLab Theme.html` carries a comfortable value and a compact
value:

| state       | rule                                 | `.jp-md`    |
| ----------- | ------------------------------------ | ----------- |
| comfortable | `.jp-md` (L495)                      | 15px / 1.65 |
| compact     | `body.density-compact .jp-md` (L966) | 14px / 1.55 |

The mockup's own default state is **Compact** — `TWEAK_DEFAULTS.density` at
L5585 of the rebuilt file. So 14px is the number its screenshots show, and the
token already agreed with it. The 15px was the value of a state nobody was
looking at.

### Why 14px and not 15px

Three reasons, in order of weight:

1. **The ramp is anchored on it.** `mapping/jp-adapter.yaml` already argues from
   14: "markdown body sits 1px above code at rest (14 vs 13)". That gap is what
   keeps a projected notebook readable, because core swaps
   `--jp-content-presentation-font-size1` (18px) in for the body while code goes
   to 16px. Moving the body to 15 makes the rest-state gap 2px and leaves
   `content.2` at 16px, one pixel above the body.
2. **The mockup's default agrees.** See above.
3. **Nothing on screen wanted 15.** Measured in the running instance on
   `fixture.ipynb`, in both modes: `--jp-content-font-size1` 14px,
   `.jp-RenderedHTMLCommon` 14px, its paragraph 14px with a 22.4px line box,
   `h1` 24px, editor 13px. Both modes are identical, which is expected — this is
   a size, not a colour.

### Line height stays at 1.6, and does not follow density

22.4px on 14px is a ratio of 1.6. That is `font.lineHeight.relaxed`, which
serves the whole content ramp, and it sits between the mockup's two values.

Making body type follow density would widen **D-009**, which states that
compact density is a set of explicit control heights, not a scale multiplier.
Adding a type size to that set is exactly the multiplier it rejects. The
mockup's `body.density-compact` block is six hard-coded declarations with no
token indirection, and D-009 already records that it has to be authored rather
than adopted. This decision authors it as: one size, both densities.

**Revisit when** P3-03 builds `.jp-RenderedHTMLCommon` and a real long-form
document is on screen to read. If 14px proves too small there, the change is to
`font.size.content.1` and it moves the whole ramp with it, deliberately.

---

## D-023 — The favicon is a frontend swap, and the busy variant is refused

**Decided by Aristide, 2026-09-03.** This answers PRD **Q11** and closes P1-08.

### PRD §8.9.2 is wrong about the frontend, and the task inherited the error

§8.9.2 states the favicon is "**not overridable from a labextension**" and
offers three server-side routes. Measured on the running instance, that is not
true at runtime. `jupyter_server`'s page template emits two ordinary elements:

```html
{% block favicon %}
<link rel="icon" href="…/favicons/favicon.ico" class="idle favicon" />
<link rel="" href="…/favicons/favicon-busy-1.ico" class="busy favicon" />
{% endblock %}
```

Rewriting `href` from JavaScript works, and the browser repaints the tab.
Verified after the swap: both links resolve to our asset, the response is 200
`image/png`, and the browser decoded it at 64×64.

What §8.9.2 **is** right about is the first paint. The stock mark sits in the
first byte of HTML and is on screen before any labextension runs, so this route
cannot avoid a brief flash of it. That is the price, and it buys the two things
the server routes cannot: a plain `pip install` and a JupyterLite build both get
the mark, because the asset ships inside the labextension rather than behind our
server config.

### Busy-state swapping is refused, but the stock mark is not left showing

The swap itself is upstream's. Something in core flips `rel` between the two
elements on kernel activity, and `jupyter_server` ships seven icons for it:
idle, busy 1–3, file, notebook, terminal. So the task's "implement busy
swapping" was really "author assets for a mechanism that already runs".

**We author one asset.** A 16px glyph that changes on kernel activity is noise,
and the status bar already carries kernel state at a size a person can read.

Refusing the variant is not the same as leaving the element alone. A busy link
still pointing at `favicon-busy-1.ico` would show the Jupyter mark for as long
as a cell runs — failing criterion **B3** exactly when a user is watching the
tab, which is the reason they are watching it. So **both links get our mark**.
The swap still happens and it is invisible.

### Why a PNG, when D-021 fought for a vector

PRD §4.2 puts **Safari 17** in scope, and Safari does not render an SVG
referenced by `rel="icon"`. An SVG-only favicon leaves a supported browser with
no icon. So `packages/icons/svg/brand/favicon.svg` is the source of truth and
`scripts/render-favicon.mjs` rasterises it to 64×64 — never hand-drawn, never
edited. 64 covers a 4× display and downscales cleanly; the mark is a disc and a
wedge, and nothing in it needs hinting at 16px.

The favicon is a **different asset** from the top-panel mark, and that is not a
B5 problem. B5 governs the splash and the top panel, which share
`LOGO_MARK_SVG`. The favicon adds the navy plate, because a tab icon is drawn by
the browser chrome against a background we do not control — measured legible at
16px on white and on `#202124`. It also cannot use `currentColor`: outside our
document there is nothing to inherit, so every value in it is explicit and
commented under the §7.8.4 exception.

### Consequences

- **The server extension is no longer needed for the favicon.** Its docstring
  said it existed for exactly that. Corrected. What remains is the status
  endpoint plus a brand-asset route that now serves nothing — kept as the
  delivery path for a future asset that must have a URL. `static/` is empty and
  expected to stay that way.
- **The tab TEXT is still stock.** `document.title` reads "JupyterLab", set by
  the page template. B3 covers the mark, not the words, so this decision does
  not touch it. Recorded because a branded icon beside the word "JupyterLab" is
  the kind of half-finish P0-06 was written to prevent.

**Revisit when** someone asks for a busy state, or when the page title is
scoped as its own task.

---

## D-024 — JupyterLite is not supported for v1, and the reason is configuration

**Decided by Aristide, 2026-09-03.** This answers PRD **Q7** and closes P1-09.
The user-facing statement is the "Deployment surfaces" section of `README.md`.

PRD §14 R7 offers two endings: "best-effort; separate CI job" or "documented as
unsupported". We take the second. A best-effort claim with no job behind it is
a claim that ages without anyone finding out, and this one has a real failure
mode under it rather than a vague risk.

### What a Lite build would actually get

Measured from what the wheel installs, not guessed:

| Installed by the wheel                                     | Read by Lite? |
| ---------------------------------------------------------- | ------------- |
| `share/jupyter/labextensions` (eight federated extensions) | **Yes**       |
| `share/jupyter/lab/settings/overrides.json`                | **No**        |
| `etc/jupyter/labconfig/page_config.json`                   | **No**        |
| `etc/jupyter/jupyter_server_config.d`                      | **No**        |

The look loads. The configuration around it does not. Three consequences, in
order of how much they matter:

1. **It would not start on our theme.** `overrides.json` is what makes
   Data4Now Light the default.
2. **Two plugins would provide `ISplashScreen`,** because the core splash stays
   enabled without our `page_config.json`.
3. **The server extension does not run,** which costs a user nothing. D-023 put
   the favicon inside the labextension, so the tab icon survives. The status
   endpoint is read only by our own test jobs.

The terminal's absence is already handled: three modules in `shell-chrome`
guard for it explicitly.

### A claim in TODO.md that this task contradicts

Consequence 2 above sent me to read the plugin registry, and what is there does
not match what `TODO.md` P2-15 asserts: "**Two `ILauncher` providers make
JupyterLab refuse to start.**"

`PluginRegistry.registerPlugin` in `@lumino/coreutils` throws on a duplicate
plugin **id** only:

```js
if (this._plugins.has(plugin.id)) {
  throw new TypeError(`Plugin '${plugin.id}' is already registered.`);
}
…
if (data.provides) {
  this._services.set(data.provides, data.id);   // silent overwrite
}
```

`@jupyterlab/application` adds no guard of its own — searched, nothing. So a
second provider of the same token **overwrites the first silently**, and the
winner depends on registration order. That is worse than a refusal, not better:
a crash is visible.

**I did not reproduce it.** The experiment needs the core splash re-enabled, and
the container refuses: `docker/entrypoint.sh` rewrites
`/usr/local/etc/jupyter/labconfig/page_config.json` on every start and lists the
plugin under `lockedExtensions`, which exists precisely to stop it being turned
back on. So this is source evidence, not observed behaviour.

**P2-15 keeps its wording, with this caveat attached.** Whoever does that task
should run the experiment before relying on "refuses to start" as a safety net.
If the registry is right, disabling the core plugin in the same change is not a
belt-and-braces measure — it is the only thing standing between the product and
a silently wrong launcher.

**Revisit when** someone asks for Lite, or when P2-15 settles the duplicate
provider question by experiment.

---

## D-025 — Menus scroll because we say so, and the height cap sits on the content

**Decided while doing P2-03, 2026-09-03.** Two upstream facts made the obvious
implementation wrong. Both were measured, not reasoned about.

### Every submenu and every context menu was `overflow: hidden`

Three rules land on a menu node:

| rule                                                     | specificity | from       |
| -------------------------------------------------------- | ----------- | ---------- |
| `.lm-Menu { overflow: hidden auto }`                     | 0,1,0       | Lumino     |
| `.jp-ThemedContainer { overflow: hidden }`               | 0,1,0       | JupyterLab |
| `.lm-MenuBar-menu.jp-ThemedContainer { overflow: auto }` | 0,2,0       | JupyterLab |

The first two tie, and JupyterLab's sheet is inserted later, so `hidden` wins
everywhere the third does not reach — which is **every menu that is not a
menu-bar dropdown**.

`menu.css` carried a comment asserting the opposite: "`.lm-Menu { overflow-y:
auto }` upstream does the rest". It does not. The cost, measured: View ▸ Text
Editor Syntax Highlighting is 141 rows and 3948px of content, and **116 of those
rows, including the last one, were unreachable** by wheel, by keyboard and by
mnemonic. Stock JupyterLab has the same defect, which is why nobody had noticed;
our 28px comfortable row made it worse by reducing the reachable rows from 29 to 25.

Our selector is already (0,2,1), so restating `overflow: hidden auto` in the
rule that exists is the whole fix. No new selector, no `!important`.

### The 60vh cap goes on `.lm-Menu-content`, not on the menu node

PRD §8.4.3 asks for `max-height: min(60vh, available)`. It had never been
implemented — there was no `menu.maxHeight` token.

The obvious placement is wrong. Lumino writes an **inline** `max-height` on the
menu node every time it opens, and the two open paths differ:

```js
openSubmenu:  let maxHeight = ch;                    // full viewport, always
openRootMenu: let maxHeight = ch - (forceY ? y : 0); // context menus use forceY
```

So a CSS cap on the node needs `!important` to beat the inline style, and would
then also override the `ch - y` case — pushing a context menu opened low in the
viewport off the bottom of the screen. Measured refutation of that approach: a
context menu right-clicked at y≈690 opens at 508–686. A `60vh !important` cap
would have made it 432px tall starting at 508, i.e. 220px off-screen.

Capping the **content** node instead lets the menu node shrink-wrap, and the
`min()` falls out of the two caps meeting:

- available > 60vh → the content cap wins, node is 442px
- available < 60vh → Lumino's inline cap on the node wins, and the node's own
  `overflow: hidden auto` scrolls

Exactly one of the two scrolls in every case. `.lm-Menu-content` is already
`display: block` in our sheet, so `max-height` behaves normally on it.

It also fixes M6's second half. A submenu sized to exactly 100vh has nowhere to
draw a shadow that reaches 8px up and 16px down. After the change the 141-row
submenu is 442px at 34–476, leaving **34px above and 244px below**.

### Measured after the change, both modes, identical numbers

|                             | before                  | after                               |
| --------------------------- | ----------------------- | ----------------------------------- |
| submenu height              | 720px (= viewport)      | 442px                               |
| room for the elevation edge | 0 above, 0 below        | 34 above, 244 below                 |
| content scrollable          | no (`overflow: hidden`) | yes, 3948 → 432                     |
| wheel over the menu         | `scrollTop` 0 → 0       | 0 → 3516 (= max)                    |
| last row "Z80"              | unreachable             | reachable, fully visible at 443–471 |

No regressions: root View menu 34–476 inside the viewport and scrolling, context
menu low 508–686 inside the viewport, context menu high 196–638 inside and
scrolling — all in both modes.

### The scroll cue cannot be verified in this container, and that is not a menu problem

Upstream hides the scrollbar on menu-bar dropdowns and draws a four-layer
gradient instead. `background-image: none` in our sheet removes that gradient,
because it is built from `--jp-layout-color0` rather than the overlay surface.
PRD §8.4.3 asks for the §6.1 scrollbar rather than a fade, so the scrollbar is
restated here and upstream's `::-webkit-scrollbar { display: none }` is
overridden.

Whether it **paints** could not be established. Enumerating every
`::-webkit-scrollbar` rule in the live document shows ours matching and nothing
hiding it, and `--d4n-scrollbar-thumb` resolves to `#6B7B91`. No bar renders, at
4× magnification, during an active scroll.

**A control settles the attribution.** In a blank page with the same rule, a
plain `div` scroller and a plain `ul` scroller both scroll and **neither shows a
scrollbar either** — gutter 2px, which is their borders. This headless Chromium
paints overlay scrollbars: invisible at rest, no layout space.

Two consequences worth carrying:

1. Nothing about the menu scrollbar can be concluded from this environment.
2. **`scrollbars.css` has never been visually verified here, and cannot be.**
   Any probe or snapshot asserting scrollbar appearance in this container is
   measuring the wrong thing. A11y review on a real browser is the only route.

**Revisit when** a real browser is available to a reviewer, or if the fade turns
out to be wanted after all — in which case it must be rebuilt from
`--d4n-menu-surface`, not restored from upstream.

---

## D-026 — The dock tab bar: a height that never rendered, and a dirty dot that never existed

**Decided while doing P2-05, 2026-09-03.** Five verification agents drove the
tab bar in both modes. **All five failed.** The surface looked finished and
almost nothing it claimed to do worked. Six root causes; four are fixed here and
two are recorded.

### The tab was 32px inside a 26px bar, and the top 6px was thrown away

Core sizes the bar and the tab to the same 26px. `tab-bar.css` raised the
**tab** to `--d4n-tab-height` (32px) and left the bar alone. Lumino writes
`contain: strict` on the bar, and paint containment clips to the padding box.

Measured, both modes: bar `y=41 h=26`, tab `y=35 h=32`, overshoot 6px upward
because upstream's `.lm-TabBar-content` is `align-items: flex-end`. The cost:

- the 2px current-tab accent was **never painted** — zero pixels of the token
  colour in a 970×46 scan, while `getComputedStyle` cheerfully reported a 2px
  teal band
- the 4px top radius and the 1px top border were never painted
- the top 6px of every tab was **not clickable**: `elementFromPoint` returned
  `#jp-main-dock-panel`

A stock-JupyterLab control run measured `overshootTop = 0` and a painted accent,
so this was ours, not inherited.

**`bottom-dock.css:82-86` already carried the fix** for its own bar, and the
comment at `bottom-dock.css:92-107` describes this exact silent failure —
"the computed style still reports the right colour and the right 2px height.
Verified by pixel, not by getComputedStyle." The main dock had never been given
the same line. It has it now: `min-height: var(--d4n-tab-height)` on the bar.

After: bar `[41, 32]`, tab `[41, 32]`, overshoot **0**, top of the tab clickable,
and the accent photographed at 4× in both modes — teal `#167C7C` light,
`#4FD1D1` dark, with the rounded corners and the border present.

**A lesson about method.** My first check after the fix used a hand-rolled PNG
decoder and reported one stray teal pixel, i.e. still broken. Looking at the
screenshot showed the indicator plainly. The decoder was wrong, not the CSS.
Where a pixel claim decides a verdict, look at the image too.

### The dirty dot never existed, because our own icon deleted its hook

Core reveals `.jp-icon-busy` inside the close SVG and hides `.jp-icon3`, so the
dot **replaces** the × until hover. `tab-bar.css` mirrored that and recoloured
the fill.

`packages/icons` overrides `ui-components:close` with a single stroked path
carrying **neither class**. So core's swap and our fill override both selected
nothing. Measured: a dirty tab was pixel-identical to a clean one — 50 ink
pixels with the same anti-aliasing distribution, both modes. `jp-icon-busy`
appears in no shipped SVG; it survived only in a comment, a dead rule and a
`selectors.json` entry that the integrity job never asserts.

**The mockup never wanted the swap anyway.** `JupyterLab Theme.html` L348
defines `.jp-tab-dot` as a separate 7px span **between the label and the ×**.
Core's mechanism puts the dot _on_ the close button and hides it on hover.
Adopting core's hack had been a design divergence with no record.

So the dot is now drawn by this sheet, in the flow: the close affordance takes
extra left margin and the dot is drawn into that gap, so it cannot sit on top of
a long ellipsised label. That also un-orphans `--d4n-tab-dirty-dot-size`, which
was referenced only from a comment. Measured after: 6×6, `border-radius: 50%`,
`#167C7C` light and `#4FD1D1` dark, photographed between the label and the ×.

### Two smaller repairs in the same pass

- **The close hit target was 16×16** — the glyph size, no padding. Now
  `--d4n-tab-close-hit` at 24px with `cursor: pointer`; the glyph is unchanged.
  Measured 24×24 with a 26.5px hit sweep, both modes.
- **Tabs shrank without a floor.** Past about fifteen tabs the label reached 0px
  and every tab became an icon plus an ×, with no tooltip on most of them.
  `--d4n-tab-min-width` is 120px. That is a judgement, not a measured constant.

### Recorded and NOT fixed

**The 8px split-handle hit area does not exist, and our rule is a no-op.**
Lumino sets `contain: strict` inline on every `DockLayout` handle — and
`contain: style` on `SplitLayout` handles, with the comment "Do not use size
containment to allow the handle to fill the available space." The identical rule
pair therefore measures **8.0px on `.lm-SplitPanel-handle` and 5.0px on
`.lm-DockPanel-handle`**. Real pointer drags at ±1px outside 739–743 do not move
the split.

Worse, `tab-bar.css:130-144` restates `min-width: 8px` that
`@lumino/widgets/style/dockpanel.css:51-59` already ships, so it changes no
computed value and no behaviour: **our effective hit area equals stock
JupyterLab's**, and the comment claiming the token "tracks the design rather than
Lumino's default" is describing Lumino's default.

Fixing it means overriding `contain` on a node Lumino repositions on every
resize — weakening an upstream performance hint — or widening the handle in JS.
Neither is a stylesheet change to make unilaterally. **Left as stock, recorded,
and tracked as P2-17.**

**The close affordance is keyboard-unreachable and has no accessible name.** It
is upstream markup — a `<div title="Close …">` with no role and no tab stop —
so it is a plugin's problem, not this sheet's. Also tracked in P2-17.

**Revisit when** someone measures whether dropping `paint` from the dock
handle's containment costs anything, or when the tab-bar renderer is replaced
for other reasons.

---

## D-027 — Declarative toolbar composition: the PRD names the wrong key, and a separator is a named spacer

**Decided while doing P2-12, 2026-09-04.**

### `jupyter.lab.toolbars` is not the key you write

PRD §7.6 shows `overrides.json` entries written under a plugin id with a
`"toolbar"` array, and the surrounding text calls the mechanism
`jupyter.lab.toolbars`. Those are two different things and only one of them is
settable:

- `jupyter.lab.toolbars` is **schema metadata**, contributed by a plugin and
  merged across plugins. It is not writable from `overrides.json`.
- The settable property is `toolbar` on the **aggregator** plugin — the one
  carrying `jupyter.lab.transform: true` and a `properties.toolbar`.

Ten of the twelve plugins that declare a toolbar are aggregators. **Two are
contributors only** and have no settable properties at all:
`@jupyterlab/launcher-extension:plugin` (contributes `new-launcher` to the file
browser) and `@jupyterlab/workspaces-extension:indicator` (contributes
`workspaceIndicator` to the top bar). Writing under a contributor's id is a
silent no-op — to move the launcher button you write under
`@jupyterlab/filebrowser-extension:widget`.

Merge semantics, read from `settingregistry.js` `reconcileToolbarItems` and
`apputils/lib/toolbar/factory.js`: items match on `name` only and shallow-merge
`{...ref, ...addition}`, so an override carries **deltas only**. An unknown name
is appended. Order is `rank`, default 50, with a stable sort — so the six
rank-less items on the `Cell` toolbar keep declaration order, and reordering
them would require assigning ranks to all six.

### A toolbar separator does not exist, and asking for one is dangerous

`toolbar.css` styled `.jp-Toolbar-separator`. That string appears **nowhere** in
4.6.3 — not in `node_modules`, not in the served bundle, JS or CSS. It came from
the mockup's own `.jp-tb-sep`, renamed into something that looks like a Jupyter
class. It could never have matched. Same failure mode as the retired icon
registry guesses in `docs/icon-manifest.md`.

The item type universe is exactly two, and it is enforced:

```json
"type": { "enum": ["command", "spacer"] }
"required": ["name"], "additionalProperties": false
```

Menus get a `separator` type. Toolbars deliberately do not. And `"type":
"separator"` is not merely ignored — it fails validation and the client
**discards the entire plugin's toolbar list**, with only a console message. That
would silently empty the notebook toolbar.

`additionalProperties: false` also rules out attaching a class. The only
attribute we control is `name`, which the factory writes to
`data-jp-item-name`.

### So the separator is a spacer we name

`overrides.json` declares two on the Notebook toolbar, at the ranks the mockup's
grouping implies:

```json
"@jupyterlab/notebook-extension:panel": {
  "toolbar": [
    { "name": "d4n-sep-run",      "type": "spacer", "rank": 25 },
    { "name": "d4n-sep-celltype", "type": "spacer", "rank": 35 }
  ]
}
```

and `toolbar.css` turns those flex spacers back into hairlines through
`[data-jp-item-name^='d4n-sep']`. The attribute adds one class-level unit,
giving (0,4,0) against upstream's `.jp-Toolbar > .jp-Toolbar-item.jp-Toolbar-spacer
{ flex-grow: 1 }` at (0,3,0) — so it wins with **no `!important`**.

Measured in both modes: order is save, insert, cut, copy, paste, **d4n-sep-run**,
run, interrupt, restart, restart-and-run, **d4n-sep-celltype**, cellType, spacer,
… — exactly the mockup's grouping at `JupyterLab Theme.html` L4336-4347. Both
separators are 1×16 with `flex-grow: 0`, background `#E4E9F0` light and
`#142E50` dark.

`selectors.json` carries the new selector as **not optional** and at state
`notebook-open`, so the integrity job fails if the override is ever silently
dropped. It moved the count from 97 matched to 98.

**Revisit when** upstream adds a real separator type, or when another toolbar
needs grouping — the same named-spacer pattern applies, and the CSS hook is
already a prefix match.

---

## D-028 — D-001 breaks core's `:root` computed privates, and we bridge them

**Decided while doing P2-18, 2026-09-04.** This is the recorded exception to PRD
§7.4(3), "never target a `--jp-private-*` variable". One file writes them:
`packages/ui-overrides/style/private-bridges.css`.

### The mechanism, and it is a consequence of D-001

Core computes some private variables at `:root` from other `--jp-*` variables:

```css
:root {
  --jp-private-toolbar-height: calc(31px + var(--jp-border-width));
}
```

**D-001 declares our Tier-4 adapter on `body`, not `:root`,** so that selecting
a stock theme returns stock JupyterLab (AC10). A `:root` rule cannot see a
`body`-scoped variable. `var(--jp-border-width)` resolves to nothing there, the
`calc()` is invalid at computed-value time, and the property is **discarded
entirely** — it computes to nothing, not to a fallback.

### What it cost, and how visible it was not

`--jp-private-toolbar-height` is written into an **inline** style on every
`<jp-toolbar>` as `min-height`. That is why no stylesheet audit found it: a scan
of every rule in `document.styleSheets` that sets `height` or `min-height` and
matches the element returned exactly one rule, core's own
`.jp-Toolbar { min-height: var(--jp-toolbar-micro-height) }`, and that variable
resolves to `8px` in **both** themes. Only CDP's `getMatchedStylesForNode`,
which reports the inline style, showed the real declaration.

Measured, notebook toolbar, same build, same page:

|                        | ours before | stock | ours after |
| ---------------------- | ----------- | ----- | ---------- |
| toolbar height         | **1px**     | 32px  | 32px       |
| toolbar `min-height`   | **0px**     | 32px  | 32px       |
| `save` item height     | **0px**     | 31px  | 31px       |
| button inside the item | 21px        | 21px  | 21px       |

The notebook toolbar was, simply, invisible — while its buttons were still
21px tall inside zero-height items.

Two variables were affected. Read off `:root` in both themes:

```
--jp-private-toolbar-height     ours UNSET   stock calc(31px + 1px)
--jp-private-code-span-padding  ours UNSET   stock calc((1.3077 - 1) * 13px / 2)
```

Two other composed `:root` properties are **fine and deliberately not bridged**:
`--jp-private-sidebar-tab-horizontal-min-width` and
`--jp-side-by-side-resized-cell` compose values core also defines at `:root`, so
nothing of ours is involved and both resolve identically in the two themes.

### Why bridge rather than move the adapter to `:root`

Defining `--jp-border-width` and the code-font pair at `:root` would fix the
`calc()` — and would leave those values behind when a stock theme is selected.
That is exactly what AC10 forbids. Bridging keeps every value inside our scope,
so the repair disappears with the theme. Confirmed after the fix: the two
variables are still **UNSET at `:root`** and resolve on `body`, and the stock
theme in the same build is unchanged at 32px.

The bridge **restates core's own formulas**. It changes where they are computed,
not what they are, which is why the control for it is "ours now equals stock"
rather than a judgement about the right height. `--d4n-toolbar-height` is 32px
for that parity. **The mockup draws its notebook toolbar at 36px**, and moving
to it is a separate, deliberate change, not part of this repair.

### The standing risk

Writing a private name means upstream can change it and this file goes stale
silently. No lint can catch that: `lint:vars` only follows `--d4n-*`, and the
selector-integrity job cannot see a custom property. The check is the comparison
the table above describes — each bridged variable against a stock theme in the
same build — and it is a human step at every JupyterLab bump (Appendix C).

**Revisit when** JupyterLab moves these definitions, or if a third composed
`:root` private appears — the enumeration that found these two is four rules
wide and cheap to re-run.

---

## D-029 — Rendered-table striping is `surface.sunken`, and the light-mode elevation gate exists because of it

**Found and fixed during P3-03, 2026-09-04.** `--jp-rendermime-table-row-background`
moves from `color.surface.raised` to `color.surface.sunken`, and the
`canvas` vs `sunken` check in `tests/contrast/audit.mjs` moves out of the
dark-only block so that it runs in both modes.

### Every light-mode table had been shipping with no striping

Core stripes a rendered table in two declarations:

```css
.jp-RenderedHTMLCommon tbody tr:nth-child(odd) {
  background: var(--jp-layout-color0);
}
.jp-RenderedHTMLCommon tbody tr:nth-child(even) {
  background: var(--jp-rendermime-table-row-background);
}
```

The first resolves to `color.surface.canvas`. The second resolved to
`color.surface.raised`. In light mode those are **the same colour**: both are
`{color.palette.neutral.0}`, because this system carries light-mode elevation
with shadow and border rather than with tint. Measured on a rendered markdown
table, three body rows:

| mode  | row 1     | row 2     | distinct |
| ----- | --------- | --------- | -------- |
| light | `#FFFFFF` | `#FFFFFF` | 1        |
| dark  | `#0E2542` | `#122A47` | 2        |

Dark mode looked correct, which is why this survived. `surface.sunken` differs
from `surface.canvas` in both modes, and stays clear of `surface.hover`, so a
hovered stripe still reads.

### The real defect was that nothing could catch it

The contrast audit ran three elevation-step gates in dark mode and none in
light, on the stated grounds that light-mode separation is carried by borders,
so a lightness gate would fail by design. That reasoning is correct for
`overlay` and `raised`. It is wrong for this one pair, because `canvas` against
`sunken` is not decoration in light mode: it is the only thing that makes a
table row distinguishable from the row above it.

So the gate now runs in both modes at the same 1.04 threshold. It was verified
by reintroducing the bug — pointing light `sunken` at `neutral.0` — and
confirming the audit fails with `1.00:1 (min 1.04) #FFFFFF on #FFFFFF`, then
restoring it.

**The general lesson, which is why this is written down.** A token alias that
is correct in one mode can be a no-op in the other, and a mode-asymmetric
audit will report a clean run either way. When a rule depends on two tokens
**differing**, that difference needs a gate in every mode the rule ships in.

**Revisit when** another surface starts depending on two surface tokens being
distinguishable in light mode. The answer is the same: add the pair to the
audit rather than trusting the ramp.

---

## D-030 — T2 was passing by luck: xterm bold-to-bright is now stated, not inherited

**Found and fixed during P3-04, 2026-09-04.** `terminal.drawBoldTextInBrightColors`
becomes a token, and `terminalBridge.ts` sets it explicitly on every terminal.

### The two halves of the ANSI source agreed by different routes

PRD T2 asks that `ls --color=always` render identically in a terminal and in a
notebook cell. `ls` does not emit a plain colour. It emits **bold plus colour** —
SGR `1;3N`, for example `ESC[01;34m` for a directory — and the two halves
resolve that pair by paths that have nothing in common:

| half       | route                                                           |
| ---------- | --------------------------------------------------------------- |
| rendermime | JupyterLab maps bold+blue to the `.ansi-blue-intense-fg` class  |
| xterm      | reaches `brightBlue` only if `drawBoldTextInBrightColors` is on |

The bridge sets nine terminal options. That was not one of them. The two halves
landed on the same token purely because xterm defaults the option to true.

### Proved by breaking it

Set the token to `false`, rebuild, and all four `ls` colours diverge in both
modes — the terminal stops using the colour rendermime uses, eight mismatches
out of eight. So the option is genuinely applied through the bridge rather than
swallowed by the try/catch in `setXtermOption`, and T2 genuinely rests on it.
Restored afterwards.

### The general lesson

An acceptance criterion that two independent subsystems agree is only as strong
as the assumptions they do not share. Here both halves were correct, both were
token-driven, and the agreement between them was still an upstream default that
nobody had written down.

**Revisit when** xterm is upgraded. The check is the one above: emit
`ESC[01;3Nm` in both halves and compare, rather than trusting that the default
has held.

---

## D-031 — CodeMirror replaces the syntax span class, so a decoration must restate the colour

**Found and fixed during P3-05, 2026-09-04.** Both bracket-matching rules in
`packages/editor-theme/src/theme.ts` now state `color: c.text.secondary`, and
the two resulting pairings are gated in `tests/contrast/audit.mjs`.

### A bracket under the cursor had no colour

The rules set a background and an outline and nothing else, on the reasonable
assumption that CodeMirror **adds** `cm-matchingBracket` to the span the syntax
highlighter already produced. It does not. It replaces it. Measured on a JSON
file, reading the class list off the element rather than inferring it:

| state                     | class on the brace   | computed colour            |
| ------------------------- | -------------------- | -------------------------- |
| cursor beside the brace   | `cm-matchingBracket` | `rgb(44,62,85)` — default  |
| cursor one keystroke away | the highlight class  | `rgb(70,86,109)` — bracket |

So for as long as the cursor sat beside it, the glyph fell through to the
default text colour. PRD §7.5 names that exact condition a bug.

### It was never a JSON problem

JSON is only where it showed up first, because a JSON file opens with `{` on
line 1 and the cursor lands at position 0. Every language with brackets has it —
Python, TypeScript, R, Julia, Bash — whenever the cursor sits beside a bracket,
which for a bracket-matching feature is the entire time it is doing anything.

### Two gates went in with the fix

`text.secondary` on `syntax.bracketMatchBg` and on `danger.faint` are body-weight
text on backdrops that nothing else in the audit covered. Both are gated at the
A4 threshold of 4.5:1. A bracket that cannot be read is worse than one with no
fill at all.

**The general lesson.** When a decoration and a highlight can land on the same
character, do not assume the classes compose. Read the class list off the live
element in the state that matters.

**Revisit when** another CodeMirror decoration is added that can cover a token —
a linter underline, an inline diff mark. The question to ask each time is
whether it replaces the highlight span, and the way to answer it is to look.

---

## D-032 — T3 fails: IPython paints tracebacks with 256-colour codes our palette does not reach

**Found during P3-06, 2026-09-04. Not fixed — the fix is a scope decision, so it
goes to a human rather than being chosen quietly.**

### What T3 asks and what actually happens

T3 asks that an IPython traceback be fully legible in both modes and pass 4.5:1
on every ANSI colour used. IPython 9.16.1 does not use only the sixteen ANSI
slots. Captured from the container, raw:

```
^[[31mValueError^[[39m     Traceback (most recent call last)
^[[36mCell^[[39m ^[[32mIn[1]^[[39m
^[[32m----> ^[[39m^[[38;5;28;01mraise^[[39;00m ^[[38;5;167;01mValueError^[[39;00m(...)
```

`31`, `36`, `32` and `39` are basic SGR and resolve through our palette. But
`38;5;28` and `38;5;167` are **256-colour** codes. Those come from xterm's
built-in colour cube, which our sixteen-slot theme does not touch.

### The two colours, and they are not legible

Cube index to RGB is `16 + 36r + 6g + b` over the levels
`0, 95, 135, 175, 215, 255`:

| code       | colour    | used for       | on `#FFFFFF` | on `#0E2542` |
| ---------- | --------- | -------------- | ------------ | ------------ |
| `38;5;28`  | `#008700` | the `raise` kw | 4.70:1 pass  | **3.28:1**   |
| `38;5;167` | `#D75F5F` | exception name | **3.69:1**   | **4.18:1**   |

Three of four pairings are below 4.5:1. So T3 is not met, and it never was —
nothing in the audit covers indices 16 to 255, because nothing in the design
system describes them.

### Three ways out, and the choice is not an engineering one

1. **Own the cube.** xterm's `ITheme` takes `extendedAnsi`, an array for indices
   16 to 255. That is 240 designed colours, and the audit would grow by the same
   order. It is the only option that makes the guarantee true for any tool, not
   just IPython.
2. **Fix it at the source.** The codes come from IPython's Pygments style. A
   deployment that pins a 16-colour-safe style gets a compliant traceback
   without the theme changing at all. It fixes IPython and nothing else.
3. **Revise T3** to say "every colour the theme controls", which is honest about
   what a sixteen-slot palette can promise.

**This is the same shape as T4** — an acceptance criterion written as though the
palette controlled more than it does. T4 was found unsatisfiable as written and
carried forward for a PRD revision. T3 should be decided at the same time.

**The general lesson.** "Every ANSI colour used" is a bigger set than "every
ANSI colour we define". A terminal renders whatever the program emits, and a
sixteen-colour theme is not a guarantee about a 256-colour stream.

## D-033 — The launcher is ours, and a disabled plugin's schema does not survive

**Decided.** `@d4n/shell-chrome:launcher` provides `ILauncher`.
`@jupyterlab/launcher-extension:plugin` is disabled in
`jupyter-config/labconfig/page_config.json` in the same change. This closes the
second half of D-016 and TODO **P2-15**.

The widget keeps **core's class names**, so the whole T2 stylesheet from P2-08
still applies and every measurement behind it stays true. It is plain DOM rather
than a `VDomRenderer`: nothing else in this package uses React, and a filter
input inside a re-rendered tree loses focus on every keystroke.

**The finding that cost the most, and it contradicts D-015.** D-015 said core's
settings schema **survives** the plugin being disabled, and warned that a swap
missing the command id would leave a View ▸ Appearance item pointing at nothing.
Measured on 2026-09-05, the opposite is true for the launcher: with
`@jupyterlab/launcher-extension:plugin` disabled, its schema is not served, and
all three declarations in it go with it —

| Declaration                              | Affordance it provides      | After the disable |
| ---------------------------------------- | --------------------------- | ----------------- |
| `jupyter.lab.menus` → `jp-mainmenu-file` | File ▸ New Launcher         | **gone**          |
| `jupyter.lab.shortcuts`                  | `Accel Shift L`             | **gone**          |
| `jupyter.lab.toolbars` → `FileBrowser`   | the file browser `+` button | **gone**          |

The command itself kept working, so nothing threw and nothing logged. Three
affordances in three other surfaces simply stopped existing. The first probe
measured `fileMenuHasNewLauncher: false`, `fbPlusCount: 0`, and a
`Control+Shift+L` that added no tab.

The fix is `packages/shell-chrome/schema/launcher.json`, which re-declares the
same three blocks against the same command id, plus `"schemaDir": "schema"` in
the package's `jupyterlab` block. After it: the File item is back, the shortcut
adds a launcher, the toolbar button is back and the palette shows **New
Launcher** under a **Launcher** header with **Ctrl+Shift+L** beside it.

**So D-015's warning was right and its premise was wrong.** A disabled plugin
does leave a trap, but the trap is the reverse of the one it described: not a
surviving schema pointing at a missing command, but a **missing schema** that
takes working affordances down with it. Both failures are silent. Whichever way
a future swap lands, the rule is the same — **enumerate what the disabled
plugin's schema declared, and re-declare it.**

**JupyterLab cannot say "zero kernels", and this shapes §8.11.5.**
`validateSpecModels` in `@jupyterlab/services` 7.6.3 throws
`No valid kernelspecs found` on an empty map. So `requestSpecs` rejects,
`KernelSpecManager._specs` stays **null**, and `specs` never becomes an empty
object. Measured against a second server started with
`--KernelSpecManager.ensure_native_kernel=False` and the `python3` kernelspec
moved aside: `/api/kernelspecs` answered
`{"default":"python3","kernelspecs":{}}` and `manager.specs` was still null
after `ready` resolved. `ready` never rejects either — 4.6.3 writes
`.catch(_ => undefined)` into the promise. And `connectionFailure` is a signal
that nothing in `manager.js` emits.

So the no-kernels test is **a null `specs` after `isReady`**, not a zero-length
map. The zero-length branch is kept because it becomes the correct one the day
upstream stops treating an empty list as a validation error, and the
`connectionFailure` branch is kept for the same reason. Both are stated in the
code rather than assumed.

**Four decisions worth naming.**

1. **Section order ignores `categoryRank` entirely.** L4 asks for an order that
   third-party rank cannot change. Core takes the smallest `categoryRank` in a
   category and sorts sections by it, so any extension reaches the top of the
   launcher by passing 0. Ours is Notebook, Console, every other category by
   name, "Other" last. Item order **inside** a section still honours `rank`,
   which L4 does not cover and users have learnt.
2. **The filter is built only above 12 cards.** §8.11.5 allows search "only if
   the P0 audit shows deployments routinely exceeding 12 kernels — otherwise it
   is chrome for a case that does not occur". No such deployment was found, so
   the input is not shipped unconditionally and there is no setting: the markup
   exists when a session actually has more cards than the threshold. A stock
   boot renders 7 and the input is absent.
3. **The root case drops the path element, it does not blank it.** At the root
   the heading reads "New files will be created in the root directory" with no
   `.jp-Launcher-cwdPath` span. The sentence is translated whole, with `%1`
   substituted by a marker and split on it, so a translation can put the path
   anywhere in the sentence.
4. **`direction: rtl` moved off the heading and onto the path.** P2-08 put it on
   `.jp-Launcher-cwd > h3`, which was right while core rendered a bare path
   there. The moment the plugin wraps the path in a sentence, an rtl heading
   reorders the sentence around it. Left truncation now lives on the span alone.

**Skeleton cards are not built.** §8.11.5's "slow kernel discovery" row asks for
skeletons rather than a spinner. The launcher opens after `app.restored`, by
which time the specs are already loaded, so a skeleton would be a flash on a
path that does not wait. Loading states for panels are **P5-05**, which is
flagged as design work, and this belongs with them rather than alone here.

**AC10 changes shape for this surface, and it must be said plainly.**
Presentation reverts completely. Measured with _JupyterLab Light_ selected:
cards go from 112px `border-box`, 6px radius, a `grid` of 6 columns and a
`#F4F6FA` kernel plate, to core's 100px `content-box`, 2px radius, `flex` and no
plate, in system-ui. **Behaviour does not revert**, because behaviour is a
plugin and not a theme: the section order stays ours and the root-directory copy
stays on screen. That is the same as the splash (P2-09) and is inherent to every
T3 swap. AC10 promises a stock **look**, not a stock plugin set.

**Measured in a running 4.6.3, both modes.**

- Section order **Notebook, Console, Other**, with 7 cards; the readout reads
  "New files will be created in the root directory".
- Non-root readout, driven by moving the file browser into a directory:
  "New files will be created in probe-cwd-a-rather-long-directory-name", the
  path in JetBrains Mono at `text.secondary` (`#46566D` light), truncated from
  the left in a 266px box, full path in `title`.
- Cards 112px `border-box`, 164.45px wide, 6px radius, 6 columns at 1600px with
  the file browser open, 12px gap. Light: `#FFFFFF` on `#E4E9F0`. Dark:
  `#122A47` on `#142E50` with the launcher on `#0E2542`.
- Kernel plate `#F4F6FA` in **both** modes, so no halo (L3). Vector icons 32px
  inside the LabIcon wrapper `div`; kernel icons are `img`.
- Every card `role="button"`, `tabindex=0`, `aria-label` set; 7 of 7. The focus
  ring measured `2px solid #167C7C` light and `#4FD1D1` dark at a 2px offset,
  with `:focus-visible` matching. **Enter** on _Show Contextual Help_ opened the
  Contextual Help tab (L9).
- No-kernels state: `role="alert"`, "No kernels found", the one-line hint and a
  link to `docs.jupyter.org`. Light plate `#FBEFD8` with a `#E0A04A` border and
  a `#8C5807` glyph; dark `#3D2E10` / `#C97C0A` / `#E0A04A`.
- Filter, with the threshold temporarily lowered to 3: a 28px input, its label
  bound by `for`/`id`, typing `term` left one card and one section visible with
  the caret still in the input, and hidden cards computed `display: none` —
  which needs the explicit `[hidden]` rules, because `.jp-LauncherCard` sets
  `display: flex` and outranks the user-agent rule.
- The solo launcher has no close icon; a second launcher makes both closable and
  closing it takes the icon away again.
- `jlpm test:galata` 14 of 14 after regenerating the four launcher-bearing
  baselines. `test:selectors` 102 matched, 0 broken. `test:contrast` 529
  pairings, 0 failing — five are new, and the block's border is gated **VIS**
  rather than A3, because 1.4.11 gates the boundary that identifies a component
  and this block is identified by its tint, its glyph and its title.

## D-034 — The completer badge letter inverts with the mode; core's white does not

**Decided under P3-07 and written down on 2026-09-05.** `.jp-Completer-monogram`
takes `color.text.inverse0`, not core's hardcoded `color: white`.

**Written late, and the reason matters.** P3-07 landed the rule, the ten contrast
pairings and the manifest note, and every one of them cited "D-033" for the
argument. That record was never written, and D-033 was later allocated to the
launcher (P2-15). This entry is reconstructed from what the repository itself
states — `packages/ui-overrides/style/surfaces/completer.css`,
`tests/contrast/audit.mjs` and `packages/ui-overrides/style/selectors.json` — and
adds nothing that is not already measured there. See the note at the end of
D-035 for the collision and the rule that now prevents it.

**The problem.** The badge behind the letter is
`--jp-completer-type-background0..10`, which the Tier-4 adapter points at the ten
`color.syntax.*` hues, so the swatch beside `def` is the colour the editor paints
a function name with. That ramp is **dark-on-light in light mode and
light-on-dark in dark mode**. A fixed white letter is therefore correct in one
mode and invisible in the other. Measured on a live completion list in dark mode,
before `completer.css` existed:

| Badge                    | Hue       | White on it |
| ------------------------ | --------- | ----------- |
| `ci=2` `syntax.name`     | `#F4F6FA` | **1.08:1**  |
| `ci=1` `syntax.function` | `#9CD4D4` | **1.64:1**  |
| `ci=4` `syntax.meta`     | `#FF6B86` | **2.73:1**  |

**The answer.** `color.text.inverse0` is the one token in the system defined to
flip with the mode — `{color.palette.neutral.0}` in
`packages/tokens/src/semantic-light.tokens.json` and
`{color.palette.neutral.900}` in `semantic-dark.tokens.json`. Putting the letter
on it makes every one of the ten badges legible in both modes. The tightest
pairings are light `syntax.comment` at **5.44:1** and dark `syntax.meta` at
**6.08:1**; the loosest are light `syntax.name` at 16.57:1 and dark
`syntax.name` at 15.32:1.

**The claim is gated, not asserted.** `tests/contrast/audit.mjs` registers ten
A1 pairings — `text.inverse0` on each of `syntax.function`, `name`, `type`,
`meta`, `keyword`, `string`, `number`, `property`, `regexp` and `comment` — in
both modes. Nothing else in the audit puts `inverse0` on a syntax hue, so those
twenty rows are the only thing that would catch the token losing its inversion.

**Why the syntax ramp and not an accent set** is settled in
`mapping/jp-adapter.yaml`: the badge is a recognition swatch sitting beside
`.jp-Completer-typeExtended`, which prints the type name in text, so colour is
never the sole carrier here and A7 is already satisfied.

**Not decided here.** The rule also sets `font-family: var(--d4n-font-family-ui)`
and `font-weight: var(--d4n-font-weight-semibold)`. The weight is measured — the
monogram renders at 600 — but the family choice is unexplained in the repository
and is not claimed as a decision.

## D-035 — The debugger keeps its handler; we replace only the two things it draws

**Decided under P3-08 when `debugBridge.ts` and `debugDecorations.ts` landed
(commit 104d88c), and written down on 2026-09-05.** PRD §8.6.4 puts the
breakpoint gutter and the execution line inside the CodeMirror 6 theme, not in a
stylesheet. `packages/editor-theme` owns both.

**Written late, for the same reason as D-034.** The code, the selectors manifest
and TODO all cite "D-033" for this argument; that record was never written and
the id later went to the launcher. This entry is reconstructed from the committed
code and adds nothing it does not already state. P3-08's verification is appended
below when it runs.

**What we replace, and what we leave alone.** `@jupyterlab/debugger` attaches an
`EditorHandler` to every editor it debugs, and that handler owns the whole round
trip: it dumps the cell, sends `setBreakpoints` over DAP, restores state after a
kernel restart, and matches a stack frame's source path to an editor. None of
that is design-system work, so **it keeps running**. We take over exactly two
things it draws:

| Upstream class                 | What it draws         | What we do                                |
| ------------------------------ | --------------------- | ----------------------------------------- |
| `.cm-breakpoint-gutter`        | its breakpoint column | `display: none !important`, mount our own |
| `.jp-DebuggerEditor-highlight` | its stopped-line band | suppress `outline` and `text-shadow` only |

Without the first, the user sees **two** breakpoint columns. Without the second,
a brown `--md-brown-100` band draws under our warning tint.

**The `!important` is not laziness.** `@codemirror/view`'s own base theme carries
`.cm-gutter { display: flex !important }`. Measured: a plain `display: none` lost
to it, and the column survived at 0px width only by accident of its markers
having no intrinsic size. Both declarations are in the same generated stylesheet
and ours is written later, so at equal weight and equal specificity ours wins.

**Only `outline` and `text-shadow` are suppressed, and only on lines that carry
both classes.** Upstream's `background-color` needs no answer: its rule is
`body[data-jp-theme-light='…'] .jp-DebuggerEditor-highlight` at (0,2,1) against
the (0,3,0) of our own line rule. The first version of the suppression said
`background: none` and **blanked our own execution line**, because at (0,3,0) it
tied with our rule and came later in the sheet — the left bar survived and the
tint did not. Restricting it to lines carrying both classes also keeps the
degraded path honest: if upstream renames the gutter class we never mount, our
line class is never set, and upstream's highlight renders whole rather than
half-suppressed.

**How an editor is found, and why not through the widget trackers.** The
extension is registered in `IEditorExtensionRegistry`, so every editor JupyterLab
builds gets it, and a `ViewPlugin` inside it reports the `EditorView` back.
Walking `INotebookTracker`, `IConsoleTracker` and `IEditorTracker` instead would
have missed the read-only editors the debugger opens for a stack frame in its
Sources panel, and would have duplicated upstream's cell lifecycle.
`.cm-breakpoint-gutter` is then used as the signal "the debugger attached a
handler here" — it is the precise set we want, because `data-jp-debugger` sits on
the whole notebook panel and cannot tell a code cell from a markdown cell.

**Three glyphs, and shape carries the state.** Filled disc, hollow ring, notched
disc, on a 12×12 canvas (D3, A7). The notch is **painted** in the editor's own
background colour rather than clipped, which keeps the glyph a single path in
every renderer. Every glyph is `aria-hidden`: the state is announced by the
debugger's breakpoint list, and a per-line graphic in a gutter is noise for a
screen reader (A10).

**`verified === false` maps to `disabled`.** `verified` is the adapter's answer
to "could this breakpoint be set". debugpy returns `false` for a line it will not
stop on, and upstream keeps such a breakpoint in the model rather than dropping
it, so the hollow ring is the honest glyph for it.

**`conditional` is unreachable in JupyterLab 4.6, and that is not an oversight.**
`IDebugger.IBreakpoint` extends the DAP **response** type
`DebugProtocol.Breakpoint`, which carries no `condition`, and JupyterLab ships no
user interface that sets one. The glyph is specified, built and measured.
Nothing in 4.6 can ask for it.

**Colours are CSS custom properties; metrics are not.** The module is registered
once and shared by both modes, so a resolved colour would freeze the decorations
at whichever mode was active when the extension was built — and D7 requires them
to repaint on a mid-session theme switch. Metrics come from `@d4n/tokens`
directly, because those tiers are identical in both modes. Each colour falls back
to the nearest stock `--jp-*` variable, so the markers still render in stock
Jupyter colours on a non-Data4Now theme (AC10).

**The gutter is compartmented rather than always on.** A CodeMirror gutter
renders its column whether or not it has markers, so an always-on breakpoint
gutter would put an empty 16px strip down the left of every editor in the
application — including files nobody is debugging. The fields and the line
decoration have no such cost and stay installed.

**The anti-loop guard is load-bearing.** Our own dispatch is a transaction, a
transaction is a view update, and a view update runs the sweep again. The
`painted` comparison is what stops the pair looping forever, and the sweep is
coalesced onto a microtask because the debugger emits `restored`, then `changed`,
then `currentFrameChanged` for one user action.

**The execution line is stored as a raw line number, not a mapped position.**
While a kernel is stopped the document does not change, and the debugger re-sends
the location on every stop event. An edit made while stopped therefore leaves the
highlight where it was rather than dragging it — preferable to a highlight that
silently drifts onto an unrelated statement.

**The tint value is not chosen here.** `color.debug.executionLineBg` holds the
same value as `color.search.unselectedMatchBg` in each mode, and **D-011** is the
record for that: PRD S3 and D4 impose the identical 4.5:1 gate against every
syntax token, and the palette supports exactly one warning-tinted highlight that
satisfies it. It is `#FBEFD8` in light and `#3D2E10` in dark.

**What P3-08 hardened along the way.** Four `var(--d4n-*)` names in
`debugDecorations.ts` kept camelCase through the project-wide rename to
kebab-case and resolved silently to their `--jp-*` fallbacks. `lint:vars` now
reads `.ts` as well as `.css`, and **a fallback no longer exempts a reference**
— which supersedes the last sentence of D-013. A fallback answers "this layer can
be out of scope", the AC10 case; it does not answer "this name is misspelled".

**Two selectors, permanently skipped by the harness.** `.cm-breakpoint-gutter`
and `.jp-DebuggerEditor-highlight` are registered in
`packages/editor-theme/style/selectors.json` under the state `debugger-stopped`,
a precondition the harness cannot create: it needs a notebook, a kernel with
debugpy, a breakpoint and a stopped thread. Both report as SKIPPED with that
reason, which is the point — a skip names the gap instead of hiding it.

### P3-08 verification, 2026-09-05 — the gutter, in both modes

**Done.** A breakpoint set in a notebook cell shows our glyph and not upstream's,
in both modes. `.cm-d4n-breakpointGutter` mounts at **16px**, in gutter order
`cm-breakpoint-gutter` (hidden), ours, `cm-lineNumbers` — so `Prec.high` really
does put it left of the line numbers. Upstream's column computes
`display: none`, width **0**, and holds **0 markers**.

| Measured        | Light                 | Dark                  |
| --------------- | --------------------- | --------------------- |
| `set` glyph     | `#C4274A` disc, r=4.5 | `#FF6B86` disc, r=4.5 |
| hover ghost     | 8px pill, opacity 0.5 | 8px pill, opacity 0.5 |
| glyph canvas    | 12×12                 | 12×12                 |
| upstream gutter | `display: none`, 0px  | `display: none`, 0px  |

The hover ghost only appears on cells without a breakpoint, which is what
`:not(.cm-d4n-hasBreakpoint)` is for, and the element carrying a glyph does get
that class.

**A behavioural gap this found and closed: a blank line was not a blank line to
us.** Upstream's `_getEffectiveClickedLine` walks back from a blank line to the
nearest non-blank line above and sets nothing when there is none. Our
`toggleBreakpoint` did not, so clicking blank space asked the kernel for a
breakpoint upstream would never have requested. `effectiveLine()` now makes the
same choice, with a range guard beside it. Measured after the fix: with a
breakpoint on `x = 2` (line 3), clicking the blank line 4 below it toggles line 3
**off** rather than adding a line-4 breakpoint — identical to upstream, and zero
console errors.

**`disabled` and `conditional` are both unreachable against debugpy in 4.6, and
the reasons differ.** `conditional` was already known: `IDebugger.IBreakpoint`
extends the DAP _response_ type, which carries no `condition`. `disabled` turns
out to be unreachable too, but for a reason nothing in the repository had
recorded: **debugpy does not answer an unbindable line with `verified: false`, it
answers with line 0.** Measured on the fixture cell, clicking the gutter beside
the comment on line 1 left the debugger panel holding two rows —
`Cell [1] 0` and `Cell [1] 3` — so `glyphState()`'s `verified === false`
branch never runs. The mapping stays, because it is the correct reading of the
protocol and another adapter may well use it; it is simply dead against debugpy.

**And that line-0 breakpoint crashes upstream, not us.**
`@jupyterlab/debugger/src/handlers/editor.ts:410` computes
`editor.state.doc.line(b.line!).from` with no range guard, so a line-0 breakpoint
throws `RangeError: Invalid line number 0 in 2-line document`. Our own gutter
filters it — `buildBreakpointSet` drops any mark outside `[1, doc.lines]` — and
paints the remaining breakpoint correctly.

**The attribution was measured, not assumed.** Re-run with every `@d4n`
extension disabled through the project's own `JUPYTERLAB_D4N=0` opt-out, the same
`RangeError` fired **four times before any click**, while upstream restored the
stale line-0 breakpoint from the kernel. None of our code was loaded. It is an
upstream defect that our replacement happens to tolerate.

**One thing the opt-out itself showed.** `JUPYTERLAB_D4N=0` disables the theme
extensions but leaves the shipped `overrides.json` pinning `Data4Now Light`, so
stock boots behind an "Error Loading Theme" dialog. Harmless, and it blocks a
scripted probe until dismissed. Recorded rather than fixed: the escape hatch is a
diagnostic, and adding a theme override to it is a change to the thing being
diagnosed.

**Gates.** Build clean, `lint:check` green, `lint:design` 8 of 8,
`test:contrast` 529 pairings 0 failing, `test:selectors` 102 matched 0 broken,
`pytest` 5 passed, `test:galata` 14 of 14. The execution line is **P3-16** and is
not covered here: it needs the program to stop.

### The `D-033` collision, and the lint that now prevents it

Three separate pieces of work each cited `D-033` for a decision none of them
wrote: the completer badge (P3-07, commit c8e6d04, 2026-09-04), these debugger
decorations (P3-08, commit 104d88c, 2026-09-05), and the launcher (P2-15, commit
ac8aee7, the same day). Only the launcher wrote a record, so the other two
citations silently pointed at somebody else's decision.

The launcher keeps `D-033`: it is cited from eleven places against the debugger's
four and the completer's three, and it is the only one of the three that was ever
written. The other two are renumbered here, oldest claim first — the completer to
**D-034** and the debugger to **D-035**.

`jlpm lint:decisions` now fails the build on any `D-0NN` reference with no
matching heading in this file. It would have caught all three at the moment they
were committed, because in every case the heading did not yet exist. It cannot
catch a reference that resolves to the **wrong** decision, so the rule that goes
with it is: **write the record in the same change that first cites it.**

---

## Still open

Tracked in `TODO.md`; listed here so the set is visible in one place.

| PRD Q | Question                                                        | Blocked on   | TODO  |
| ----- | --------------------------------------------------------------- | ------------ | ----- |
| Q1    | Monospace ramp — authored or supplied?                          | Design       | P0-05 |
| Q3    | Does the launch-target readout ship in v1?                      | Design + PM  | P2-08 |
| Q4    | How much of the icon set exists vs needs authoring?             | Design       | P0-04 |
| Q5    | matplotlib/Vega opt-in helper in v1 or deferred?                | PM           | P3-14 |
| Q8    | Upstream the a11y contrast fixes to core?                       | Eng Lead     | P6-08 |
| Q9    | T3: own the 256-colour cube, pin IPython, or revise T3 (D-032)? | PM + Design  | P3-06 |
| —     | 20px-native rail icon export — the set is 24px scaled (D-018)   | Design       | P2-04 |
| —     | Rail tooltip: replace the renderer, or accept native (D-019)    | Design + Eng | P2-04 |
