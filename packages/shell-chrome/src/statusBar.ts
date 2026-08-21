/**
 * T3 replacement for `IStatusBar` — NOT IMPLEMENTED YET.
 *
 * TODO(P2-07): build the replacement status bar.
 *
 * PRD §8.5.1 explains why this is T3 rather than a CSS job: the status bar's
 * layout — left/middle/right item groups, ranks, and the overflow behaviour at
 * the §8.5.2 breakpoint — is decided in `StatusBar`'s own widget code, so no
 * amount of scoped CSS produces the specified arrangement. The replacement
 * provides the same `IStatusBar` token so every third-party item that registers
 * against it keeps working (§10.4).
 *
 * Nothing is exported here but the id the plugin will claim. Registering a
 * placeholder plugin that provides `IStatusBar` without implementing it would be
 * worse than absent: it would shadow core's working status bar.
 */
export const STATUS_BAR_PLUGIN_ID = '@d4n/shell-chrome:status-bar';
