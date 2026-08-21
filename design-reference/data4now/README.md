# Data4Now — JupyterHub + JupyterLab Design System & Integration Guide

This repository is a **complete brand design** for a Data4Now-tenanted
JupyterHub deployment. It is split into two layers that ship and theme
differently:

| Layer | What it is | How it's delivered |
|---|---|---|
| **JupyterHub** | The multi-user *hub*: login, spawner, control panels, admin | Jinja2 HTML templates + a CSS bundle served by the Hub |
| **JupyterLab** | A complete **branded JupyterLab distribution** — the notebook IDE the hub spawns | A custom **`jupyterlab`-app distribution**: pinned core + bundled extensions + theme + overrides, shipped as a Docker image / Python env |

> **The core distinction.** JupyterHub pages are **server-rendered templates**
> you override on the Hub. JupyterLab here is **not just a theme** — it is a
> **purpose-built distribution of JupyterLab**: a pinned core, a curated set of
> bundled extensions, default settings overrides, a custom app name/favicon/
> page title, and the Data4Now theme set as the default. The theme package is
> one *component* of that distribution, not the whole deliverable. The two
> layers are integrated through completely different mechanisms — never theme
> JupyterLab by editing Hub templates, or vice versa.

---

## 1. Brand foundation (shared by both layers)

Everything keys off one token file: **`assets/colors_and_type.css`**.

```
Brand DNA (from the logo):
  navy     #0F3D6E   primary — letterforms "DATA / NOW", primary buttons, headers
  teal     #1FA0A0   secondary — accents, active states, focus rings, links
  magenta  #E63558   accent — single point of emphasis, errors, the pie-wedge in the "O"

Neutrals: ink #0B1F38 · graphite #2C3E55 · slate #5A6B82 · steel #8A99AE
          mist #C8D1DD · fog #E4E9F0 · paper #F4F6FA · white #FFFFFF

Type:
  display  Montserrat (600/700)  — UI chrome, headings, eyebrows
  body     Roboto                — prose, descriptions
  mono     JetBrains Mono        — code, paths, IDs, metrics

Eyebrow convention: 11px, 700, letter-spacing 0.14em, UPPERCASE, teal-deep (#167C7C)
Radii: sm 4 · md 6 · lg 10 · xl 16 · pill 999
Spacing: 4px base scale (sp-1..sp-24)
```

When integrating, **map these tokens once** into each layer's variable system
(see §2 and §3) and never hard-code hexes in components.

---

## 2. JUPYTERHUB layer

The Hub renders Jinja2 templates server-side. You override them via
`c.JupyterHub.template_paths` and serve a brand CSS bundle via
`c.JupyterHub.extra_handlers` (or a static path). Each HTML file in this repo
maps to one Hub template.

### 2.1 Page → template mapping

| Design file | JupyterHub template | Route | Notes |
|---|---|---|---|
| `JupyterHub Login.html` | `login.html` | `/hub/login` | Split brand panel + form + SSO providers |
| `Image Picker.html` | `spawn.html` / `spawn_pending.html` | `/hub/spawn` | Profile/image selection (KubeSpawner `profile_list`) |
| `Hub Control Panel.html` | `home.html` | `/hub/home` | User's own servers, tokens, quota |
| `Hub Admin Panel.html` | `admin.html` (Users) | `/hub/admin` | User management table |
| `Hub Admin Servers.html` | custom admin page | `/hub/admin/servers` | Needs a custom handler or admin extension |
| `Hub Admin Images.html` | custom admin page | `/hub/admin/images` | Image registry — custom handler |
| `Hub Admin Groups.html` | custom admin page | `/hub/admin/groups` | Group/role matrix — custom handler |
| `Hub Admin Audit Log.html` | custom admin page | `/hub/admin/audit` | Audit trail — custom handler |
| `Hub Admin Config.html` | custom admin page | `/hub/admin/config` | Tenant settings — custom handler |
| `Spawn Failure.html` | `spawn_pending.html` (error state) | `/hub/spawn-pending/...` | Shown when spawn fails |
| `Quota Exceeded.html` | modal / `error.html` variant | — | Rendered client-side over the lab or as a Hub error |
| `Status Pages.html` | `404.html`, `logout.html`, `error.html` | various | 3 states in one file (see switcher) |

> **Built-in vs custom.** `login`, `spawn`, `home`, `admin`, `error`, `404`,
> `logout` are real JupyterHub templates you can override directly. **Servers,
> Images, Groups, Audit, Config** are *new* admin surfaces — they need custom
> Tornado handlers (or a JupyterHub service/extension) mounting these pages.
> Treat them as a custom admin SPA or server-rendered pages behind
> `@web.authenticated` + admin-scope checks.

### 2.2 Shared Hub chrome

The four admin pages (Users/Servers/Images/Audit) and Groups/Config already
share two extracted files — reuse these, do not re-inline:

```
preview-assets/admin-shared.css   — header, subnav, stat cards, toolbar, tables, pagination, side cards, footer
preview-assets/admin-shared.js    — row-checkbox selection, subnav tabs, filter chips
```

Admin chrome uses a **magenta** header accent rail (vs teal elsewhere) to
signal "you are in an administrative/destructive context." Keep that cue.

### 2.3 Integration steps (Hub)

1. Copy `assets/colors_and_type.css` into the Hub's static dir; link it from a
   `page.html` base template so every Hub page inherits tokens + fonts.
2. Port each design file's `<style>` into template-scoped CSS (or one
   `hub-brand.css`). Replace the demo content with Jinja2 loops:
   - `spawn.html` → iterate `profile_list` into the image cards
   - `admin.html` → iterate `users` into table rows
   - `home.html` → `user.all_spawners()` into the server cards
3. Wire real data into the status cells (`status-running`, `status-failed`,
   etc.) — the class names encode state; map spawner `.ready` / `.pending` /
   `.active` onto them.
4. For the custom admin pages, add handlers under a JupyterHub service and
   reuse `admin-shared.css`.
5. Logo: `preview-assets/logo.png` (light bg) is auto-inverted on dark via the
   CSS filter already in the templates.

---

## 3. JUPYTERLAB layer — a branded distribution (not just a theme)

This layer is a **complete, purpose-built JupyterLab distribution** for
Data4Now. The theme package is one component; the full distribution also pins
the core, bundles a curated extension set, ships default settings, and
rebrands the app shell (name, favicon, page title, splash). Think of it as
*your own `jupyterlab`* — built once with `jupyter lab build` / `jlpm` and
shipped as a Docker image (the same image the Hub spawner launches, e.g.
`data4now/python:2025.10`).

### 3.0 Distribution anatomy

```
data4now-jupyterlab/                 the distribution (build + ship as an image)
├── pyproject.toml                   pins jupyterlab==X.Y.*, jupyterhub, kernels, SDK
├── overrides.json                   default settings for ALL users (theme, density,
│                                    autosave, disabled extensions) → shipped in
│                                    {sys-prefix}/share/jupyter/lab/settings/overrides.json
├── page_config.json                 disable/lock extensions, set the default theme,
│                                    custom appName / favicon / announcements
├── extensions (bundled, pinned):
│     @data4now/jupyterlab-theme     ← the theme package in this repo
│     jupyterlab-git, jupyterlab-lsp, @jupyterlab/debugger,
│     @jupyter-widgets/jupyterlab-manager, jupyterlab-toc, …
├── data4now/medallion SDK           the kernel-side Python package
├── branding/                        favicon, app logo, splash, custom CSS overrides
└── Dockerfile                       FROM jupyter/base; pip install .; jupyter lab build

  THEME COMPONENT (lives in this repo, shipped inside the distribution):
  jupyterlab-data4now-theme/
  ├── package.json            labextension manifest (@data4now/jupyterlab-theme)
  ├── src/index.ts            registers "Data4Now" (light) + "Data4Now Dark" with IThemeManager
  ├── style/
  │   ├── index.css           LIGHT entry — base + variables.css + chrome tweaks
  │   ├── index-dark.css      DARK entry — variables-dark.css
  │   ├── variables.css       every --jp-* token mapped to brand (light)
  │   ├── variables-dark.css  every --jp-* token mapped to brand (dark)
  │   ├── index.js            style-only entry (styleModule)
  │   └── images/             logo.png + logo-dark.png
  └── README.md               build instructions
```

