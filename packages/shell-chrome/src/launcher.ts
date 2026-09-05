import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ICommandPalette,
  MainAreaWidget,
  showErrorMessage
} from '@jupyterlab/apputils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import type { FileBrowserModel } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import type { KernelSpec } from '@jupyterlab/services';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import type { TranslationBundle } from '@jupyterlab/translation';
import {
  addIcon,
  classes,
  exceptionsIcon,
  LabIcon,
  launcherIcon
} from '@jupyterlab/ui-components';
import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';
import { DockPanel, TabBar, Widget } from '@lumino/widgets';

/**
 * T3 replacement for `ILauncher` (PRD §8.11, TODO.md P2-15, docs/decisions.md
 * D-016 and D-033).
 *
 * This is the SECOND half of §8.11. The first half — card geometry, the
 * responsive grid, the kernel plate (D-010) and the readout styling — shipped as
 * T2 in `ui-overrides/style/surfaces/launcher.css` and is untouched here. Four
 * requirements were left because no stylesheet can reach them:
 *
 *   1. a section order WE fix, rather than one third-party rank bidding decides
 *   2. the root-directory copy, where core prints an empty path
 *   3. the no-kernels state, where core prints an empty section
 *   4. a filter once the card count passes 12
 *
 * FOUR THINGS THAT WOULD BREAK IF THEY WERE "CLEANED UP".
 *
 * (1) THE COMMAND ID IS `launcher:create`, AND IT IS NOT OURS TO RENAME.
 *
 *     Four affordances in four other plugins resolve it BY ID: the `+` button in
 *     the file browser toolbar, File ▸ New Launcher, the dock panel's own `+`
 *     tab button, and the command palette. Core's own settings schema also binds
 *     `Accel Shift L` to it, and that schema survives the plugin being disabled.
 *     Rename the id and all of them go dead, in four places, none of which look
 *     like the launcher's fault.
 *
 * (2) CORE'S PLUGIN MUST BE DISABLED IN THE SAME CHANGE.
 *
 *     `jupyter-config/labconfig/page_config.json` disables
 *     `@jupyterlab/launcher-extension:plugin`. P1-09 measured what happens
 *     without that (D-024): `PluginRegistry.registerPlugin` throws on a
 *     duplicate plugin ID, but for a duplicate provided TOKEN it runs
 *     `this._services.set(data.provides, data.id)` — a silent overwrite. Two
 *     providers do not crash the application, they leave the winner to
 *     registration order. The disable is the only guard, not a second one.
 *
 * (3) THE MARKUP KEEPS CORE'S CLASS NAMES ON PURPOSE.
 *
 *     `.jp-Launcher`, `.jp-LauncherCard`, `.jp-LauncherCard-icon > div` and the
 *     rest are what the T2 stylesheet is written against, and that stylesheet
 *     was measured surface by surface. Re-using the names keeps every one of
 *     those measurements true and keeps `selectors.json` a live assertion. The
 *     one shape worth naming: LabIcon mounts its SVG inside a wrapper `div`, so
 *     the icon goes into the card through `LabIcon.resolveElement`, never as a
 *     bare `svg`.
 *
 * (4) IT IS PLAIN DOM, NOT REACT.
 *
 *     Core's launcher is a `VDomRenderer`. Nothing else in this package uses
 *     React, and a filter input inside a re-rendered tree loses focus on every
 *     keystroke unless the tree is diffed. Building the sections once and
 *     toggling `hidden` on filter keeps the caret where the user put it.
 */

/** The class core puts on the launcher widget, and the T2 sheet's entry point. */
const LAUNCHER_CLASS = 'jp-Launcher';

/**
 * Above this many cards, the filter appears.
 *
 * §8.11.5 asks for search "only if the P0 audit shows deployments routinely
 * exceeding 12 kernels — otherwise it is chrome for a case that does not
 * occur". No such deployment was found, so the input is not shipped
 * unconditionally. It is built only when a session actually has more cards than
 * this, which answers both halves of that sentence and needs no setting.
 */
