import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Package names covered by a file in `style/vendor/` — the P0 and P1 rows of
 * PRD §10.4. Exported so the Galata matrix suite can assert that every entry
 * here still has a snapshot, and so `docs/compat-matrix.md` has exactly one
 * source of truth to be checked against.
 *
 * These are *package* names, not plugin ids: an extension's plugin ids are
 * `<package>:<name>` and the suffix changes far more often than the package.
 */
export const SHIMMED_PACKAGES: ReadonlyArray<string> = [
  '@jupyterlab/git',
  '@jupyter-lsp/jupyterlab-lsp',
  '@jupyter-widgets/base',
  '@jupyter-widgets/controls',
  '@jupyter-widgets/jupyterlab-manager',
  'jupyterlab-execute-time',
  '@lckr/jupyterlab_variableinspector',
  'jupyterlab-jupytext'
];

/**
 * Scopes whose packages ship *with* JupyterLab and are therefore already
 * covered by the Tier-4 adapter. `@jupyterlab/git` is the exception that makes
 * the ordering matter — it lives under the core scope but is third-party — so
 * `SHIMMED_PACKAGES` is always consulted first.
 */
const CORE_SCOPES = [
  '@jupyterlab/',
  '@jupyter/',
  '@jupyter-notebook/',
  '@jupyterlite/',
  '@d4n/'
];

const packageOf = (pluginId: string): string => {
  const sep = pluginId.lastIndexOf(':');
  return sep === -1 ? pluginId : pluginId.slice(0, sep);
};

/**
 * `@d4n/compat-shim` — third-party extension compatibility (PRD §10.4).
 *
 * WHY A PLUGIN AT ALL, FOR A CSS-ONLY PACKAGE
 * -------------------------------------------
 * The payload is `style/index.css`, pulled in by `styleModule`. The plugin
 * exists for two reasons that CSS cannot cover.
 *
 * First, `styleModule` is only honoured for packages JupyterLab loads as
 * extensions, so the package needs a plugin to have its stylesheet loaded at
 * all. It is deliberately not registered as a theme: theme stylesheets are
 * fetched on every switch (see the comment in `@d4n/theme-light`), and every
 * rule here is already gated on `body[data-jp-theme-name^='Data4Now']`, so a
 * user on a stock theme gets stock rendering without any load/unload dance.
 *
 * Second, the failure mode this package is built to prevent is silent: a user
 * installs an extension nobody on the team has seen, it hardcodes `#fff`, and
 * dark mode turns unreadable. On startup we diff the installed plugin list
 * against the matrix and name the gap, so the report is "these three are
 * unshimmed" rather than a screenshot six weeks later.
 *
 * Nothing here throws or blocks: `listPlugins` is Lumino API that has moved
 * between the `Application` and the plugin registry across 4.x, so it is
 * feature-detected and the whole audit is best-effort.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/compat-shim:plugin',
  description:
    'Data4Now design system — compatibility CSS for third-party extensions.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    void app.restored.then(() => {
      const unshimmed = listUnshimmedPackages(app);
      if (unshimmed.length === 0) {
        return;
      }
      // console.debug, not warn: an unshimmed extension is a known, accepted
      // P2/P3 state (PRD §10.4), not an error. It should be findable in the
      // console when someone asks "why does this panel look wrong", and
      // invisible otherwise.
      console.debug(
        '[@d4n/compat-shim] No Data4Now compatibility CSS for: ' +
          unshimmed.join(', ') +
          '. These render with their own colours and may not match the theme. ' +
          'See @d4n/compat-shim/docs/compat-matrix.md.'
      );
    });
  }
};

/**
 * Installed extension packages with no file in `style/vendor/`.
 *
 * Returns an empty list rather than throwing if the plugin registry cannot be
 * enumerated — a diagnostic must never be the reason a shell fails to start.
 */
function listUnshimmedPackages(app: JupyterFrontEnd): string[] {
  let ids: string[];
  try {
    const list = (app as { listPlugins?: () => string[] }).listPlugins;
    if (typeof list !== 'function') {
      return [];
    }
    ids = list.call(app) ?? [];
  } catch {
    return [];
  }

  const seen = new Set<string>();
  for (const id of ids) {
    const pkg = packageOf(id);
    if (SHIMMED_PACKAGES.indexOf(pkg) !== -1) {
      continue;
    }
    if (CORE_SCOPES.some(scope => pkg.startsWith(scope))) {
      continue;
    }
    seen.add(pkg);
  }
  return Array.from(seen).sort();
}

export default plugin;
