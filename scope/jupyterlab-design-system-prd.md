# PRD — JupyterLab Interface Replatform onto the Design System

| Field | Value |
|---|---|
| **Document** | Product Requirements — JupyterLab UI Replatform |
| **Codename** | `SURFACE` |
| **Status** | Draft v1.0 — for review |
| **Target platform** | JupyterLab `4.2.x` – `4.4.x`, Notebook `7.2+` |
| **Owner** | Design Systems / Developer Experience |
| **Reviewers** | Design Lead, Frontend Eng Lead, Accessibility, Platform/Infra, Data Science org rep |
| **Distribution** | `pip` wheel + conda package + base Docker image |

---

## 1. Summary

JupyterLab ships two first-party themes and a CSS-variable surface that covers roughly **40–50% of what a real design system needs**. The rest of the interface — settings editor internals, the launcher, tab bars, dialogs, form controls, icons, terminal palette, ANSI output colors, data grid, ipywidgets — is either hardcoded, JavaScript-driven, or structurally wrong for the design language.

This project replaces the JupyterLab interface with a design-system-native UI. Both light and dark modes are first-class, driven from one token source of truth, with mode switching that does not flash, does not reload, and does not desync JavaScript-rendered surfaces.

**This is not a theme.** A theme swaps `--jp-*` values. This replaces components, restructures chrome, overrides plugins, and owns the icon set. The theme extension is one of eight packages shipped.

### 1.1 The core insight that drives the architecture

JupyterLab's CSS variables are **positional, not semantic**. `--jp-layout-color0` through `--jp-layout-color4` are a lightness ramp. `--jp-border-color0` through `3` are a contrast ramp. A design system speaks in `surface.canvas`, `surface.raised`, `border.subtle`, `text.muted`.

Mapping one onto the other by intuition produces a UI that looks right on one screen and wrong on the next, because the same `--jp-layout-color2` means "sunken input background" in one component and "hovered menu item" in another.

The fix is a **four-tier token architecture with an explicit adapter layer** (§5). Every `--jp-*` variable gets a documented, reviewed, tested mapping. That mapping file is the contract between design and engineering, and it is the single highest-leverage artifact in this project.

### 1.2 Using this document with any design system

This PRD is written to be **design-system agnostic**. Every token name in it — `color.surface.canvas`, `font.family.mono`, `elevation.3` — is a **placeholder**, not a prescription. Binding them is a P0 activity:

| Layer | Changes per design system? |
|---|---|
| Tier 1–3 token names and values | **Yes** — supplied by the design system |
| `mapping/jp-adapter.yaml` (Tier 4) | **Yes** — the only file that needs rewriting |
| Surface inventory (§6) and treatment levels | No — these are properties of JupyterLab |
| Technical architecture (§7) | No |
| Component specs (§8) — *structure and states* | No |
| Component specs (§8) — *values* | **Yes** |
| Acceptance criteria, a11y gates, testing (§9–10) | No |

The reusable asset is the **left column of the mapping table plus the treatment-level classification**. What JupyterLab exposes, what it hides behind JavaScript, and which surfaces portal outside the shell does not change when the design system does.

**To adopt this document:** run P0, replace the token names in §8 and Appendix A with the real ones, answer §16, and delete any surface the deployment does not ship.

---

## 2. Problem statement

**Today:**

- The notebook environment is the only surface in the product that does not look like the product.
- Users switching between the main application and JupyterLab experience a visual and interaction discontinuity — different type scale, different focus rings, different button semantics, different density, different iconography.
- Dark mode in JupyterLab is a separate stylesheet with independently drifted values. It does not match the design system's dark mode, and it does not follow the OS preference by default.
- Three internal teams have shipped partial CSS patches into `custom.css` and `overrides.json`. These fight each other, break on every JupyterLab minor upgrade, and have no owner.
- Third-party extensions (git, LSP, debugger, variable inspector) hardcode colors and become unreadable in dark mode.
- Accessibility is unaudited. Focus rings are inconsistent; several core surfaces fail 4.5:1 text contrast in the default dark theme.

**Cost of doing nothing:** continued per-team CSS patching (~0.4 FTE of unowned maintenance), a permanently off-brand primary workspace, and an accessibility exposure with no remediation path.

---

## 3. Goals & non-goals

### 3.1 Goals

| # | Goal | How it's measured |
|---|---|---|
| G1 | Every JupyterLab surface renders in the design system's visual language | Surface inventory (§6) 100% at Treatment Level ≥ 2 |
| G2 | Light and dark are peers, not primary/secondary | Both modes pass identical acceptance criteria and identical Galata snapshot suites |
| G3 | One source of truth for tokens | Zero hardcoded color/type/space literals in shipped CSS, enforced by CI lint |
| G4 | Mode switching is instant and complete | < 100ms, no FOUC, no stale JS-rendered surfaces, verified by automated test |
| G5 | Survives JupyterLab minor upgrades | CI runs against JupyterLab `latest` nightly; break budget ≤ 2 selectors per minor |
| G6 | WCAG 2.1 AA on all owned surfaces | Automated contrast audit passes on both modes; manual keyboard + SR audit signed off |
| G7 | One installable artifact | `pip install acme-jupyterlab-ui` produces the complete redesign with zero manual config |

### 3.2 Non-goals

- **Forking JupyterLab.** We build on top of the plugin system. A fork is unmaintainable at our headcount.
- **Rewriting Lumino.** Docking, drag-drop, and tab mechanics stay as-is. We restyle them; we do not replace them.
- **Redesigning third-party extension internals.** We ship a compatibility shim (§7.9) and an audit matrix. We do not own `jupyterlab-git`'s markup.
- **Notebook Classic / `nbclassic`.** Out of scope. Notebook 7 is in scope because it shares the JupyterLab component layer.
- **Changing kernel, server, or execution behavior.** This is a presentation-layer project. Zero backend changes.
- **Redesigning notebook *content*** — matplotlib figures, Plotly, Vega outputs. We theme the chrome around them and expose tokens so users can opt in.
- **A new information architecture.** Menu taxonomy and command names stay. We restructure chrome layout and density, not the mental model.

---

## 4. Users, use cases, and constraints

### 4.1 Primary users

| Persona | Environment | What they need from this |
|---|---|---|
| Data scientist (daily driver) | 8–12h/day in JupyterLab, dark mode, high density | Zero regression in speed. Readable code at 13px. Dense toolbars. |
| ML engineer | Splits time between IDE and Lab | Consistency with the design system, keyboard-first, no surprises |
| Analyst / occasional user | Light mode, lower density, less keyboard fluency | Discoverable chrome, obvious affordances, clear empty states |
| Platform engineer | Ships and maintains the Lab image | Deterministic install, pinned versions, upgrade playbook |

### 4.2 Environment constraints

- **Browsers:** Chromium 120+, Firefox 121+, Safari 17+. No IE, no legacy Edge.
- **Deployment surfaces:** JupyterHub (multi-user), local `jupyter lab`, Docker image, JupyterLite (best-effort — see §14 R7).
- **Viewport floor:** 1280×720. Tablet is best-effort; mobile is out of scope.
- **Offline:** must fully render with no network. No CDN fonts, no remote icon sprites. All assets bundled.
- **Kernel-agnostic:** Python, R, Julia, Scala. Nothing may assume the Python kernel.

---

## 5. The design system contract

Engineering cannot start Phase 1 until Design delivers the following. This is a hard gate.

### 5.1 Required inputs from Design

| Artifact | Format | Notes |
|---|---|---|
| Token set | W3C Design Tokens JSON (`.tokens.json`) | Both modes, all tiers, machine-readable |
| Type scale | Tokens + spec | Must include a **monospace** ramp — the design system currently has none |
| Spacing scale | Tokens | Must include a **compact** density variant for toolbars/tab bars |
| Elevation | Tokens | Shadow values for both modes (dark mode shadows need luminance, not opacity) |
| Motion | Tokens | Duration + easing; must define the `prefers-reduced-motion` fallback |
| Focus ring | Component spec | One spec, applied to every focusable element, both modes |
| Icon set | SVG, 16/20/24px grids, `currentColor` fills, no baked colors | ~180 icons required (§7.8) — inventory attached as Appendix B |
| Component specs | Figma + redlines | Button, Input, Select, Checkbox, Radio, Switch, Tab, Menu item, Dialog, Toast, Tooltip, Badge, Table row |

### 5.2 Token architecture — four tiers

```
TIER 1  PRIMITIVE          --ds-palette-blue-500: #2563eb
        (mode-independent)  --ds-space-2: 8px
                            --ds-font-mono: "JetBrains Mono", ui-monospace

TIER 2  SEMANTIC           --ds-color-surface-canvas: var(--ds-palette-neutral-0)
        (mode-scoped)      --ds-color-text-primary: var(--ds-palette-neutral-900)
                           --ds-color-border-subtle: var(--ds-palette-neutral-200)

TIER 3  COMPONENT          --ds-button-primary-bg: var(--ds-color-action-default)
        (mode-independent)  --ds-input-border-rest: var(--ds-color-border-strong)

TIER 4  ADAPTER            --jp-layout-color0: var(--ds-color-surface-canvas)
        (JupyterLab-facing) --jp-ui-font-color1: var(--ds-color-text-primary)
```

**Rules:**

1. Tier 4 is the **only** place `--jp-*` names appear. It is a generated file, produced by the mapping table in Appendix A. Nobody hand-edits it.
2. Only Tier 2 is redefined per mode. Tiers 1, 3, 4 are written once.
3. Component CSS consumes Tier 3, never Tier 1. Any Tier-1 reference outside Tier 2 fails CI lint.
4. Every Tier-2 token has a light value and a dark value. Missing either fails the build.

### 5.3 Mode scoping — implementation decision

JupyterLab sets two attributes on `<body>` when a theme loads:

```
data-jp-theme-name="Acme Light"
data-jp-theme-light="true"
```

We register **two themes** with `IThemeManager` (required — several extensions branch on `themeManager.isLight()`), but ship **one stylesheet containing both modes**, scoped:

```css
:root { /* Tier 1, Tier 3, Tier 4 — mode-independent */ }

body[data-jp-theme-light="true"]  { /* Tier 2 light */ }
body[data-jp-theme-light="false"] { /* Tier 2 dark  */ }
```

**Why:** `IThemeManager.loadCSS()` performs a network/disk fetch on every switch. Two separate stylesheets means an unstyled frame between unload and load — the FOUC that G4 forbids. One stylesheet swaps an attribute. Switching becomes a repaint, not a fetch.

**Cost:** ~8KB extra CSS shipped, gzipped negligible. Accepted.

### 5.4 OS preference sync

JupyterLab 4.1+ exposes adaptive theming in `@jupyterlab/apputils-extension:themes` settings. We ship these defaults via `overrides.json`:

```json
{
  "@jupyterlab/apputils-extension:themes": {
    "theme": "Acme Dark",
    "adaptive-theme": true,
    "preferred-light-theme": "Acme Light",
    "preferred-dark-theme": "Acme Dark",
    "theme-scrollbars": true
  }
}
```

**Fallback requirement:** if the target JupyterLab version does not expose `adaptive-theme`, our `shell-chrome` plugin registers a `matchMedia('(prefers-color-scheme: dark)')` listener and calls `themeManager.setTheme()` directly. This fallback is **required in the implementation regardless**, so the package works across the full supported version range without conditional logic in the settings layer.

---

## 6. Scope — surface inventory

Every surface is assigned a **Treatment Level**:

| Level | Meaning |
|---|---|
| **T1** | Token-only. Adapter layer handles it. No custom CSS. |
| **T2** | Token + structural CSS override. Selectors we own and test. |
| **T3** | Plugin replacement. Core plugin disabled, our plugin provides the token. |
| **T4** | JS-driven. Requires a runtime bridge — CSS variables do not reach it. |

### 6.1 Shell & chrome

| Surface | Level | Notes |
|---|---|---|
| Top panel | T2 | Height, density, logo slot, right-side action cluster |
| Menu bar (`.lm-MenuBar`) | T2 | Trigger typography, item padding, active/open state, mnemonic underline, overflow at narrow widths |
| Menu dropdowns (`.lm-Menu`) | T2 | Full component spec — §8.4 |
| Submenus | T2 | Chevron, open delay, flip behavior near viewport edge, nested elevation |
| Context menus | T2 | Same `.lm-Menu` classes; composition via `jupyter.lab.context-menu` |
| Menu separators & section headers | T2 | `[data-type='separator']` — inset, weight, spacing rhythm |
| Toggled / checked menu items | T2 | `.lm-mod-toggled` — must not be color-only (A7) |
| Keyboard-highlighted item | T2 | `.lm-mod-active` — **not** `:hover` or `:focus`. See §8.4 note. |
| Left/right sidebar rails | T2 | Icon-rail width, active indicator, tooltip positioning |
| Sidebar panel headers | T2 | Type, sticky behavior, action button slot |
| Main dock area tab bar | T2 | `.lm-TabBar` — tab shape, close affordance, dirty-state dot, overflow |
| Dock split handles | T2 | `.lm-SplitPanel-handle` — hit area is currently 4px, spec calls for 8px hit / 1px visual |
| Status bar | T3 | Replaced — §8.5. `IStatusBar` positions items but cannot enforce item shape. |
| Status bar items (core) | T3 | Kernel/execution indicator, line·col, editor mode, trust, running sessions, notification bell |
| Status bar items (third-party) | T2 | Wrapped by our shell; internals restyled via `compat-shim` |
| Status bar hover popovers | T2 | `.jp-StatusBar-HoverItem` — kernel picker, session list |
| Bottom dock area (`'down'`) | T2 | Own tab bar, resize handle, collapsed state — currently unstyled by core |
| Log console | T2 | Level badges, timestamps, source selector — needs level color tokens |
| Splash screen | T3 | `ISplashScreen` token override. Current one is a hardcoded SVG. |
| Scrollbars | T2 | `--jp-scrollbar-*` + `themeScrollbars: true`; Firefox uses `scrollbar-color` |
| Drag-drop ghost / drop zones | T2 | `.lm-mod-drag-image`, `.lm-DockPanel-overlay` |

