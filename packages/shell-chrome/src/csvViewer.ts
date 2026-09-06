import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  createToolbarFactory,
  InputDialog,
  IThemeManager,
  IToolbarWidgetRegistry,
  WidgetTracker
} from '@jupyterlab/apputils';
import {
  CSVDelimiter,
  CSVViewer,
  CSVViewerFactory,
  TSVViewerFactory
} from '@jupyterlab/csvviewer';
import type { TextRenderConfig } from '@jupyterlab/csvviewer';
import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { ISearchProviderRegistry } from '@jupyterlab/documentsearch';
import { IMainMenu } from '@jupyterlab/mainmenu';
import type { ISearchProviderFactory } from '@jupyterlab/documentsearch';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';
import type { DataGrid } from '@lumino/datagrid';
import type { IObservableList } from '@jupyterlab/observables';
import type { Widget } from '@lumino/widgets';

import { buildGridStyle, buildTextRenderConfig } from './gridStyle';

/**
 * T3 replacement for the CSV and TSV viewers (PRD §7.9, §8.6.2 D1/D2,
 * TODO.md P3-11, docs/decisions.md D-038).
 *
 * WHY THIS IS A SWAP AND NOT A BRIDGE, WHICH IS THE OPPOSITE OF THE OTHER GRID.
 *
 * §7.9 names two DataGrid surfaces: this one and the debugger's variables grid.
 * They turn out to need completely different treatment, and P3-11 assumed they
 * needed the same:
 *
 *   - The DEBUGGER's grid reads its colours from a hidden probe element with
 *     `getComputedStyle`, and every variable it reads is one the Tier-4 adapter
 *     already maps. It is themed today, frame and cell text, and nothing here
 *     touches it. D-038 has the measurements.
 *   - THIS one has its colours as a frozen JavaScript object of hex literals
 *     inside the extension. There is no CSS path into it and no public seam to
 *     intercept, so the plugin has to be ours.
 *
 * FOUR THINGS THAT WOULD BREAK IF THEY WERE "CLEANED UP".
 *
 * (1) BOTH core plugins are disabled, not just `:csv`. P3-11 said to disable
 *     `@jupyterlab/csvviewer-extension:csv`. The package ships TWO plugins and
 *     `:tsv` carries its own complete copy of the stock palette, so disabling
 *     one would put a Data4Now `.csv` grid next to a stock `.tsv` grid — the
 *     exact "one shade apart" failure §7.9 warns about.
 *
 * (2) THE FACTORY NAMES ARE `CSVTable` AND `TSVTable`, and they are not ours to
 *     rename. `ILayoutRestorer` stores `{ path, factory: 'CSVTable' }` in the
 *     saved workspace, so a rename orphans every restored tab a user already
 *     has. The command ids `csv:go-to-line` and `tsv:go-to-line` are fixed for
 *     the same reason D-033 fixed `launcher:create`.
 *
 * (3) THE TOOLBAR IS SCHEMA-DRIVEN, AND A DISABLED PLUGIN'S SCHEMA IS NOT
 *     SERVED. `createToolbarFactory` reads `jupyter.lab.toolbars` from the
 *     schema of the plugin id it is given, so `schema/csv.json` and
 *     `schema/tsv.json` here re-declare the delimiter item that core's schemas
 *     declared. That is the same trap D-033 measured on the launcher.
 *
 * (4) THE VIEWER TAKES A `TextRenderConfig`, NOT A `TextRenderer`. It builds its
 *     own renderer and feeds `backgroundColor` from the grid search service, so
 *     handing it `buildTextRenderer()` would not merely fail to type-check — it
 *     would delete the search-match highlight. `buildTextRenderConfig` exists
 *     for this, and carries the two match colours.
 */

/** Core's factory names. See note (2). */
const FACTORY_CSV = 'CSVTable';
const FACTORY_TSV = 'TSVTable';

/** Core's command ids. See note (2). */
const CSV_GO_TO_LINE = 'csv:go-to-line';
const TSV_GO_TO_LINE = 'tsv:go-to-line';

export const CSV_PLUGIN_ID = '@d4n/shell-chrome:csv';
export const TSV_PLUGIN_ID = '@d4n/shell-chrome:tsv';

/** Everything that differs between the two otherwise identical plugins. */
interface IViewerSpec {
  pluginId: string;
  factoryName: string;
  fileType: string;
  commandId: string;
  trackerNamespace: string;
  label: string;
  /** `CSVViewerFactory` or `TSVViewerFactory`; the only difference is the delimiter. */
  makeFactory: (
    options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<CSVViewer>>
  ) => CSVViewerFactory;
  /**
   * Whether to refresh command enablement on `shell.currentChanged` as well.
   *
   * Core does this for CSV and not for TSV, which leaves the TSV command's
   * enabled state stale when focus moves to another widget. Both get it here;
   * the asymmetry is an upstream oversight, not a design.
   */
  watchShell: boolean;
}

