/**
 * T3 replacement for `ILauncher` — NOT IMPLEMENTED YET.
 *
 * TODO(P2-08): build the replacement launcher.
 *
 * PRD §8.11.1 makes the same argument as the status bar: the card grid, its
 * sections and the §8.11.4 launch-target context are structure, not styling, and
 * they live inside core's `Launcher` widget. §8.11.3 adds the constraint that
 * actually forces the rewrite — kernel logos are not `LabIcon`s (§7.8.2), so the
 * card cannot theme them and has to render them on the designed kernel plate
 * instead.
 *
 * As with the status bar, no placeholder plugin: providing `ILauncher` without an
 * implementation would displace the working core launcher.
 */
export const LAUNCHER_PLUGIN_ID = '@d4n/shell-chrome:launcher';
