import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { LabIcon } from '@jupyterlab/ui-components';
import { LANGUAGE_MARKS, OVERRIDES, PENDING } from './manifest';
import type { IPendingIcon } from './manifest';

const LOG = '[@d4n/icons]';

/**
 * How long to coalesce DOM mutations before re-running the override pass. Long
 * enough that a burst of widget construction produces one pass rather than
 * hundreds; short enough that a lazily-loaded extension's icons are corrected
 * inside the same visual beat rather than as a visible flicker later.
 */
const REAPPLY_DEBOUNCE_MS = 200;

/**
 * `LabIcon`'s registry is a private static `Map<string, LabIcon>`.
 *
 * Reading it is the one piece of this plugin that reaches past the public API,
 * and it is deliberate. The public route, `LabIcon.resolve({ icon: name })`,
 * cannot be used to ask "is this name registered?" — when the name is unknown it
 * silently *registers a placeholder* under that name rather than throwing
 * (labicon.js: "no matching icon currently registered, create a new loading
 * icon"). Two consequences follow, and both are bad:
 *
 *  1. The `try`/`catch` the PRD §7.8 sketch wraps each override in never fires,
 *     so a stale or misspelled name reports success and shows nothing.
 *  2. The placeholder we would have created carries `_loading: true`, and the
 *     `LabIcon` constructor treats a later real registration of that name as the
 *     authority — so pre-creating it hands the icon *back* to the extension we
 *     were trying to override. Exactly backwards.
 *
 * So: look the name up, and if it is genuinely absent, leave the registry alone
 * and try again on the next pass.
 */
function iconRegistry(): Map<string, LabIcon> | null {
  const instances = (LabIcon as unknown as { _instances?: unknown })._instances;
  return instances instanceof Map ? (instances as Map<string, LabIcon>) : null;
}

/**
 * Fallback for a future JupyterLab that renames or removes `_instances`.
 *
 * `resolve` is safe *here* specifically because every key in `OVERRIDES` is a
 * core `ui-components:` name, and those are registered eagerly when
 * `@jupyterlab/ui-components` is imported — which has already happened by the
 * time this module runs. The placeholder hazard above applies to lazily
 * registered names, and we never apply those.
 */
function resolveWithoutRegistry(name: string): LabIcon | undefined {
  try {
    return LabIcon.resolve({ icon: name });
  } catch {
    return undefined;
  }
}

/** Original `svgstr` per icon, captured before first write, for `deactivate`. */
const originals = new Map<string, string>();

/** Names already reported missing, so the re-apply pass does not spam. */
const warned = new Set<string>();

/** Tears down the `MutationObserver` and its pending timer; set by `activate`. */
let stopWatching: (() => void) | null = null;

/**
 * Write every override whose target is registered and does not already hold our
 * SVG.
 *
 * Idempotence is not a nicety here, it is what stops the `MutationObserver`
 * below from looping: assigning `svgstr` rewrites live DOM nodes, which is
 * itself a mutation. Skipping icons that already match means a re-apply pass
 * triggered by our own writes performs zero writes and the cascade ends.
 *
 * @param quiet - suppress "not found" warnings (true for re-apply passes).
 * @returns the number of icons whose SVG this pass changed.
 */
function applyOverrides(quiet: boolean): number {
  const registry = iconRegistry();
  let written = 0;

  for (const [name, svgstr] of Object.entries(OVERRIDES)) {
    try {
      const icon = registry ? registry.get(name) : resolveWithoutRegistry(name);

      if (!icon) {
        if (!quiet && !warned.has(name)) {
          warned.add(name);
          console.warn(
            `${LOG} icon "${name}" is not registered in this JupyterLab build — override skipped`
          );
        }
        continue;
      }

      if (icon.svgstr === svgstr) {
        continue;
      }

      if (!originals.has(name)) {
        originals.set(name, icon.svgstr);
      }
      icon.svgstr = svgstr;
      written += 1;

      if (warned.delete(name)) {
        console.info(
          `${LOG} icon "${name}" appeared late and is now overridden`
        );
      }
    } catch (err) {
      // Per-icon, so one bad entry cannot cost us the rest of the manifest.
      console.warn(`${LOG} icon "${name}" could not be overridden`, err);
    }
  }

  return written;
}

