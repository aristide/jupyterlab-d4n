/**
 * The name → SVG manifest for `LabIcon` overrides (PRD §7.8).
 *
 * HOW THE NAMES IN `OVERRIDES` WERE ESTABLISHED
 * ---------------------------------------------
 * Every key below was read out of `@jupyterlab/ui-components`'s
 * `lib/icon/iconimports.js`, which is the generated file that registers the
 * built-in icon set. They are not remembered, and they are not guessed.
 *
 * That distinction is the whole reason this file is structured the way it is.
 * `LabIcon.resolve({ icon: 'typo:name' })` does not throw — it *creates* a
 * placeholder icon under that name (labicon.js: "no matching icon currently
 * registered, create a new loading icon"). So a misspelled name is not a loud
 * failure, it is a silent no-op that also pollutes the registry. An unverified
 * guess is therefore strictly worse than an omission, which is why anything
 * unconfirmed lives in `PENDING` and is never applied.
 *
 * A second sweep of every other installed `@jupyterlab/*` package found zero
 * `new LabIcon(...)` registrations outside `ui-components` — the debugger, for
 * instance, aliases `runIcon`/`pauseIcon` rather than registering its own. Icons
 * belonging to `*-extension` packages and to third-party labextensions cannot be
 * enumerated from source here; that is what the runtime audit (TODO P5-01) is
 * for, and `PENDING` is its input.
 *
 * COVERAGE IS PARTIAL AND THAT IS RECORDED, NOT HIDDEN
 * ---------------------------------------------------
 * The Data4Now export ships 120 icons; `ui-components` registers ~120 names, and
 * the two sets are not the same shape. Where the design system has no equivalent
 * asset (`caret-up`, `collapse`, `move-up`, the debugger stepping glyphs) the
 * name is deliberately absent rather than mapped to an approximate neighbour —
 * see README.md "Asset gaps", which is the work item for the design side.
 */

// actions/
import chevronDownSvg from '../svg/actions/chevron-down.svg';
import chevronRightSvg from '../svg/actions/chevron-right.svg';
import closeSvg from '../svg/actions/close.svg';
import downloadSvg from '../svg/actions/download.svg';
import duplicateSvg from '../svg/actions/duplicate.svg';
import editSvg from '../svg/actions/edit.svg';
import externalSvg from '../svg/actions/external.svg';
import filterSvg from '../svg/actions/filter.svg';
import linkSvg from '../svg/actions/link.svg';
import moreHSvg from '../svg/actions/more-h.svg';
import plusSvg from '../svg/actions/plus.svg';
import redoSvg from '../svg/actions/redo.svg';
import refreshSvg from '../svg/actions/refresh.svg';
import searchSvg from '../svg/actions/search.svg';
import trashSvg from '../svg/actions/trash.svg';
import undoSvg from '../svg/actions/undo.svg';
import uploadSvg from '../svg/actions/upload.svg';

// data/
import historySvg from '../svg/data/history.svg';

// file-types/
import csvSvg from '../svg/file-types/csv.svg';
import folderSvg from '../svg/file-types/folder.svg';
import jsonSvg from '../svg/file-types/json.svg';
import markdownSvg from '../svg/file-types/markdown.svg';
import notebookSvg from '../svg/file-types/notebook.svg';
import tableSvg from '../svg/file-types/table.svg';
import terminalFileSvg from '../svg/file-types/terminal-file.svg';
import textFileSvg from '../svg/file-types/text-file.svg';
import yamlConfigSvg from '../svg/file-types/yaml-config.svg';

// identity/
import lockSvg from '../svg/identity/lock.svg';
import shieldSvg from '../svg/identity/shield.svg';
import userSvg from '../svg/identity/user.svg';
import usersSvg from '../svg/identity/users.svg';

// kernels/
import juliaSvg from '../svg/kernels/julia.svg';
import pythonKernelSvg from '../svg/kernels/python.svg';
import rLangSvg from '../svg/kernels/r-lang.svg';

// notebook/
import cellCodeSvg from '../svg/notebook/cell-code.svg';
import launcherSvg from '../svg/notebook/launcher.svg';

// sidebar/
import commandsSvg from '../svg/sidebar/commands.svg';
import debuggerSvg from '../svg/sidebar/debugger.svg';
import extensionsSvg from '../svg/sidebar/extensions.svg';
import inspectorSvg from '../svg/sidebar/inspector.svg';
import kernelSvg from '../svg/sidebar/kernel.svg';
import lineNumbersSvg from '../svg/sidebar/line-numbers.svg';
import runningSvg from '../svg/sidebar/running.svg';
import settingsSvg from '../svg/sidebar/settings.svg';
import tocSvg from '../svg/sidebar/toc.svg';

// status/
import checkSvg from '../svg/status/check.svg';
import errorXSvg from '../svg/status/error-x.svg';
import infoSvg from '../svg/status/info.svg';

// toolbar/
import clearSvg from '../svg/toolbar/clear.svg';
import copySvg from '../svg/toolbar/copy.svg';
import cutSvg from '../svg/toolbar/cut.svg';
import pasteSvg from '../svg/toolbar/paste.svg';
import runSvg from '../svg/toolbar/run.svg';
import saveSvg from '../svg/toolbar/save.svg';
import stopSvg from '../svg/toolbar/stop.svg';

/**
 * Applied at activation. Keys verified against the `ui-components` registry.
 */
