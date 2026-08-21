import { IThemeManager } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PartialJSONObject } from '@lumino/coreutils';

import { isD4nTheme, isLightTheme } from './adaptiveTheme';

/**
 * The settings-holding plugin of `@jupyterlab/codemirror-extension`.
 *
 * Note this is `:plugin`, not `:themes` or `:extensions`. Those two provide the
 * registries; `:plugin` is the one whose schema the user's editor configuration
 * is persisted against.
 */
const CODEMIRROR_PLUGIN_ID = '@jupyterlab/codemirror-extension:plugin';

/**
 * The editor theme is not a top-level setting. In JupyterLab 4 every CodeMirror
 * feature is an entry in `IEditorExtensionRegistry`, and the registry's user
 * configuration is one object — `defaultConfig` — keyed by extension name. The
 * theme registers itself there under `theme`, alongside `lineNumbers`,
 * `lineWrap`, `tabSize` and the rest. Writing `defaultConfig` as a whole is
 * therefore the only way in, which is why the merge below matters.
 */
const CONFIG_KEY = 'defaultConfig';
const THEME_KEY = 'theme';

/** Names registered by `@d4n/editor-theme`. */
const EDITOR_THEME_LIGHT = 'd4n-light';
const EDITOR_THEME_DARK = 'd4n-dark';

/**
 * Keep the CodeMirror 6 theme locked to the application theme (PRD §7.5:
 * "Users must never have to switch two themes.").
 */
export async function activateEditorThemeSync(
  themeManager: IThemeManager,
  settingRegistry: ISettingRegistry
): Promise<void> {
  let settings: ISettingRegistry.ISettings;
  try {
    settings = await settingRegistry.load(CODEMIRROR_PLUGIN_ID);
  } catch {
    // No CodeMirror extension (a stripped deployment, or a JupyterLab that moved
    // the plugin id). Nothing to sync; the editor keeps whatever theme it has.
    return;
  }

  const sync = async () => {
    // PRD AC10 again: on a stock theme we leave the editor setting alone rather
    // than pinning a Data4Now editor theme under JupyterLab Dark.
    if (!isD4nTheme(themeManager)) {
      return;
    }
    const wanted = isLightTheme(themeManager)
      ? EDITOR_THEME_LIGHT
      : EDITOR_THEME_DARK;

    // `user`, not `composite`: composite is user-over-schema-defaults, and writing
    // it back would freeze today's defaults into the user's settings file, so a
    // future JupyterLab default change would silently never reach them.
    const existing = (settings.user[CONFIG_KEY] ?? {}) as PartialJSONObject;
    if (existing[THEME_KEY] === wanted) {
      return;
    }
    // Spread, never replace — `defaultConfig` carries every other editor option
    // the user has ever changed.
    await settings.set(CONFIG_KEY, { ...existing, [THEME_KEY]: wanted });
  };

  // The equality guard above is load-bearing here, not just a micro-optimisation:
  // every write persists to the user's settings file over HTTP, and terminal
  // AC T8 flips the theme twenty times in a row.
  themeManager.themeChanged.connect(() => {
    void sync();
  });

  await sync();
}
