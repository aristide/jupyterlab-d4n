/**
 * The `IStatusBar` replacement that is NOT going to be built.
 *
 * PRD §8.5.1 classifies the status bar T3 and gives four reasons the token
 * cannot deliver §8.5.2. Audited against a running 4.6.3, **all four are
 * reachable from CSS** — including the one §8.5.1 calls out as needing a
 * wrapper, because the DOM already distinguishes controls from readouts. The
 * bar shipped as T2 in `ui-overrides/style/surfaces/status-bar.css`, core's
 * `@jupyterlab/statusbar-extension:plugin` stays enabled, and nothing was added
 * to `page_config.json`. The measurements are in `docs/decisions.md` D-015.
 *
 * WHAT IS LEFT IS TODO(P2-14), AND IT IS NOT A SWAP. Core hides `priority: 0`
 * items below 630px from a private `_isWindowNarrow`; §8.5.2 asks for 1024px and
 * a `⋯` trigger that collapses items right-to-left into a popover. That is the
 * one part of the spec that genuinely needs JavaScript.
 *
 * The shape it should take is now settled by precedent rather than by argument:
 * `@d4n/shell-chrome:menu-bar-overflow` (P2-02, D-017) does the same job for the
 * menu bar by providing no token and replacing nothing — it just does the
 * missing work over the public API. `IStatusBar` exposes the items it holds, so
 * the same approach should reach §8.5.2 without displacing core's plugin.
 *
 * Expect the breakpoint to move, too. 1024px is a viewport number for a bar
 * whose available room depends on what has been registered into it; the menu bar
 * turned out to need available width instead, and by about a factor of two.
 *
 * Nothing is exported here but the id, kept because it is referenced from
 * `index.ts` and from TODO.md. **Do not register a plugin that provides
 * `IStatusBar`** — it would shadow core's working status bar, which is the whole
 * thing D-015 decided against.
 */
export const STATUS_BAR_PLUGIN_ID = '@d4n/shell-chrome:status-bar';