### 3.0.1 What makes it a *distribution*, not a theme

Integrate all of these, not just the theme package:

- **Default theme** — set `"@data4now/jupyterlab-theme:plugin"` theme as default
  in `overrides.json` (`"@jupyterlab/apputils-extension:themes": { "theme": "Data4Now" }`)
  so users get the brand with zero clicks.
- **App rebrand** — `page_config.json` → `appName: "Data4Now Notebook"`, custom
  favicon + page title; replace the Jupyter logo (the theme's `index.css`
  already swaps the menubar wordmark).
- **Bundled extensions** — Git, LSP, debugger, ipywidgets, ToC come pre-installed
  and pinned so every spawned server is identical. The mock's Right-panel and
  ipywidgets surfaces assume these are present.
- **Settings overrides** — ship sane defaults (density, autosave 120s,
  `scrollPastEnd`, line numbers) via `overrides.json` — these are exactly the
  values shown in the Settings-editor mock.
- **Locked/curated UX** — optionally lock the theme or hide extensions via
  `page_config.json` `disabledExtensions` / `lockedExtensions`.
- **Splash + favicon** — brand the boot splash (mocked as Overlay: Splash) and
  the favicon, not just in-app chrome.

The result is a single image: `jupyter lab build` bakes the theme + extensions
into the static assets, and the Hub spawner points users at it.

### 3.1 What `JupyterLab Theme.html` is

It is a **high-fidelity browser mock** of the themed lab — NOT the extension
itself. It exists so you can see every surface the theme touches and copy exact
spacing/color decisions into the real `--jp-*` overrides. It uses a **Tweaks
panel** (bottom-right) to toggle between every surface; treat each Tweak option
as a spec for one real lab surface:

| Tweak control | Real JupyterLab surface | Where to implement |
|---|---|---|
| Mode: Light/Dark | `Data4Now` / `Data4Now Dark` themes | `variables.css` / `variables-dark.css` |
| Accent: Teal/Magenta/Navy | `--jp-accent-color*` / `--jp-brand-color*` | variables |
| Density: Comfortable/Compact | `--jp-cell-padding`, notebook spacing | variables + `index.css` |
| View: Notebook | cell/output/prompt theming | `--jp-cell-*`, `--jp-rendermime-*` |
| View: Launcher | `.jp-Launcher`, `.jp-LauncherCard` | `index.css` |
| View: Terminal | xterm ANSI palette + `.jp-Terminal*` | `index.css` + terminal theme |
| View: Settings | `.jp-SettingsEditor` 3-column | `index.css` |
| Right panel: Debugger | `.jp-DebuggerSidebar` (@jupyterlab/debugger) | `index.css` |
| Right panel: Git | jupyterlab-git panel | `index.css` (3rd-party ext classes) |
| Right panel: ToC | `@jupyterlab/toc` | `index.css` |
| Context menu | `.lm-Menu` (Lumino) | `index.css` |
| Command palette | `.jp-CommandPalette` (⌘⇧C) | `index.css` |
| Menubar dropdowns (File/Edit/View/Run/Kernel/Git/Tabs/Settings/Help) | `.lm-Menu` menubar dropdown | `index.css` |
| Dialog | `.jp-Dialog` | `index.css` |
| Notifications | `.jp-Notification` (Notobook 7 toasts) | `index.css` |
| Tooltip | `.jp-Tooltip` hover bubbles | `index.css` |
| Overlay: Connection lost | `.jp-ConnLost` (hub connection lost) | `index.css` |
| Overlay: Splash | boot splash screen | `index.css` (splash plugin) |
| ipywidgets cell | `.widget-*` (@jupyter-widgets) | separate widget CSS |

### 3.2 Token-mapping anchors (already done in the package — reference values)

```
--jp-brand-color1   → navy   #0F3D6E   (primary)
--jp-accent-color1  → teal   #1FA0A0   (accent / active)
--jp-error-color1   → magenta #E63558  (errors)
--jp-ui-font-family      → Montserrat
--jp-content-font-family → Roboto
--jp-code-font-family    → JetBrains Mono
--jp-layout-color0..4    → white → paper → fog → mist (light)
                         → ink shades (dark)
```

Chrome touches not expressible via tokens alone (do these in `index.css`):
navy menubar with teal pillar accent, dark-ink left sidebar with teal active
stripe, Data4Now wordmark replacing the Jupyter logo, teal cell collapser on
the active cell.

### 3.3 Integration steps (Lab distribution)

**a) Build the theme component**
```bash
cd jupyterlab-data4now-theme
jlpm install && jlpm run build
jupyter labextension develop . --overwrite   # dev iteration
python -m build                              # → wheel, to be pip-installed in the image
```

**b) Assemble the distribution** (the shippable deliverable)
```bash
# in data4now-jupyterlab/
pip install jupyterlab @data4now/jupyterlab-theme jupyterlab-git \
            jupyterlab-lsp jupyterlab-toc ipywidgets ...      # pinned versions
cp overrides.json    $(jupyter --data-dir)/lab/settings/overrides.json
cp page_config.json  $(jupyter --data-dir)/lab/settings/page_config.json
jupyter lab build                                            # bake assets
```

**c) Default the brand** — in `overrides.json`:
```json
{
  "@jupyterlab/apputils-extension:themes": { "theme": "Data4Now" },
  "@jupyterlab/notebook-extension:tracker": { "cellDensity": "compact", "scrollPastEnd": true }
}
```

**d) Ship as the spawner image** — `Dockerfile FROM` a Jupyter base, `pip install .`,
`jupyter lab build`, then point the Hub `spawn.html` profiles at this image
(`data4now/python:2025.10`). The Hub and this distribution meet exactly here.

For interactive widgets, the `.widget-*` classes from `@jupyter-widgets` need a
companion stylesheet — port the `.jp-Widget*` rules from `JupyterLab Theme.html`
onto the real ipywidgets class names and include it in the theme package.

---

## 4. Component & element inventory

Every component below was designed as **hand-written semantic HTML + scoped
CSS** keyed off `assets/colors_and_type.css` tokens (no UI framework). To
replicate one in code: open the listed file, find the listed CSS class prefix
(search the `<style>` block), and copy the rule + markup — the class names are
the contract. State is expressed through modifier classes, never inline styles.

### 4.1 How to access any component
1. **Open the source file** listed in the table (e.g. `read JupyterLab Theme.html`).
2. **Search its `<style>` block** for the class prefix (e.g. `.jp-Dialog`) — all
   rules for that component are grouped under a banner comment of the same name.
3. **Copy the markup** for that component from the `<body>` (or, in the lab mock,
   from the matching React render block near the bottom).
4. **Re-map demo data → real data**, preserving every class name and modifier.
5. For lab surfaces, the **Tweaks panel option name = the component** — toggle it
   in the preview to see the exact target state before porting.

> **Exact code anchors:** for the literal HTML tag, JS render call, CSS banner,
> and line number of every component, see **`COMPONENT-INDEX.md`** — it maps
> each surface to the precise grep string (e.g. `.jp-Dialog` CSS at the
> `/* ===== DIALOG ===== */` banner, `Dialog`/`DialogHost` JS render fn, mount
> node `<div id="dialog-root">`) so you can pull the exact source.

### 4.2 JupyterHub components