const FILTER_THRESHOLD = 12;

/** The filter input's id, so its label can point at it. */
const FILTER_INPUT_ID = 'd4n-launcher-filter';

/** Where "No kernels found" sends the user. */
const KERNEL_DOCS_URL =
  'https://docs.jupyter.org/en/latest/install/kernels.html';

/**
 * A placeholder that cannot occur inside a translated string.
 *
 * The readout is one sentence with a path inside it, and the path needs its own
 * element (mono, truncated from the left). Splitting the sentence in the source
 * would hand a translator half a sentence and no way to move the path. So the
 * whole sentence is translated with `%1`, substituted with this mark, and split
 * on it — the path lands wherever the translation put it.
 */
const PATH_MARK = '\u0000';

/** What the kernel spec manager can tell us, reduced to the §8.11.5 cases. */
type KernelState =
  | { kind: 'ok' }
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'failed'; detail: string };

/** A rendered section, kept so the filter can hide cards without a re-render. */
interface IRenderedSection {
  node: HTMLElement;
  cards: { node: HTMLElement; label: string }[];
}

/**
 * The launcher model.
 *
 * `ILauncher.IModel` is `ILauncher` plus `items()` plus `VDomRenderer.IModel`,
 * and the last of those is only `IDisposable` and a `stateChanged` signal. So
 * this implements the interface without importing `VDomModel`, which would pull
 * React in for two members that take ten lines to write.
 */
class D4nLauncherModel implements ILauncher.IModel {
  get stateChanged(): ISignal<this, void> {
    return this._stateChanged;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._items.length = 0;
    Signal.clearData(this);
  }

  /**
   * Register an item. The returned disposable removes it again.
   *
   * The options are copied, exactly as core copies them: a caller that mutates
   * the object it passed must not be able to reorder a launcher that has
   * already rendered.
   */
  add(options: ILauncher.IItemOptions): IDisposable {
    const item: ILauncher.IItemOptions = {
      ...options,
      category: options.category || '',
      rank: options.rank !== undefined ? options.rank : Infinity
    };
    this._items.push(item);
    this._stateChanged.emit(undefined);

    return new DisposableDelegate(() => {
      const at = this._items.indexOf(item);
      if (at !== -1) {
        this._items.splice(at, 1);
        this._stateChanged.emit(undefined);
      }
    });
  }

  items(): IterableIterator<ILauncher.IItemOptions> {
    return this._items[Symbol.iterator]();
  }

  private _items: ILauncher.IItemOptions[] = [];
  private _isDisposed = false;
  private _stateChanged = new Signal<this, void>(this);
}

/** Everything the widget needs that `ILauncher.IOptions` does not carry. */
interface ID4nLauncherOptions extends ILauncher.IOptions {
  /** Optional: a deployment with no server manager still gets a launcher. */
  kernelspecs: KernelSpec.IManager | null;
}

/**
 * The launcher widget.
 */
class D4nLauncher extends Widget {
  constructor(options: ID4nLauncherOptions) {
    super();
    this._model = options.model;
    this._cwd = options.cwd;
    this._commands = options.commands;
    this._callback = options.callback;
    this._kernelspecs = options.kernelspecs;
    this._trans = (options.translator ?? nullTranslator).load('jupyterlab');
    this.addClass(LAUNCHER_CLASS);

    this._model.stateChanged.connect(this._onStateChanged, this);
    if (this._kernelspecs) {
      this._kernelspecs.specsChanged.connect(this._onStateChanged, this);
      this._kernelspecs.connectionFailure.connect(
        this._onConnectionFailure,
        this
      );
      // `ready` is what flips a null `specs` from "still loading" to "there is
      // nothing to load" — see `_kernelState`. It never rejects, so there is no
      // catch: 4.6.3 writes `.catch(_ => undefined)` into the promise itself.
      void this._kernelspecs.ready.then(() => {
        if (!this.isDisposed) {
          this.update();
        }
      });
    }
  }

