# Component Source Index — exact anchors

For every JupyterLab component: the **exact CSS banner**, the **exact HTML tag
or JS render call**, and the **line number** in `JupyterLab Theme.html` (7158
lines). To pull the literal code: open the file at the line, or `grep` the
quoted anchor string. CSS lives in the `<style>` block (lines 9–4135); static
markup in `<body>` (4137–5580); React components in `<script
type="text/babel">` (5581–end).

> Token base for all of it: `assets/colors_and_type.css` (`--d4n-*`, `--font-*`).
> Light values on `:root` / `.jp-app` scope; dark values under `body.is-dark`
> (search `body.is-dark .<class>` for any component's dark overrides).

> **Every anchor below is checked.** `jlpm lint:anchors` reads each
> `` `string` L#### `` pair and asserts that the string is on that line of
> `JupyterLab Theme.html`. The pairs are literal: paste one into `grep -F` and
> it matches. An anchor written without a line number is deliberate — it means
> "search for this, it moves". Re-derived on 2026-09-03 (TODO **P0-11**), after
> the numbers had drifted 76 lines on CSS and 103 lines on markup.

## Tokens & shell

| Component | CSS anchor (line) | Markup / render anchor (line) | Render type |
|---|---|---|---|
| Token map (`--jp-*`) | `:root {` L14 | — | CSS vars |
| Dark token overrides | `body.is-dark {` L43 | — | CSS vars |
| App shell grid | `/* ============= APP SHELL ============= */` L77 | `<div class="jp-app">` L4138 | static |
| Top menubar | `/* ============= TOP MENUBAR (#jp-top-panel) ============= */` L84 | `<header class="jp-menubar">` L4140 | static |
| Main row | `/* ============= MAIN ROW ============= */` L162 | `<div class="jp-main">` L4170 | static |
| Left rail | `/* ============= SIDEBAR RAIL (.jp-SideBar) ============= */` L169 | inside `<div class="jp-main">` L4170 | static |
| File-browser panel | `/* ============= SIDEBAR PANEL (file browser) ============= */` L194 | inside `<div class="jp-main">` L4170 | static |
| Content area | `/* ============= CONTENT AREA ============= */` L297 | inside `<div class="jp-main">` L4170 | static |
| Dock tab strip | `.jp-tabbar {` L306 | `<div class="jp-tabbar">` L4301 | static |
| Status bar | `.jp-status {` L858 | `<footer class="jp-status">` L5533 | static |
| Status-bar Simple switch | `.jp-status-switch {` L887 | `id="simple-switch"` L5542 | static, plus a JS listener |
| Single-doc top-bar title | `.jp-menubar-title` L934 | inside `<header class="jp-menubar">` L4140 | static, shown by `body.simple-mode` |
| Simple-mode rules | `/* ============= SINGLE-DOCUMENT (SIMPLE) MODE =============` L927, first rule `body.simple-mode .jp-tabbar` L931 | the `simple-mode` class on `<body>` | CSS state |

## Notebook & main views

| Component | CSS anchor (line) | Markup / render anchor (line) | Render type |
|---|---|---|---|
| Notebook frame | `.jp-notebook {` L403 | `<div class="jp-notebook">` L4356 | static |
| Notebook cells | `.jp-cell {` L421, editor `.jp-editor {` L455 | inside `<div class="jp-notebook">` L4356 | static |
| Outputs | `.jp-output {` L539, dataframe `.jp-df` L570, chart `.jp-chart` L794 | inside the cells | static |
| ipywidgets | `/* ============= IPYWIDGETS (.jp-Widget) =============` L610 | `<div class="jp-Widget">` L4492 | static |
| Launcher | `/* ============= LAUNCHER (.jp-Launcher) =============` L3106 | `<section class="jp-launcher"` L4556 | static |
| Terminal | `/* ============= TERMINAL (.jp-Terminal) =============` L2255 | `<section class="jp-Terminal"` L4712 | static |
| Settings editor | `/* ============= SETTINGS EDITOR (.jp-SettingsEditor) =============` L1684 | `<section class="jp-SettingsEditor"` L4762 | static |

## Right-rail panels

| Component | CSS anchor (line) | Render anchor | Render type |
|---|---|---|---|
| Shared panel frame | `/* ============= RIGHT-RAIL PANELS (Debugger / Git / ToC) =============` L970 | a `panel-*` class on `<body>` | static |
| Debugger | `/* ============= DEBUGGER ============= */` L1099, first rule `.jp-Panel-debug-status` L1100 | inside `<div class="jp-main">` L4170 | static |
| Git | `/* ============= GIT ============= */` L1322, first rule `.jp-Git-toolbar` L1323 | inside `<div class="jp-main">` L4170 | static |
| Table of Contents | `/* ============= TABLE OF CONTENTS ============= */` L1540, rows `.jp-Toc-row` L1598 | inside `<div class="jp-main">` L4170 | static |

## Floating and transient (React — the CSS banner AND the render function)

| Component | CSS anchor (line) | JS render fn (line) | Mount node |
|---|---|---|---|
| Context menu | `/* ============= CONTEXT MENU (.lm-Menu) =============` L3733 | `function ContextMenu({ kind, anchorLeft }) {` L6460, host `function MenuHost() {` L6838 | `<div id="menu-root">` L5568 |
| Command palette | `/* ============= COMMAND PALETTE (.jp-CommandPalette) =============` L3334 | `ContextMenu` with kind `'Command palette'` | `#menu-root` |
| Menubar dropdowns | the context-menu banner | items `const FILE_MENU_ITEMS = [` L6314 and its siblings, map `const MENUBAR_MENUS = {` L6448, drawn by `ContextMenu`; the wiring dispatches `menu-change` L5612 | `#menu-root` |
| Theme and New submenus | the context-menu banner | `const FILE_NEW_SUBMENU = [` L6335, `const THEME_SUBMENU = [` L6430, component `function Submenu({ left, top, items, header }) {` L6233 | `#menu-root` |
| Code completion | `/* ============= CODE COMPLETION (.jp-Completer) =============` L2369 | `ContextMenu` with kind `'Code completion'` | `#menu-root` |
| Find and replace | `/* ============= FIND & REPLACE (.jp-SearchBar) =============` L2552 | `ContextMenu` with kind `'Find & replace'` | `#menu-root` |
| Dialog | `/* ============= DIALOG (.jp-Dialog) =============` L3872 | `function Dialog({ kind }) {` L6087, host `function DialogHost() {` L6198 | `<div id="dialog-root">` L5571 |
| Notifications | `/* ============= NOTIFICATIONS (.jp-Notification) =============` L3520 | `function Toast({ variant, title, body, actions, progress, onClose }) {` L6891, host `function NotifHost() {` L6928 | `<div id="notifications-root">` L5565 |
| Tooltips | `/* ============= TOOLTIP (.jp-Tooltip) =============` L2728 | `function TooltipHost() {` L7077 | `<div id="tooltip-root">` L5559 |
| Connection-lost banner | `.jp-ConnLost {` L2850 | `function OverlayHost() {` L6988, kind `'Connection lost'` | `<div id="overlay-root">` L5562 |
| Splash and boot | `/* ============= SPLASH / BOOT (.jp-Splash) =============` L2952 | `function OverlayHost() {` L6988, kind `'Splash'` | `#overlay-root` |

`OverlayHost` and `TooltipHost` came back with P0-02. The first import stopped
at 262 144 bytes, which cut the file inside `NotifHost`, so all three were
absent until 2026-09-02.

## How the React surfaces are driven

All transient surfaces share one pattern, so you can reproduce the exact markup.
A `*Host` component holds React state, listens for a
`CustomEvent('<name>-change', { detail })` that the Tweaks panel dispatches, and
draws the matching variant. To read a component's JSX, open its render function
at the line above. These calls work in the console:

```js
window.dispatchEvent(new CustomEvent('dialog-change', { detail: { dialog: 'Restart kernel' } }));
window.dispatchEvent(new CustomEvent('menu-change',   { detail: { menu: 'Command palette' } }));
window.dispatchEvent(new CustomEvent('notif-change',  { detail: { notif: 'Stack of 3' } }));
window.dispatchEvent(new CustomEvent('tooltip-change',{ detail: { tooltip: 'Help' } }));
window.dispatchEvent(new CustomEvent('overlay-change',{ detail: { overlay: 'Splash' } }));
// view and body-class toggles (static surfaces):
document.body.classList.toggle('view-launcher');   // Launcher
document.body.classList.toggle('view-terminal');   // Terminal
document.body.classList.toggle('view-settings');   // Settings
document.body.classList.toggle('panel-debugger');  // right panel: Debugger
document.body.classList.toggle('simple-mode');     // single-document (Simple) mode
document.body.classList.toggle('is-dark');         // dark mode
```

## JupyterHub pages

**Eleven of these files are not in this repo.** They exist in the Claude Design
project, and nobody imported them. `preview-assets/admin-shared.css` and
`admin-shared.js` did come across, which is how we know the pages are real. They
are out of scope for this project, so the rows stay as a map of what is
upstream. Import a file before you cite it.

| Component | File | Imported | CSS anchor | Markup anchor |
|---|---|---|---|---|
| 404, sign-out, expired | `Status Pages.html` | yes | `.st-*` | `<section class="st-panel" data-panel="...">` (×3) |
| Form controls | `Form Controls.html` | yes | `.btn/.inp/.sel/.chk/.rad/.sw/.sl/.tag/.kpi` | one `<section>` per control |
| Icons | `Icon Set.html` and `icons/` | yes | `d4n-{name}` | `icons/{category}/{name}.svg`, `icons/sprite.svg` |
| Admin chrome (shared) | `preview-assets/admin-shared.css` | yes | `.ah-header/.ah-subnav/.ah-stat/.ah-table/.ah-toolbar/.ah-pagination` | used by every admin page |
| Login | `JupyterHub Login.html` | **no** | `.login-*`, `.sso-*` | `<aside class="brand-panel">`, `<main class="login-panel">` |
| Spawner cards | `Image Picker.html` | **no** | `.ip-*` | React: `image-picker.jsx`, `image-data.jsx` |
| Control panel | `Hub Control Panel.html` | **no** | `.hub-*` | `<div class="hub-server-card">` |
| Admin: Users | `Hub Admin Panel.html` | **no** | `.user-cell`, `.role-pill`, `.status-pill` | `<table class="ah-table">` |
| Admin: Servers | `Hub Admin Servers.html` | **no** | `.ah-cluster`, `.server-cell`, `.usage-cell` | `<table class="ah-table">` |
| Admin: Images | `Hub Admin Images.html` | **no** | `.image-*`, `.approval-*`, `.cve` | `<table class="ah-table">` |
| Admin: Groups | `Hub Admin Groups.html` | **no** | `.gr-*`, `.role-mtx` | `<div class="gr-layout">` |
| Admin: Audit | `Hub Admin Audit Log.html` | **no** | `.audit-*` | `<div class="ah-audit-layout">` |
| Admin: Config | `Hub Admin Config.html` | **no** | `.cfg-*`, `.provider-*`, `.danger-zone` | `<div class="cfg-layout">` |
| Spawn failure | `Spawn Failure.html` | **no** | `.sf-*` | `<div class="sf-card">` |
| Quota modal | `Quota Exceeded.html` | **no** | `.qx-*` | `<div class="qx-dialog">` |