| Component | File | Class prefix / anchor | How it was built |
|---|---|---|---|
| Login split-panel + SSO | `JupyterHub Login.html` | `.login-*`, `.sso-*` | Brand panel (dark, dot texture, teal→magenta rail) + form column; password toggle + remember-me in plain JS |
| Spawner / image cards | `Image Picker.html` | `.ip-*` | React mock (`image-picker.jsx` + `image-data.jsx`); grid/list cards, sticky launch bar, size picker |
| Control-panel server card | `Hub Control Panel.html` | `.hub-server-*`, `.hub-named-*` | Active-server card w/ status pill, specs grid, action row; named-servers list; tokens table; quota meters; activity timeline |
| Admin shared chrome | `preview-assets/admin-shared.css` | `.ah-header/.ah-subnav/.ah-stat/.ah-table/.ah-toolbar/.ah-pagination` | Extracted once, imported by all 5 admin pages; magenta header rail = admin context |
| Users table | `Hub Admin Panel.html` | `.user-cell`, `.role-pill`, `.status-pill`, `.quota-cell` | Row select → bulk bar; role/status pills; per-row quota bars |
| Servers table + cluster health | `Hub Admin Servers.html` | `.ah-cluster`, `.server-cell`, `.usage-cell` | Node CPU/RAM meters; spawn-state rows incl. progress + ImagePullBackOff |
| Images registry | `Hub Admin Images.html` | `.image-*`, `.approval-*`, `.cve` | Brand-gradient glyphs; approval queue; CVE pills; scan feed |
| Groups matrix | `Hub Admin Groups.html` | `.gr-*`, `.role-mtx`, `.quota-row` | Master-detail; role × scope matrix; group quotas; members table |
| Config / settings | `Hub Admin Config.html` | `.cfg-*`, `.provider-*`, `.danger-zone` | Sticky nav; unsaved banner; field rows; provider toggles; danger zone |
| Audit log | `Hub Admin Audit Log.html` | `.audit-*` | Filter rail; timeline w/ kind glyphs, diffs, outcome tags |
| Spawn-failure page | `Spawn Failure.html` | `.sf-*` | Spawner log block, facts grid, numbered next-steps |
| Quota-exceeded modal | `Quota Exceeded.html` | `.qx-*` | Scrim + dialog over blurred lab; meters w/ soft-warning marker; companion toast |
| 404 / sign-out / expired | `Status Pages.html` | `.st-*` | 3 states in one file, dark stage, top state-switcher (JS) |

### 4.3 JupyterLab components (all in `JupyterLab Theme.html`)

Each maps to a real lab class (Lumino `.lm-*` / `--jp-*` surfaces) — see the
§3.1 Tweak→surface table for where it lands in the distribution.

| Component | Class prefix | Real lab target | Tweak to preview |
|---|---|---|---|
| Menubar + wordmark | `.jp-menubar`, `.jp-logo` | `#jp-top-panel` | (always on) |
| Left rail + file browser | `.jp-rail`, `.jp-sidebar`, `.jp-tree-*` | `.jp-SideBar`, filebrowser | (always on) |
| Tab bar | `.jp-tabbar`, `.jp-tab` | `.lm-DockPanel-tabBar` | (always on) |
| Notebook cells / prompts | `.jp-cell`, `.jp-prompt`, `.jp-editor`, `tok-*` | `.jp-Cell`, CodeMirror tokens | View: Notebook |
| Outputs (df / chart / error / stream) | `.jp-output`, `.jp-df`, `.jp-chart` | `.jp-RenderedHTML` etc. | View: Notebook |
| ipywidgets | `.jp-Widget`, `.jp-wSlider/wToggle/wDropdown/wProgress` | `.widget-*` | View: Notebook (In [5]) |
| Launcher | `.jp-launcher`, `.jp-LauncherCard` | `.jp-Launcher` | View: Launcher |
| Terminal | `.jp-Terminal*`, `.ansi-*` | xterm theme | View: Terminal |
| Settings editor | `.jp-Set-*` | `.jp-SettingsEditor` | View: Settings |
| Debugger | `.jp-Panel-*`, `.jp-Bp-*`, `.jp-Frame-*`, `.jp-Var-*` | `@jupyterlab/debugger` | Right panel: Debugger |
| Git | `.jp-Git-*`, `.jp-Diff-*` | jupyterlab-git | Right panel: Git |
| Table of Contents | `.jp-Toc-*` | `@jupyterlab/toc` | Right panel: ToC |
| Context / file menu | `.lm-Menu*` | Lumino menus | Context menu: * |
| Command palette | `.jp-CommandPalette*` | `.jp-CommandPalette` | Context menu: Command palette |
| Dialog | `.jp-Dialog*` | `.jp-Dialog` | Dialog preview: * |
| Notifications | `.jp-Notification*` | Notebook-7 toasts | Notifications: * |
| Tooltip | `.jp-Tooltip*` | `.jp-Tooltip` | Tooltip: * |
| Connection-lost banner | `.jp-ConnLost*` | connection-lost plugin | Overlay: Connection lost |
| Splash / boot | `.jp-Splash*` | splash screen plugin | Overlay: Splash |

### 4.4 Shared / cross-cutting

| Component | File | Class prefix | Notes |
|---|---|---|---|
| Brand tokens | `assets/colors_and_type.css` | `--d4n-*`, `--font-*`, type classes | Source of truth; both layers map from here |
| Form-control catalog | `Form Controls.html` | `.btn`, `.inp`, `.sel`, `.chk`, `.rad`, `.sw`, `.sl`, `.tag`, `.kpi` | Every control × every state, light + dark; the canonical control specs |
| Theme token maps | `jupyterlab-data4now-theme/style/variables*.css` | `--jp-*` | Done — copy values when wiring real `--jp-*` |
| Icon set | `Icon Set.html` (catalog) + `icons/` (assets) | `d4n-{name}` | 120 line icons (10 categories), 24×24 stroke, `currentColor` — see §4.5 |

### 4.5 Icon set — `icons/`

120 line icons, all **24×24 viewBox, `stroke-width 1.6`, round caps/joins,
`currentColor`** so they inherit text color and scale anywhere. Browse + copy
from `Icon Set.html`; the raw assets live in `icons/`:

```
icons/
├── file-types/     folder, folder-open, notebook, python, table, csv, markdown,
│                   json, yaml-config, text-file, terminal-file
├── toolbar/        save, add-cell, cut, copy, paste, run, run-all, stop,
│                   restart, interrupt, clear
├── sidebar/        files, running, commands, extensions, git, toc, settings,
│                   debugger, inspector, comments, kernel,
│                   sidebar-left, sidebar-right, wrap, line-numbers
├── status/         check, check-circle, error-x, warning, info, pending,
│                   idle-dot, live
├── actions/        search, close, chevron-down, chevron-right, arrow-right,
│                   external, download, upload, refresh, more-h, more-v,
│                   filter, trash, edit, plus, link, eye, expand,
│                   undo, redo, zoom-in, zoom-out, fullscreen, presentation
├── compute/        cpu, memory, gpu, server, database, cluster, cloud, container
├── identity/       user, users, lock, shield, key, logout, login, mfa
├── data/           zone-layers, promote, hash, audit, anonymize, branch,
│                   commit, schedule, pull, push, stash, clone
├── notebook/       cell-code, cell-md, output, kernel-idle, launcher,
│                   split-right, split-down, new-window
├── kernels/        python, r-lang, rstudio, julia, julia-dots
├── sprite.svg      all icons as <symbol id="d4n-{name}"> in one hidden <svg>
└── index.json      { category: [names] } manifest for programmatic use
```

