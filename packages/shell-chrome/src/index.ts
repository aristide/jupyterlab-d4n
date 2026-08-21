import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITerminalTracker } from '@jupyterlab/terminal';

import { activateAdaptiveTheme } from './adaptiveTheme';
import { activateEditorThemeSync } from './editorThemeSync';
import { activateTerminalBridge } from './terminalBridge';

/**
 * `@d4n/shell-chrome` — the T4 bridges (PRD §7.9).
 *
 * Everything in this package exists because CSS cannot reach it. xterm.js paints
 * to canvas, Lumino's DataGrid paints to canvas, the CodeMirror theme is a
 * JavaScript object, and the OS colour-scheme query is an event. §7.9 names this
 * "the section most redesigns skip, and it is why most redesigns have a terminal
 * that looks wrong."
 *
 * WHY AN ARRAY AND NOT ONE PLUGIN
 * -------------------------------
 * Three unrelated concerns with three different failure modes: a theme-following
 * listener, a settings write, and a canvas repaint. A single plugin makes them
 * one on/off switch, so a user hitting a problem with one has to disable all
 * three — and an activation error in any one of them takes the other two down
 * with it. Separate ids mean `jupyter labextension disable
 * @d4n/shell-chrome:terminal` is a real option.
 *
 * The DataGrid bridge is intentionally *not* a plugin. `buildGridStyle` and
 * `buildTextRenderer` are exported for `@d4n/ui-overrides` and the debugger hook
 * to consume; the widget-level wiring for the CSV viewer and the variables grid
 * lands with those packages, so the factories stay in one place per §7.9 while
 * their two consumers stay independent.
 */

const adaptiveTheme: JupyterFrontEndPlugin<void> = {
  id: '@d4n/shell-chrome:adaptive-theme',
  description: 'Follows the OS light/dark preference (PRD §5.4).',
  requires: [IThemeManager],
  optional: [ISettingRegistry],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    themeManager: IThemeManager,
    settingRegistry: ISettingRegistry | null
  ) => {
    activateAdaptiveTheme(themeManager, settingRegistry);
  }
};

const editorThemeSync: JupyterFrontEndPlugin<void> = {
  id: '@d4n/shell-chrome:editor-theme-sync',
  description:
    'Keeps the CodeMirror 6 theme locked to the application theme (PRD §7.5).',
  requires: [IThemeManager, ISettingRegistry],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    themeManager: IThemeManager,
    settingRegistry: ISettingRegistry
  ) => {
    void activateEditorThemeSync(themeManager, settingRegistry);
  }
};

const terminalBridge: JupyterFrontEndPlugin<void> = {
  id: '@d4n/shell-chrome:terminal',
  description: 'Pushes the token palette into xterm.js (PRD §8.7).',
  requires: [IThemeManager],
  // Optional, so a deployment without the terminal extension — JupyterLite, a
  // kernel-only image — activates this plugin and does nothing rather than
  // failing to activate and dragging a console error into every session.
  optional: [ITerminalTracker],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    themeManager: IThemeManager,
    tracker: ITerminalTracker | null
  ) => {
    activateTerminalBridge(themeManager, tracker);
  }
};

const plugins: JupyterFrontEndPlugin<void>[] = [
  adaptiveTheme,
  editorThemeSync,
  terminalBridge
];

export default plugins;

export {
  D4N_DARK_THEME,
  D4N_LIGHT_THEME,
  D4N_THEME_PREFIX,
  isD4nTheme,
  isLightTheme
} from './adaptiveTheme';
export { density } from './density';
export type { D4nDensity } from './density';
export { buildGridStyle, buildTextRenderer } from './gridStyle';
export { buildTerminalTheme } from './terminalBridge';

// Deferred T3 plugin replacements. See each module for the reasoning and the
// TODO id; none of them registers anything yet.
export { LAUNCHER_PLUGIN_ID } from './launcher';
export { SPLASH_PLUGIN_ID } from './splash';
export { STATUS_BAR_PLUGIN_ID } from './statusBar';