function activate(
  spec: IViewerSpec,
  app: JupyterFrontEnd,
  translator: ITranslator,
  restorer: ILayoutRestorer | null,
  themeManager: IThemeManager | null,
  mainMenu: IMainMenu | null,
  searchRegistry: ISearchProviderRegistry | null,
  settingRegistry: ISettingRegistry | null,
  toolbarRegistry: IToolbarWidgetRegistry | null
): void {
  const { commands, shell } = app;
  const trans = translator.load('jupyterlab');

  let toolbarFactory:
    | ((
        widget: IDocumentWidget<CSVViewer>
      ) => IObservableList<DocumentRegistry.IToolbarItem>)
    | undefined;

  if (toolbarRegistry) {
    toolbarRegistry.addFactory<IDocumentWidget<CSVViewer>>(
      spec.factoryName,
      'delimiter',
      widget => new CSVDelimiter({ widget: widget.content, translator })
    );
    if (settingRegistry) {
      // The 4th argument is the plugin id whose SCHEMA carries
      // `jupyter.lab.toolbars` — ours, not core's. See note (3).
      toolbarFactory = createToolbarFactory(
        toolbarRegistry,
        settingRegistry,
        spec.factoryName,
        spec.pluginId,
        translator
      );
    }
  }

  const factory = spec.makeFactory({
    name: spec.factoryName,
    label: trans.__(spec.label),
    fileTypes: [spec.fileType],
    defaultFor: [spec.fileType],
    // The viewer never writes, and `readOnly` is what stops the docmanager
    // offering to save a file it cannot serialise.
    readOnly: true,
    toolbarFactory,
    translator
  });

  const tracker = new WidgetTracker<IDocumentWidget<CSVViewer>>({
    namespace: spec.trackerNamespace
  });

  // Held rather than recomputed per widget: a theme change rewrites these two
  // and then replays them over every open grid, so they are the single source
  // for both new widgets and existing ones.
  let style: DataGrid.Style = buildGridStyle(isLight(themeManager));
  let rendererConfig = buildTextRenderConfig(
    isLight(themeManager)
  ) as TextRenderConfig;

  if (restorer) {
    void restorer.restore(tracker, {
      command: 'docmanager:open',
      args: widget => ({
        path: widget.context.path,
        factory: spec.factoryName
      }),
      name: widget => widget.context.path
    });
  }

  app.docRegistry.addWidgetFactory(factory);

  // THE FILE TYPE IS NOT REGISTERED HERE, and it does not need to be.
  // `csv` and `tsv` are core file types installed by the DocumentRegistry
  // constructor from `getDefaultFileTypes()`, so disabling core's plugin leaves
  // the extension, the mime type and the spreadsheet icon in place. All this
  // does is copy that icon onto the tab, which core also does.
  const fileType = app.docRegistry.getFileType(spec.fileType);

  let searchProviderInitialized = false;

  factory.widgetCreated.connect(async (_sender, widget) => {
    void tracker.add(widget);
    widget.context.pathChanged.connect(() => {
      void tracker.save(widget);
    });

    if (fileType) {
      widget.title.icon = fileType.icon!;
      widget.title.iconClass = fileType.iconClass!;
      widget.title.iconLabel = fileType.iconLabel!;
    }

    // The dynamic import is deliberately AFTER the title setters, so those run
    // synchronously in this turn — core notes the same ordering.
    //
    // THIS IS A DEEP IMPORT INTO THE PACKAGE WE DISABLE, AND IT IS DELIBERATE.
    // `CSVSearchProvider` lives in `@jupyterlab/csvviewer-extension`, not in
    // `@jupyterlab/csvviewer`, and it is 135 lines of `GridSearchService`
    // plumbing that would have to be kept in step with upstream forever if it
    // were copied. Importing the submodule pulls in that module and nothing
    // else — the package's plugins are in `index`, are never imported here, and
    // so never register. Disabling a plugin and importing a sibling module from
    // the same package is not a contradiction: `disabledExtensions` acts on
    // plugin ids at registration time, not on the bundle.
    if (searchRegistry && !searchProviderInitialized) {
      const { CSVSearchProvider } =
        await import('@jupyterlab/csvviewer-extension/lib/searchprovider');
      // The cast is a variance workaround, and `isApplicable` is what makes it
      // safe. `ISearchProviderRegistry.add` is typed `ISearchProviderFactory<Widget>`
      // while `CSVSearchProvider.createNew` narrows its argument to a
      // `DocumentWidget<CSVViewer>`, which `strictFunctionTypes` rejects. The
      // registry never calls `createNew` without first calling the provider's own
      // `isApplicable` type guard, so the narrowing it declares is the one the
      // registry already enforces.
      searchRegistry.add(
        spec.fileType,
        CSVSearchProvider as unknown as ISearchProviderFactory<Widget>
      );
      searchProviderInitialized = true;
    }

    // `.content.ready` matters: `@lumino/datagrid` and the DSV model are dynamic
    // imports, so the grid does not exist yet and assigning `.style` before this
    // resolves throws on an undefined grid.
    await widget.content.ready;
    widget.content.style = style;
    widget.content.rendererConfig = rendererConfig;
  });

  const updateThemes = () => {
    const light = isLight(themeManager);
    style = buildGridStyle(light);
    rendererConfig = buildTextRenderConfig(light) as TextRenderConfig;
    tracker.forEach(async widget => {
      await widget.content.ready;
      widget.content.style = style;
      widget.content.rendererConfig = rendererConfig;
    });
  };
  if (themeManager) {
    themeManager.themeChanged.connect(updateThemes);
  }

  // Enabled only when this viewer is BOTH tracked and the widget in front.
  // Checking the tracker alone leaves Go to Line enabled over a notebook.
  const isEnabled = () =>
    tracker.currentWidget !== null &&
    tracker.currentWidget === shell.currentWidget;

  commands.addCommand(spec.commandId, {
    label: trans.__('Go to Line'),
    execute: async () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      const result = await InputDialog.getNumber({
        title: trans.__('Go to Line'),
        value: 0
      });
      if (result.button.accept && result.value !== null) {
        widget.content.goToLine(result.value);
      }
    },
    isEnabled,
    // Copied from core so the command inspector and any programmatic caller see
    // the same shape; dropping it is a silent capability loss.
    describedBy: { args: { type: 'object', properties: {} } }
  });

  // EDIT ▸ GO TO LINE REACHES THIS VIEWER THROUGH `goToLiners`, NOT THROUGH THE
  // COMMAND ID. `mainmenu-extension` builds that one menu item from a semantic
  // group every "go to line"-capable widget registers with, and asks each
  // member's own `isEnabled` which one applies. A replacement that registers
  // the command and skips this leaves the command working from the palette and
  // the menu item dead over a CSV — a capability lost with no visible symptom,
  // which is the same shape as the schema trap in note (3).
  if (mainMenu) {
    mainMenu.editMenu.goToLiners.add({ id: spec.commandId, isEnabled });
  }

  const notify = () => {
    commands.notifyCommandChanged(spec.commandId);
  };
  tracker.currentChanged.connect(notify);
  if (spec.watchShell) {
    shell.currentChanged?.connect(notify);
  }
}