**How to use the icons in code:**
- **Single file** — `<img src="icons/status/check.svg">`, or inline the SVG and
  let it inherit `color` (it's `currentColor`).
- **Sprite** — include `icons/sprite.svg` once, then reference anywhere:
  `<svg class="icn"><use href="#d4n-check"/></svg>`. Size via CSS `width/height`,
  color via `color`.
- **JupyterLab** — register each as a `LabIcon` from `@jupyterlab/ui-components`:
  `new LabIcon({ name: 'data4now:check', svgstr: <file contents> })`, then pass
  it to toolbar buttons, sidebar tabs, file-type registrations, etc. This is how
  you replace JupyterLab's default icons in the branded distribution.
- **JupyterHub templates** — inline or `<use>` the sprite; these replace the
  emoji/glyph placeholders the mocks use (e.g. `◆`, `⊞`, `▶`).

> The mocks use emoji/unicode glyphs as stand-ins. In production, swap them for
> the matching `icons/` asset — the names line up with the surfaces (e.g.
> `notebook` for `.ipynb` rows, `run` for the run button, `status/error-x` for
> failures).

---

## 5. Repository map

```
JUPYTERHUB (server-rendered templates)
  JupyterHub Login.html        login.html
  Image Picker.html            spawn.html         (React mock — port markup to Jinja)
  Hub Control Panel.html       home.html
  Hub Admin Panel.html         admin.html (Users)
  Hub Admin Servers.html       custom handler  ┐
  Hub Admin Images.html        custom handler  │ share preview-assets/admin-shared.{css,js}
  Hub Admin Groups.html        custom handler  │
  Hub Admin Audit Log.html     custom handler  │
  Hub Admin Config.html        custom handler  ┘
  Spawn Failure.html           spawn_pending.html (error)
  Quota Exceeded.html          modal / error
  Status Pages.html            404.html + logout.html + error.html (3-in-1)

JUPYTERLAB (a complete branded distribution — built & shipped as an image)
  jupyterlab-data4now-theme/   the theme COMPONENT (one part of the distribution)
  JupyterLab Theme.html        hi-fi mock / spec of every lab surface (Tweaks-driven)
  (to author alongside: overrides.json, page_config.json, Dockerfile, bundled exts — see §3.0)

SHARED
  assets/colors_and_type.css   brand tokens — source of truth for BOTH layers
  preview-assets/              logos + extracted admin chrome (css/js) for mocks
  Form Controls.html           cross-cutting control catalog (buttons/inputs/etc, light+dark)
  Icon Set.html                icon catalog (browse + copy) — assets in icons/
  icons/                       120 line-icon SVGs (10 categories) + sprite.svg + index.json

MOCK-ONLY (not shipped — support the previews)
  tweaks-panel.jsx, image-data.jsx, image-picker.jsx   (React, for the HTML mocks)
```

## 5. Integration order (recommended)

1. **Tokens first** — get `colors_and_type.css` + the `--jp-*` mapping landing in
   both layers. Verify fonts load.
2. **Lab distribution** — build the theme component, then assemble the full
   distribution (pinned core + bundled extensions + `overrides.json` +
   `page_config.json` + app rebrand) and bake it into the spawner image. The
   theme alone is the fastest win; the distribution is the actual deliverable.
3. **Hub built-in templates** — login, spawn, home, admin, 404, logout, error.
4. **Hub custom admin** — Servers/Images/Groups/Audit/Config behind admin
   handlers, reusing `admin-shared.css`.
5. **States & widgets** — spawn-failure, quota modal, ipywidgets CSS.

## 6. Notes for the integrator

- The HTML mocks use literal demo data (ACME-EU-2 tenant, sample users). Replace
  with template variables / API data; keep the **class names** — they encode
  state and drive the brand styling.
- State is expressed through classes: `is-running`, `is-failed`, `is-selected`,
  `status-*`, `approval-*`, `kind-*`. Map backend state onto these.
- Dark mode: Hub pages are light-only in these mocks (except the dark login/
  status stages); the Lab ships both. If you want a dark Hub, fork the token
  block the way `variables-dark.css` does.
- Admin = magenta accent; everything else = teal accent. Preserve that signal.
- Never reference `/projects/...` or cross-project paths in shipped code; all
  assets here are local.

---

## 7. Light & Dark mode — exact build spec

> **Read this before implementing.** Both modes are first-class and must match
> the design pixel-for-pixel. The mocks are **token-driven**: every component
> reads from the variables below, so you implement light/dark **once at the
> token layer**, and every component inherits correctly. Do **not** hand-pick
> per-component colors — wire the tokens, then only apply the per-component
> *deviations* listed in §7.5. The Lab ships both modes (`Data4Now` /
> `Data4Now Dark`); Hub pages are light by default with dark brand stages for
> login/status/splash.

### 7.1 The mechanism

- **Light is the default** — tokens are defined on `:root` (Hub) / set by
  `variables.css` (Lab). Nothing extra needed for light beyond loading tokens.
- **Dark is an override** — add `body.is-dark { … }` (Hub mocks) or load
  `variables-dark.css` (Lab `Data4Now Dark` theme). Dark **re-declares the same
  variable names** with dark values; components never change.
- If your implementation "only does dark," it's because you hard-coded dark
  values instead of mapping the light token set first. Define **both** blocks.

### 7.2 Core surface + text tokens (exact hex)

| Token (role) | Light | Dark |
|---|---|---|
| page background (`--jp-layout-color2` / `--bg`) | `#F4F6FA` paper | `#0B1F38` ink |
| surface / card (`--jp-layout-color1` / `--surface`) | `#FFFFFF` | `#122A47` |
| sunken / tab bar (`--jp-layout-color3`) | `#E4E9F0` fog | `#0E2542` |
| sidebar / rail (deepest) | `#0B1F38` ink | `#050F1D` |
| inverse chrome (`--jp-layout-color4`) | `#C8D1DD` mist | `#2C4A75` |
| text primary (`--fg-1`) | `#0B1F38` ink | `#F4F6FA` |
| text secondary (`--fg-2`) | `#2C3E55` graphite | `#C8D1DD` mist |
| text tertiary / captions (`--fg-3`) | `#5A6B82` slate | `#8A99AE` steel |
| text disabled / placeholder (`--fg-4`) | `#8A99AE` steel | `#5A6B82` |
| border-1 (hairline) | `#E4E9F0` fog | `#1B385C` |
| border-2 / strong | `#C8D1DD` mist | `#2C4A75` |

### 7.3 Brand + status tokens (note the dark "bright" lifts)

| Token | Light | Dark |
|---|---|---|
| brand / primary (`--jp-brand-color1`) | navy `#0F3D6E` | `#4F77A8` (lifted) |
| accent / active (`--jp-accent-color1`) | teal `#1FA0A0` | **teal-bright `#4FD1D1`** |
| accent-deep (links, eyebrows) | `#167C7C` | `#4FD1D1` |
| error (`--jp-error-color1`) | magenta `#E63558` | **magenta-bright `#FF6B86`** |
| warning | `#C97C0A` | `#E0A04A` |
| success | `#1F8A5E` | `#6FCF97` |
| info | teal `#1FA0A0` | `#4FD1D1` |

> **Critical dark rule:** teal and magenta are **brightened** in dark
> (`#1FA0A0`→`#4FD1D1`, `#E63558`→`#FF6B86`) so they hold contrast on dark
> surfaces. Use the base values in light, the bright values in dark. Syntax
> highlight + chart colors get the same treatment (greens→`#6FCF97`,
> golds→`#E0A04A`, blues→`#6BB1FF`).

### 7.4 Constants — identical in both modes

These do **not** change between modes — only color does:

- **Type:** display Montserrat (600/700), body Roboto (400/500), mono JetBrains
  Mono. Sizes: eyebrow 10–11px/700/`0.14em`/UPPERCASE; body 13–14px; section
  titles 18–24px/700/`-0.01em…-0.02em`; mono labels 10.5–12px.
- **Radii:** sm 4 · md 6 · lg 10 · xl 14–16 · pill 999.
- **Spacing:** 4px base. Card padding 18–28px; field rows 14px vertical;
  table cells 12–14px; toolbar gaps 8–10px; section gaps 16–28px.
- **Borders:** width 1px hairline using border-1; focus ring = `0 0 0 3px
  rgba(31,160,160,0.20)` light / `rgba(79,209,209,0.25)` dark.
- **Icons:** the `icons/` set is `currentColor` → it recolors automatically with
  text. No per-mode icon files needed.
- **Layout, margins, paddings, fl/grid structure: identical.** Only the 3 token
  tables above flip.

### 7.5 Per-component deviations (where a component does more than inherit tokens)

Most components are 100% token-driven. These are the only ones with explicit
`body.is-dark` rules beyond the token flip — replicate exactly:

| Component | Light | Dark |
|---|---|---|
| **Menubar** (`#jp-top-panel`) | navy `#0F3D6E`, teal pillar `#1FA0A0`, white wordmark | ink-deep `#050F1D`, pillar `#4FD1D1`, `logo-dark.png` |
| **Left rail / sidebar** | ink `#0B1F38`, teal active stripe | `#050F1D`, `#4FD1D1` stripe |
| **Primary button** | bg navy `#0F3D6E`, text white | bg teal `#1FA0A0`/`#4FD1D1`, **text ink `#0B1F38`** (not white) |
| **Code cell editor bg** | white `#FFFFFF` | `#122A47`; active border teal-bright |
| **Dialog / palette / menu shadow** | `0 24px 48px rgba(15,61,110,.20)` | `0 24px 48px rgba(0,0,0,.55–.65)` |
| **Card hover shadow** | `rgba(15,61,110,.08)` | `rgba(0,0,0,.40–.45)` |
| **Inputs** | bg white/paper | bg `#0E2542`; brighter focus ring |
| **`<code>` inline** | bg fog, text navy-deep | bg fog-tint, text `#4FD1D1` |
| **Tag/pill tints** | solid-tint bg + deep text | translucent bg (`rgba(...,.16–.22)`) + bright text |
| **Terminal** | always `#0B1F38` bg | `#050F1D` bg (slightly deeper) |
| **Splash / login / status stages** | **always dark** (brand stage), no light variant | same |
| **Admin pages** | light only in mocks | (fork token block if a dark Hub is wanted) |
| **Active toggle/segment** | bg navy, text white | bg teal, text ink |

### 7.6 Verification checklist (run in BOTH modes)

1. Toggle the mode and confirm **every surface** flips (no element keeps a
   light card on a dark page — that means a hard-coded hex slipped in).
2. Primary buttons: **white text in light, ink text in dark** (teal bg needs
   dark text for contrast).
3. Accents read as teal `#1FA0A0` in light, **teal-bright `#4FD1D1`** in dark.
4. Focus rings, shadows, code chips, and pill tints use their per-mode values.
5. Type, spacing, radii, borders, and icon geometry are **identical** — only
   color changed.

---

## 8. Shell bars — exact build (top, left/right, bottom)

> **Source file:** all §8 surfaces are in **`JupyterLab Theme.html`** (always
> visible — no Tweak needed). Search its `<style>` block for the class names
> in each heading.

The JupyterLab shell is a CSS grid: `grid-template-rows: 32px 1fr 24px`
(menubar / body / status) and the body row is
`grid-template-columns: 48px 280px 1fr [300px] 48px` (left rail / left panel /
dock / [right panel] / right rail). All four bars below.

**Shared geometry (both modes):**
```
--jp-menubar-h: 32px      top bar height
--jp-tabbar-h:  36px      dock tab strip
--jp-status-h:  24px      bottom bar height
--jp-rail-w:    48px      icon rail width (left & right)
--jp-sidebar-w: 280px     left panel (file browser) width
right panel:    300px     debugger / git / ToC, when open
```

### 8.1 Top bar — menubar (`#jp-top-panel` / `.jp-menubar`)

| Property | Light | Dark |
|---|---|---|
| height | 32px | 32px |
| background | navy `#0F3D6E` | ink-deep `#050F1D` |
| bottom border | `#082B52` navy-deep | `#000` |
| logo | `logo.png`, 18–22px tall, left-aligned in a 220px lockup | `logo-dark.png` (inverted wordmark) |
| teal pillar accent | 2px wide, `#1FA0A0`, at the lockup's right edge (`top/bottom: 6–8px`) | `#4FD1D1` |
| menu item text | Montserrat 500, 12px, `rgba(255,255,255,.92)`, padding `0 10px`, full-height | same |
| menu item hover | `rgba(255,255,255,.08)` bg | `rgba(255,255,255,.06)` |
| right cluster | tenant pill + email (12px) + 22px avatar (teal bg, white, 700/10px) | same; avatar teal-bright |
| tenant pill | `var(--font-display)` 10px/600 UPPERCASE `0.12em`, teal-on-`status-info-bg` | translucent teal |

White text in both modes (the bar is dark either way); only the bg deepens in dark.

### 8.2 Left rail (`.jp-SideBar` / `.jp-rail`)

| Property | Light | Dark |
|---|---|---|
| width | 48px | 48px |
| background | ink `#0B1F38` | `#050F1D` |
| icon button | 36×36, centered, `currentColor` icon at `rgba(200,209,221,.55)` | same |
| icon hover | color → mist `#C8D1DD` | same |
| **active tab** | color → teal `#1FA0A0`, bg `rgba(255,255,255,.04)`, **2px teal left stripe** | teal-bright `#4FD1D1` stripe |
| icon size | 16–18px (the 24px `icons/` set scaled down) | same |
| layout | flex column, `padding-top: 8px`, `gap: 2px`, spacer pushes Settings to bottom | same |

### 8.3 Left panel — file browser (`.jp-sidebar`)

| Property | Light | Dark |
|---|---|---|
| width | 280px | 280px |
| background | white `#FFFFFF` | `#122A47` |
| right border | fog `#E4E9F0` | `#1B385C` |
| header eyebrow | Montserrat 700 10px `0.14em` UPPERCASE, teal-deep `#167C7C` | teal-bright |
| action buttons | 24px tall, `font-mono`-adjacent 11px; primary = navy bg/white | primary = teal/ink |
| search field | 28px, sunken bg, fog border, teal focus | `#0E2542` bg |
| tree row | 12px display font, `padding: 4px 12px`, hover = sunken | same |
| **selected row** | `rgba(31,160,160,.10)` bg + **2px teal inset stripe** | `rgba(79,209,209,.10)` |
| file-type icon | 14px, color-coded (notebook=magenta, py=teal-deep, csv=green, md=navy, cfg=gold) | bright variants |
| breadcrumb | `font-mono` 11px slate, sunken bg | same |

### 8.4 Right rail + right panel

| Property | Light | Dark |
|---|---|---|
| right rail | 48px, ink `#0B1F38`, same icon treatment as left rail | `#050F1D` |
| right panel (debugger/git/ToC) | 300px, surface white, left border fog | `#122A47`, border `#1B385C` |
| panel header | Montserrat 700 11px `0.14em` UPPERCASE teal-deep, `padding: 14–16px` | teal-bright |
| panel body text | body 12–13px fg-2 | fg-2 dark |
| only opens when a right-rail icon is active (grid adds the 300px column) | | |

### 8.5 Dock tab strip (`.lm-DockPanel-tabBar` / `.jp-tabbar`)

| Property | Light | Dark |
|---|---|---|
| height | 36px | 36px |
| background | sunken fog `#E4E9F0` | `#0E2542` |
| bottom border | fog | `#1B385C` |
| tab text | Montserrat 500 12px | same |
| inactive tab | sunken bg, slate text | dark sunken, steel text |
| **current tab** | surface white bg, ink text, **2px teal top border** | `#122A47` bg, teal-bright top |
| tab icon | 12px file-type icon; unsaved = 7px teal dot; close = 14px circle | same |

### 8.6 Bottom bar — status bar (`#jp-bottom-panel` / `.jp-StatusBar`)

| Property | Light | Dark |
|---|---|---|
| height | 24px | 24px |
| background | navy-deep `#082B52` | `#050F1D` |
| text | Montserrat 500 11px, mist `#C8D1DD` | same |
| mode chip (left) | teal `#1FA0A0` bg, white, UPPERCASE 10px `0.1em`, full-height | teal-bright bg, ink text |
| kernel item | 6px green dot (`#1F8A5E`, `0 0 0 3px rgba(31,138,94,.18)`) + label | same |
| layout | flex, `padding: 0 12px`, `gap: 16px`, spacer splits left/right groups | same |
| items | mode · kernel/idle · filename · Ln/Col · git branch · saved-ago · tenant · theme | same |

White/mist text in both modes (bar is dark either way); bg deepens in dark.

**Status-bar items, left→right (exact markup `<footer class="jp-status">`):**
- `is-mode` chip — `Mode: Edit` (teal bg, full-height, UPPERCASE 10px `0.1em`)
- kernel — 6px green `.jp-status-dot` + `Python 3 (Data4Now) · Idle`
- filename `analysis.ipynb`
- `Ln 2, Col 18`
- `.jp-status-spacer` (flex:1 — splits the bar)
- **`.jp-status-switch#simple-switch`** — the Simple Interface toggle (see §11)
- git `main ↑2 ↓0`
- `Saved 2 min ago`
- `Tenant ACME-EU-2`
- `Theme: Data4Now`

All items are `.jp-status-item` (`display:flex; align-items:center; gap:6px`).

---

## 11. Single Document Mode (Simple Interface)

JupyterLab's "Simple Interface" / single-document mode. **Source:**
`JupyterLab Theme.html` — toggle via the status-bar **`#simple-switch`** or
Tweaks → `Interface: Simple`. Both flip `body.simple-mode`.

### 11.1 What changes when `body.simple-mode` is on

| Behaviour | Implementation |
|---|---|
| Dock **tab strip disappears** | `body.simple-mode .jp-tabbar { display: none; }` |
| **Document title moves to the top bar**, centered above the menu | `.jp-menubar-title` (absolutely positioned `left:50%; transform:translateX(-50%)`), shown only in simple mode |
| Document uses the **full area** | tab strip gone → content fills; notebook centers at `max-width: 900px` |
| **Left + right panels stay** | (no grid change — sidebars and rails remain exactly as in tabbed mode) |

> Correct behaviour (matches real JupyterLab): only the **tabs** are removed and
> the **title relocates to the top bar**. The file browser, right-rail panels,
> and both icon rails are **kept**. Earlier drafts that collapsed the sidebars
> were wrong — do not hide them.

### 11.2 Status-bar switch (`.jp-status-switch`)

| Property | Light | Dark |
|---|---|---|
| layout | `display:flex; gap:8px`, sits before the git item, after the spacer | same |
| label | `Simple`, Montserrat 500/11px, `rgba(255,255,255,.78)` → `#fff` when on | same |
| track (`.sw`) | 28×15px pill, `rgba(255,255,255,.20)` → **`var(--jp-accent)` when on** | teal-bright when on |
| knob | 11px white circle, `translateX(13px)` when on, 200ms ease | same |
| on-state class | `body.simple-mode` drives the filled track + knob shift | same |

### 11.3 Top-bar title (`.jp-menubar-title`)

| Property | Value |
|---|---|
| position | `absolute; left:50%; transform:translateX(-50%)`, `max-width:46%`, `pointer-events:none` |
| visibility | hidden by default; `display:flex` only under `body.simple-mode` |
| contents | `.doc-icon` (◆, white 85% opacity, 12px) + `.doc-name` (Montserrat 600/12.5px white, ellipsis) + `.doc-dot` (6px teal unsaved dot) |
| both modes | white text — it lives on the dark menubar, so it does not invert |

### 11.4 Markup anchors

```html
<!-- centered title, inside <header class="jp-menubar"> after .jp-menubar-spacer -->
<div class="jp-menubar-title">
  <span class="doc-icon">◆</span>
  <span class="doc-name">analysis.ipynb</span>
  <span class="doc-dot" title="unsaved"></span>
</div>

<!-- toggle, inside <footer class="jp-status"> after .jp-status-spacer -->
<div class="jp-status-switch" id="simple-switch" title="Toggle Simple Interface">
  <span class="label">Simple</span>
  <span class="sw"></span>
</div>
```

```js
// status-bar switch ↔ body class (two-way; also syncs the Tweaks panel)
simpleSwitch.addEventListener('click', () => {
  const on = !document.body.classList.contains('simple-mode');
  document.body.classList.toggle('simple-mode', on);
});
```

**Real JupyterLab mapping:** this is the built-in command
`application:toggle-mode` (Single-Document Mode). In the distribution it's a
core feature — you only theme the status-bar widget + the top-bar title; the
tab-hiding and layout are JupyterLab's own. Expose it via the status bar (and
View menu) exactly as mocked.