/** One row of {@link auditRegistry}'s per-name verdict. */
export interface IRegistryAudit {
  /** Every name in the live `LabIcon` registry, sorted. */
  readonly registered: readonly string[];
  /** `OVERRIDES` keys that exist in the registry **and** currently hold our SVG. */
  readonly applied: readonly string[];
  /** `OVERRIDES` keys registered but whose live `svgstr` is not ours. */
  readonly notApplied: readonly string[];
  /** `OVERRIDES` keys that no plugin in this build ever registered. */
  readonly absentFromBuild: readonly string[];
  /** Registered names we neither override nor defer. */
  readonly uncovered: readonly string[];
  /** `LANGUAGE_MARKS` names present in this build (D-010 / PRD §7.8.2). */
  readonly deferred: readonly string[];
  /** Each `PENDING` candidate with the only fact that settles it. */
  readonly pending: readonly (IPendingIcon & {
    readonly registered: boolean;
  })[];
}

/**
 * Enumerate the live `LabIcon` registry and score `OVERRIDES` against it.
 *
 * This is the evidence source for the P0-04 icon gap analysis, and it is
 * exported rather than kept private for one reason: the registry is the union of
 * core, every `*-extension` package and every third-party labextension, so it
 * only exists in a *running* lab. A test harness reaches this through the
 * federated container —
 * `(await window._JUPYTERLAB['@d4n/icons'].get('./index'))().auditRegistry()` —
 * because JupyterLab exposes no application global to hang a command call off.
 *
 * `applied` is the load-bearing field. `OVERRIDES` containing a name proves
 * nothing (a misspelling is a silent no-op, see `manifest.ts`); a name whose
 * live `svgstr` is byte-identical to our asset proves the override landed.
 *
 * @returns the audit, or `null` if the registry is no longer readable.
 */
export function auditRegistry(): IRegistryAudit | null {
  const registry = iconRegistry();
  if (!registry) {
    return null;
  }

  const deferredNames = new Set(Object.keys(LANGUAGE_MARKS));
  const applied: string[] = [];
  const notApplied: string[] = [];
  const absentFromBuild: string[] = [];

  for (const [name, svgstr] of Object.entries(OVERRIDES)) {
    const icon = registry.get(name);
    if (!icon) {
      absentFromBuild.push(name);
    } else if (icon.svgstr === svgstr) {
      applied.push(name);
    } else {
      notApplied.push(name);
    }
  }

  const overridden = new Set(Object.keys(OVERRIDES));
  const registered = [...registry.keys()].sort();

  return {
    registered,
    applied: applied.sort(),
    notApplied: notApplied.sort(),
    absentFromBuild: absentFromBuild.sort(),
    uncovered: registered.filter(
      n => !overridden.has(n) && !deferredNames.has(n)
    ),
    deferred: [...deferredNames].filter(n => registry.has(n)).sort(),
    pending: PENDING.map(p => ({ ...p, registered: registry.has(p.name) }))
  };
}