### 6.2 Core panels

| Surface | Level | Notes |
|---|---|---|
| Launcher — shell & sections | T3 | Replaced. `ILauncher` cannot control layout, grouping, or add affordances — §8.11 |
| Launcher — cards | T3 | Card geometry, hover/focus, label truncation |
| Launcher — **kernel card icons** | T4 | `kernelIconUrl` is a server-served raster. Mixes with vector `LabIcon`s in the same grid — §8.11.3 |
| Launcher — non-kernel cards | T2 | Terminal, text file, markdown, contextual help — these are `LabIcon`s |
| Launcher — cwd context | T3 | Launch target directory is invisible in stock. Net-new — §8.11.4 |
| Launcher — states | T3 | No kernels, kernel discovery failure, long kernel lists |
| File browser listing | T2 | Row density, selection, file-type icons, breadcrumb |
| File browser toolbar | T2 | Declarative reorder via `jupyter.lab.toolbars` (§7.6) |
| Running terminals/kernels | T2 | List rows, kill affordance |
| Table of contents — panel shell | T2 | Header, toolbar, settings popover, empty state — §8.10 |
| Table of contents — item tree | T2 | 6 depth levels in a ~200px column; indent guides, collapser, numbering |
| Table of contents — active heading | T2 | Scroll-synced indicator; the one piece of state in the panel |
| Table of contents — inline heading content | T2 | Headings carry code spans, links, **and rendered math** — must be neutralised |
| Table of contents — collapse sync | T2 | Bidirectional with notebook heading collapse; state must read the same in both places |
| Extension manager | T2 | Card layout, install/enable states, warning banner |
| Debugger — panel shell | T2 | Section headers, collapse state, toolbar row — §8.6 |
| Debugger — variables **tree** view | T2 | Row density, expand affordance, type badges |
| Debugger — variables **grid** view | **T4** | **Lumino DataGrid.** Same JS-object styling as the CSV viewer. Reclassified from T2. |
| Debugger — callstack | T2 | Frame rows, active frame indicator, file·line typography |
| Debugger — breakpoints list | T2 | Enabled/disabled state, source path truncation |
| Debugger — sources / kernel sources | T2 | File tree + CM6 read-only editor |
| Debugger — breakpoint gutter | T3 | CodeMirror 6 gutter extension — lives in the editor theme (§7.5), not plain CSS |
| Debugger — current-line highlight | T3 | CM6 decoration, same |
| Debugger — variable detail view | T2 | Main-area widget, renders via rendermime |
| Property inspector | T2 | Shares form controls with Settings — see §6.5 |
| Command palette | T2 | Result rows, category headers, match highlight, keybinding chips |

### 6.3 Notebook

| Surface | Level | Notes |
|---|---|---|
| Notebook canvas & padding | T1 | `--jp-notebook-padding`, `--jp-notebook-scroll-padding` |
| Cell container / selection | T2 | Active-cell indicator is currently a 5px left bar; spec calls for a full-bleed surface change |
| Input prompt (`In [n]:`) | T2 | Prompt width, mono type, opacity states |
| Cell editor chrome | T1 | `--jp-cell-editor-*` background/border/active |
| Cell collapser | T2 | Hit area and hover affordance |
| Cell toolbar | T2 | Floating toolbar position, density, icon sizing |
| Output area | T2 | Padding, scroll affordance, output prompt |
| **ANSI output colors** | T2 | **Hardcoded** in rendermime — `.ansi-*-fg` / `.ansi-*-bg`. 32-selector override block. **Must share one token source with the terminal — §8.7.2.** |
| IPython traceback coloring | T2 | Same ANSI classes. Traceback readability is gated on the ANSI palette, not on `--jp-rendermime-error-*`. |
| Stream / error output | T2 | `--jp-rendermime-error-background` + traceback mono treatment |
| Rendered markdown | T2 | `.jp-RenderedHTMLCommon` — largest single CSS surface in scope. Full type ramp, tables, code, blockquote, lists, hr, links. |
| Rendered tables | T2 | `--jp-rendermime-table-row-*` + border model |
| Notebook search overlay | T2 | `--jp-search-*` match highlight colors |
| Cell drag/drop indicator | T2 | |

### 6.4 Editors & consoles

| Surface | Level | Notes |
|---|---|---|
| CodeMirror 6 editor theme | T3 | Custom theme registered via `IEditorThemeRegistry` (§7.5) |
| Syntax highlighting | T3 | `HighlightStyle` against `@lezer/highlight` tags — not the legacy `--jp-mirror-editor-*` vars |
| Gutters / line numbers / active line | T3 | Part of the CM6 theme |
| Autocomplete popup | T2 | `.jp-Completer` — item rows, type badges, doc panel |
| Inline signature/tooltip | T2 | |
| **Terminal — cell grid** | **T4** | Rendered to **canvas/WebGL**. Zero CSS reachability. Everything comes from the xterm options object — §8.7 |
| Terminal — ANSI palette | T4 | 16 ANSI + fg/bg/cursor/selection. Shares one token source with rendermime ANSI (§8.7.2) |
| Terminal — typography | T4 | `fontFamily`/`fontSize`/`lineHeight`/`letterSpacing` are xterm options, not CSS. Advance width drives the cell grid. |
| Terminal — viewport & scrollbar | T2 | `.xterm-viewport` **is** DOM — the scrollbar spec from §6.1 applies here |
| Terminal — panel chrome & padding | T2 | `.jp-Terminal` — padding changes must trigger a `FitAddon` recalculation |
| Terminal — links | T2 | Web-links addon; link color and underline |
| Terminal — settings conflict | T3 | `terminal:plugin` `theme: 'inherit'` competes with our bridge — R14 |
| Console panel | T2 | Prompt cell, banner, history separators |
| CSV/TSV viewer (**DataGrid**) | T4 | Lumino DataGrid styles are a **JavaScript object**, not CSS. Requires a plugin override. |
| JSON viewer | T2 | Tree rows, expand affordance, search |
| Image/PDF/HTML viewers | T1 | Chrome only |

### 6.5 Settings, forms, and dialogs

This is where the "not a theme change" requirement bites hardest. The Settings Editor is a React app using `@rjsf/core` v5. Its widgets are not JupyterLab CSS classes — they are RJSF's default field templates.

| Surface | Level | Notes |
|---|---|---|
| Settings editor shell | T2 | Two-pane layout, search, plugin list |
| Plugin list (left pane) | T2 | Row density, modified indicator, category grouping |
| **Settings form fields** | T3 | Custom renderers via `IFormRendererRegistry` (§7.7) — string, number, boolean, enum, array, object, keybinding |
| Settings JSON editor view | T3 | Inherits the CM6 theme |
| Text input | T2 | `--jp-input-*` covers ~60%; focus ring, invalid state, and prefix/suffix slots need CSS |
| Select / dropdown | T2 | `.jp-HTMLSelect` — native `<select>`, so the popup list is OS-rendered. **Known limitation**, see §14 R5. |
| Checkbox / radio | T2 | Custom-drawn via `appearance: none` |
| Switch | T2 | `@jupyterlab/ui-components` Switch |
| Buttons (all variants) | T2 | Primary, secondary, ghost, danger, icon-only, split |
| Toolbar buttons | T2 | `.jp-ToolbarButtonComponent` — active/pressed/disabled states |
| Dialogs | T2 | `.jp-Dialog` — header, body, footer, button order (LTR/RTL), backdrop |
| Toasts / notifications | T2 | `.jp-Notification-*` (JupyterLab 4.2+) |
| Tooltips | T2 | Delay, placement, max-width, arrow |
| Progress / spinners | T2 | Must respect `prefers-reduced-motion` |

### 6.6 ipywidgets

| Surface | Level | Notes |
|---|---|---|
| `@jupyter-widgets/controls` | T1 + T2 | Exposes its own `--jp-widgets-*` variable set — map in the adapter layer. Slider, dropdown, and file-upload need CSS overrides beyond the vars. |

### 6.7 States

Every panel gets an explicit design for: **empty**, **loading**, **error**, **permission-denied**, **offline/kernel-disconnected**. Currently JupyterLab ships blank or text-only for most. This is net-new design work, not restyling.

---

## 7. Technical architecture

### 7.1 Repository layout

Monorepo, one Python distribution shipping eight prebuilt federated extensions.

```
acme-jupyterlab-ui/
├── packages/
│   ├── tokens/               # Style Dictionary source + build → CSS/JSON/TS
│   ├── theme-light/          # IThemeManager registration (light)
│   ├── theme-dark/           # IThemeManager registration (dark)
│   ├── ui-overrides/         # structural CSS for all T2 surfaces
│   ├── icons/                # LabIcon overrides + net-new icons
│   ├── editor-theme/         # CodeMirror 6 theme + HighlightStyle
│   ├── settings-forms/       # IFormRendererRegistry custom field renderers
│   ├── shell-chrome/         # status bar, splash, launcher, terminal bridge, datagrid bridge
│   └── compat-shim/          # third-party extension patch layer
├── python/
│   └── acme_jupyterlab_ui/
│       ├── __init__.py
│       ├── labextension/     # built federated bundles
│       └── etc/jupyter/      # overrides.json, page_config.json
├── tests/
│   ├── galata/               # visual regression
│   ├── contrast/             # automated a11y audit
│   └── compat/               # third-party matrix
├── pyproject.toml            # hatchling + hatch-jupyter-builder
└── package.json              # workspaces root
```

Scaffolded from `copier copy https://github.com/jupyterlab/extension-template`, converted to a workspace.

### 7.2 Token build pipeline

```
Figma  ──(Tokens Studio)──►  tokens/src/*.tokens.json
                                      │
                              Style Dictionary v4
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
   tokens/dist/tokens.css   tokens/dist/tokens.ts   tokens/dist/tokens.json
   (Tiers 1–3, mode-scoped)  (JS bridge for T4)     (docs + contrast audit)
                                      │
                          mapping/jp-adapter.yaml
                                      │
                              codegen script
                                      ▼
                          tokens/dist/jp-adapter.css   (Tier 4)
```

**Requirements:**

- The pipeline runs in CI on every token change and opens a PR with the regenerated CSS. Designers never touch CSS.
- `tokens.ts` is a typed export consumed by the T4 bridges (terminal, DataGrid) — the JS-driven surfaces read the same numbers the CSS does. **This eliminates the single most common failure mode in this class of project: the terminal being one shade off from the notebook.**
- `jp-adapter.yaml` is reviewed like code. Every entry requires a `rationale` field. Unmapped `--jp-*` variables fail the build with a list.

### 7.3 Theme extension registration

`packages/theme-light/src/index.ts`:

```ts
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@acme/theme-light:plugin',
  description: 'Acme design system — light mode.',
  requires: [IThemeManager],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IThemeManager,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load('acme');
    const style = '@acme/theme-light/index.css';

    manager.register({
      name: 'Acme Light',
      displayName: trans.__('Acme Light'),
      isLight: true,
      themeScrollbars: true,
      load: () => manager.loadCSS(style),
      unload: () => Promise.resolve(undefined)
    });
  }
};

export default plugin;
```

`package.json` must declare the theme path or JupyterLab will not copy the stylesheet:

```json
{
  "jupyterlab": {
    "extension": true,
    "themePath": "style/index.css"
  }
}
```

The dark package is identical with `isLight: false`. Both `index.css` files `@import` the same combined token stylesheet — the attribute scoping in §5.3 does the actual work.

### 7.4 Structural CSS layer (`ui-overrides`)

Not a theme extension — a plain `autoStart` plugin whose `style/index.js` imports CSS. Loaded independently of the theme so it applies in both modes.

**Selector ownership discipline** — the rule that determines whether this project survives its first JupyterLab upgrade:

1. Every selector lives in a file named for its surface: `style/surfaces/tab-bar.css`, `style/surfaces/dialog.css`.
2. Every file begins with a header block listing the upstream package and version the selectors were verified against.
3. **Never** target `--jp-private-*` variables or class names containing `-private-`. They are explicitly not public API.
4. `!important` requires an inline comment naming the upstream rule being beaten. CI greps for uncommented `!important` and fails.
5. A `selectors.json` manifest lists every selector we depend on. A CI job boots the target JupyterLab version and asserts each selector matches at least one element. Broken selectors fail the build **before** anyone sees a visual regression.

### 7.5 CodeMirror 6 editor theme

JupyterLab 4 moved to CodeMirror 6. The legacy `--jp-mirror-editor-*` variables still exist for compatibility, but they only cover token colors — not gutters, selection, active line, bracket matching, or the completion popup.

Two paths:

- **Minimum:** set `--jp-mirror-editor-*` in the adapter layer and keep the default `jupyter` editor theme.
- **Required for this project:** register a real CM6 theme.

