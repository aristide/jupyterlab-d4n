/**
 * The name → SVG manifest for `LabIcon` overrides (PRD §7.8).
 *
 * HOW THE NAMES IN `OVERRIDES` WERE ESTABLISHED
 * ---------------------------------------------
 * The original keys were read out of `@jupyterlab/ui-components`'s
 * `lib/icon/iconimports.js`, the generated file that registers the built-in
 * icon set. Every key has since been re-confirmed against the **live** registry
 * of a running JupyterLab 4.5 — see `docs/icon-manifest.md` (TODO P0-04), which
 * records the full 129-name enumeration, the per-surface census, and the
 * evidence for each promotion. They are not remembered, and they are not
 * guessed.
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
 * instance, aliases `runIcon`/`pauseIcon` rather than registering its own. The
 * runtime enumeration confirmed that sweep and sharpened it: of the 129 names
 * registered in the running build, **127 are `ui-components:`** and the only two
 * others are `completer:inline` and `completer:widget`. No `*-extension` package
 * registers an icon of its own.
 *
 * That result retired five `PENDING` rows outright. `filebrowser:filter`,
 * `filebrowser:new-directory`, `notebook:restart-kernel`,
 * `notebook:restart-and-run-all` and `notebook:interrupt-kernel` are **not
 * registry names at all** — those toolbar buttons render `ui-components:filter`,
 * `ui-components:new-folder`, `ui-components:refresh`,
 * `ui-components:fast-forward` and `ui-components:stop`. Had any of them been
 * "promoted" on plausibility, all five would have been silent no-ops.
 *
 * COVERAGE IS PARTIAL AND THAT IS RECORDED, NOT HIDDEN
 * ---------------------------------------------------
 * The Data4Now export ships 120 icons; the running build registers 129 names,
 * and the two sets are not the same shape. 57 names are overridden here, 3 are
 * deliberately deferred (`LANGUAGE_MARKS`), 3 are Jupyter trademarks that belong
 * to the logo decision rather than to this file, and 66 have no D4N equivalent.
 * Where the design system has no asset (`caret-up`, `collapse`, `move-up`, the
 * ten debugger glyphs) the name is deliberately absent rather than mapped to an
 * approximate neighbour — `docs/icon-manifest.md` is the authoring brief.
 *
 * `ui-components:blank` must **never** be overridden: it is a deliberately empty
 * 1×1 SVG that core renders where a menu row needs an icon-sized gap. Giving it
 * a glyph puts a mark in every blank slot in the product.
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
import moreVSvg from '../svg/actions/more-v.svg';
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
import warningSvg from '../svg/status/warning.svg';

// toolbar/
import clearSvg from '../svg/toolbar/clear.svg';
import copySvg from '../svg/toolbar/copy.svg';
import cutSvg from '../svg/toolbar/cut.svg';
import pasteSvg from '../svg/toolbar/paste.svg';
import runAllSvg from '../svg/toolbar/run-all.svg';
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

  // "Restart the kernel and run every cell" — the notebook toolbar's second
  // most-hit button. Registered as `fast-forward`, not under any `notebook:`
  // name; the runtime census (P0-04) caught it rendering in
  // `.jp-NotebookPanel-toolbar` alongside eight icons we already owned.
  'ui-components:fast-forward': runAllSvg,

  // Directional / control
  'ui-components:caret-down': chevronDownSvg,
  // The outline caret core puts in every `HTMLSelect` — including the notebook
  // toolbar's cell-type picker and each debugger section twisty. Core draws it
  // as a chevron, so this is the same glyph, not an approximation; sharing an
  // asset with `caret-down` above is deliberate, since core's filled/outline
  // distinction carries no meaning at 16px.
  'ui-components:caret-down-empty': chevronDownSvg,
  'ui-components:caret-right': chevronRightSvg,
  'ui-components:check': checkSvg,
  'ui-components:close': closeSvg,
  'ui-components:delete': trashSvg,
  'ui-components:download': downloadSvg,
  'ui-components:duplicate': duplicateSvg,
  'ui-components:edit': editSvg,
  'ui-components:ellipses': moreHSvg,
  // `dots` is core's `ellipses` rotated 90° — literally the same three circles
  // under `transform="rotate(90,12,12)"` — so it takes the vertical member of
  // our own h/v pair. Registered but rendered nowhere in core 4.5 (its only
  // consumers are `--jp-icon-dots` in `deprecated.css` and third-party
  // extensions), so unlike the other three promotions this one is confirmed
  // against the registry rather than against a pixel.
  'ui-components:dots': moreVSvg,
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
  // The debugger's "pause on exceptions" toggle. Core draws a triangle with a
  // bang, which is exactly what `status/warning` is; the census found it
  // rendering in `#jp-debugger-sidebar` next to `stop`, which we already owned.
  'ui-components:exceptions': warningSvg,
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
 * Names that a runtime enumeration in *this* deployment cannot settle, because
 * the extension that would register them is not installed.
 *
 * P0-04 emptied this list of everything else. The five core guesses it used to
 * hold (`filebrowser:filter`, `filebrowser:new-directory`,
 * `notebook:restart-kernel`, `notebook:restart-and-run-all`,
 * `notebook:interrupt-kernel`) were all disproved: the live registry contains
 * 129 names, none of them under a `filebrowser:` or `notebook:` prefix. Those
 * buttons render `ui-components:` icons, four of which `OVERRIDES` already
 * covers.
 *
 * What survives is the class the audit is structurally unable to resolve — a
 * third-party labextension registers its icons only when it is installed, so an
 * empty result here is evidence of absence *from this image*, not of a wrong
 * name. Settle these by installing the extension and re-running
 * `auditRegistry()`; do not promote on the strength of the note.
 *
 * Two assets sit unused waiting on that: `sidebar/git.svg` and
 * `data/branch.svg`, plus the eleven other `data/*` VCS glyphs the design system
 * ships (`commit`, `pull`, `push`, `clone`, `stash`, …). They exist because the
 * Data4Now product has a git surface, not because JupyterLab core does.
 */
export const PENDING: readonly IPendingIcon[] = [
  {
    name: 'jupyterlab-git:git',
    asset: 'sidebar/git.svg',
    note: 'third-party (@jupyterlab/git), not installed in this image — absent from the 129-name runtime registry, which neither confirms nor refutes the name'
  },
  {
    name: 'jupyterlab-git:branch',
    asset: 'data/branch.svg',
    note: 'third-party (@jupyterlab/git), not installed in this image — same caveat as above'
  }
];