/**
 * Data4Now icon overrides (PRD §7.8).
 *
 * NO `requires`, BY DESIGN
 * ------------------------
 * PRD §7.8 "Timing": the override pass has to land before the first render, or
 * the user watches stock glyphs get swapped out one frame in. Declaring a
 * dependency — even on something as innocuous as `ITranslator` — puts this
 * plugin behind that token's own activation in Lumino's resolution order, which
 * is the difference between "icons were never wrong" and "icons flickered".
 *
 * That constraint is also why nothing here is translated: there is no user-
 * visible string in the hot path, and the audit command's label is developer
 * tooling.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@d4n/icons:plugin',
  description: 'Data4Now design system — LabIcon overrides.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const total = Object.keys(OVERRIDES).length;
    const written = applyOverrides(false);
    console.debug(`${LOG} applied ${written}/${total} icon overrides`);

    /**
     * PRD R8: extensions loaded after us register their icons after us, and a
     * `LabIcon` registered later keeps its own SVG. There is no registration
     * signal to subscribe to, so DOM growth is the proxy — a new panel or
     * toolbar appearing is the observable consequence of the plugin that owns it
     * having initialised.
     *
     * The observer stays connected for the session rather than stopping once
     * `OVERRIDES` is fully resolved, because the case it guards is not only
     * "registered late" but "re-registered later": any extension constructing
     * `new LabIcon({ name: 'ui-components:run', … })` overwrites us, and the
     * next pass takes it back. The callback body is a flag check and a timer, so
     * the per-mutation cost is a few instructions; the actual scan runs at most
     * five times a second and only writes when something diverged.
     */
    let scheduled: number | null = null;
    const observer = new MutationObserver(() => {
      if (scheduled !== null) {
        return;
      }
      scheduled = window.setTimeout(() => {
        scheduled = null;
        applyOverrides(true);
      }, REAPPLY_DEBOUNCE_MS);
    });

    // `document.body` exists by the time a JupyterLab plugin activates, but fall
    // back rather than throw in an embedding that boots us earlier.
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true
    });

    /**
     * The P0 audit hook (TODO P5-01). Only a real, running lab can enumerate the
     * `LabIcon` registry — it is the union of core, every installed
     * `*-extension` package, and every third-party labextension, which cannot be
     * read from source. This prints that union next to what we cover, so the
     * audit produces a manifest rather than an opinion.
     *
     * Not added to the command palette: this is developer tooling, and the
     * palette is a user surface. It returns the audit as well as printing it, so
     * a harness that *can* reach `app.commands` gets structured data; one that
     * cannot calls the exported {@link auditRegistry} through the federated
     * container instead.
     */
    app.commands.addCommand('d4n-icons:audit-registry', {
      label: 'Data4Now: Audit icon registry',
      execute: () => {
        const audit = auditRegistry();
        if (!audit) {
          console.warn(
            `${LOG} cannot enumerate the registry — LabIcon._instances is no longer a Map in this build`
          );
          return null;
        }

        console.groupCollapsed(
          `${LOG} registry audit — ${audit.registered.length} registered, ${audit.applied.length} overrides live`
        );
        console.log('uncovered:', audit.uncovered);
        console.log('deferred (language marks, PRD §7.8.2):', audit.deferred);
        console.log(
          'in OVERRIDES but absent from this build:',
          audit.absentFromBuild
        );
        console.log('registered but override did not take:', audit.notApplied);
        console.log('PENDING candidates (name confirmed?):', audit.pending);
        console.groupEnd();
        return audit;
      }
    });

    stopWatching = () => {
      if (scheduled !== null) {
        window.clearTimeout(scheduled);
        scheduled = null;
      }
      observer.disconnect();
    };
  },

  // Lumino calls this when the plugin is deactivated at runtime. Without it the
  // observer outlives the plugin and keeps writing into a registry nobody asked
  // it to own.
  deactivate: () => {
    stopWatching?.();
    stopWatching = null;

    // Restore rather than leave our SVGs behind: a deactivated icon plugin that
    // still supplies the icons is indistinguishable from one that never stopped.
    for (const [name, svgstr] of originals) {
      const icon = iconRegistry()?.get(name);
      if (icon) {
        icon.svgstr = svgstr;
      }
    }
    originals.clear();
    warned.clear();
  }
};

export default plugin;
export { LOGO_MARK_SVG, OVERRIDES, LANGUAGE_MARKS, PENDING } from './manifest';
export type { IPendingIcon } from './manifest';
