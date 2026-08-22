/**
 * T3 replacement for `ILauncher` — NOT IMPLEMENTED YET.
 *
 * TODO(P2-15): build it, and disable core's plugin in the same change.
 *
 * This stub used to carry P2-08 and the whole of §8.11. It does not any more.
 * Audited against a running 4.6.3, the card geometry, the responsive grid, the
 * kernel plate (D-010) and the launch-target readout are all reachable from CSS
 * and shipped as T2 in `ui-overrides/style/surfaces/launcher.css`. Core's
 * `@jupyterlab/launcher-extension:plugin` stays enabled. `docs/decisions.md`
 * D-016 has the split and the measurements.
 *
 * WHAT IS LEFT — the four parts of §8.11 that CSS genuinely cannot reach:
 *
 *   - fixed section order (core orders by the category rank other plugins pass
 *     to `ILauncher.add`)
 *   - the root-directory copy (core renders the cwd string, and at root that
 *     string is empty, so the heading renders blank — §8.11.4 is wrong that the
 *     readout is net-new; only this case is)
 *   - the no-kernels error state (core renders an empty section, not a message)
 *   - search above ~12 kernels
 *
 * WEIGH IT BEFORE BUILDING IT. `launcher:create` is resolved BY COMMAND ID from
 * four other places — the file browser toolbar `+`, File ▸ New Launcher, the
 * dock panel `+` tab button and the command palette. A replacement that provides
 * `ILauncher` but misses that id leaves four dead affordances in four parts of
 * the application, none of which look like the launcher's fault. That is the
 * same trap D-015 found in the status bar's surviving settings schema.
 *
 * As with the status bar, no placeholder plugin: providing `ILauncher` without an
 * implementation would displace the working core launcher.
 */
export const LAUNCHER_PLUGIN_ID = '@d4n/shell-chrome:launcher';
