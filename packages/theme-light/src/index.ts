import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

/**
 * Data4Now Light — `IThemeManager` registration.
 *
 * WHY THIS PLUGIN IS ALMOST EMPTY, AND WHY THAT IS THE DESIGN
 * ----------------------------------------------------------
 * PRD §7.3 sketches each theme package importing the combined token stylesheet.
 * We deliberately do not: `@d4n/ui-overrides` ships the token CSS ONCE, and it
 * carries both modes scoped by `[data-jp-theme-light]` on <body> (PRD §5.3).
 *
 * Importing it from both theme packages instead would ship the same ~8KB twice
 * as two separate federated bundles — webpack cannot dedupe across them — and,
 * worse, it would put the tokens behind `IThemeManager.loadCSS()`, which
 * performs a fetch on every switch. That fetch is exactly the unstyled frame G4
 * forbids. With the tokens already in the document, switching modes is an
 * attribute swap: a repaint, not a fetch.
 *
 * So what this plugin actually contributes is the two things only a registered
 * theme can: it makes "Data4Now Light" selectable in Settings ▸ Theme, and it
 * makes JupyterLab write `data-jp-theme-name` and `data-jp-theme-light` onto
 * <body> — the attributes every rule in the token stylesheet is gated on.
 *
 * Registering a real theme (rather than just shipping CSS) is also required for
 * a second reason: several extensions branch on `themeManager.isLight()`, and a
 * CSS-only redesign leaves them guessing (PRD §5.3).
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/theme-light:plugin',
  description: 'Data4Now design system — light mode.',
  requires: [IThemeManager],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IThemeManager,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlab_d4n');
    const style = '@d4n/theme-light/index.css';

    manager.register({
      name: 'Data4Now Light',
      displayName: trans.__('Data4Now Light'),
      isLight: true,
      // PRD §6.1: the scrollbar spec is part of the design, and core only
      // applies --jp-scrollbar-* when the active theme opts in.
      themeScrollbars: true,
      load: () => manager.loadCSS(style),
      unload: () => Promise.resolve(undefined)
    });
  }
};

export default plugin;