```ts
import { IEditorThemeRegistry } from '@jupyterlab/codemirror';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { acme } from '@acme/tokens';

const buildTheme = (dark: boolean) => {
  const c = dark ? acme.dark : acme.light;

  const base = EditorView.theme(
    {
      '&': {
        color: c.textPrimary,
        backgroundColor: c.surfaceCode,
        fontFamily: acme.fontMono,
        fontSize: '13px'
      },
      '.cm-content': { caretColor: c.accentDefault },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.accentDefault },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground':
        { backgroundColor: c.selectionBg },
      '.cm-activeLine': { backgroundColor: c.surfaceCodeActive },
      '.cm-gutters': {
        backgroundColor: c.surfaceCode,
        color: c.textMuted,
        border: 'none',
        borderRight: `1px solid ${c.borderSubtle}`
      },
      '.cm-activeLineGutter': {
        backgroundColor: c.surfaceCodeActive,
        color: c.textPrimary
      },
      '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: c.bracketMatchBg,
        outline: `1px solid ${c.bracketMatchBorder}`
      },
      '.cm-tooltip': {
        backgroundColor: c.surfaceOverlay,
        border: `1px solid ${c.borderSubtle}`,
        borderRadius: acme.radiusMd,
        boxShadow: dark ? acme.elevationDark2 : acme.elevationLight2
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: c.surfaceSelected,
        color: c.textPrimary
      }
    },
    { dark }
  );

  const highlight = HighlightStyle.define([
    { tag: t.keyword,                         color: c.synKeyword },
    { tag: [t.controlKeyword, t.moduleKeyword], color: c.synKeyword, fontWeight: '600' },
    { tag: [t.name, t.deleted, t.character],  color: c.synName },
    { tag: [t.function(t.variableName), t.labelName], color: c.synFunction },
    { tag: [t.propertyName],                  color: c.synProperty },
    { tag: [t.className, t.typeName],         color: c.synType },
    { tag: [t.number, t.bool, t.null],        color: c.synNumber },
    { tag: [t.string, t.special(t.string)],   color: c.synString },
    { tag: [t.regexp, t.escape],              color: c.synRegexp },
    { tag: [t.operator, t.operatorKeyword],   color: c.synOperator },
    { tag: [t.comment, t.blockComment],       color: c.synComment, fontStyle: 'italic' },
    { tag: [t.meta, t.documentMeta],          color: c.synMeta },
    { tag: t.invalid,                         color: c.dangerFg }
  ]);

  return [base, syntaxHighlighting(highlight)];
};
```

Registered in the plugin:

```ts
requires: [IEditorThemeRegistry],
activate: (app, themes: IEditorThemeRegistry) => {
  themes.addTheme({
    name: 'acme-light',
    displayName: 'Acme Light',
    theme: buildTheme(false)
  });
  themes.addTheme({
    name: 'acme-dark',
    displayName: 'Acme Dark',
    theme: buildTheme(true)
  });
}
```

**Requirement:** the editor theme must follow the application theme automatically. `shell-chrome` subscribes to `IThemeManager.themeChanged` and writes the matching editor theme into the `@jupyterlab/codemirror-extension:plugin` settings via `ISettingRegistry`. Users must never have to switch two themes.

**Coverage requirement:** the `HighlightStyle` must be validated against Python, R, Julia, SQL, Markdown, JSON, YAML, TOML, Bash, TypeScript, and LaTeX. Any lezer tag that falls through to the default color in any of those languages is a bug.

### 7.6 Declarative toolbar & menu restructuring

JupyterLab exposes toolbar and menu composition through **settings schema**, not code. This is how chrome gets restructured without touching upstream markup.

`overrides.json`:

```json
{
  "@jupyterlab/notebook-extension:panel": {
    "toolbar": [
      { "name": "save",         "rank": 10 },
      { "name": "insert",       "rank": 20 },
      { "name": "spacer-1",     "type": "spacer", "rank": 25 },
      { "name": "run",          "rank": 30 },
      { "name": "interrupt",    "rank": 31 },
      { "name": "restart",      "rank": 32 },
      { "name": "restart-and-run", "rank": 33 },
      { "name": "cellType",     "rank": 40 },
      { "name": "cut",          "rank": 90, "disabled": true },
      { "name": "copy",         "rank": 91, "disabled": true },
      { "name": "paste",        "rank": 92, "disabled": true },
      { "name": "spacer-2",     "type": "spacer", "rank": 95 },
      { "name": "kernelName",   "rank": 100 },
      { "name": "executionProgress", "rank": 101 }
    ]
  },
  "@jupyterlab/mainmenu-extension:plugin": {
    "menus": [
      { "id": "jp-mainmenu-tabs", "disabled": true }
    ]
  }
}
```

**Requirement:** all chrome composition changes go through `overrides.json`. Zero DOM manipulation, zero `MutationObserver`-based reordering. Anything that cannot be expressed declaratively gets escalated to a T3 plugin replacement rather than a DOM hack.

### 7.7 Settings editor form renderers

The Settings Editor renders `@rjsf/core` v5 fields. To replace them with design-system components, register renderers against `IFormRendererRegistry`:

```ts
import { IFormRendererRegistry } from '@jupyterlab/ui-components';

activate: (app: JupyterFrontEnd, registry: IFormRendererRegistry) => {
  registry.addRenderer('@jupyterlab/shortcuts-extension:shortcuts.shortcuts', {
    fieldRenderer: KeybindingField
  });
  registry.addRenderer('@jupyterlab/fileeditor-extension:plugin.editorConfig', {
    fieldRenderer: EditorConfigField
  });
}
```

The registry keys on `<plugin-id>.<property>`, so **global** widget replacement is not available through this API. The plan:

1. **Global pass:** CSS overrides against RJSF's stable class names (`.form-group`, `.field-string`, `.field-boolean`, `.array-item`, `.control-label`, `.field-description`) restyle every field. This covers ~85% of fields.
2. **Targeted pass:** custom `fieldRenderer`s for the fields where CSS is not enough — keybinding capture, theme picker, editor config, font pickers, color pickers.
3. **Escape hatch:** if the settings editor UX cannot reach spec through 1+2, escalate to a full T3 replacement of `@jupyterlab/settingeditor-extension:form-ui`. This is scoped as a **contingency**, not baseline. Decision point at end of Phase 4.

### 7.8 Icon system

JupyterLab icons are `LabIcon` instances holding SVG strings, registered in a global name-keyed registry. Built-in icons are overridden by writing to the `svgstr` setter:

```ts
import { LabIcon } from '@jupyterlab/ui-components';
import runSvg from '../svg/run.svg';
import saveSvg from '../svg/save.svg';

const OVERRIDES: Record<string, string> = {
  'ui-components:run': runSvg,
  'ui-components:save': saveSvg,
  'ui-components:notebook': notebookSvg
  // ...generated from the icon manifest
};

for (const [name, svgstr] of Object.entries(OVERRIDES)) {
  try {
    LabIcon.resolve({ icon: name }).svgstr = svgstr;
  } catch (err) {
    console.warn(`[acme-icons] icon "${name}" not found in this JupyterLab build`, err);
  }
}
```

#### 7.8.1 Icon inventory by surface

"Replace the icons" is six separate problems with three different delivery mechanisms. The P0 audit produces the exact per-version manifest by enumerating the `LabIcon` registry at runtime; the table below is the scope shape.

| Surface | ~Count | Mechanism | Notes |
|---|---|---|---|
| **Sidebar rail** | 8–12 | `LabIcon` override | File browser, running sessions, palette, TOC, extensions, debugger, property inspector, plus any third-party panel. **Highest visibility icons in the product** — always visible, never labelled. |
| **Menu items** | 30–50 | `LabIcon` override | Only some commands carry icons. Partial coverage looks worse than none — see 7.8.3. |
| **Toolbars** | 40–60 | `LabIcon` override | Notebook, file browser, debugger, cell toolbar. Densest cluster; optical weight consistency matters most here. |
| **File type icons** | 20–30 | `LabIcon` override, registered per `DocumentRegistry` file type | Notebook, .py, .md, .json, .csv, .html, .yaml, .pdf, images, folder, generic file |
| **Directional / control** | 25–35 | `LabIcon` override | Carets, close, check, search, filter, ellipsis, add, refresh, link, edit, trash, upload, download |
| **Status & state** | 10–15 | `LabIcon` override | Kernel status, notification bell, trust shield, breakpoint glyphs, dirty-state dot |
| **Kernel logos** | 3–10 | **Server-side — not overridable from a labextension.** See 7.8.2 | Python, R, Julia, and any custom kernel |
| **Brand marks** | 3–5 | Static assets + widget | Logo, favicon, splash, About dialog — §8.9 |

#### 7.8.2 Kernel logos are not `LabIcon`s

Kernel logos shown in the launcher cards, the kernel picker, and notebook tabs are **not** in the `LabIcon` registry. They are `logo-32x32.png`, `logo-64x64.png`, and `logo-svg.svg` files inside each kernelspec directory, served over HTTP by the Jupyter **server** from the kernelspec resource path.

A frontend extension cannot override them. The options:

1. **Ship replacement kernelspec resources in the image** — overwrite the logo files at build time in the Docker image. Deterministic, but only covers kernels installed at build time.
2. **A server extension** that intercepts the kernelspec resource handler and serves our assets. Covers dynamically installed kernels; adds a server-side component to a project otherwise scoped as frontend-only.
3. **Accept stock kernel logos.** Defensible — the Python and R marks are external brands, and replacing them with house-styled versions may be wrong on trademark grounds regardless of technical feasibility.

**Recommendation:** option 3 for third-party language marks, option 1 for any internal/custom kernel. Escalate to option 2 only if the deployment installs kernels dynamically and the launcher looks broken without it. This is a P0 decision — it is the only part of the icon scope that can pull a server-side component into the project.

#### 7.8.3 Partial coverage is worse than none

Menu icon coverage in JupyterLab is inconsistent: some commands have icons, most do not. Two viable positions, and the choice must be made once and applied globally:

- **All or nothing per menu.** Every item in a given menu has an icon, or none do. Mixed menus produce a ragged label column that reads as a bug.
- **Icons only where they aid recognition.** Reserved for high-frequency destructive or state-changing commands; the icon column is then omitted entirely on menus with no icons, reclaiming the leading space.

Either is fine. Silently inheriting JupyterLab's existing partial coverage is not — that is a decision by default, and it is the one most likely to make a finished redesign still look unfinished.

#### 7.8.4 SVG authoring requirements

Non-negotiable — these are what make icons theme-aware:

- Fills must use JupyterLab's icon classes (`jp-icon0`–`jp-icon4`, `jp-icon-brand0`–`3`, `jp-icon-accent0`–`3`, `jp-icon-contrast0`–`4`) **or** `currentColor`. Never a literal hex. A literal hex is an icon that is invisible in one of the two modes.
- Optical alignment on a 16px grid with a 1px safe margin.
- Stroke width normalized to 1.5px at 16px.
- SVGO-optimized, no `<style>` blocks, no `id` attributes (they collide when inlined).
- Every icon carries `<title>` for screen readers.
- Sidebar rail icons are authored at 20px, not scaled up from 16px — a 16px glyph scaled to 20 reads soft next to a native 20px one.

Timing: the override plugin must have `autoStart: true` and no `requires`, so it runs before the first render. A `MutationObserver` fallback re-applies overrides to lazily-registered icons from third-party extensions.

#### 7.8.5 Icon acceptance criteria

| # | Criterion |
|---|---|
| I1 | Every icon in the P0 manifest is replaced; zero stock JupyterLab glyphs visible on owned surfaces |
| I2 | No icon contains a literal colour value (CI-linted across the SVG directory) |
| I3 | Optical weight is consistent across any single toolbar or menu — reviewed as a contact sheet, not icon by icon |
| I4 | Menu icon coverage follows the 7.8.3 decision uniformly |
| I5 | Every icon-only control has an `aria-label` and the SVG has a `<title>` |
| I6 | Kernel logo position (7.8.2) is decided and implemented |

### 7.9 The T4 bridges — JavaScript-driven surfaces

These do not read CSS variables. They must be pushed values at runtime, and re-pushed on every theme change. **This is the section most redesigns skip, and it is why most redesigns have a terminal that looks wrong.**

**Terminal (xterm.js):**

```ts
const applyTerminalTheme = (isLight: boolean) => {
  const p = isLight ? acme.light.terminal : acme.dark.terminal;
  for (const widget of tracker.widgets) {
    widget.setOption('theme', {
      foreground: p.fg, background: p.bg,
      cursor: p.cursor, cursorAccent: p.cursorAccent,
      selectionBackground: p.selection,
      black: p.ansi0,  red: p.ansi1,  green: p.ansi2,  yellow: p.ansi3,
      blue: p.ansi4,   magenta: p.ansi5, cyan: p.ansi6, white: p.ansi7,
      brightBlack: p.ansi8,  brightRed: p.ansi9,
      brightGreen: p.ansi10, brightYellow: p.ansi11,
      brightBlue: p.ansi12,  brightMagenta: p.ansi13,
      brightCyan: p.ansi14,  brightWhite: p.ansi15
    });
  }
};

themeManager.themeChanged.connect(() => applyTerminalTheme(themeManager.isLight(themeManager.theme!)));
tracker.widgetAdded.connect(() => applyTerminalTheme(/* current */));
```

**Lumino DataGrid — two instances, one bridge:** styles are a JS `DataGrid.IStyle` object, not CSS. Both the CSV/TSV viewer *and the debugger's variables grid view* are DataGrids. One shared `buildGridStyle(isLight)` factory in `shell-chrome`, applied by overriding `@jupyterlab/csvviewer-extension` and hooking the debugger's variables widget, re-applied on `themeChanged`. Writing this bridge twice is how the two grids end up one shade apart.

**ipywidgets:** primarily `--jp-widgets-*` variables (T1), but sliders and the file-upload button need CSS. Widgets rendered into output areas before a theme switch must repaint — verify no stale inline styles.

**Notebook output content (matplotlib, Plotly, Vega):** out of scope as content, but we ship an opt-in helper package exposing the token palette as a matplotlib style sheet and a Vega theme, so users *can* match. Documented, not enforced.

### 7.10 Distribution

```toml
# pyproject.toml (excerpt)
[build-system]
requires = ["hatchling>=1.21", "hatch-jupyter-builder>=0.9"]
build-backend = "hatchling.build"

[project]
name = "acme-jupyterlab-ui"
requires-python = ">=3.9"
dependencies = ["jupyterlab>=4.2.0,<4.5.0"]

[tool.hatch.build.targets.wheel.shared-data]
"python/acme_jupyterlab_ui/labextension" = "share/jupyter/labextensions"
"python/acme_jupyterlab_ui/etc/jupyter" = "etc/jupyter"
```