  /** The directory every card launches into. */
  get cwd(): string {
    return this._cwd;
  }
  set cwd(value: string) {
    this._cwd = value;
    this.update();
  }

  /** True while a card's command is in flight, so a second click is ignored. */
  get pending(): boolean {
    return this._pending;
  }
  set pending(value: boolean) {
    this._pending = value;
  }

  protected onUpdateRequest(): void {
    this._render();
  }

  protected onAfterAttach(): void {
    this.update();
  }

  private _onStateChanged(): void {
    this.update();
  }

  private _onConnectionFailure(_sender: unknown, error: Error): void {
    this._specsError = error.message;
    this.update();
  }

  /**
   * Rebuild the whole body.
   *
   * The filter does NOT come through here — see `_applyFilter`. Everything else
   * (an item added, the cwd changed, a kernel appearing) is rare enough that a
   * rebuild is cheaper to reason about than a diff.
   */
  private _render(): void {
    this.node.textContent = '';
    this._sections = [];

    const body = document.createElement('div');
    body.className = 'jp-Launcher-body jp-zoom-target';
    const content = document.createElement('div');
    content.className = 'jp-Launcher-content';
    body.appendChild(content);

    content.appendChild(this._buildCwd());

    const state = this._kernelState();
    if (state.kind === 'none' || state.kind === 'failed') {
      content.appendChild(this._buildErrorState(state));
    }

    const categories = this._groupItems();
    const ordered = this._orderCategories([...categories.keys()]);

    let cards = 0;
    for (const cat of ordered) {
      cards += (categories.get(cat) as ILauncher.IItemOptions[]).length;
    }
    if (cards > FILTER_THRESHOLD) {
      content.appendChild(this._buildFilter());
    }

    for (const cat of ordered) {
      const items = categories.get(cat) as ILauncher.IItemOptions[];
      content.appendChild(this._buildSection(cat, items));
    }

    this.node.appendChild(body);
    this._applyFilter();
  }

  /**
   * The launch-target readout (§8.11.4, L5).
   *
   * Core renders the raw cwd string into this heading, so at the root — the
   * state every session starts in — it renders BLANK. That empty heading is the
   * only genuinely new thing in §8.11.4. The element and its styling already
   * existed on 4.6, which the PRD gets wrong and D-016 records.
   */
  private _buildCwd(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'jp-Launcher-cwd';
    const heading = document.createElement('h3');

    if (!this._cwd) {
      heading.textContent = this._trans.__(
        'New files will be created in the root directory'
      );
      wrap.appendChild(heading);
      return wrap;
    }

    const sentence = this._trans.__(
      'New files will be created in %1',
      PATH_MARK
    );
    const [before, after = ''] = sentence.split(PATH_MARK);
    const path = document.createElement('span');
    path.className = 'jp-Launcher-cwdPath';
    // The full path in `title`, because the span truncates from the LEFT and the
    // removed head is exactly what a user checks when two leaf names match.
    path.title = this._cwd;
    path.textContent = this._cwd;
    heading.append(
      document.createTextNode(before),
      path,
      document.createTextNode(after)
    );
    wrap.appendChild(heading);
    return wrap;
  }

