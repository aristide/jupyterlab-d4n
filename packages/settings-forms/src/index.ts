import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  IFormRenderer,
  IFormRendererRegistry
} from '@jupyterlab/ui-components';

/**
 * The renderer table: `'<plugin-id>.<property>'` → RJSF field/widget override.
 *
 * WHY THIS IS EMPTY, AND WHY THE PACKAGE STILL EARNS ITS PLACE
 * ------------------------------------------------------------
 * `FormRendererRegistry.addRenderer()` splits its id at the LAST `.` into a
 * plugin id and a single property name, and the settings editor looks a
 * renderer up by that exact pair. There is no wildcard, no schema-type key, and
 * no "all fields" hook: PRD §7.7 states the consequence plainly — **global
 * widget replacement is not available through this API**.
 *
 * So the design system reaches the settings editor along two paths, and only
 * one of them runs through this file:
 *
 *   1. `style/settings-forms.css` — the global pass. It restyles every RJSF
 *      field by class name and covers ~85% of them (§7.7 step 1). That half is
 *      delivered by `styleModule`, which JupyterLab loads when the federated
 *      extension is loaded, NOT when this plugin activates — so the CSS lands
 *      even in a build where `IFormRendererRegistry` is missing entirely.
 *   2. This table — the targeted pass. One entry per field where CSS provably
 *      cannot reach spec, each naming its plugin and property explicitly
 *      because the API gives us no other way to say it.
 *
 * Phase 4 fills the table (P4-03 keybinding capture, P4-04 theme picker,
 * P4-05 editor config, P4-06 font picker, P4-07 colour picker); see
 * `src/renderers/README.md`. Until then an empty table is the correct state,
 * not a stub — the loop below is a no-op and every field falls through to (1).
 */
const RENDERERS: Record<string, IFormRenderer> = {};

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/settings-forms:plugin',
  description: 'Data4Now design system — settings editor form field renderers.',
  requires: [IFormRendererRegistry],
  autoStart: true,
  activate: (app: JupyterFrontEnd, registry: IFormRendererRegistry) => {
    for (const [id, renderer] of Object.entries(RENDERERS)) {
      try {
        registry.addRenderer(id, renderer);
      } catch (err) {
        // `addRenderer` throws — it does not warn and return — when the id is
        // already taken. A third-party extension claiming the same field would
        // otherwise abort this activate() partway through, silently dropping
        // every renderer after it in iteration order. Losing one field to a
        // conflict is acceptable; losing the rest of the table to it is not.
        console.warn(
          `[@d4n/settings-forms] could not register renderer "${id}"; ` +
            'the stock field will be used instead.',
          err
        );
      }
    }
  }
};

export default plugin;