Shipped defaults land in `etc/jupyter/labconfig/` (`page_config.json` — disabled core plugins) and `share/jupyter/lab/settings/overrides.json` (theme + toolbar defaults).

**Disabled core plugins** (T3 replacements) go in `page_config.json`:

```json
{
  "disabledExtensions": {
    "@jupyterlab/apputils-extension:splash": true,
    "@jupyterlab/statusbar-extension:plugin": true,
    "@jupyterlab/launcher-extension:plugin": true,
    "@jupyterlab/csvviewer-extension:csv": true
  }
}
```

**Hard requirement:** users can still install their own extensions and choose the stock themes. We ship defaults, not a lockdown. Anything that traps a user in our UI is a bug.

---

## 8. Component specifications (representative)

Full redlines live in Figma. Three specified here because they set the pattern for the rest.

### 8.1 Button

| Property | Primary | Secondary | Ghost | Danger |
|---|---|---|---|---|
| Background (rest) | `action.default` | `surface.raised` | `transparent` | `danger.default` |
| Background (hover) | `action.hover` | `surface.hover` | `surface.hover` | `danger.hover` |
| Background (active) | `action.active` | `surface.active` | `surface.active` | `danger.active` |
| Foreground | `text.on-action` | `text.primary` | `text.primary` | `text.on-danger` |
| Border | none | `1px border.default` | none | none |
| Radius | `radius.md` (6px) | same | same | same |
| Padding | `space.2 space.3` | same | same | same |
| Height | 32px default / 24px compact | | | |
| Disabled | 40% opacity, `cursor: not-allowed`, no hover transition | | | |
| Focus | `2px action.focus` ring, `2px` offset, `:focus-visible` only | | | |
| Motion | `background-color 120ms ease-out`; suppressed under `prefers-reduced-motion` | | | |

**Icon-only variant:** 32×32 (24×24 compact), icon 16px centered, `aria-label` mandatory, tooltip after 500ms.

**Toolbar variant:** ghost, 24px, 4px radius, active state uses `--jp-toolbar-active-background`.

### 8.2 Notebook cell

