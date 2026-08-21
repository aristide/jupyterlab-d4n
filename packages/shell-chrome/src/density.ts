import { ISignal, Signal } from '@lumino/signaling';

export type D4nDensity = 'comfortable' | 'compact';

/**
 * The attribute `@d4n/ui-overrides` gates its density-dependent rules on. It is
 * the single source of truth for the current density: CSS reads it as a selector,
 * this module reads it as a value, and nothing has to keep two copies in step.
 */
const DENSITY_ATTRIBUTE = 'data-d4n-density';

const DEFAULT_DENSITY: D4nDensity = 'comfortable';

/**
 * Density state, minus the user-facing control.
 *
 * TODO(P5-04): the comfortable/compact toggle — the command, its settings
 * binding, persistence across reloads, and the `overrides.json` default — is a
 * Phase 5 task. What exists here is only the part the T4 bridges need today: the
 * xterm bridge must repaint on density change (PRD §8.7.4 trigger 3), because
 * terminal font size is density-dependent and xterm cannot read the CSS that
 * drives every other surface.
 *
 * Until P5-04 lands nothing writes the attribute, `current` stays `comfortable`
 * and `changed` never emits — the bridges degrade to the comfortable metrics
 * rather than failing.
 */
class DensityManager {
  constructor() {
    // Observing the attribute rather than exposing only a setter means P5-04 can
    // land the toggle as a pure DOM/CSS concern and this signal still fires. It
    // also keeps us honest if anything else — a Galata test, a user's custom
    // JS — flips the attribute directly.
    if (
      typeof MutationObserver === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return;
    }
    const target = document.body;
    if (!target) {
      return;
    }
    this._current = DensityManager.read(target);
    new MutationObserver(() => {
      const next = DensityManager.read(target);
      if (next === this._current) {
        return;
      }
      this._current = next;
      this._changed.emit(next);
    }).observe(target, {
      attributes: true,
      attributeFilter: [DENSITY_ATTRIBUTE]
    });
  }

  get current(): D4nDensity {
    return this._current;
  }

  get changed(): ISignal<DensityManager, D4nDensity> {
    return this._changed;
  }

  private static read(target: HTMLElement): D4nDensity {
    return target.getAttribute(DENSITY_ATTRIBUTE) === 'compact'
      ? 'compact'
      : DEFAULT_DENSITY;
  }

  private _current: D4nDensity = DEFAULT_DENSITY;
  private _changed = new Signal<DensityManager, D4nDensity>(this);
}

/** Process-wide density state. One instance, because the attribute is one. */
export const density = new DensityManager();