> **Rule of thumb for the bars:** top bar, both rails, and status bar are
> **dark chrome in light mode too** — they don't invert, they only *deepen*
> (`#0F3D6E`→`#050F1D`, `#0B1F38`→`#050F1D`, `#082B52`→`#050F1D`). The middle
> band (panels, dock, tab strip) is what truly flips light↔dark. Keep all
> heights, widths, fonts, and icon sizes identical between modes.

---

## 9. Main-area surfaces — exact build (Launcher, Notebook, Settings, panels)

> **Source file:** all §9 surfaces are in **`JupyterLab Theme.html`**. Reach
> each via the Tweaks panel (bottom-right): Launcher → `View: Launcher`,
> Notebook → `View: Notebook`, Settings → `View: Settings`, Git/ToC/Debugger →
> `Right panel: *`. Search the `<style>` block for the class in each heading.

All of these live in the **middle band**, so they fully flip light↔dark per the
§7.2 token table. Values below are the exact specs from `JupyterLab Theme.html`.

### 9.1 Launcher (`.jp-launcher` / `.jp-LauncherCard`)

| Property | Light | Dark |
|---|---|---|
| scroll bg | paper `#F4F6FA` | ink `#0B1F38` |
| outer padding | `28px 40px 100px`, inner max-width 1080px, sections `gap: 28px` | same |
| **hero** | eyebrow (Montserrat 700/11px/`0.14em` UPPER, teal-deep) + h1 (700/30px/`-0.015em`) + lead (Roboto 14px/1.55 fg-2); bottom border fog + 64px teal underline accent | eyebrow teal-bright; border `#1B385C` |
| section header | h2 Montserrat 700/12px/`0.14em` UPPER teal-deep + meta caption right | teal-bright |
| **card grid** | `repeat(auto-fill, minmax(240px,1fr))`, `gap: 10px` | same |
| card | surface white, 1px fog border, radius 10, `padding: 14px 16px`, grid `40px 1fr` (icon + title/sub) | `#122A47`, border `#1B385C` |
| card hover | `translateY(-2px)`, border→teal, shadow `0 8px 18px rgba(15,61,110,.10)` | shadow `rgba(0,0,0,.45)` |
| card icon | 40×40, sunken bg, radius 8, brand glyph navy | bg `#0E2542`, teal-bright glyph |
| card title | Montserrat 600/14px ink; sub Roboto 12px fg-3 | title `#F4F6FA` |
| **primary card** (recommended kernel) | navy→navy-deep gradient bg, white text, icon on `rgba(255,255,255,.12)` | teal→teal-deep gradient, **ink text** |
| chip ("Recommended", version) | `font-mono` 10px, sunken bg, fg-3 | translucent |
| recents list | surface card, rows `grid 24px 1fr auto auto`, hover sunken, notebook icon magenta, mono path/time fg-3 | dark surface |