| Element | Spec |
|---|---|
| Container background | `surface.canvas` |
| Active cell background | `surface.raised` (structural change from core's left-bar-only indicator) |
| Active cell indicator | 2px `action.default` left bar, full cell height including output |
| Selected (multi) | `surface.selected` at 60% |
| Editor background | `surface.code` |
| Editor border (rest) | `1px border.subtle` |
| Editor border (focus) | `1px action.default` + 2px focus ring |
| Prompt | `font.mono`, `text.muted`, right-aligned, 64px width, `letter-spacing: 0` |
| Prompt (running) | `action.default` + pulse animation, suppressed under `prefers-reduced-motion` |
| Cell gap | `space.2` (8px) |
| Output background | `surface.canvas` |
| Error output | `danger.subtle` background, `2px danger.default` left border |
| Collapser hit area | 24px wide, 4px visual, hover reveals at 100% opacity |

### 8.3 Dialog

| Element | Spec |
|---|---|
| Backdrop | `overlay.scrim`, `backdrop-filter: blur(2px)` (disabled under `prefers-reduced-transparency`) |
| Surface | `surface.overlay`, `radius.lg` (10px), `elevation.3` |
| Width | 480px default, 640px wide variant, max `90vw` |
| Header | `font.heading.sm`, `space.4` padding, no border |
| Body | `space.4` padding, max-height `70vh`, scrolls with sticky header/footer |
| Footer | right-aligned, `space.2` gap, primary rightmost (LTR) |
| Entry motion | 120ms fade + 4px translate-Y; suppressed under `prefers-reduced-motion` |
| Focus | trapped; first focusable focused on open; `Escape` closes; focus restored to trigger on close |

### 8.4 Menu bar & menus

Menus are the highest-traffic chrome in the product and the surface most likely to be restyled incorrectly, because Lumino's markup and state model do not behave like normal DOM.

#### 8.4.1 Three structural facts that constrain the design

**1. Menus render detached, into `document.body`.** A `.lm-Menu` is not a child of the shell. Any CSS scoped under `#main`, `.jp-LabShell`, or a panel selector will miss menus entirely and they will render stock while everything around them is redesigned. The `body[data-jp-theme-light]` scoping decision in §5.3 is what makes menus work — mode tokens resolve because the scope is on `<body>`, above the portal.

**2. The keyboard-highlighted item uses `.lm-mod-active`, not `:hover` or `:focus`.** Lumino manages its own active-item index. A menu styled only on `:hover` has *completely invisible keyboard navigation* — arrow keys move an indicator nobody can see. Every hover rule in the menu stylesheet must have a matching `.lm-mod-active` rule. This is a CI-lintable invariant and it is listed as such below.

**3. Items are a four-column grid: icon | label | shortcut | submenu chevron.** Columns must stay aligned across every item in a menu, including items with no icon and no shortcut. Padding changes applied to one column without the others break alignment across the whole menu. Column widths are specified below and are fixed, not content-derived.

#### 8.4.2 Menu bar

| Property | Spec |
|---|---|
| Bar height | 36px default / 28px compact |
| Bar background | `color.surface.raised` |
| Bar border | `1px color.border.subtle` bottom only |
| Item typography | `font.family.ui`, `font.size.ui.sm` (13px), weight 450 |
| Item color (rest) | `color.text.secondary` |
| Item color (hover) | `color.text.primary` |
| Item background (hover) | `color.surface.hover` |
| Item state (open) | `color.surface.active` bg, `color.text.primary` fg, `radius.sm` top corners only |
| Item padding | `space.2` horizontal (8px), full bar height |
| Item gap | 0 — adjacent hit areas, no dead zones |
| Mnemonic (`.lm-MenuBar-itemMnemonic`) | `text-decoration: underline`, revealed on `Alt`; **never removed** |
| Overflow | Items collapse into an overflow trigger below 900px; overflow menu uses the standard `.lm-Menu` spec |
| Focus | `2px color.action.focus` ring, inset (an outset ring clips against the top panel edge) |

#### 8.4.3 Menu dropdown

| Property | Spec |
|---|---|
| Surface | `color.surface.overlay` |
| Border | `1px color.border.subtle` |
| Radius | `radius.md` (6px) |
| Elevation | `elevation.3` — dark mode via surface lightness step, not shadow opacity (§9) |
| Min width | 200px |
| Max width | 360px — labels truncate with ellipsis, full text in `title` |
| Max height | `min(60vh, available)` — scrolls with the scrollbar spec from §6.1 |
| Padding (content) | `space.1` vertical (4px), 0 horizontal |
| Item height | 28px default / 24px compact |
| Item padding | `space.2` horizontal |
| Item typography | `font.family.ui`, `font.size.ui.sm`, weight 400 |

**Column grid (fixed widths — do not make content-derived):**

| Column | Width | Contents |
|---|---|---|
| Icon | 20px + `space.2` gap | 16px `LabIcon`, or the checkmark for `.lm-mod-toggled` |
| Label | flex, truncating | `color.text.primary`; mnemonic underlined |
| Shortcut | auto, min 64px, right-aligned | `font.family.mono`, `font.size.ui.xs`, `color.text.muted`, tabular figures |
| Submenu chevron | 16px + `space.1` gap | 12px chevron, `color.text.muted` |

**Item states:**

| State | Selector | Treatment |
|---|---|---|
| Rest | `.lm-Menu-item` | `color.text.primary` on transparent |
| Hover | `.lm-Menu-item:hover` | `color.surface.hover` |
| **Keyboard active** | `.lm-Menu-item.lm-mod-active` | **Identical to hover.** Non-negotiable — see §8.4.1(2) |
| Disabled | `.lm-mod-disabled` | 40% opacity, no hover response, `cursor: default` |
| Toggled | `.lm-mod-toggled` | Check glyph in the icon column **plus** `color.text.strong` label. Never color-only. |
| Submenu open | `.lm-mod-active` on parent | Same as hover; chevron shifts to `color.text.primary` |
| Separator | `[data-type='separator']` | 1px `color.border.faint`, `space.1` vertical margin, inset `space.2` from both edges |

**Motion:** no entry animation on open — menus must feel instantaneous, and a 120ms fade on a menu opened 200 times a day reads as lag, not polish. Submenu open delay 150ms on hover, 0ms on keyboard.

#### 8.4.4 Context menus

Same `.lm-Menu` component; the only deltas are min-width 180px and composition, which is declarative:

```json
{
  "@jupyterlab/filebrowser-extension:browser": {
    "jupyter.lab.context-menu": [
      {
        "command": "filebrowser:open",
        "selector": ".jp-DirListing-item[data-isdir='false']",
        "rank": 1
      },
      {
        "type": "separator",
        "selector": ".jp-DirListing-item",
        "rank": 50
      }
    ]
  }
}
```

Ranks and separators move through `overrides.json` per §7.6. Zero DOM manipulation.

#### 8.4.5 Escape hatch — if CSS is not enough

If the spec requires markup Lumino does not emit (badges on items, two-line items, inline descriptions), the path is a custom `Menu.IRenderer`. JupyterLab already does this — `@jupyterlab/ui-components` ships `MenuSvg` / `ContextMenuSvg`, which replace the default renderer to support `LabIcon` SVGs in the icon column. Subclassing that renderer and applying it to menus at construction is the sanctioned mechanism, not a hack.

**Scoped as contingency, not baseline.** Decision point at P2 exit alongside the Q3 launcher call. Baseline assumption is that CSS reaches the spec; the four-column grid is the only thing likely to force the escalation.

#### 8.4.6 Menu-specific acceptance criteria

| # | Criterion |
|---|---|
| M1 | Every `:hover` rule in the menu stylesheet has a matching `.lm-mod-active` rule — CI-linted |
| M2 | Keyboard-only traversal of every top-level menu and every submenu shows a visible indicator at all times |
| M3 | Mnemonic underlines render on `Alt` and are never suppressed by the redesign |
| M4 | Column alignment holds across items with: icon only, shortcut only, both, neither, submenu |
| M5 | Toggled state is distinguishable without color (A7) |
| M6 | A menu longer than the viewport scrolls without clipping the last item or the elevation edge |
| M7 | Submenus flip correctly at all four viewport edges at 1280×720 |
| M8 | Menus render correctly in both modes when opened from the menu bar, the context menu, and the overflow trigger |

### 8.5 Status bar & bottom dock

#### 8.5.1 Why the status bar is T3, not T2

`IStatusBar.registerStatusItem(id, { item, align, rank, isActive, activeStateChanged })` places a widget into one of three groups and orders it by rank. That is the entire API surface. It cannot:

- enforce a consistent item shape (each item owns its own markup)
- provide separators, overflow, or grouping
- restyle a third-party item's internals
- distinguish a passive readout from an interactive control

The spec calls for all four. So we disable `@jupyterlab/statusbar-extension:plugin` and provide our own plugin that **supplies the same `IStatusBar` token** — every existing registration, ours and third-party, keeps working unchanged. The interface is small enough that this is a low-risk replacement, and it is the difference between a status bar we style and a status bar we own.

#### 8.5.2 Status bar spec

| Property | Spec |
|---|---|
| Height | 24px default / 22px compact (`--jp-statusbar-height`) |
| Background | `color.surface.raised` |
| Border | `1px color.border.subtle` top only |
| Typography | `font.family.ui`, `font.size.ui.xs` (11px), `color.text.secondary` |
| Numerics | `font.family.mono`, tabular figures — line·col must not reflow as digits change |
| Item padding | `space.2` horizontal |
| Item gap | 0; separators are 1px `color.border.faint`, `space.1` inset vertically |
| Interactive item (rest) | `color.text.secondary`, no background |
| Interactive item (hover) | `color.surface.hover`, `color.text.primary`, `cursor: pointer` |
| Passive readout | `color.text.muted`, `cursor: default`, no hover response |
| Focus | `2px color.action.focus` inset ring |
| Overflow | Items collapse right-to-left below 1024px into a `⋯` trigger |

**Item shape is enforced by the wrapper**, not by the item: our `IStatusBar` implementation wraps every registered widget in a container that applies padding, height, separator, hover, and focus. Third-party items inherit the shape for free; only their inner content needs `compat-shim` attention.

**Status indicator semantics — never color-only (A7):**

| State | Indicator |
|---|---|
| Kernel idle | Hollow dot + "Idle" |
| Kernel busy | Filled dot, pulse (suppressed under `prefers-reduced-motion`) + "Busy" |
| Kernel disconnected | Warning glyph + "Disconnected", `color.warning.default` |
| Kernel dead | Error glyph + "No Kernel", `color.danger.default` |
| Notebook untrusted | Shield glyph + label, `color.warning.default` |
| Notifications pending | Bell glyph + count badge |

**Hover popovers** (`.jp-StatusBar-HoverItem`) — kernel picker, running-sessions list — use the `.lm-Menu` surface tokens from §8.4.3 so they match menus rather than inventing a third overlay style.

#### 8.5.3 Bottom dock area (`'down'`)

JupyterLab 4 exposes a bottom dock area alongside left/right/main. Core ships it essentially unstyled because core barely uses it. It is the natural home for the log console and a debug console, and it is net-new design work — there is nothing to restyle.

| Property | Spec |
|---|---|
| Default height | 240px, user-resizable, persisted in layout state |
| Collapsed | Tab bar only (32px), click a tab to restore |
| Tab bar | Same `.lm-TabBar` spec as the main dock, bottom-anchored: active indicator on the **top** edge |
| Resize handle | 8px hit area / 1px `color.border.subtle` visual, `row-resize` cursor |
| Background | `color.surface.raised` |
| Border | `1px color.border.subtle` top |
| Empty state | Hidden entirely — never render an empty bottom bar |

**Log console** (`.jp-LogConsole`) needs level tokens that do not currently exist in the design system — flag for Design in P0 alongside Q1/Q2:

| Level | Token |
|---|---|
| Critical | `color.danger.strong` |
| Error | `color.danger.default` |
| Warning | `color.warning.default` |
| Info | `color.info.default` |
| Debug | `color.text.muted` |

Level renders as a badge, not tinted body text — tinted log text at 11px fails A1 for the muted levels.

### 8.6 Debug panel

The debugger is five stacked sections in one sidebar panel, and it is the most information-dense surface in the application. Three of its parts are not plain CSS.

#### 8.6.1 Panel shell

| Property | Spec |
|---|---|
| Section header | 28px, `font.size.ui.xs` uppercase, `letter-spacing: 0.04em`, `color.text.secondary`, sticky |
| Section chevron | 12px, rotates 90° on expand, 120ms (suppressed under reduced-motion) |
| Section body | `color.surface.canvas`, max-height proportional, independent scroll |
| Section toolbar | Ghost icon buttons at 24px per §8.1 toolbar variant, right-aligned in the header |
| Section divider | 1px `color.border.subtle` |
| Disabled state | When debugging is off, sections render the empty state — not blank bodies |

**Global debug controls** (continue, terminate, step over, step in, step out) sit in a dedicated toolbar row above the sections: 28px icon buttons, `space.1` gap, disabled at 40% opacity when no session is active.

#### 8.6.2 Variables — two views, two treatments

The variables section toggles between a **tree** and a **grid**. They are different technologies and the first draft of this document got that wrong.

**Tree view (T2):**

| Property | Spec |
|---|---|
| Row height | 22px |
| Indent per level | 16px, with a 1px `color.border.faint` guide line |
| Expand chevron | 12px, `color.text.muted` |
| Name | `font.family.mono`, `color.text.primary` |
| Type badge | `font.size.ui.xs`, `color.text.muted`, `color.surface.sunken` chip, `radius.sm` |
| Value | `font.family.mono`, `color.text.secondary`, truncated with `title` |
| Value by kind | string `color.syntax.string`, number `color.syntax.number`, bool/None `color.syntax.keyword` — matched to the CM6 `HighlightStyle` so a value looks the same in the editor and the inspector |
| Hover | `color.surface.hover` |
| Selected | `color.surface.selected` |

**Grid view (T4):** Lumino DataGrid. Consumes the shared `buildGridStyle()` factory from §7.9 — the same one the CSV viewer uses.

| `DataGrid.IStyle` field | Token |
|---|---|
| `voidColor` | `color.surface.canvas` |
| `backgroundColor` | `color.surface.canvas` |
| `rowBackgroundColor` (striping) | alternating `color.surface.raised` |
| `gridLineColor` | `color.border.faint` |
| `headerBackgroundColor` | `color.surface.raised` |
| `headerGridLineColor` | `color.border.subtle` |
| `selectionFillColor` | `color.selection.active` |
| `selectionBorderColor` | `color.action.default` |
| `headerSelectionFillColor` | `color.surface.active` |
| `cursorFillColor` | `color.selection.active` |
| `cursorBorderColor` | `color.action.default` |
| `scrollShadow` | mode-specific per §9 |

Text color and font inside DataGrid cells come from the **cell renderer**, not the style object — a `TextRenderer` with `textColor` and `font` bound to tokens is required as well. Styling the grid and forgetting the renderer produces a themed frame around stock-black text, which reads as a bug in dark mode.

#### 8.6.3 Callstack, breakpoints, sources

| Surface | Spec |
|---|---|
| Callstack frame row | 24px, `font.family.mono` for the function name, `color.text.muted` for `file:line`, right-aligned |
| Active frame | `color.surface.selected` + 2px `color.action.default` left bar |
| Breakpoint row | 24px, breakpoint glyph in a fixed 20px leading column, path truncated from the left (`direction: rtl` trick — the filename matters, not the mount point) |
| Breakpoint disabled | Hollow glyph + 50% opacity — glyph shape carries the state, not color alone |
| Sources / kernel sources | File tree matching the file browser row spec; preview pane is a read-only CM6 editor on the §7.5 theme |
| Empty states | "No breakpoints set", "Not paused", "No sources" — designed, not blank |

#### 8.6.4 Editor decorations (T3 — inside the CM6 theme)

Breakpoint markers and the current-execution-line highlight are CodeMirror 6 gutter and decoration extensions. They belong in `packages/editor-theme`, not `ui-overrides`. Putting them in CSS is the mistake that makes them stop working on the next CodeMirror bump.

| Decoration | Spec |
|---|---|
| Breakpoint gutter (rest) | Empty, 16px wide, hover shows a 50%-opacity glyph |
| Breakpoint set | Filled circle, `color.danger.default` |
| Breakpoint disabled | Hollow circle, `color.text.muted` |
| Conditional breakpoint | Filled circle with a notch, `color.warning.default` |
| Current execution line | `color.warning.faint` background, 2px `color.warning.default` left bar |
| Current execution gutter | Arrow glyph, `color.warning.default` |

Contrast gate: the execution-line background must stay ≥ 4.5:1 against every syntax token color in both modes (A4). This is the tightest constraint in the whole editor theme — validate it before the palette locks.

#### 8.6.5 Debug-specific acceptance criteria

| # | Criterion |
|---|---|
| D1 | Both variables views render on token colors; grid and CSV viewer are pixel-identical in chrome |
| D2 | DataGrid **cell text** is themed via the renderer, not just the frame |
| D3 | Breakpoint states are distinguishable by glyph shape alone (A7) |
| D4 | Execution-line highlight passes A4 against all syntax tokens, both modes |
| D5 | Value colors in the variables tree match the CM6 `HighlightStyle` for the same types |
| D6 | Every section has a designed empty state; no blank section bodies |
| D7 | Theme switch mid-debug-session repaints both variables views and all editor decorations |

### 8.7 Terminal

The terminal was already scoped T4 with a runtime bridge in §7.9. This section specifies it, and closes a gap the bridge alone does not: **the ANSI palette is currently defined in two unrelated places.**

#### 8.7.1 The constraint that governs everything else

xterm.js renders the cell grid to **canvas/WebGL**, not DOM. Text inside the terminal viewport is drawn, not styled. There is no CSS override, no `!important`, no `compat-shim` entry that can change a single character's color. Every visual property of the grid — colors, font, size, line height, letter spacing, cursor — comes from the options object or it does not happen.

The boundary is exact and worth internalising, because half the terminal *is* CSS-reachable:

| Reachable via CSS | Reachable only via options |
|---|---|
| `.jp-Terminal` panel padding, border, background behind the grid | All 16 ANSI colors |
| `.xterm-viewport` scrollbar | Foreground, background, cursor, cursor accent |
| Tab bar, toolbar, chrome around the terminal | Selection background / foreground |
| Link hover affordance (partially) | Font family, size, line height, letter spacing |
| | Cursor style and blink |

#### 8.7.2 Single-source ANSI palette — new requirement

ANSI-coloured output appears in **three** places, and users read them as the same thing:

1. The terminal (`ls --color`, `htop`, `pytest`)
2. Notebook cell output from shell commands and `%%bash` (rendermime `.ansi-*-fg` / `.ansi-*-bg`)
3. **IPython tracebacks** — the coloured traceback every user sees on every error is ANSI, rendered through those same rendermime classes

Path 1 is a JavaScript options object. Paths 2 and 3 are hardcoded CSS classes in rendermime. Nothing in the architecture currently forces them to agree, and they will drift the moment two people work on them in different sprints.

**Requirement:** one `ansi` token group in Tier 2, mode-scoped, 16 entries plus fg/bg. It generates:

- the `theme` object pushed to xterm via the §7.9 bridge, from `tokens.ts`
- the 32-selector rendermime override block, from `tokens.css`

Both artifacts are **generated from the same token group**. Neither is hand-written. Hand-editing either one fails CI.

| Token | ANSI | Used by |
|---|---|---|
| `color.ansi.black` / `.brightBlack` | 0 / 8 | xterm `black`/`brightBlack`, `.ansi-black-fg`, `.ansi-black-intense-fg` |
| `color.ansi.red` / `.brightRed` | 1 / 9 | Same pattern — **traceback exception type and error text** |
| `color.ansi.green` / `.brightGreen` | 2 / 10 | Test pass output, diff additions |
| `color.ansi.yellow` / `.brightYellow` | 3 / 11 | Warnings, traceback line numbers |
| `color.ansi.blue` / `.brightBlue` | 4 / 12 | Directories in `ls`, traceback file paths |
| `color.ansi.magenta` / `.brightMagenta` | 5 / 13 | |
| `color.ansi.cyan` / `.brightCyan` | 6 / 14 | Traceback caret and context lines |
| `color.ansi.white` / `.brightWhite` | 7 / 15 | |

**Design constraint that catches people out:** ANSI "black" and "white" are not background and foreground. In light mode, ANSI black must remain *dark* and ANSI white must remain *light* — a naive dark-mode inversion makes `ls` output invisible against the terminal background. Both modes need their own 16 values authored deliberately, not derived by flipping one set.

**Contrast:** every one of the 16 must pass 4.5:1 against the terminal background *and* against the notebook output background in its own mode. Those two backgrounds are not the same colour, so the palette is gated on the tighter of the two. This joins the automated audit in §10.2.

#### 8.7.3 Terminal options spec

| Option | Value | Note |
|---|---|---|
| `fontFamily` | `font.family.mono` | Must have a true fixed advance — xterm measures one glyph and grids the rest. A fallback with a variable advance shears the whole screen. |
| `fontSize` | 13px default / 12px compact | |
| `lineHeight` | 1.35 | Below ~1.2 the box-drawing characters in TUI apps (`htop`, `vim`) leave gaps |
| `letterSpacing` | 0 | Non-zero breaks box-drawing alignment |
| `cursorStyle` | `bar` (design system convention) | |
| `cursorBlink` | **`false` when `prefers-reduced-motion: reduce`** | A blinking cursor is motion; the bridge reads the media query and pushes the value |
| `cursorInactiveStyle` | `outline` | Distinguishes focused from unfocused terminals |
| `theme.selectionBackground` | `color.selection.active` | |
| `theme.selectionForeground` | **unset** | Leaving it unset preserves each cell's own colour under selection — overriding it flattens syntax-coloured output to one colour while selected |
| `minimumContrastRatio` | **1 (off)** | See below |
| `scrollback` | 10000 | |
| `allowTransparency` | `false` | Transparent backgrounds cost a compositing pass per frame |
| `screenReaderMode` | User setting, not forced | Changes rendering; exposed in settings, defaulted off |

**On `minimumContrastRatio`:** xterm.js can auto-adjust foreground colours to hit a contrast floor. Setting it to 4.5 would guarantee A1 compliance — and silently distort every colour in the designed palette, differently on every background. The call: **design the 16 values to pass, verify them in the automated audit, and leave the option off.** A palette that needs runtime rescuing is a palette that was not finished. Revisit only if the audit cannot be satisfied by design.

#### 8.7.4 Bridge behaviour

The §7.9 bridge must fire on all four of these, not just the first:

1. `themeManager.themeChanged` — existing terminals repaint
2. `tracker.widgetAdded` — terminals opened *after* a theme switch get the current palette
3. Density toggle — font size and line height change with density
4. `matchMedia('(prefers-reduced-motion)')` change — cursor blink follows live

**Failure mode this prevents:** switch to dark, then open a new terminal. Without (2), the new terminal renders with whatever the plugin's default was. It is the most commonly shipped bug in this class of work and it only appears in the specific order theme-then-open, which is why manual QA scenario 5 tests exactly that sequence.

#### 8.7.5 Settings conflict

`@jupyterlab/terminal-extension:plugin` exposes a `theme` setting with values `inherit` / `light` / `dark`. `inherit` derives terminal colours from JupyterLab's layout variables — which means core will push its own theme object on theme change, competing with ours. Last writer wins, and which one that is depends on signal connection order. That is a race, not a design.

Resolution: ship `theme: 'inherit'` in `overrides.json` so the setting is stable and predictable, and have our bridge connect to `themeChanged` and apply **after** core, overwriting the inherited object with the full 16-colour palette. Verified by an explicit test that switches themes twenty times and asserts the final palette is ours.

The alternative — disabling the core terminal plugin and replacing it (T3) — is the fallback if the ordering proves unstable across JupyterLab minors. Decision at P3 exit.

#### 8.7.6 Terminal acceptance criteria

| # | Criterion |
|---|---|
| T1 | The xterm theme object and the rendermime ANSI CSS are both generated from one token group; neither is hand-edited (CI-enforced) |
| T2 | `ls --color=always` renders identically in a terminal and in a notebook cell, both modes |
| T3 | An IPython traceback is fully legible in both modes and passes 4.5:1 on every ANSI colour used |
| T4 | All 16 ANSI colours pass 4.5:1 against **both** the terminal background and the notebook output background |
| T5 | `htop` and `vim` render with no gaps or shear in box-drawing characters |
| T6 | A terminal opened *after* a theme switch has the correct palette |
| T7 | Cursor blink is off under `prefers-reduced-motion` |
| T8 | Twenty consecutive theme switches leave our palette applied, not core's inherited one |
| T9 | `.xterm-viewport` scrollbar matches the application scrollbar spec |
| T10 | Terminal panel padding does not break `FitAddon` sizing at any viewport width |

### 8.8 Search & filter inputs

JupyterLab has **six** search inputs, built by five different teams over eight years, sharing no component. A design system with one search component makes this a consolidation job, not six styling jobs.

| Mount point | Selector | Affordances needed |
|---|---|---|
| File browser filter | `.jp-FilterBox` | Input, clear |
| Document search & replace | `.jp-DocumentSearch-overlay` | Input, replace input, match count, prev/next, filter toggles, close |
| Command palette | `.lm-CommandPalette-search` | Input, no chrome — the palette owns the surface |
| Settings editor search | Settings shell | Input, clear |
| Extension manager search | Extension panel | Input, clear, category filter |
| Panel filters (where present) | Panel-local | Input, clear |

**One component, six configurations.** Spec the base and gate each mount on which affordances it turns on.

#### 8.8.1 Base input

| Property | Spec |
|---|---|
| Height | 28px default / 24px compact |
| Background | `color.surface.sunken` |
| Border | `1px color.border.default`; `color.action.default` on focus |
| Radius | `radius.md` |
| Leading icon | 16px search glyph, `color.text.muted`, `space.2` inset |
| Text | `font.family.ui`, `font.size.ui.sm`, `color.text.primary` |
| Placeholder | `color.text.muted` — never below 4.5:1, placeholders are text |
| Clear affordance | 16px, appears only when non-empty, `Escape` also clears |
| Focus | `2px color.action.focus` ring, `1px` offset |
| Invalid (bad regex) | `color.danger.default` border + inline message, not a tooltip |

#### 8.8.2 Document search overlay

The densest of the six and the one users hit most (`Ctrl/Cmd-F`). Floats over content, top-right of the document.

| Element | Spec |
|---|---|
| Overlay surface | `color.surface.overlay`, `radius.md`, `elevation.3`, `1px color.border.subtle` |
| Position | Top-right, `space.3` inset; must not occlude the first cell's content |
| Match count | `font.family.mono`, tabular figures, `color.text.muted`, format `3/24`, `0/0` when empty |
| No matches | Input border `color.warning.default`, count reads `0/0` — colour is not the only signal |
| Prev / next | 24px ghost icon buttons, disabled at 0 matches |
| Filter toggles | `Aa` (case), `\b` (whole word), `.*` (regex) — **toggle buttons with a persistent on-state**, `color.surface.active` + `color.text.primary`, not opacity shifts |
| Replace row | Collapsed by default; disclosure chevron on the left rail; expanding must not reflow the document |
| Replace buttons | "Replace" / "Replace All" — secondary and danger-adjacent respectively |
| Notebook-only filters | Search cell outputs, search in selection — checkbox rows below the input |
| Close | 20px, top-right; `Escape` closes and returns focus to the document |

**Match highlighting** is in the editor, not the overlay — it lives in the CM6 theme (§7.5) and maps to `--jp-search-*`:

| State | Token |
|---|---|
| Unselected match | `color.warning.faint` background, text keeps its syntax colour |
| Selected (current) match | `color.warning.default` background, `color.text.on-warning` |
| Match in a scrolled-out cell | Scrollbar tick mark, `color.warning.default` |

Contrast gate: the selected-match background must hold 4.5:1 against every syntax token, both modes. Same constraint class as the debugger execution line (D4) — the two should be validated together, and if the palette only supports one warning-tinted highlight, they should share it.

#### 8.8.3 Search acceptance criteria

| # | Criterion |
|---|---|
| S1 | All six mounts render the same component; zero bespoke search styling |
| S2 | Filter toggle on-state is distinguishable without colour (A7) |
| S3 | Selected-match highlight passes 4.5:1 against all syntax tokens, both modes |
| S4 | `Escape` clears then closes; focus returns to the document |
| S5 | Expanding the replace row does not reflow document content |
| S6 | Overlay does not occlude the first cell at any viewport width |

### 8.9 Brand identity slots

Four brand surfaces, three delivery mechanisms, and one of them is not reachable from a labextension at all.

| Slot | Mechanism | Notes |
|---|---|---|
| Top panel logo | Widget added to the `'top'` area at rank 0 | Does not exist in stock JupyterLab — net-new |
| Splash screen | `ISplashScreen` token replacement (T3) | Already scoped §6.1 |
| About dialog | Command override on `help:about` | Contains the Jupyter mark and version string |
| **Favicon** | **Server-side** — static assets / page template | **Not overridable from a labextension.** See below. |

#### 8.9.1 Logo — one SVG beats two bitmaps

If the design system supplies separate light and dark logo files, the recommendation is to **replace both with a single SVG using `currentColor`** for any monochrome portion, and CSS-variable-driven fills for any brand-coloured portion.

| Approach | Cost |
|---|---|
| Two PNGs, swapped on `themeChanged` | Two assets, swap logic, a flash during switch, and it is raster — soft on HiDPI and at any size other than the one exported |
| One SVG, `currentColor` + tokens | One asset, zero swap logic, no flash, sharp at every DPI, and it inherits the mode automatically because the mode scope is on `<body>` |

If the mark has fixed brand colours that must not shift between modes, those stay as literal values inside the SVG and only the wordmark or lockup text uses `currentColor`. That is the one sanctioned exception to the "no literal colours in SVG" rule in §7.8.4, and it must be commented in the asset.

**Top panel logo spec:** 20px height, `space.3` left inset, vertically centred, `aria-label` with the product name, click target only if it does something (a decorative logo must not be focusable).

#### 8.9.2 Favicon is a server-side asset

The browser tab icon is served by the Jupyter **server** from its static assets and referenced by the page template. A frontend labextension cannot change it. Delivery is one of:

1. Overwrite the static asset in the Docker image at build time
2. A `jupyter_server_config` template override pointing at custom assets
3. Accept the stock Jupyter favicon

Recommendation: option 1, since §7.10 already ships a Docker image. If the deployment also uses busy/idle favicon swapping, **both** state variants need assets or the busy state falls back to stock and the tab flickers between two brands.

**SVG favicon note:** if serving an SVG favicon, it can carry an internal `@media (prefers-color-scheme: dark)` block and adapt to the *browser chrome* — which is a different setting than the JupyterLab theme. Design for the case where a user runs the light JupyterLab theme in a dark OS.

#### 8.9.3 Brand acceptance criteria

| # | Criterion |
|---|---|
| B1 | Logo renders correctly in both modes with no swap flash |
| B2 | Logo is sharp at 1×, 2×, and 3× DPI |
| B3 | Favicon delivery decided and implemented; no stock Jupyter mark in the tab |
| B4 | About dialog reflects the product, not stock JupyterLab |
| B5 | Splash screen and top panel logo use the same mark and lockup |
| B6 | Any fixed brand colour in an SVG is commented as a deliberate exception to §7.8.4 |

### 8.10 Table of contents panel

Present in the inventory since the first draft as a single row. It needs a spec because it contains a problem none of the other panels have: **six levels of hierarchy in a ~200px column**, where the design system's heading ramp assumes a page.

#### 8.10.1 The depth ramp — the actual design problem

Markdown headings go `h1`–`h6`. A sidebar at `--jp-sidebar-min-width` cannot carry six distinguishable type sizes. Four approaches, one recommendation:

| Approach | Verdict |
|---|---|
| Six-step size ramp | Fails. By `h4` you are at 9px, and `h5`/`h6` are indistinguishable. |
| Six-step indent only | Fails. 6 × 16px = 96px of indent — half the panel width is empty by level 4. |
| Six-step colour ramp | Fails A1. Levels 5–6 land below 4.5:1 on any usable scale. |
| **Indent + weight, capped size ramp** | **Recommended.** |

**Recommended ramp:**

| Level | Size | Weight | Indent | Colour |
|---|---|---|---|---|
| h1 | `font.size.ui.sm` | 600 | 0 | `color.text.primary` |
| h2 | `font.size.ui.sm` | 500 | 12px | `color.text.primary` |
| h3 | `font.size.ui.sm` | 400 | 24px | `color.text.primary` |
| h4 | `font.size.ui.xs` | 400 | 36px | `color.text.secondary` |
| h5 | `font.size.ui.xs` | 400 | 44px | `color.text.secondary` |
| h6 | `font.size.ui.xs` | 400 | 52px | `color.text.secondary` |

Two sizes, three weights, decaying indent steps (12 → 12 → 12 → 8 → 8). Indent guides at 1px `color.border.faint` carry the structure that the type ramp stops carrying past level 3.

#### 8.10.2 Item row

| Property | Spec |
|---|---|
| Row height | 24px single-line / auto when wrapped |
| Collapser | 16px chevron in a fixed leading column; **column reserved even on leaf rows** so text left-edges align within a level |
| Numbering | Optional (user setting). `font.family.mono`, tabular figures, `color.text.muted`, fixed 32px column, right-aligned — `1.10.2` must not shift `1.9.1` |
| Text | Single line, `text-overflow: ellipsis`, full text in `title` |
| Hover | `color.surface.hover` |
| Active heading | `color.surface.selected` + 2px `color.action.default` left bar, full row bleed |
| Focus | `2px color.action.focus` inset ring |
| Code-cell entries | When "show code cells" is on: `font.family.mono`, `font.size.ui.xs`, `color.text.muted`, first line only |

**On truncation:** single-line with ellipsis, not a two-line clamp. A TOC is scanned, not read — variable row heights destroy the vertical rhythm that makes scanning work, and long headings are a document problem, not a panel problem.

#### 8.10.3 Inline heading content — the ragged-row trap

Markdown headings legitimately contain inline code, links, emphasis, and **rendered math**. The TOC renders that markup. Left alone, a heading containing `` `df.groupby()` `` gets a code background and mono metrics, a heading with `$\alpha$` gets a MathJax/KaTeX block with its own line-height, and the panel becomes visibly ragged.

Requirement — inside `.jp-tocItem`, all inline content is neutralised to inherit the row:

| Element | Treatment |
|---|---|
| `code` | Inherit row size and colour; no background, no border, no padding. `font.family.mono` retained. |
| `a` | Inherit colour; no underline. The whole row is already a navigation target — a link inside a link is a keyboard trap. |
| `strong` / `em` | Inherit weight from the depth ramp; ignore the markup |
| Rendered math | `font-size: inherit`, `line-height: 1`, `vertical-align: middle`, `display: inline` — never allowed to set the row height |
| `img` | `max-height: 1em` or hidden entirely |

#### 8.10.4 Header, toolbar, and states

| Element | Spec |
|---|---|
| Panel header | Standard sidebar header per §6.1 |
| Toolbar | Ghost 24px icon buttons: numbering toggle, settings popover |
| Settings popover | Uses the `.lm-Menu` surface tokens from §8.4.3 — checkbox rows for show-code-cells, show-markdown, show-output, sync-collapse |
| Toggle on-state | `color.surface.active` + `color.text.primary`, plus the glyph state — never opacity alone |
| Empty state | "No headings in this document" + one-line hint. This fires constantly on code-only notebooks; it is a high-traffic empty state, not an edge case. |
| Unsupported document | "Outline not available for this file type" |
| Loading | No spinner — TOC generation is synchronous and fast; a spinner that flashes for 30ms is worse than nothing |

#### 8.10.5 Collapse sync

The TOC collapser and the notebook's heading collapser control the same state in two places. They must **look** like the same control: identical chevron glyph, identical rotation direction, identical animation duration. A user who collapses in one and sees a different affordance in the other reads them as unrelated features.

#### 8.10.6 TOC acceptance criteria

| # | Criterion |
|---|---|
| TC1 | All six heading levels are visually distinguishable at 200px panel width |
| TC2 | Levels 4–6 pass 4.5:1 (A1) — this is where a colour-decay ramp fails |
| TC3 | Inline code, links, emphasis, and rendered math do not alter row height or alignment |
| TC4 | Numbering column does not shift horizontally as digit counts change |
| TC5 | Active-heading indicator tracks scroll position and is distinguishable from hover |
| TC6 | Collapse affordance is identical in the TOC and in the notebook |
| TC7 | Tree semantics: `role="tree"`/`treeitem`, `aria-level`, `aria-expanded`, full keyboard traversal |
| TC8 | Empty state renders on a code-only notebook and reads as intentional |

### 8.11 Launcher

Referenced four times in this document — T3 in the inventory, in the disabled-plugins list (§7.10), in the P2 phase scope, and as open question Q3 — without a spec. It is also the first thing a user sees on every session.

#### 8.11.1 Why T3, and why it is the same argument as the status bar

`ILauncher.add({ command, args, category, rank, kernelIconUrl, metadata })` registers an item into a named category at a rank. That is the whole API. It cannot control card geometry, section ordering beyond rank, grouping semantics, or add anything the original authors did not anticipate — search, pinning, recency, a visible launch target.

Same resolution as §8.5.1: disable `@jupyterlab/launcher-extension:plugin`, provide our own plugin **supplying the same `ILauncher` token**, so every third-party registration keeps working untouched while we own the presentation. Two T3 replacements, one pattern — if a third surface needs it, the pattern is established and the cost is known.

#### 8.11.2 Layout

| Element | Spec |
|---|---|
| Container | `color.surface.canvas`, `space.6` padding, max content width 1120px, centred |
| Section header | `font.size.ui.sm`, weight 600, `color.text.primary`, `space.4` top margin |
| Section subtitle | `font.size.ui.xs`, `color.text.muted`, optional |
| Section order | Notebook → Console → Other. Fixed by us, not by third-party rank bidding. |
| Card grid | `repeat(auto-fill, minmax(160px, 1fr))`, `space.3` gap |
| Responsive | ≥1024px: 5–6 columns. 768–1023px: 3–4. <768px: 2. Never a single column — a one-column launcher reads as a list, and the card affordance stops earning its space. |
| Overflow | Page scrolls; sections do not scroll independently |

**Card:**

| Property | Spec |
|---|---|
| Size | 160×112px, `radius.md` |
| Background | `color.surface.raised` |
| Border | `1px color.border.subtle` |
| Hover | `color.surface.hover`, border `color.border.default`, 1px lift via `elevation.1` |
| Active | `color.surface.active`, no lift |
| Focus | `2px color.action.focus` ring, `2px` offset |
| Icon | 32px, centred, `space.3` above the label |
| Label | `font.size.ui.sm`, `color.text.primary`, centred, 2-line clamp with ellipsis, full text in `title` |
| Motion | 120ms on background and border only. **Never animate transform on a grid this size** — a hover lift on 20 cards is 20 composited layers. |

#### 8.11.3 The kernel logo collision — the finding that matters here

Launcher cards carry two different kinds of icon in the same grid:

| Card type | Icon source | Format | Theme-aware? |
|---|---|---|---|
| Kernel cards (Python, R, Julia, custom) | `kernelIconUrl` → kernelspec resource, served by the **Jupyter server** | Raster PNG (or an SVG the server serves verbatim) | **No** |
| Everything else (terminal, text, markdown, help) | `LabIcon` from the registry | Vector, `currentColor` | Yes |

They sit side by side, at the same size, in the same row. So the launcher is the one surface where the §7.8.2 kernel-logo constraint is **visible as an inconsistency** rather than an abstraction:

- A PNG kernel logo exported on white shows a halo against a dark card. Every other icon in the grid does not.
- The PNG is soft at 2×/3× DPI. Every other icon in the grid is sharp.
- The PNG keeps its own palette across a theme switch. Every other icon follows the mode.

**This makes Q9 a launcher decision, not an icon-system decision.** Re-pointed accordingly. The three options from §7.8.2 evaluated specifically here:

| Option | Launcher outcome |
|---|---|
| Leave stock | Mixed grid. Acceptable *only* if the cards are designed to accommodate it — see mitigation below. |
| Replace assets in the Docker image | Consistent grid; breaks for kernels installed after image build |
| Server extension intercepting kernelspec resources | Consistent grid always; adds a server component to a frontend project |

**Mitigation if we leave stock (recommended default):** give kernel icons a fixed-size neutral plate — a `color.surface.sunken` rounded square behind the logo — so the halo problem disappears and the raster/vector difference reads as a deliberate distinction between "a language" and "an action" rather than as inconsistency. This costs nothing, works with any kernel installed at any time, and sidesteps the trademark question entirely. It is the cheapest good answer and it should be the default position going into Q9.

#### 8.11.4 Launch target context — net-new

Stock JupyterLab launches everything into the file browser's current directory, and **shows this nowhere**. Users create notebooks in the wrong place constantly and only find out later.

| Element | Spec |
|---|---|
| Placement | Above the first section header |
| Content | `font.size.ui.xs`, `color.text.muted`, format: `New files will be created in <path>` |
| Path | `font.family.mono`, `color.text.secondary`, truncated from the left — the leaf directory is what matters |
| Root case | Reads "in the root directory", not an empty path |

**Scope note:** this is the one net-new *feature* in the launcher spec, and §3.2 lists "a new information architecture" as a non-goal. A one-line context readout is a clarity fix, not an IA change, and it is in scope. **Recency, pinning, and favourites are not** — they are features, they belong in a product backlog, and they should be explicitly declined here so they do not arrive as "while we're in there."

#### 8.11.5 States

| State | Treatment |
|---|---|
| No kernels available | Not an empty state — an **error** state. `color.warning.default` glyph, "No kernels found", one-line remediation hint, link to the docs. This means the environment is broken and the user cannot work. |
| Kernel discovery failed | Same treatment, different copy; include the server error if available |
| Many kernels (>12) | Section stays a grid and the page scrolls. Add the §8.8 search component above the grid **only** if the P0 audit shows deployments routinely exceeding 12 kernels — otherwise it is chrome for a case that does not occur. |
| Third-party items | Land in "Other". Cards are rendered by our shell, so they inherit card geometry for free; only their icons need `compat-shim` attention. |
| Slow kernel discovery | Skeleton cards, not a spinner — the grid shape is known before the data arrives |

#### 8.11.6 Launcher acceptance criteria

| # | Criterion |
|---|---|
| L1 | `ILauncher` is re-provided; all third-party launcher registrations render without modification |
| L2 | Kernel cards and `LabIcon` cards are visually reconciled per the Q9 decision |
| L3 | No PNG halo visible on any kernel card in dark mode |
| L4 | Section order is fixed by us and not reorderable by third-party rank |
| L5 | Launch target directory is visible before the user clicks anything |
| L6 | "No kernels" renders as an error state, not an empty one |
| L7 | Grid reflows correctly at 768px and 1024px with no single-column fallback |
| L8 | Card labels clamp at 2 lines; no card grows taller than its neighbours |
| L9 | Full keyboard traversal of the grid with a visible focus ring; `Enter` launches |

---

## 9. Accessibility requirements

Hard gates. Failing any of these blocks the phase exit.

| # | Requirement | Verification |
|---|---|---|
| A1 | Body text ≥ 4.5:1 against its background, both modes | Automated (§10.2) |
| A2 | Large text (≥18.66px or ≥14px bold) ≥ 3:1 | Automated |
| A3 | UI component boundaries and state indicators ≥ 3:1 | Automated |
| A4 | Syntax highlighting tokens ≥ 4.5:1 against editor background, both modes | Automated — **this is where most dark themes fail** |
| A5 | Visible focus indicator on every focusable element, ≥ 3:1 against adjacent colors | Manual keyboard sweep |
| A6 | Focus indicator never removed — `:focus-visible` only, never bare `outline: none` | CI lint |
| A7 | Color is never the sole information carrier (cell state, diff, validation) | Design review |
| A8 | `prefers-reduced-motion: reduce` disables all non-essential animation | Automated + manual |
| A9 | `prefers-contrast: more` raises border and text contrast one step | Manual |
| A10 | All icon-only controls have `aria-label` | Automated (axe) |
| A11 | Full keyboard reachability of all owned surfaces; no keyboard traps outside modals | Manual |
| A12 | 200% browser zoom without loss of content or horizontal scroll at 1280px | Manual |
| A13 | Screen reader pass: NVDA/Firefox, VoiceOver/Safari — landmark, name, role, state on all owned components | Manual, signed off by A11y |

**Dark mode note:** `elevation` in dark mode must be expressed as **surface lightness increase**, not shadow opacity. Shadows are near-invisible on dark backgrounds; a shadow-only elevation system produces a flat, unreadable dark UI. This is a design-system input requirement (§5.1), not an engineering workaround.

---

## 10. Testing & QA

### 10.1 Visual regression — Galata

JupyterLab ships `@jupyterlab/galata`, a Playwright-based harness with JupyterLab-aware fixtures and snapshot comparison. This is the backbone of the test strategy.

- **Snapshot matrix:** every surface in §6 × {light, dark} × {default, compact density}. Estimated ~180 snapshots.
- Snapshots regenerate on token change and require explicit human approval in the PR.
- Threshold: 0.2% pixel diff. Font rendering forced deterministic via a pinned container image.
- Runs on every PR and nightly against JupyterLab `latest`.

### 10.2 Automated contrast audit

Custom job: parse `tokens.json`, compute every foreground/background pairing declared in the mapping table, assert WCAG ratios. Runs pre-merge on token changes. **Catches contrast failures before a single line of CSS is written** — the cheapest possible place to catch them.

Supplemented by `axe-core` injected into Galata runs for DOM-level checks (labels, roles, landmarks).

### 10.3 Selector integrity

Boot each supported JupyterLab version, assert every selector in `selectors.json` matches ≥1 element. Fails loudly on upstream markup changes rather than silently rendering wrong.

### 10.4 Third-party extension compatibility matrix

| Extension | Priority | Treatment |
|---|---|---|
| `jupyterlab-git` | P0 | Full compat CSS in `compat-shim` |
| `jupyterlab-lsp` | P0 | Full compat CSS |
| `jupyterlab_widgets` (ipywidgets) | P0 | Token mapping + CSS |
| `jupyterlab-execute-time` | P1 | Token mapping |
| `jupyterlab-variableinspector` | P1 | Compat CSS |
| `jupytext` | P1 | Token mapping |
| `jupyterlab-drawio` / diagram tools | P2 | Best-effort |
| `dask-labextension` | P2 | Best-effort |
| Long tail | P3 | Documented "may not match" + contribution guide |

P0 and P1 get dedicated Galata snapshots in both modes.

### 10.5 Performance budget

| Metric | Budget | Method |
|---|---|---|
| Added time-to-interactive vs. stock JupyterLab | ≤ 200ms | Playwright trace, 20-run median |
| Theme switch (attribute swap → paint complete) | ≤ 100ms | `performance.mark` around the switch |
| Total shipped CSS (gzipped) | ≤ 120KB | Bundle analyzer, CI gate |
| Notebook scroll with 200 rendered cells | ≥ 55fps | Playwright tracing |
| Memory delta vs. stock | ≤ 15MB | Heap snapshot |

Anything that makes a daily driver's environment slower is a regression, no matter how good it looks.

### 10.6 Manual QA scenarios

Executed per phase, both modes:

1. Cold start → launcher → new notebook → run cells → view output → save
2. Open 8 tabs, split the dock 4 ways, drag panels between areas
3. Open Settings → change 5 settings across 3 plugins → switch to JSON view → save
4. Open terminal → run `ls --color=always`, `htop`, `vim` → verify all 16 ANSI colors
5. Switch theme mid-session with terminal + CSV viewer + ipywidget open → verify **all** repaint
6. Kill kernel mid-execution → verify error output, status bar, and dialog states
7. Open a 5MB CSV, a 2000-cell notebook, a 10k-line Python file
8. Keyboard-only: reach every command without touching the mouse
9. Kernel disconnect → verify offline states across chrome

---

## 11. Phasing

| Phase | Scope | Duration | Exit criteria |
|---|---|---|---|
| **P0 — Audit & contract** | Surface inventory verified against target JupyterLab build; `jp-adapter.yaml` mapping drafted and reviewed; design inputs (§5.1) delivered; icon gap analysis | 2 wks | Mapping table signed off by Design + Eng. Icon manifest complete. Zero unmapped `--jp-*` variables. |
| **P1 — Token pipeline & themes** | Style Dictionary build; `tokens/`, `theme-light/`, `theme-dark/`; adapter codegen; CI contrast audit; Galata harness | 3 wks | Both themes install and switch. Contrast audit green. Snapshot baseline captured. |
| **P2 — Chrome & navigation** | Top panel, menus, sidebars, tab bars, status bar (T3), splash (T3), scrollbars, launcher (T3), file browser, command palette | 4 wks | All §6.1–6.2 surfaces at spec, both modes. Galata green. |
| **P3 — Notebook & editor** | Cells, prompts, outputs, ANSI overrides, rendered markdown, CM6 theme + `HighlightStyle`, **breakpoint gutter + execution-line decorations**, terminal bridge (T4), console, **shared DataGrid bridge (T4) — CSV viewer + debugger variables grid** | 5 wks | 11-language syntax validation passes. Terminal + both DataGrids repaint on theme switch. A4 contrast gate green incl. D4. |
| **P4 — Forms, settings, dialogs** | RJSF global CSS pass, targeted field renderers, all form controls, dialogs, toasts, tooltips, completer | 4 wks | Settings editor at spec. Contingency decision made on full settings-editor replacement. |
| **P5 — Icons, motion, density** | ~180 icon overrides, motion tokens, compact density mode, empty/loading/error states | 3 wks | Zero stock icons visible. Density toggle ships. All states designed and implemented. |
| **P6 — Hardening & release** | A11y audit (A1–A13), third-party matrix, perf budget, docs, upgrade playbook, packaging, pilot | 3 wks | All gates green. Pilot cohort ≥ 20 users, 1 week, no P0 bugs. |

**Total: 24 weeks.** Phases 2–5 overlap partially; P3 is the critical path and should be staffed first.

**Recommended staffing:** 2 frontend engineers (1 senior, JupyterLab/Lumino experience strongly preferred), 1 designer at 50%, 1 a11y specialist at 25% concentrated in P0 and P6, 1 QA at 50% from P2.

---

## 12. Acceptance criteria

Ship gate. All must be true.

| # | Criterion |
|---|---|
| AC1 | `pip install acme-jupyterlab-ui && jupyter lab` produces the full redesign with zero manual configuration |
| AC2 | Light and dark both pass the identical Galata suite; neither mode has surfaces the other lacks |
| AC3 | Theme switch repaints **every** surface including terminal, DataGrid, and ipywidgets, in < 100ms, with no FOUC |
| AC4 | Zero hardcoded color, font, spacing, or radius literals in shipped CSS (CI-enforced) |
| AC5 | Every `--jp-*` variable consumed by JupyterLab core has a mapping entry with a written rationale |
| AC6 | Contrast audit passes A1–A4 in both modes with zero exceptions |
| AC7 | Manual a11y audit (A5–A13) signed off by the accessibility owner |
| AC8 | P0 and P1 third-party extensions render correctly in both modes |
| AC9 | Performance budgets in §10.5 met |
| AC10 | Users can still switch to stock themes and install arbitrary extensions |
| AC11 | Upgrade playbook documented and rehearsed against a JupyterLab minor bump |
| AC12 | All 180 icons replaced; zero stock JupyterLab icons visible in any owned surface |
| AC13 | Pilot: ≥ 20 daily users, 1 week, zero P0 bugs, satisfaction ≥ 4.0/5 |

---

## 13. Success metrics (post-launch)

| Metric | Baseline | Target | Window |
|---|---|---|---|
| Design system visual consistency score (audit rubric) | 2.1/10 | ≥ 8.5/10 | Launch |
| Internal `custom.css` patch files in use | 3 | 0 | 90 days |
| Unowned CSS maintenance load | ~0.4 FTE | ≤ 0.1 FTE | 180 days |
| Adoption (opt-in installs before default rollout) | 0 | ≥ 60% | 60 days |
| Theme-related support tickets | ~8/mo | ≤ 2/mo | 90 days |
| a11y open findings on Lab surfaces | unknown/unaudited | 0 P0/P1 | Launch |
| Reported perf regressions | — | 0 | 30 days |

---

## 14. Risks & mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | JupyterLab minor upgrade breaks owned selectors | High | Medium | `selectors.json` integrity job; nightly CI against `latest`; pin `<4.5.0`; documented upgrade playbook with a named owner |
| R2 | Settings editor cannot reach spec through CSS + field renderers | Medium | High | Contingency T3 replacement of `settingeditor-extension:form-ui` scoped in P4; decision point at P4 exit, not at ship |
| R3 | Third-party extensions look broken and users blame the redesign | High | Medium | P0/P1 compat shim; documented "may not match" list; upstream PRs to top offenders; in-product note in the extension manager |
| R4 | Design system has no monospace ramp or compact density scale | High | High | Hard gate in P0 (§5.1). Phase 1 does not start until delivered. |
| R5 | Native `<select>` popups are OS-rendered and cannot be themed | Certain | Low | Accept for low-traffic selects; replace high-traffic ones (kernel picker, cell type) with a custom listbox in `ui-overrides` |
| R6 | Perf regression from CSS weight or excessive custom properties | Low | High | §10.5 budgets gated in CI from P1 onward, not measured at the end |
| R7 | JupyterLite build divergence | Medium | Low | Best-effort; separate CI job; documented as unsupported if it blocks the critical path |
| R8 | Icon override timing — third-party icons register after our plugin | Medium | Low | `MutationObserver` re-apply pass; documented registration hook for internal extensions |
| R9 | Scope creep into notebook output content (matplotlib/Plotly) | Medium | Medium | Explicit non-goal (§3.2); opt-in helper package only |
| R10 | Dark mode elevation reads flat | Medium | Medium | Design system input requirement (§9): dark elevation via surface lightness, not shadow opacity |
| R11 | Power users reject density or chrome changes | Medium | Medium | Ship a compact/comfortable density toggle; pilot cohort weighted toward daily drivers; stock theme remains selectable |
| R12 | Menu keyboard navigation goes invisible because styling targets `:hover` and not `.lm-mod-active` | High | High | CI lint pairing every menu hover rule with its `.lm-mod-active` counterpart (M1); keyboard traversal in manual QA scenario 8 |
| R13 | Menu CSS scoped under a shell selector misses menus entirely — they portal to `document.body` | Medium | Medium | Body-level mode scoping (§5.3); `selectors.json` entries for `.lm-Menu` verified against a menu opened in the integrity job |
| R14 | `terminal:plugin` `theme: 'inherit'` competes with our bridge; winner depends on signal connection order | Medium | Medium | Apply after core on `themeChanged`; T8 test asserts our palette survives 20 switches; T3 plugin replacement as fallback, decided at P3 exit |
| R15 | ANSI palette drifts between the terminal and notebook output because they are set in different technologies | High | High | Single token group generating both artifacts (§8.7.2); T1/T2 acceptance criteria; hand-edits fail CI |
| R16 | Mono font fallback lacks a true fixed advance and shears the terminal grid | Low | High | Bundle the font (§4.2, offline requirement); T5 validates box-drawing in `htop`/`vim` |
| R17 | Kernel logos and favicon are server-side; pursuing them pulls a server component into a frontend-scoped project | Medium | Medium | §7.8.2 / §8.9.2 decisions taken at P0; default is Docker-image asset replacement, not a server extension |
| R18 | Partial menu-icon coverage inherited from core makes a finished redesign look unfinished | High | Low | §7.8.3 decision made once and applied globally; I4 acceptance criterion |

---

## 15. Rollout

**Stage 1 — Internal alpha (P6 week 1).** Design + Eng only. `pip install --pre` from the internal index. Daily bug triage.

**Stage 2 — Pilot (P6 weeks 2–3).** 20–30 volunteers weighted toward daily drivers. In-product feedback command wired to the issue tracker. Exit on AC13.

**Stage 3 — Opt-in GA.** Published to the internal index and documented. Stock JupyterLab remains the base image default. Target ≥ 60% voluntary adoption before Stage 4.

**Stage 4 — Default.** Baked into the base Docker image and the JupyterHub singleuser image. Opt-out documented and supported: `jupyter labextension disable @acme/theme-dark:plugin` etc., or a single `ACME_UI=0` env flag handled in the image entrypoint.

**Version policy:** semver. `jupyterlab>=4.2.0,<4.5.0` pinned. Every JupyterLab minor bump gets its own release branch, a full Galata regeneration, and a selector integrity run before publish.

---

## 16. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| Q1 | Does the design system have a monospace type ramp, or must one be authored? | Design | P0 exit |
| Q2 | Compact density — new scale, or reuse an existing compact variant? | Design | P0 exit |
| Q3 | Launcher confirmed T3 per §8.11.1. Remaining call: does the launch-target readout (§8.11.4) ship in v1? | Design + PM | P1 exit |
| Q4 | How much of the ~180-icon set exists today vs. needs authoring? | Design | P0 exit |
| Q5 | Do we ship the matplotlib/Vega opt-in helper in v1 or defer? | PM | P3 exit |
| Q6 | Which JupyterLab minor is the launch target — pin to current or track latest? | Platform | P0 exit |
| Q7 | Is JupyterLite in scope for v1 or explicitly deferred? | PM | P1 exit |
| Q8 | Do we upstream the a11y contrast fixes to JupyterLab core as a contribution? | Eng Lead | P6 |
| Q9 | Kernel logos — leave stock with the neutral plate (§8.11.3 default), replace in image, or server extension? **Decided at the launcher, where the inconsistency is visible.** | Design + Platform | P0 exit |
| Q10 | Menu icon coverage — all-or-nothing per menu, or high-frequency only? (§7.8.3) | Design | P0 exit |
| Q11 | Favicon delivery route, and does the deployment use busy-state swapping? (§8.9.2) | Platform | P1 exit |
| Q12 | Is the logo delivered as SVG with `currentColor`, or as light/dark bitmaps? (§8.9.1) | Design | P0 exit |

---

## Appendix A — `--jp-*` adapter mapping (excerpt)

This is the contract. Full table lives in `mapping/jp-adapter.yaml`; every row carries a `rationale` field. Excerpt showing the pattern:

### Layout & surfaces

| JupyterLab variable | Design token | Rationale |
|---|---|---|
| `--jp-layout-color0` | `color.surface.canvas` | Deepest surface — notebook and editor background |
| `--jp-layout-color1` | `color.surface.raised` | Panel/toolbar background, one step above canvas |
| `--jp-layout-color2` | `color.surface.sunken` | Inset surfaces — inputs, code cells |
| `--jp-layout-color3` | `color.surface.hover` | Hover state on rows and menu items |
| `--jp-layout-color4` | `color.surface.active` | Pressed/selected state |
| `--jp-inverse-layout-color0`…`4` | `color.surface.inverse.*` | Tooltips, inverted icon fills |

### Text

| JupyterLab variable | Design token |
|---|---|
| `--jp-ui-font-color0` | `color.text.strong` |
| `--jp-ui-font-color1` | `color.text.primary` |
| `--jp-ui-font-color2` | `color.text.secondary` |
| `--jp-ui-font-color3` | `color.text.muted` |
| `--jp-content-font-color0`…`3` | `color.text.*` (content ramp, same semantics) |
| `--jp-content-link-color` | `color.text.link` |
| `--jp-ui-inverse-font-color0`…`3` | `color.text.inverse.*` |

### Borders

| JupyterLab variable | Design token |
|---|---|
| `--jp-border-color0` | `color.border.strong` |
| `--jp-border-color1` | `color.border.default` |
| `--jp-border-color2` | `color.border.subtle` |
| `--jp-border-color3` | `color.border.faint` |
| `--jp-border-width` | `border.width.thin` |
| `--jp-border-radius` | `radius.sm` |

### Intent colors

| JupyterLab variable | Design token |
|---|---|
| `--jp-brand-color0`…`3` | `color.brand.{strong,default,subtle,faint}` |
| `--jp-accent-color0`…`3` | `color.action.{strong,default,subtle,faint}` |
| `--jp-warn-color0`…`3` | `color.warning.*` |
| `--jp-error-color0`…`3` | `color.danger.*` |
| `--jp-success-color0`…`3` | `color.success.*` |
| `--jp-info-color0`…`3` | `color.info.*` |

### Typography

| JupyterLab variable | Design token |
|---|---|
| `--jp-ui-font-family` | `font.family.ui` |
| `--jp-ui-font-size0`…`3` | `font.size.ui.{xs,sm,md,lg}` |
| `--jp-content-font-family` | `font.family.content` |
| `--jp-content-font-size0`…`5` | `font.size.content.*` |
| `--jp-content-line-height` | `font.lineHeight.relaxed` |
| `--jp-code-font-family` | `font.family.mono` |
| `--jp-code-font-size` | `font.size.code` |
| `--jp-code-line-height` | `font.lineHeight.code` |

### Component-scoped

| JupyterLab variable | Design token |
|---|---|
| `--jp-cell-editor-background` | `color.surface.code` |
| `--jp-cell-editor-border-color` | `color.border.subtle` |
| `--jp-cell-editor-active-background` | `color.surface.code` |
| `--jp-cell-editor-active-border-color` | `color.action.default` |
| `--jp-cell-prompt-not-active-font-color` | `color.text.muted` |
| `--jp-cell-inprompt-font-color` | `color.text.secondary` |
| `--jp-cell-outprompt-font-color` | `color.text.muted` |
| `--jp-toolbar-background` | `color.surface.raised` |
| `--jp-toolbar-border-color` | `color.border.subtle` |
| `--jp-toolbar-active-background` | `color.surface.active` |
| `--jp-input-background` | `color.surface.sunken` |
| `--jp-input-border-color` | `color.border.default` |
| `--jp-input-active-border-color` | `color.action.default` |
| `--jp-input-hover-background` | `color.surface.hover` |
| `--jp-dialog-background` | `color.overlay.scrim` |
| `--jp-editor-cursor-color` | `color.action.default` |
| `--jp-editor-selected-background` | `color.selection.inactive` |
| `--jp-editor-selected-focused-background` | `color.selection.active` |
| `--jp-rendermime-error-background` | `color.danger.faint` |
| `--jp-rendermime-table-row-background` | `color.surface.raised` |
| `--jp-rendermime-table-row-hover-background` | `color.surface.hover` |
| `--jp-search-selected-match-background-color` | `color.warning.default` |
| `--jp-search-unselected-match-background-color` | `color.warning.faint` |
| `--jp-scrollbar-thumb-color` | `color.border.strong` |
| `--jp-scrollbar-background-color` | `color.surface.canvas` |
| `--jp-icon-contrast-color0`…`4` | `color.icon.contrast.*` |
| `--jp-elevation-z0`…`z24` | `elevation.{0..8}` (mode-specific, see §9) |

### Excluded from the mapping — do not touch

- Any `--jp-private-*` variable. Not public API; changes without notice between patch releases.
- `--jp-*` variables defined by third-party extensions. Handled in `compat-shim`, not in the adapter.

---

## Appendix B — Surfaces requiring non-token treatment

Reference list. These are the surfaces where "just set the CSS variables" is not an available strategy, and where redesign projects of this type typically discover the gap late.

| Surface | Why tokens don't reach it | Treatment |
|---|---|---|
| ANSI output colors | Hardcoded hex in rendermime `.ansi-*-fg` / `.ansi-*-bg` classes | 32-selector CSS override block |
| xterm.js terminal cell grid | Rendered to canvas/WebGL — text is drawn, not styled. Zero CSS reachability. | Options object + runtime bridge on 4 triggers (§8.7.4) |
| rendermime ANSI + xterm ANSI | Same 16 colours, two technologies, two files | One Tier-2 `ansi` token group generating both (§8.7.2) |
| Lumino DataGrid | `DataGrid.IStyle` is a JS object | Plugin override + runtime bridge |
| Debugger variables **grid** view | Same DataGrid — plus cell text lives in the renderer, not the style object | Shared `buildGridStyle()` + `TextRenderer` |
| Debugger breakpoint gutter & execution line | CodeMirror 6 gutter/decoration extensions | Ships inside `editor-theme`, not CSS |
| Status bar item internals | Each item owns its markup; `IStatusBar` cannot reach inside | T3 replacement supplying the same token, wrapper enforces item shape |
| Splash screen | Inline SVG with baked fills | `ISplashScreen` token replacement |
| Native `<select>` popup | OS-rendered | Custom listbox for high-traffic selects |
| RJSF form field markup | React templates, not JupyterLab CSS classes | Global CSS pass + targeted `fieldRenderer`s |
| Third-party extension CSS | Not ours | `compat-shim` per-extension override files |
| ipywidgets slider / file-upload | Partial variable coverage only | CSS override on top of `--jp-widgets-*` |
| Notebook output content | User-generated | Out of scope; opt-in helper package |

---

## Appendix C — Upgrade playbook (JupyterLab minor bumps)

Run on every `4.x` → `4.x+1`. Owned by the DX on-call.

1. Cut a release branch. Bump the `jupyterlab` pin.
2. Run the selector integrity job. Any failure produces a diff report of broken selectors and the upstream commit that moved them.
3. Run the adapter completeness check — new `--jp-*` variables introduced upstream fail the build until mapped.
4. Regenerate Galata snapshots. Review every diff manually; approve or fix.
5. Run the contrast audit and `axe` sweep.
6. Run the third-party compat matrix (P0 + P1).
7. Run the performance budget suite.
8. Execute manual QA scenarios 1–9 in both modes.
9. Publish. Update the compatibility table in the README.

**Break budget:** ≤ 2 broken selectors per minor. Exceeding it triggers a design review of whether that surface should be promoted from T2 to T3 — a structural CSS override that keeps breaking is a plugin replacement that hasn't happened yet.
