import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorThemeRegistry } from '@jupyterlab/codemirror';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { buildEditorTheme } from './theme';

/**
 * Data4Now CodeMirror 6 themes — `IEditorThemeRegistry` registration (PRD §7.5).
 *
 * WHY TWO THEMES RATHER THAN ONE THAT READS THE MODE
 * --------------------------------------------------
 * `IEditorThemeRegistry` hands CodeMirror a frozen `Extension` at registration
 * time; there is no re-evaluation hook. A single mode-aware theme would have to
 * read the mode once, at activation, and would then be stuck in it. So we build
 * both up front and let the setting choose.
 *
 * The names are the identifiers the `codemirror-extension` settings store, not
 * display strings — `shell-chrome` writes `'d4n-light'` / `'d4n-dark'` into
 * `@jupyterlab/codemirror-extension:plugin` when `IThemeManager.themeChanged`
 * fires, which is the §7.5 requirement that "users must never have to switch two
 * themes". Renaming either breaks that write silently.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/editor-theme:plugin',
  description: 'Data4Now design system — CodeMirror 6 editor themes.',
  requires: [IEditorThemeRegistry],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    themes: IEditorThemeRegistry,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlab_d4n');

    const register = (
      name: string,
      displayName: string,
      isLight: boolean
    ): void => {
      // `addTheme` throws on a duplicate name, which would take the whole plugin
      // down and leave the editor unthemed. A second activation is not supposed
      // to happen, but a dev-mode reload is not worth a broken editor.
      if (themes.themes.some(theme => theme.name === name)) {
        return;
      }
      themes.addTheme({
        name,
        displayName,
        theme: buildEditorTheme(isLight)
      });
    };

    register('d4n-light', trans.__('Data4Now Light'), true);
    register('d4n-dark', trans.__('Data4Now Dark'), false);
  }
};

export default plugin;

export { buildEditorTheme } from './theme';
export { buildHighlightStyle } from './highlight';
export {
  breakpointField,
  breakpointGutter,
  debugDecorations,
  executionLineField,
  executionLineHighlight,
  setBreakpointsEffect,
  setExecutionLineEffect
} from './debugDecorations';
export type {
  BreakpointState,
  IBreakpointGutterOptions,
  IBreakpointMark
} from './debugDecorations';