  /**
   * The no-kernels and discovery-failed states (§8.11.5, L6).
   *
   * §8.11.5 is explicit that this is an ERROR, not an empty state: with no
   * kernel the user cannot work. Core answers it by rendering an empty section,
   * which reads as "nothing here" rather than "your environment is broken".
   */
  private _buildErrorState(state: KernelState): HTMLElement {
    const box = document.createElement('div');
    box.className = 'jp-Launcher-errorState';
    box.setAttribute('role', 'alert');

    // `ui-components:exceptions` is the registry's warning triangle, and
    // `@d4n/icons` already overrides it with `status/warning.svg` — so this is
    // our glyph without a second route to the same asset. There is no
    // `ui-components:warning` in 4.6.3; measured against `iconimports.js`.
    const icon = exceptionsIcon.element({
      tag: 'div',
      className: 'jp-Launcher-errorIcon'
    });
    icon.setAttribute('aria-hidden', 'true');
    box.appendChild(icon);

    const text = document.createElement('div');
    text.className = 'jp-Launcher-errorText';

    const title = document.createElement('p');
    title.className = 'jp-Launcher-errorTitle';
    title.textContent =
      state.kind === 'none'
        ? this._trans.__('No kernels found')
        : this._trans.__('Kernel discovery failed');
    text.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'jp-Launcher-errorHint';
    hint.textContent =
      state.kind === 'none'
        ? this._trans.__(
            'JupyterLab cannot start a notebook or a console until a kernel is installed.'
          )
        : state.kind === 'failed' && state.detail
          ? state.detail
          : this._trans.__('The server did not return the list of kernels.');
    text.appendChild(hint);

    const link = document.createElement('a');
    link.className = 'jp-Launcher-errorLink';
    link.href = KERNEL_DOCS_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = this._trans.__('Read how to install a kernel');
    text.appendChild(link);

    box.appendChild(text);
    return box;
  }

  /** The filter input, built only above `FILTER_THRESHOLD` cards. */
  private _buildFilter(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'jp-Launcher-filter';

    const label = document.createElement('label');
    label.className = 'jp-Launcher-filterLabel';
    label.htmlFor = FILTER_INPUT_ID;
    label.textContent = this._trans.__('Filter');

    const input = document.createElement('input');
    input.id = FILTER_INPUT_ID;
    input.className = 'jp-Launcher-filterInput';
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = this._trans.__('Filter by name');
    input.value = this._filter;
    input.addEventListener('input', () => {
      this._filter = input.value;
      this._applyFilter();
    });

    wrap.append(label, input);
    return wrap;
  }

  /**
   * Show or hide cards against the filter, and hide a section left with none.
   *
   * Deliberately not a re-render: an `input` replaced mid-typing loses focus and
   * the caret, which is the classic way a filter box becomes unusable.
   */
  private _applyFilter(): void {
    const needle = this._filter.trim().toLowerCase();
    for (const section of this._sections) {
      let visible = 0;
      for (const card of section.cards) {
        const match = !needle || card.label.toLowerCase().includes(needle);
        card.node.hidden = !match;
        if (match) {
          visible += 1;
        }
      }
      section.node.hidden = visible === 0;
    }
  }

  /** Group the model's items by category, sorted within each category. */
  private _groupItems(): Map<string, ILauncher.IItemOptions[]> {
    const categories = new Map<string, ILauncher.IItemOptions[]>();
    for (const item of this._model.items()) {
      const cat = item.category || this._trans.__('Other');
      const list = categories.get(cat);
      if (list) {
        list.push(item);
      } else {
        categories.set(cat, [item]);
      }
    }
    for (const list of categories.values()) {
      list.sort((a, b) => this._compareItems(a, b));
    }
    return categories;
  }

  /** Rank first, then label. Core's order, and the one users have learnt. */
  private _compareItems(
    a: ILauncher.IItemOptions,
    b: ILauncher.IItemOptions
  ): number {
    const rankA = a.rank ?? Infinity;
    const rankB = b.rank ?? Infinity;
    if (rankA !== rankB) {
      return rankA < rankB ? -1 : 1;
    }
    const labelA = this._commands.label(a.command, {
      ...a.args,
      cwd: this._cwd
    });
    const labelB = this._commands.label(b.command, {
      ...b.args,
      cwd: this._cwd
    });
    return labelA.localeCompare(labelB);
  }