### 9.2 Notebook (`.jp-cell` and children)

| Element | Light | Dark |
|---|---|---|
| notebook scroll bg | paper `#F4F6FA` | `#0B1F38` |
| **cell grid** | `8px 64px 1fr` (collapser / prompt / body), radius 6, `padding: 4px 0` | same |
| collapser | transparent; hover→mist; **active = teal `#1FA0A0`**; selected = navy-soft 50% | active = teal-bright |
| prompt | `font-mono` 11px, right-aligned; `In [n]` navy, `Out [n]` magenta | In blue `#6BB1FF`, Out magenta-bright |
| **code editor** | surface white, 1px fog border, radius 4, `font-mono` 13px/1.5, `padding: 8px 12px` | bg `#122A47`, border `#1B385C` |
| active editor | border teal + `0 0 0 2px rgba(31,160,160,.15)` | teal-bright glow |
| syntax tokens | kw navy · fn teal-deep · str green `#1F8A5E` · num gold `#B8860B` · com slate italic · op magenta | kw `#6BB1FF` · fn `#4FD1D1` · str `#6FCF97` · num `#E0A04A` · op `#FF6B86` |
| **markdown cell** | Roboto 15px/1.65 ink; h1 28px/700 w/ fog underline; eyebrow teal-deep; blockquote 3px teal left border + `rgba(31,160,160,.06)` bg | dark equivalents; code chip text teal-bright |
| **output — dataframe** | `.jp-df` table, header Montserrat 600/10px UPPER fg-3 on sunken w/ 2px navy bottom border; rows hover `rgba(31,160,160,.06)`; zone pills bronze/silver/gold | dark surfaces, translucent pills |
| **output — error** | surface bg, 2px magenta left border, mono, magenta text | magenta-bright |
| **output — stream** | sunken bg, slate left border, fg-2 | dark sunken |
| **output — chart** | surface card; bars teal→teal-deep gradient; emphasis bar magenta gradient; legend caption fg-2 | bright gradients |
| ipywidgets | surface w/ 2px teal left rail; slider teal fill+thumb; toggle active teal/white; value readouts teal-deep mono; progress teal→navy gradient | teal-bright accents, ink text on active |

