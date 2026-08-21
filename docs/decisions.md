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