export const OVERRIDES: Readonly<Record<string, string>> = {
  // Sidebar rail — PRD §7.8.1 calls these the highest-visibility icons in the
  // product: always on screen, never labelled.
  'ui-components:bug': debuggerSvg,
  'ui-components:extension': extensionsSvg,
  'ui-components:folder': folderSvg,
  'ui-components:inspector': inspectorSvg,
  'ui-components:kernel': kernelSvg,
  'ui-components:launcher': launcherSvg,
  'ui-components:palette': commandsSvg,
  'ui-components:running': runningSvg,
  'ui-components:settings': settingsSvg,
  'ui-components:toc': tocSvg,

  // Notebook / toolbar cluster — densest grouping, so optical weight matters
  // most here (PRD I3).
  'ui-components:add': plusSvg,
  'ui-components:clear': clearSvg,
  'ui-components:copy': copySvg,
  'ui-components:cut': cutSvg,
  'ui-components:paste': pasteSvg,
  'ui-components:run': runSvg,
  'ui-components:save': saveSvg,
  'ui-components:stop': stopSvg,

  // Directional / control
  'ui-components:caret-down': chevronDownSvg,
  'ui-components:caret-right': chevronRightSvg,
  'ui-components:check': checkSvg,
  'ui-components:close': closeSvg,
  'ui-components:delete': trashSvg,
  'ui-components:download': downloadSvg,
  'ui-components:duplicate': duplicateSvg,
  'ui-components:edit': editSvg,
  'ui-components:ellipses': moreHSvg,
  'ui-components:file-upload': uploadSvg,
  'ui-components:filter': filterSvg,
  'ui-components:history': historySvg,
  'ui-components:launch': externalSvg,
  'ui-components:link': linkSvg,
  'ui-components:lock': lockSvg,
  'ui-components:numbering': lineNumbersSvg,
  'ui-components:redo': redoSvg,
  'ui-components:refresh': refreshSvg,
  'ui-components:search': searchSvg,
  'ui-components:undo': undoSvg,

  // File types. `file` and `text-editor` intentionally share one asset: the
  // design set has a single lined-page glyph and inventing a second would be a
  // design decision made in code.
  'ui-components:code': cellCodeSvg,
  'ui-components:file': textFileSvg,
  'ui-components:json': jsonSvg,
  'ui-components:markdown': markdownSvg,
  'ui-components:notebook': notebookSvg,
  'ui-components:spreadsheet': csvSvg,
  'ui-components:table-rows': tableSvg,
  'ui-components:terminal': terminalFileSvg,
  'ui-components:text-editor': textFileSvg,
  'ui-components:yaml': yamlConfigSvg,

  // Status & identity
  'ui-components:error': errorXSvg,
  'ui-components:info': infoSvg,
  'ui-components:trusted': shieldSvg,
  'ui-components:user': userSvg,
  'ui-components:users': usersSvg
};

/**
 * Registered, real, and **deliberately not applied**.
 *
 * PRD §7.8.2 recommends option 3 for third-party language marks: accept the
 * stock logos, because re-drawing the Python, R and Julia marks in house style
 * is a trademark question before it is a design question. These three names hold
 * exactly those marks, so overriding them is a P0 sign-off (criterion I6), not a
 * default. Flip them in by spreading this into `OVERRIDES` once that decision is
 * recorded — the assets are already imported and normalised.
 */
export const LANGUAGE_MARKS: Readonly<Record<string, string>> = {
  'ui-components:julia': juliaSvg,
  'ui-components:python': pythonKernelSvg,
  'ui-components:r-kernel': rLangSvg
};

/** A name we believe exists but have not been able to confirm from source. */
export interface IPendingIcon {
  /** Candidate `LabIcon` registry name. */
  readonly name: string;
  /** Path under `svg/` of the asset that would be used, once confirmed. */
  readonly asset: string;
  /** Why it is not in `OVERRIDES` yet. */
  readonly note: string;
}

/**
 * Input for the P0 icon audit (TODO P5-01), which enumerates the live `LabIcon`
 * registry in a running lab and settles each of these.
 *
 * None of these names could be verified from the packages installed in this
 * repo: they belong to `@jupyterlab/*-extension` packages (which ship with the
 * application, not with the libraries) or to third-party labextensions. Running
 * `d4n-icons:audit-registry` from the command palette prints the real registry
 * next to `OVERRIDES`; promote a row here into `OVERRIDES` only after its name
 * appears in that output.
 */
export const PENDING: readonly IPendingIcon[] = [
  {
    name: 'filebrowser:filter',
    asset: 'actions/filter.svg',
    note: 'file browser filter box; may simply reuse ui-components:filter'
  },
  {
    name: 'filebrowser:new-directory',
    asset: 'file-types/folder-open.svg',
    note: 'file browser toolbar "new folder"; ui-components:new-folder is the likely real owner'
  },
  {
    name: 'notebook:restart-kernel',
    asset: 'toolbar/restart.svg',
    note: 'notebook toolbar restart; core may render ui-components:refresh instead'
  },
  {
    name: 'notebook:restart-and-run-all',
    asset: 'toolbar/run-all.svg',
    note: 'notebook toolbar fast-forward; core may render ui-components:fast-forward instead'
  },
  {
    name: 'notebook:interrupt-kernel',
    asset: 'toolbar/interrupt.svg',
    note: 'notebook toolbar interrupt; core may render ui-components:stop instead'
  },
  {
    name: 'jupyterlab-git:git',
    asset: 'sidebar/git.svg',
    note: 'third-party (@jupyterlab/git); only present when that extension is installed'
  },
  {
    name: 'jupyterlab-git:branch',
    asset: 'data/branch.svg',
    note: 'third-party (@jupyterlab/git)'
  }
];