  /**
   * The section order, fixed by us (§8.11.2, L4).
   *
   * Notebook, then Console, then every other category by name, and "Other"
   * last. `categoryRank` IS READ BY NOBODY here, and that is the requirement:
   * L4 says the order must not be reorderable by third-party rank. Core takes
   * the smallest `categoryRank` in a category and sorts sections by it, so any
   * extension can put itself above Notebook by passing 0 — which is the bidding
   * L4 forbids.
   */
  private _orderCategories(cats: string[]): string[] {
    const fixed = [this._trans.__('Notebook'), this._trans.__('Console')];
    const other = this._trans.__('Other');

    const weight = (cat: string): number => {
      const at = fixed.indexOf(cat);
      if (at !== -1) {
        return at;
      }
      return cat === other ? 2000 : 1000;
    };

    return cats.sort((a, b) => {
      const weightA = weight(a);
      const weightB = weight(b);
      return weightA !== weightB ? weightA - weightB : a.localeCompare(b);
    });
  }

  /** One `.jp-Launcher-section`: header, icon, title, and the card grid. */
  private _buildSection(
    cat: string,
    items: ILauncher.IItemOptions[]
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'jp-Launcher-section';

    const header = document.createElement('div');
    header.className = 'jp-Launcher-sectionHeader';

    const first = items[0];
    const args = { ...first.args, cwd: this._cwd };
    const headerIcon = LabIcon.resolveElement({
      icon: this._commands.icon(first.command, args),
      iconClass: classes(
        this._commands.iconClass(first.command, args),
        'jp-Icon-cover'
      ),
      stylesheet: 'launcherSection'
    });
    headerIcon.setAttribute('aria-hidden', 'true');
    header.appendChild(headerIcon);

    const title = document.createElement('h2');
    title.className = 'jp-Launcher-sectionTitle';
    title.textContent = cat;
    header.appendChild(title);
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'jp-Launcher-cardContainer';

    // The category name decides whether a card takes the raster plate, and core
    // decides it the same way rather than by the presence of `kernelIconUrl`.
    // Kept, so a kernel with no logo still gets the letter tile.
    const kernel =
      cat === this._trans.__('Notebook') || cat === this._trans.__('Console');

    const cards: IRenderedSection['cards'] = [];
    for (const item of items) {
      const card = this._buildCard(kernel, item);
      grid.appendChild(card.node);
      cards.push(card);
    }
    section.appendChild(grid);
    this._sections.push({ node: section, cards });
    return section;
  }