/**
 * Light unless the theme manager says otherwise.
 *
 * The default matters: with no theme manager, or before one has a theme, core
 * assumes light and so do we. Assuming dark would flash a dark grid into a light
 * application on every cold open.
 */
function isLight(themeManager: IThemeManager | null): boolean {
  return themeManager && themeManager.theme
    ? themeManager.isLight(themeManager.theme)
    : true;
}

const OPTIONAL = [
  ILayoutRestorer,
  IThemeManager,
  IMainMenu,
  ISearchProviderRegistry,
  ISettingRegistry,
  IToolbarWidgetRegistry
];

export const csvViewerPlugin: JupyterFrontEndPlugin<void> = {
  id: CSV_PLUGIN_ID,
  description:
    'Data4Now CSV viewer (replaces @jupyterlab/csvviewer-extension:csv).',
  requires: [ITranslator],
  optional: OPTIONAL,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    restorer: ILayoutRestorer | null,
    themeManager: IThemeManager | null,
    mainMenu: IMainMenu | null,
    searchRegistry: ISearchProviderRegistry | null,
    settingRegistry: ISettingRegistry | null,
    toolbarRegistry: IToolbarWidgetRegistry | null
  ) => {
    activate(
      {
        pluginId: CSV_PLUGIN_ID,
        factoryName: FACTORY_CSV,
        fileType: 'csv',
        commandId: CSV_GO_TO_LINE,
        trackerNamespace: 'csvviewer',
        label: 'CSV Viewer',
        makeFactory: options => new CSVViewerFactory(options),
        watchShell: true
      },
      app,
      translator,
      restorer,
      themeManager,
      mainMenu,
      searchRegistry,
      settingRegistry,
      toolbarRegistry
    );
  }
};

export const tsvViewerPlugin: JupyterFrontEndPlugin<void> = {
  id: TSV_PLUGIN_ID,
  description:
    'Data4Now TSV viewer (replaces @jupyterlab/csvviewer-extension:tsv).',
  requires: [ITranslator],
  optional: OPTIONAL,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    restorer: ILayoutRestorer | null,
    themeManager: IThemeManager | null,
    mainMenu: IMainMenu | null,
    searchRegistry: ISearchProviderRegistry | null,
    settingRegistry: ISettingRegistry | null,
    toolbarRegistry: IToolbarWidgetRegistry | null
  ) => {
    activate(
      {
        pluginId: TSV_PLUGIN_ID,
        factoryName: FACTORY_TSV,
        fileType: 'tsv',
        commandId: TSV_GO_TO_LINE,
        trackerNamespace: 'tsvviewer',
        label: 'TSV Viewer',
        makeFactory: options => new TSVViewerFactory(options),
        // Core omits this for TSV; see IViewerSpec.watchShell.
        watchShell: true
      },
      app,
      translator,
      restorer,
      themeManager,
      mainMenu,
      searchRegistry,
      settingRegistry,
      toolbarRegistry
    );
  }
};