### 9.3 Settings editor (`.jp-SettingsEditor`) — 3 columns

| Column / element | Light | Dark |
|---|---|---|
| layout | `260px 1fr 360px` (nav / form / JSON) | same |
| **nav** | surface white, right border fog; sticky search (`#0E2542`-equiv sunken field, teal focus); section labels Montserrat 700/9.5px UPPER teal-deep | `#122A47`, teal-bright labels |
| nav item | grid `16px 1fr auto`, 12.5px; active = sunken bg + 2px teal left rail + bold | teal-bright rail |
| modified badge | magenta `#E63558` pill, white, mono 9.5px | magenta-bright on ink |
| **form** | paper bg; max-width 720px; head w/ breadcrumb + eyebrow (`· 3 modified` in magenta) + 24px title + teal underline | dark; teal-bright |
| field row | grid `1fr auto`, 14px vertical, fog bottom border; **modified field** = `rgba(31,160,160,.04)` bg + 2px teal left rail | `rgba(79,209,209,.06)` |
| field key | Montserrat 600/13px ink + mono `code` path chip (sunken/fg-3) + teal "Modified" mark | bright |
| controls | segmented (active navy/white), switch (teal on), number input w/ unit hint, select | active teal/ink in dark |
| **JSON pane** | surface, left border fog; header eyebrow teal-deep + mono filename; body mono 12px/1.55, keys navy, strings green, numbers gold, booleans magenta, comments slate-italic; **modified lines** teal-tinted w/ 2px teal rail + line numbers | keys `#6BB1FF`, str `#6FCF97`, num `#E0A04A`, bool `#FF6B86` |

### 9.4 File browser panel — see §8.3 (it's the left panel).

### 9.5 Git panel (`.jp-Git-*` / `.jp-Diff-*`) — right panel, 300px

| Element | Light | Dark |
|---|---|---|
| panel | surface white, left border fog; header eyebrow teal-deep | `#122A47`, border `#1B385C` |
| branch selector | mono 12px, branch name magenta-deep, ahead/behind counts mono fg-3 | magenta-bright |
| section labels | Montserrat 700/10px UPPER fg-3 ("Staged" / "Changed" / "Untracked") | same |
| **status letter** | square 16px chip: M = gold `#C97C0A`, A = green `#1F8A5E`, D = magenta, U = slate | bright variants |
| file row | mono 12px filename, hover sunken, stage/unstage chevron action | dark sunken |
| **diff view** | mono 12px/1.55; added lines `rgba(31,138,94,.10)` bg + green text + green left gutter; removed `rgba(230,53,88,.08)` + magenta; gutter line numbers fg-3 | brightened add/del |
| commit box | textarea (surface, fog border, teal focus), primary "Commit" navy/white | teal/ink |

### 9.6 Table of Contents panel (`.jp-Toc-*`) — right panel, 300px

| Element | Light | Dark |
|---|---|---|
| panel | surface white, left border fog; header eyebrow teal-deep | `#122A47` |
| heading row | Roboto 13px, `padding: 5px 12px`, indent 14px per level (h1→h6), hover sunken | dark sunken |
| **active heading** | teal-deep text + 2px teal left rail + sunken bg | teal-bright |
| numbering | optional mono fg-3 prefix (`1.`, `1.2`) | same |
| h1 weight 600 ink, deeper levels lighten toward fg-3 | | |

### 9.7 Debugger panel (`.jp-Panel-*` / `.jp-Bp-*` / `.jp-Frame-*` / `.jp-Var-*`)

| Element | Light | Dark |
|---|---|---|
| panel | surface white, left border fog; section eyebrows teal-deep | `#122A47` |
| toolbar | continue/step/over/out/stop icon buttons (24–28px, fg-2, hover sunken); stop = magenta hover | bright |
| **breakpoints list** | row w/ magenta dot + mono `file:line` + condition; hover sunken | magenta-bright dot |
| **call stack** | frames as rows, current frame = teal left rail + sunken bg; mono function name + line | teal-bright |
| **variables tree** | name (mono fg-1) : value (mono, type-colored — num gold, str green, bool magenta); expand chevron fg-3; nested indent 14px | bright value colors |
| source breakpoint gutter | magenta filled circle in the editor gutter | magenta-bright |

> Every surface in §9 lives in the middle band → it inverts fully between modes
> via the token table. Only the brand **accent brightening** (teal→`#4FD1D1`,
> magenta→`#FF6B86`, syntax/status lifts) and the **primary-button text
> white→ink** flip are non-obvious — everything else is the same token mapped to
> its light or dark value. Geometry, fonts, and spacing never change.

---

## 10. Floating & transient surfaces — exact build

> **Source file:** all §10 surfaces are in **`JupyterLab Theme.html`**, driven
> from the Tweaks panel: Context menu → `Context menu: *` (Code completion /
> Find & replace / Command palette / File menu / Cell·File·Tab context),
> Dialogs → `Dialog preview: *` (Restart / Save as / Shutdown), Tooltips →
> `Tooltip: *`, Notifications → `Notifications: *`, Terminal → `View: Terminal`,
> Overlays → `Overlay: *`. Search the `<style>` block for the class in each
> heading; the React render blocks near the bottom of the file hold the markup.

Menus, dialogs, tooltips, notifications. All live above the shell (high
z-index) and **flip fully** via the token table; per-mode notes below are the
only deviations.

### 10.1 Context menus & palettes

**Context menu (`.lm-Menu`)** — right-click + menubar dropdowns
| Property | Light | Dark |
|---|---|---|
| panel | surface white, 1px fog border, radius 8, `padding: 4px`, min-width 230px | `#122A47`, border `#1B385C` |
| shadow | `0 12px 28px rgba(15,61,110,.18)` | `0 12px 28px rgba(0,0,0,.55)` |
| item | grid `22px 1fr auto 14px` (icon/label/shortcut/submenu), 28px tall, 12.5px/500, radius 4 | same |
| item hover/active | navy `#0F3D6E` bg, white text | teal bg, **ink text** |
| icon col | 14px `currentColor` fg-3 | same |
| shortcut | `font-mono` 11px fg-3, → `rgba(255,255,255,.8)` when active | `rgba(11,31,56,.65)` |
| submenu arrow | 10px fg-3 `▸` | same |
| separator | 1px fog, `margin: 4px 6px` | `#1B385C` |
| header | Montserrat 700/9.5px UPPER `0.14em` teal-deep | teal-bright |
| danger item | magenta text; hover = magenta bg/white | magenta-bright; hover bright bg/ink |

