# Component Source Index — exact anchors

For every JupyterLab component: the **exact CSS banner**, the **exact HTML tag
or JS render call**, and the **line number** in `JupyterLab Theme.html` (7158
lines). To pull the literal code: open the file at the line, or `grep` the
quoted anchor string. CSS lives in the `<style>` block (lines 9–4135); static
markup in `<body>` (4137–5580); React-rendered components in `<script
type="text/babel">` (5581–end).

> Token base for all of it: `assets/colors_and_type.css` (`--d4n-*`, `--font-*`).
> Light values on `:root` / `.jp-app` scope; dark values under `body.is-dark`
> (search `body.is-dark .<class>` for any component's dark overrides).

> **The line numbers in the tables below are stale. Do not trust them. Search
> for the quoted anchor instead.** Measured on 2026-09-02, after P0-02 rebuilt
> the file: rows up to `IPYWIDGETS` (L610) are correct, every CSS banner after
> that point is 76 lines low, and every body anchor is 103 lines low. The JS
> column cites banner comments such as `// ===== NOTIFICATIONS =====` that are
> not in the file at all — the React section names its components with
> `function NotifHost()` and similar. The drift comes from an older revision of
> the design page, not from the rebuild, which preserved every line number.
> Tracked as `TODO.md` **P0-11**.

## Tokens & shell

| Component | CSS anchor (line) | Markup / render anchor (line) | Render type |
|---|---|---|---|
| Token map (`--jp-*`) | `:root {` ~L14 | — | CSS vars |
| Dark token overrides | `body.is-dark {` (search) | — | CSS vars |
| App shell grid | `/* ===== APP SHELL ===== */` L77 — `.jp-app` | `<div class="jp-app">` L4062 | static |
| Top menubar | `/* ===== TOP MENUBAR (#jp-top-panel) ===== */` L84 — `.jp-menubar` | `<header class="jp-menubar">` L4064 | static |
| Left rail | `/* ===== SIDEBAR RAIL (.jp-SideBar) ===== */` L169 — `.jp-rail` | `<div class="jp-main">` L4089 (rail inside) | static |
| File-browser panel | `/* ===== SIDEBAR PANEL (file browser) ===== */` L194 — `.jp-sidebar` | inside `.jp-main` L4089 | static |
| Dock tab strip | `.jp-tabbar` (search L307) | inside content L297 | static |
| Status bar | `.jp-status` (search) | `<footer class="jp-status">` L5439 | static |
| Status-bar Simple switch | `.jp-status-switch` (search) | `<div class="jp-status-switch" id="simple-switch">` inside status footer | static + JS `#simple-switch` listener |
| Single-doc top-bar title | `.jp-menubar-title` (search) | `<div class="jp-menubar-title">` inside `<header class="jp-menubar">` | static, shown via `body.simple-mode` |
| Simple-mode rules | `body.simple-mode .jp-tabbar` / `.jp-menubar-title` (search `simple-mode`) | toggled by `body.simple-mode` | CSS state |

## Notebook & main views

| Component | CSS anchor (line) | Markup / render anchor (line) | Render type |
|---|---|---|---|
| Notebook cells | `.jp-cell` / `.jp-editor` / `tok-*` (search) | inside `.jp-notebook` (search `class="jp-notebook"`) | static |
| Outputs (df/error/stream/chart) | `.jp-output`, `.jp-df`, `.jp-chart` (search) | inside notebook cells | static |
| ipywidgets | `/* ===== IPYWIDGETS (.jp-Widget) ===== */` L610 | cell `In [5]` — `class="jp-Widget"` (search) | static |
| Launcher | `/* ===== LAUNCHER (.jp-Launcher) ===== */` L3030 — `.jp-launcher` | `<section class="jp-launcher"` L4476 | static |
| Terminal | `/* ===== TERMINAL (.jp-Terminal) ===== */` L2179 | `<section class="jp-Terminal"` L4618 | static |
| Settings editor | `/* ===== SETTINGS EDITOR (.jp-SettingsEditor) ===== */` L1608 | `<section class="jp-SettingsEditor"` L4668 | static |

## Right-rail panels (shared frame L894)

| Component | CSS anchor (line) | Render anchor | Render type |
|---|---|---|---|
| Panel frame | `/* ===== RIGHT-RAIL PANELS ===== */` L894 | toggled by `body.panel-*` class | static |
| Debugger | `/* ===== DEBUGGER ===== */` L1023 — `.jp-Panel-debug-status`, `.jp-Bp-*`, `.jp-Frame-*`, `.jp-Var-*` | inside `.jp-main` | static |
| Git | `/* ===== GIT ===== */` L1246 — `.jp-Git-toolbar`, `.jp-Git-*`, `.jp-Diff-*` | inside `.jp-main` | static |
| Table of Contents | `/* ===== TABLE OF CONTENTS ===== */` L1464 — `.jp-Toc-*` | inside `.jp-main` | static |

## Floating / transient (React — find both the CSS banner AND the JS render fn)

| Component | CSS anchor (line) | JS render fn (line) | Mount node |
|---|---|---|---|
| Context menu | `/* ===== CONTEXT MENU (.lm-Menu) ===== */` L3657 | `// ===== CONTEXT MENU =====` L6077 (`ContextMenu`, `MenuHost`) | `<div id="menu-root">` L5465 |
| Command palette | `/* ===== COMMAND PALETTE (.jp-CommandPalette) ===== */` L3258 | rendered in `ContextMenu` (kind `'Command palette'`) L6077 | `#menu-root` |
| Menubar dropdowns (File/Edit/View/Run/Kernel/Git/Tabs/Settings/Help) | `.lm-Menu` (same banner as context menu) | data arrays `FILE_MENU_ITEMS`/`EDIT_MENU`/`VIEW_MENU`/`RUN_MENU`/`KERNEL_MENU`/`GIT_MENU`/`TABS_MENU`/`SETTINGS_MENU`/`HELP_MENU` + map `MENUBAR_MENUS` (search); rendered by `ContextMenu` (kind `'<Name> menu'`); a menubar IIFE wires `.jp-menu-item` clicks → `CustomEvent('menu-change',{detail:{menu,left}})` | `#menu-root` |
| Theme/New submenus | — | `THEME_SUBMENU` / `FILE_NEW_SUBMENU` arrays; `Submenu` component | `#menu-root` |
| Code completion | `/* ===== CODE COMPLETION (.jp-Completer) ===== */` L2293 | `ContextMenu` (kind `'Code completion'`) | `#menu-root` |
| Find & replace | `/* ===== FIND & REPLACE (.jp-SearchBar) ===== */` L2476 | `ContextMenu` (kind `'Find & replace'`) | `#menu-root` |
| Dialog | `/* ===== DIALOG (.jp-Dialog) ===== */` L3796 | `// ===== DIALOG =====` L5944 (`Dialog`, `DialogHost`) | `<div id="dialog-root">` L5468 |
| Notifications | `/* ===== NOTIFICATIONS (.jp-Notification) ===== */` L3444 | `// ===== NOTIFICATIONS =====` L6550 (`Toast`, `NotifHost`) | `<div id="notifications-root">` L5462 |
| Tooltips | `/* ===== TOOLTIP (.jp-Tooltip) ===== */` L2652 | `// ===== TOOLTIPS =====` L6744 (`TooltipHost`) | `<div id="tooltip-root">` L5456 |
| Connection-lost banner | `.jp-ConnLost` (search ~L2800) | `// ===== OVERLAYS =====` L6657 (`OverlayHost`, kind `'Connection lost'`) | `<div id="overlay-root">` L5459 |
| Splash / boot | `/* ===== SPLASH / BOOT (.jp-Splash) ===== */` L2876 | `OverlayHost` (kind `'Splash'`) L6657 | `#overlay-root` |

## How the React surfaces are driven

All transient surfaces share one pattern (so you can replicate the exact
markup): a `*Host` component holds React state, listens for a
`CustomEvent('<name>-change', { detail })` dispatched by the Tweaks panel's
`update()`, and renders the matching variant. To read a component's exact JSX,
open the render fn at the line above. Example calls already in the file:

```js
window.dispatchEvent(new CustomEvent('dialog-change', { detail: { dialog: 'Restart kernel' } }));
window.dispatchEvent(new CustomEvent('menu-change',   { detail: { menu: 'Command palette' } }));
window.dispatchEvent(new CustomEvent('notif-change',  { detail: { notif: 'Stack of 3' } }));
window.dispatchEvent(new CustomEvent('tooltip-change',{ detail: { tooltip: 'Help' } }));
window.dispatchEvent(new CustomEvent('overlay-change',{ detail: { overlay: 'Splash' } }));
// view + body-class toggles (static surfaces):
document.body.classList.toggle('view-launcher');   // Launcher
document.body.classList.toggle('view-terminal');   // Terminal
document.body.classList.toggle('view-settings');   // Settings
document.body.classList.toggle('panel-debugger');  // right panel: Debugger
document.body.classList.toggle('simple-mode');     // single-document (Simple) mode
document.body.classList.toggle('is-dark');         // dark mode
```

## JupyterHub pages (server-rendered mocks — all static HTML)

Each is a standalone file; CSS in its own `<style>` (or `admin-shared.css`).

| Component | File | CSS anchor | Markup anchor |
|---|---|---|---|
| Login | `JupyterHub Login.html` | `.login-*`, `.sso-*` | `<aside class="brand-panel">` / `<main class="login-panel">` |
| Spawner cards | `Image Picker.html` | `.ip-*` | React: `image-picker.jsx` + `image-data.jsx` |
| Control panel | `Hub Control Panel.html` | `.hub-*` | `<div class="hub-server-card">` etc. |
| Admin chrome (shared) | `preview-assets/admin-shared.css` | `.ah-header/.ah-subnav/.ah-stat/.ah-table/.ah-toolbar/.ah-pagination` | imported by all admin pages |
| Admin: Users | `Hub Admin Panel.html` | `.user-cell`, `.role-pill`, `.status-pill` | `<table class="ah-table">` |
| Admin: Servers | `Hub Admin Servers.html` | `.ah-cluster`, `.server-cell`, `.usage-cell` | `<table class="ah-table">` |
| Admin: Images | `Hub Admin Images.html` | `.image-*`, `.approval-*`, `.cve` | `<table class="ah-table">` |
| Admin: Groups | `Hub Admin Groups.html` | `.gr-*`, `.role-mtx` | `<div class="gr-layout">` |
| Admin: Audit | `Hub Admin Audit Log.html` | `.audit-*` | `<div class="ah-audit-layout">` |
| Admin: Config | `Hub Admin Config.html` | `.cfg-*`, `.provider-*`, `.danger-zone` | `<div class="cfg-layout">` |
| Spawn failure | `Spawn Failure.html` | `.sf-*` | `<div class="sf-card">` |
| Quota modal | `Quota Exceeded.html` | `.qx-*` | `<div class="qx-dialog">` |
| 404 / sign-out / expired | `Status Pages.html` | `.st-*` | `<section class="st-panel" data-panel="...">` (×3) |
| Form controls | `Form Controls.html` | `.btn/.inp/.sel/.chk/.rad/.sw/.sl/.tag/.kpi` | one `<section>` per control |
| Icons | `Icon Set.html` + `icons/` | `d4n-{name}` | `icons/{category}/{name}.svg` + `icons/sprite.svg` |

> Line numbers are approximate (the file evolves) — always confirm by grepping
> the quoted banner/tag string, which is stable.
