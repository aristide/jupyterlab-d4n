import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

/**
 * Data4Now Dark — `IThemeManager` registration.
 *
 * The exact mirror of `@d4n/theme-light`, which carries the full reasoning for
 * why this plugin ships no tokens of its own: see the header comment in
 * packages/theme-light/src/index.ts.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/theme-dark:plugin',
  description: 'Data4Now design system — dark mode.',
  requires: [IThemeManager],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IThemeManager,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlab_d4n');
    const style = '@d4n/theme-dark/index.css';

    manager.register({
      name: 'Data4Now Dark',
      displayName: trans.__('Data4Now Dark'),
      isLight: false,
      // PRD §6.1: the scrollbar spec is part of the design, and core only
      // applies --jp-scrollbar-* when the active theme opts in.
      themeScrollbars: true,
      load: () => manager.loadCSS(style),
      unload: () => Promise.resolve(undefined)
    });
  }
};

export default plugin;
