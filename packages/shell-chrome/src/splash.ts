/**
 * T3 replacement for `ISplashScreen` — NOT IMPLEMENTED YET.
 *
 * TODO(P2-09): build the branded splash screen.
 *
 * The splash is the first frame of the application and core's version is
 * hardcoded Jupyter branding, so it is the one surface where the §8.9 brand slots
 * cannot be filled by CSS. It also has to honour the §10.5 performance budget:
 * the splash paints before the token stylesheet is guaranteed to have loaded, so
 * its own colours are inlined rather than read from custom properties.
 *
 * No placeholder plugin — providing `ISplashScreen` without an implementation
 * would disable core's splash and leave a blank frame during startup.
 */
export const SPLASH_PLUGIN_ID = '@d4n/shell-chrome:splash';