  /** One `.jp-LauncherCard`. */
  private _buildCard(
    kernel: boolean,
    item: ILauncher.IItemOptions
  ): IRenderedSection['cards'][0] {
    const command = item.command;
    const args = { ...item.args, cwd: this._cwd };
    const label = this._commands.label(command, args);
    const caption = this._commands.caption(command, args);
    const title = kernel ? label : caption || label;

    const node = document.createElement('div');
    node.className = 'jp-LauncherCard';
    node.title = title;
    // `role="button"` plus `tabindex=0` plus Enter and Space is the whole of L9:
    // every card is a tab stop, `:focus-visible` in the T2 sheet draws the ring,
    // and both activation keys launch. A `div` rather than a `button`, because
    // core's own stylesheet still ships and is written against the div.
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', title);
    node.tabIndex = 0;
    node.dataset.category = item.category || this._trans.__('Other');

    const iconBox = document.createElement('div');
    iconBox.className = 'jp-LauncherCard-icon';
    if (kernel) {
      if (item.kernelIconUrl) {
        const img = document.createElement('img');
        img.className = 'jp-Launcher-kernelIcon';
        img.src = item.kernelIconUrl;
        img.alt = title;
        iconBox.appendChild(img);
      } else {
        const letter = document.createElement('div');
        letter.className = 'jp-LauncherCard-noKernelIcon';
        letter.textContent = label.length ? label[0].toUpperCase() : '?';
        iconBox.appendChild(letter);
      }
    } else {
      // Through `resolveElement`, so the SVG lands inside a wrapper `div` —
      // the shape `.jp-LauncherCard-icon > div` in the T2 sheet sizes. A bare
      // `svg` child measured unsized (D-016).
      iconBox.appendChild(
        LabIcon.resolveElement({
          icon: this._commands.icon(command, args),
          iconClass: classes(
            this._commands.iconClass(command, args),
            'jp-Icon-cover'
          ),
          stylesheet: 'launcherCard'
        })
      );
    }
    node.appendChild(iconBox);

    const labelBox = document.createElement('div');
    labelBox.className = 'jp-LauncherCard-label';
    labelBox.title = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = label;
    labelBox.appendChild(paragraph);
    node.appendChild(labelBox);

    const launch = () => this._launch(item);
    node.addEventListener('click', launch);
    node.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        launch();
      }
    });

    return { node, label };
  }

  /** Run a card's command, and replace the launcher if it returned a widget. */
  private _launch(item: ILauncher.IItemOptions): void {
    if (this._pending) {
      return;
    }
    this._pending = true;
    this._commands
      .execute(item.command, { ...item.args, cwd: this._cwd })
      .then(value => {
        this._pending = false;
        if (value instanceof Widget) {
          this._callback(value);
        }
      })
      .catch(error => {
        console.error(error);
        this._pending = false;
        void showErrorMessage(
          this._trans._p('Error', 'Launcher Error'),
          error as Error
        );
      });
  }

  /**
   * Reduce the kernel spec manager to the §8.11.5 cases.
   *
   * WITH NO MANAGER the answer is `ok`, never an error: a deployment that does
   * not hand us one has told us nothing, and inventing "No kernels found" from
   * an absent service is worse than saying nothing at all.
   *
   * A NULL `specs` AFTER `ready` IS THE EMPTY CASE, and this is the part that
   * has to be written down. `specs` never becomes an empty map, because
   * `validateSpecModels` in `@jupyterlab/services` 7.6.3 THROWS
   * "No valid kernelspecs found" on one — so `requestSpecs` rejects, `_specs`
   * stays null, and `KernelSpecManager` has no way at all to say "zero
   * kernels". Measured on 2026-09-05 against a server started with
   * `--KernelSpecManager.ensure_native_kernel=False` and no kernelspec on
   * disk: `/api/kernelspecs` answered `{"default":"python3","kernelspecs":{}}`
   * and `manager.specs` was still null after `ready` resolved.
   *
   * The zero-key branch below therefore cannot fire against 4.6.3. It is kept
   * because it is the branch that becomes correct the day upstream stops
   * treating an empty list as a validation error.
   *
   * `failed` is driven by `connectionFailure`, which this manager never emits
   * in 4.6.3 — the signal exists and nothing in `manager.js` fires it. Also
   * kept, and also stated rather than assumed.
   */
  private _kernelState(): KernelState {
    const manager = this._kernelspecs;
    if (!manager) {
      return { kind: 'ok' };
    }
    if (this._specsError) {
      return { kind: 'failed', detail: this._specsError };
    }
    const specs = manager.specs;
    if (!specs) {
      return manager.isReady ? { kind: 'none' } : { kind: 'loading' };
    }
    return Object.keys(specs.kernelspecs).length === 0
      ? { kind: 'none' }
      : { kind: 'ok' };
  }

  private _model: ILauncher.IModel;
  private _commands: JupyterFrontEnd['commands'];
  private _callback: (widget: Widget) => void;
  private _kernelspecs: KernelSpec.IManager | null;
  private _trans: TranslationBundle;
  private _cwd = '';
  private _pending = false;
  private _filter = '';
  private _specsError = '';
  private _sections: IRenderedSection[] = [];
}

export const LAUNCHER_PLUGIN_ID = '@d4n/shell-chrome:launcher';

/** The command id, and it is core's — see note (1) at the top of this file. */
const CREATE_COMMAND = 'launcher:create';

/** Distinguishes one launcher widget from the next. Core does the same. */
let launcherCount = 0;

