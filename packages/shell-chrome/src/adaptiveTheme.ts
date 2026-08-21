import { IThemeManager } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Settings plugin that owns theme selection in JupyterLab 4.x.
 */
const THEMES_PLUGIN_ID = '@jupyterlab/apputils-extension:themes';

/**
 * Theme identity, shared by every bridge in this package.
 *
 * The prefix is the JS mirror of the `body[data-jp-theme-name^='Data4Now']`
 * gate every structural rule in `@d4n/ui-overrides` is scoped under (PRD AC10).
 * The bridges honour it for the same reason the CSS does: pick a stock theme and
 * you get stock JupyterLab back, including in the surfaces CSS cannot reach.
 */
export const D4N_THEME_PREFIX = 'Data4Now';
export const D4N_LIGHT_THEME = 'Data4Now Light';
export const D4N_DARK_THEME = 'Data4Now Dark';

/** `true` when one of our two themes is the active theme. */
export function isD4nTheme(manager: IThemeManager): boolean {
  return manager.theme?.startsWith(D4N_THEME_PREFIX) ?? false;
}

/**
 * Light/dark for the active theme, defaulting to light.
 *
 * `IThemeManager.isLight()` indexes an internal record and throws for a name it
 * has never seen — reachable during startup, when a theme saved by a since-removed
 * extension is still in the user's settings.
 */
export function isLightTheme(manager: IThemeManager): boolean {
  const name = manager.theme;
  if (!name) {
    return true;
  }
  try {
    return manager.isLight(name);
  } catch {
    return true;
  }
}

/**
 * OS colour-scheme following (PRD §5.4).
 *
 * JupyterLab 4.1+ ships this itself behind the `adaptive-theme` setting, which
 * `overrides.json` turns on. We register the `matchMedia` listener anyway,
 * unconditionally: PRD §5.4 makes the fallback a requirement "regardless", so the
 * package spans the whole supported version range with no version sniffing here
 * and no branching in the settings layer.
 *
 * Running both is safe because every path through `sync()` is idempotent — the
 * `current === target` guard turns the duplicate into a no-op instead of a second
 * stylesheet load.
 */
export function activateAdaptiveTheme(
  themeManager: IThemeManager,
  settingRegistry: ISettingRegistry | null
): void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');

  let settings: ISettingRegistry.ISettings | null = null;

  const preferences = () => {
    const composite = settings?.composite ?? {};
    return {
      // Absent `adaptive-theme` means an older JupyterLab whose schema has no such
      // key. Defaulting to `true` there is what makes this the fallback §5.4 asks
      // for; on 4.1+ the user's own value wins, so switching it off switches us off.
      adaptive: (composite['adaptive-theme'] as boolean | undefined) ?? true,
      light:
        (composite['preferred-light-theme'] as string | undefined) ??
        D4N_LIGHT_THEME,
      dark:
        (composite['preferred-dark-theme'] as string | undefined) ??
        D4N_DARK_THEME
    };
  };

  const sync = () => {
    const { adaptive, light, dark } = preferences();
    if (!adaptive) {
      return;
    }
    const current = themeManager.theme;
    const target = query.matches ? dark : light;
    if (!current || current === target) {
      return;
    }
    // The "do not fight the user" rule. We only ever flip between the two
    // preferred themes. If the active theme is anything else — JupyterLab Dark, a
    // third-party theme, the other half of a design system someone is trialling —
    // it was an explicit choice, and yanking it away on an OS event is a bug the
    // user cannot diagnose.
    if (current !== light && current !== dark) {
      return;
    }
    void themeManager.setTheme(target);
  };

  query.addEventListener('change', sync);

  const start = async () => {
    if (settingRegistry) {
      try {
        settings = await settingRegistry.load(THEMES_PLUGIN_ID);
        // Editing `preferred-*-theme` should take effect without a reload.
        settings.changed.connect(sync);
      } catch {
        // apputils-extension absent or its schema failed to load; the defaults
        // above are still a working configuration.
        settings = null;
      }
    }
    // One sync at startup covers the case the media listener never fires: the OS
    // was already dark when the previously saved theme was light.
    sync();
  };

  void start();
}