**Command palette (`.jp-CommandPalette`)** — ⌘⇧C
| Property | Light | Dark |
|---|---|---|
| scrim | `rgba(11,31,56,.40)` + 2px blur, panel anchored 72px from top, centered | `rgba(5,15,29,.55)` |
| panel | 580px, surface, radius 10, **3px teal left rail**, max-h 64vh | `#122A47`, teal-bright rail |
| search row | 14px pad, magnifier fg-3, input Roboto 15px, `esc` chip (mono 10px on sunken) | dark |
| section eyebrow | Montserrat 700/10px UPPER teal-deep + count fg-3 | teal-bright |
| command row | grid `18px 1fr auto` (icon/label/shortcut), 7px pad; **active = navy bg/white** | teal bg/ink |
| match highlight | `<mark>` teal-tint bg + teal-deep bold | teal-bright |
| footer | sunken bg, mono kbd hints (↑↓ / ↵ / esc) | dark sunken |

**Code completion (`.jp-Completer`)**
| Property | Light | Dark |
|---|---|---|
| popup | grid `260px 1fr` (list / detail), 620px, surface, radius 8, shadow as menu | `#122A47` |
| list item | grid `20px 1fr auto`, 5px pad; active = navy bg/white | teal bg/ink |
| **kind badge** | 18px square, mono 9px/700: method=teal · function=navy · class=gold · param=green · property=magenta · keyword=slate | brightened tints |
| label | mono 12.5px/500; `<mark>` prefix teal-tint | teal-bright |
| detail pane | paper bg; eyebrow teal-deep; signature mono 12px on surface w/ 2px teal rail (param names teal-deep); doc Roboto 12px/1.55 | dark; teal-bright |
| footer | mono 10px file location + kbd `↵`/`esc` | same |

**Find & replace (`.jp-SearchBar`)**
| Property | Light | Dark |
|---|---|---|
| bar | fixed top-right (`top:110px; right:80px`), 480px, surface, fog border, radius 8, `padding: 10px 12px` | `#122A47` |
| rows | grid `84px 1fr auto` (toggles / input / nav) | same |
| toggle group | Aa/W/.* buttons in sunken pill; active = teal bg/white | teal/ink |
| input | 30px, layout bg, strong border, teal focus; count `3 / 7` mono fg-3 | `#0E2542` |
| nav btns | 26px ↑/↓/✕ fg-2, hover sunken | dark |
| replace btns | "Replace" secondary + "Replace all" primary navy | teal/ink primary |
| scope row | top border + select (mono 11px) | dark |

### 10.2 Dialogs (`.jp-Dialog`)

| Property | Light | Dark |
|---|---|---|
| scrim | `rgba(11,31,56,.50)` + 2px blur, centered | `rgba(5,15,29,.65)` |
| panel | 440px, surface, radius 10, fog border, **4px brand-color left rail** (teal default, **magenta if danger**) | `#122A47`; shadow `rgba(0,0,0,.65)` |
| rise anim | `jp-dialog-rise` 240ms | same |
| header | 28px icon circle (teal-tint bg, or magenta-tint if danger) + eyebrow (Montserrat 700/10px UPPER teal-deep) + title (700/17px) + close ✕ | bright tints |
| body | Roboto 14px/1.6 fg-2; `code` chips sunken; `strong` fg-1 | dark; code teal-bright |
| form fields (Save as) | label Montserrat 600/11px fg-3 + mono input (layout bg, strong border, teal focus) + hint fg-3 | `#0E2542` input |
| footer | sunken bg, top border, right-aligned, `gap: 8px` | dark sunken |
| buttons | ghost / secondary / **primary navy** / danger magenta; in dark primary = teal/ink | per-mode |
| variants | **Restart** = teal rail + 3-btn footer; **Save as** = teal rail + path field; **Shutdown** = `is-danger` magenta rail/icon/eyebrow + danger button | same |

### 10.3 Tooltips (`.jp-Tooltip`)

| Property | Light | Dark |
|---|---|---|
| bubble | **always dark** ink `#0B1F38` bg, paper text, radius 6, `padding: 8px 12px`, max-width 280px, shadow `rgba(0,0,0,.35)` | `#050F1D` bg, shadow `.65` |
| arrow | 8px rotated square, auto-positioned (top/bottom/left/right variant classes) | same |
| anchor highlight | pulsing 2px teal ring + soft halo on the target element | teal-bright |
| **shortcut variant** | single row: label + mono kbd chip (`rgba(255,255,255,.10)` bg, teal text) | teal-bright chip |
| **help variant** | 2px teal left rail; title (600/12.5px white) + body (Roboto 11.5px mist) + inline `code` (teal) | teal-bright |
| **rich variant** | title + body + meta footer (mono 10px, top border, "Open ↗" link teal) | teal-bright link |
| **status variant** | colored dot (green idle/running) + single line | same |

Tooltips do NOT invert — they're dark chrome in both modes (only the bg deepens).

### 10.4 Notifications (`.jp-Notification`) — toast stack, bottom-left

| Property | Light | Dark |
|---|---|---|
| stack | fixed `bottom:36px; left:16px`, `gap: 10px`, max-width 360px | same |
| toast | surface white, fog border, radius 10, grid `30px 1fr auto`, `padding: 14px`, slide-in anim | `#122A47`, border `#1B385C` |
| shadow | `0 8px 20px rgba(15,61,110,.12)` | `rgba(0,0,0,.50)` |
| **left rail** (variant) | success green `#1F8A5E` · info teal · warn gold `#C97C0A` · error magenta | brightened |
| icon badge | 22px circle, variant-tinted bg + matching icon | translucent + bright icon |
| title | Montserrat 600/13px fg-1 | `#F4F6FA` |
| body | Roboto 12.5px fg-2; `code` chips sunken | code teal-bright |
| actions | 26px buttons: primary navy / ghost / danger; primary = teal/ink in dark | per-mode |
| **progress toast** | spinner (teal border-top) + animated teal→navy progress bar | teal-bright |
| close | 22px ✕ fg-3, hover sunken | dark |
| variants | **Saved** (success+View commit), **Promoting** (info+spinner+progress), **Error** (magenta+Reconnect/Restart), **Stack of 3** (success+info+warn together) | same |

### 10.5 Right-rail panels (Debugger / Git / ToC)

Full specs in **§9.5–9.7**. Shared frame in both modes: 300px width, surface
white→`#122A47`, left border fog→`#1B385C`, header eyebrow Montserrat
700/10–11px UPPER teal-deep→teal-bright, body text fg-2. State accents
(current frame, active heading, staged status) use the teal rail in light and
teal-bright in dark; destructive/removed states use magenta→magenta-bright.

### 10.6 Views (Terminal / Launcher / Settings)

- **Launcher** — full spec **§9.1** (flips fully; primary card gradient navy→teal, text white→ink).
- **Settings** — full spec **§9.3** (3-column; modified rails teal, badges magenta).
- **Terminal (`.jp-Terminal`)** — **always dark** like the bars:
  | Property | Light | Dark |
  |---|---|---|
  | body bg | `#0B1F38` | `#050F1D` (deeper) |
  | tab strip | `#050F1D`, shell tabs mono 12px, active = teal-bright text + 2px bottom border | same |
  | text | `font-mono` 13px/1.55, fog `#E4E9F0` | same |
  | prompt | user teal-bright · host blue `#6BB1FF` · cwd gold · git-branch magenta-bright · `❯` teal-bright | same |
  | cursor | blinking teal-bright block | same |
  | ANSI palette | red→`#FF6B86` · green `#6FCF97` · yellow `#E0A04A` · blue `#6BB1FF` · cyan `#4FD1D1` · inverse = teal-bright bg/ink | same |

> **Floating-surface summary:** menus, dialogs, palettes, completer, find-bar,
> and notifications **flip** with the tokens. Tooltips and the terminal are
> **always-dark chrome** (only deepen). The recurring non-obvious flips are the
> same two everywhere: **active/primary fills go navy(light)→teal(dark) with
> white→ink text**, and **teal/magenta brighten** for dark contrast.
```
