/* -----------------------------------------------------------------------------
 | Data4Now JupyterLab Theme
 | Registers the theme with JupyterLab's ThemeManager.
 |---------------------------------------------------------------------------*/

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { IThemeManager } from '@jupyterlab/apputils';

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@data4now/jupyterlab-theme:plugin',
  description: 'Data4Now brand theme for JupyterLab (light + dark).',
  requires: [IThemeManager],
  activate: (app: JupyterFrontEnd, manager: IThemeManager) => {
    const lightStyle = '@data4now/jupyterlab-theme/index.css';
    const darkStyle  = '@data4now/jupyterlab-theme/index-dark.css';

    manager.register({
      name: 'Data4Now',
      isLight: true,
      load: () => manager.loadCSS(lightStyle),
      unload: () => Promise.resolve(undefined)
    });

    manager.register({
      name: 'Data4Now Dark',
      isLight: false,
      load: () => manager.loadCSS(darkStyle),
      unload: () => Promise.resolve(undefined)
    });
  },
  autoStart: true
};

export default plugin;