export const launcherPlugin: JupyterFrontEndPlugin<ILauncher> = {
  id: LAUNCHER_PLUGIN_ID,
  description:
    'Data4Now launcher (replaces the core launcher, PRD §8.11, TODO P2-15).',
  provides: ILauncher,
  requires: [ITranslator],
  optional: [ILabShell, ICommandPalette, IDefaultFileBrowser],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    labShell: ILabShell | null,
    palette: ICommandPalette | null,
    defaultBrowser: IDefaultFileBrowser | null
  ): ILauncher => {
    const { commands, shell } = app;
    const trans = translator.load('jupyterlab');
    const model = new D4nLauncherModel();
    const kernelspecs = app.serviceManager?.kernelspecs ?? null;

    commands.addCommand(CREATE_COMMAND, {
      label: trans.__('New Launcher'),
      icon: args => (args.toolbar ? addIcon : undefined),
      // Copied from core, argument for argument. The command inspector and any
      // caller that introspects the command read this, and dropping it would be
      // a capability lost with no visible symptom.
      describedBy: {
        args: {
          type: 'object',
          properties: {
            cwd: {
              type: 'string',
              description: trans.__('The current working directory')
            },
            toolbar: {
              type: 'boolean',
              description: trans.__(
                'Whether the command is executed from a toolbar'
              )
            },
            activate: {
              type: 'boolean',
              description: trans.__('Whether to activate the widget')
            },
            ref: {
              type: 'string',
              description: trans.__('The reference widget id')
            }
          }
        }
      },
      execute: (args: ReadonlyPartialJSONObject) => {
        const cwd = (args['cwd'] as string) ?? defaultBrowser?.model.path ?? '';
        const id = `launcher-${launcherCount++}`;

        const callback = (item: Widget) => {
          // Replace the launcher only when the command put its widget in the
          // main area. A command that opened a dialog leaves the launcher up.
          for (const widget of shell.widgets('main')) {
            if (widget === item) {
              shell.add(item, 'main', { ref: id });
              launcher.dispose();
              return;
            }
          }
        };

        const launcher = new D4nLauncher({
          model,
          cwd,
          callback,
          commands,
          translator,
          kernelspecs
        });
        launcher.title.icon = launcherIcon;
        launcher.title.label = trans.__('Launcher');

        const main = new MainAreaWidget({ content: launcher });
        // With nothing else open the launcher is the only thing in the main
        // area, and a close button that empties the application is a trap.
        main.title.closable = !!Array.from(shell.widgets('main')).length;
        main.id = id;

        shell.add(main, 'main', {
          activate: args['activate'] as boolean,
          ref: args['ref'] as string
        });

        if (labShell) {
          labShell.layoutModified.connect(() => {
            main.title.closable =
              Array.from(labShell.widgets('main')).length > 1;
          }, main);
        }

        if (defaultBrowser) {
          const onPathChanged = (browserModel: FileBrowserModel) => {
            launcher.cwd = browserModel.path;
          };
          defaultBrowser.model.pathChanged.connect(onPathChanged);
          launcher.disposed.connect(() => {
            defaultBrowser.model.pathChanged.disconnect(onPathChanged);
          });
        }

        return main;
      }
    });

    if (labShell) {
      void Promise.all([app.restored, defaultBrowser?.model.restored]).then(
        () => {
          labShell.layoutModified.connect(() => {
            // Create a launcher whenever the main area is emptied.
            if (labShell.isEmpty('main')) {
              void commands.execute(CREATE_COMMAND);
            }
          });
        }
      );
    }

    if (palette) {
      palette.addItem({
        command: CREATE_COMMAND,
        category: trans.__('Launcher')
      });
    }

    if (labShell) {
      // The dock panel's own `+` tab button. Core turns it on here, so a
      // replacement that forgets this line removes a control from every tab bar.
      labShell.addButtonEnabled = true;
      labShell.addRequested.connect(
        (sender: DockPanel, arg: TabBar<Widget>) => {
          const ref =
            arg.currentTitle?.owner.id ||
            arg.titles[arg.titles.length - 1].owner.id;
          return commands.execute(CREATE_COMMAND, { ref });
        }
      );
    }

    return model;
  }
};

export default launcherPlugin;
