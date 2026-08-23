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

**Open:** this narrows a written PRD acceptance criterion. It needs Design and
Accessibility sign-off — see TODO `P0-09`.

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
`lint:design` chain. A reference with an explicit fallback is exempt, because a
fallback is a deliberate "this may not exist".

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

**Decided.** `packages/ui-overrides/style/surfaces/launcher.css` styles core's
launcher. `@jupyterlab/launcher-extension:plugin` stays **enabled**. The four
behavioural requirements of §8.11 that CSS genuinely cannot reach are TODO.md
**P2-15**, and they are the only thing that would justify re-providing
`ILauncher`.

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

## Still open

Tracked in `TODO.md`; listed here so the set is visible in one place.

| PRD Q | Question                                                       | Blocked on    | TODO  |
| ----- | -------------------------------------------------------------- | ------------- | ----- |
| Q1    | Monospace ramp — authored or supplied?                         | Design        | P0-05 |
| Q3    | Does the launch-target readout ship in v1?                     | Design + PM   | P2-08 |
| Q4    | How much of the icon set exists vs needs authoring?            | Design        | P0-04 |
| Q5    | matplotlib/Vega opt-in helper in v1 or deferred?               | PM            | P3-14 |
| Q7    | JupyterLite in scope for v1?                                   | PM            | P1-09 |
| Q8    | Upstream the a11y contrast fixes to core?                      | Eng Lead      | P6-08 |
| Q10   | Menu icon coverage — all-or-nothing, or high-frequency only?   | Design        | P0-06 |
| Q11   | Favicon delivery route; busy-state swapping?                   | Platform      | P1-08 |
| Q12   | Logo as SVG with `currentColor`, or bitmaps?                   | Design        | P0-07 |
| —     | D-002's narrowing of T4 — sign-off needed                      | Design + A11y | P0-09 |
| —     | Rendered-markdown body size: mockup says 15px, tokens say 14px | Design        | P0-08 |
| —     | 20px-native rail icon export — the set is 24px scaled (D-018)  | Design        | P2-04 |
| —     | Rail tooltip: replace the renderer, or accept native (D-019)   | Design + Eng  | P2-04 |
