import { JupyterFrontEndPlugin } from '@jupyterlab/application';

/**
 * `@d4n/ui-overrides` — the always-loaded CSS layer.
 *
 * WHERE THE WORK ACTUALLY HAPPENS
 * -------------------------------
 * The payload of this package is `style/index.css`: the generated token
 * stylesheet plus one file per surface under `style/surfaces/`. JupyterLab's
 * builder wires `styleModule` into the federated bundle's entry point, so the
 * CSS is injected when the bundle loads — strictly before any plugin activates.
 * That ordering is why this `activate` can be a diagnostic and nothing else.
 *
 * WHY IT IS A PLUGIN AT ALL
 * -------------------------
 * A `styleModule` with no `JupyterFrontEndPlugin` behind it is not a labextension
 * the user can see or disable. Registering a real plugin puts an entry in the
 * extension manager, which is what makes AC10 ("users can still switch to stock
 * themes") true in practice: disable this one plugin and every structural rule
 * goes with it, because they all live behind the `body[data-jp-theme-name^=…]`
 * scope this package's stylesheet is the only thing that fills in.
 *
 * This is deliberately NOT a theme. Themes are mutually exclusive and get
 * unloaded on switch; the structural layer must survive a switch between
 * Data4Now Light and Data4Now Dark, so it is a plain `autoStart` plugin loaded
 * independently of `IThemeManager` (PRD §7.4).
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/ui-overrides:plugin',
  description:
    'Data4Now design system — token custom properties and structural CSS.',
  autoStart: true,
  activate: (): void => {
    // Tier 1 lands on bare `:root`, unlike Tiers 2-4 which are gated on the
    // theme attribute. So this probe answers "did the stylesheet reach the
    // document at all?" without also answering "is a Data4Now theme active?" —
    // the second question has a legitimate "no" and must not warn.
    const probe = getComputedStyle(document.documentElement)
      .getPropertyValue('--d4n-color-palette-neutral-0')
      .trim();

    if (!probe) {
      // A missing stylesheet leaves every rule in this package inert and the
      // application rendering as stock JupyterLab. That is a degraded state,
      // not a broken one — never throw here, or a bad build takes the shell
      // down with it.
      console.warn(
        '[@d4n/ui-overrides] The Data4Now token stylesheet is not present in ' +
          'the document. Surfaces will render as stock JupyterLab. Check that ' +
          'the labextension was built after `jlpm build:tokens`.'
      );
    }
  }
};

export default plugin;
