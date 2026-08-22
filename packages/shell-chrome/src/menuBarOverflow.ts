import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';
import { Menu, MenuBar } from '@lumino/widgets';

import { density } from './density';

/**
 * Menu bar overflow (PRD §8.4.2, TODO P2-02).
 *
 * §8.4.2 asks for the trailing menus to collapse into an overflow trigger, and
 * for that trigger to open a normal `.lm-Menu`. Lumino 2.9 ships exactly that
 * feature — and it does not work. The full audit is docs/decisions.md D-017; the
 * two things worth knowing before reading this file are:
 *
 * 1. IT NEVER RUNS. `MenuBar` measures every item once, caches the widths, and
 *    never invalidates the cache. In JupyterLab that one measurement lands while
 *    the widget is still detached, so the cache is eight zeros and the summed
 *    width can never exceed the bar's — the trigger does not appear at ANY
 *    width, in our theme or in stock, and nothing is logged. Measured with an
 *    `offsetWidth` spy: `t=7783ms` reads 0 for the node and 0 for all eight
 *    items; the bar does not reach its real 401px until `t=10800ms`.
 *
 * 2. WAKING IT UP IS WORSE THAN LEAVING IT ASLEEP. Emptying the cache does start
 *    the collapse — and then: the trigger renders twice at some widths; the
 *    rendered items and the widget's own menu list drift out of step, so the
 *    trigger opens the Help menu instead of itself; the bar comes back from a
 *    narrow window with `Settings` and `Tabs` transposed, permanently; and a bar
 *    that is ever measured at zero width records an overflow index of 0, after
 *    which every update throws `RangeError: Invalid array length` before
 *    rendering and the menu bar is dead for the life of the page. All four were
 *    measured, in that order, on the way to this file.
 *
 * So the collapse here is OURS, and Lumino's stays asleep. That is a deliberate
 * inversion of the usual preference for upstream behaviour, and it buys three
 * things: no reliance on a private field (the repair above needed two), an
 * algorithm whose failure modes we can test, and a stable menu order.
 *
 * IF UPSTREAM EVER FIXES IT, THIS GETS OUT OF THE WAY. `sync()` returns
 * immediately whenever `bar.overflowMenu` is non-null, which is Lumino's own
 * trigger and can only exist if its cache started working.
 *
 * WHAT THE SPEC SAYS AND WHAT THIS ACTUALLY DOES
 * ---------------------------------------------
 * §8.4.2 writes the rule as "below 900px". This collapses on AVAILABLE width
 * instead, which is the better number and a different one: the bar shares the
 * top panel with the logo lockup and `#jp-top-bar`, so on the stock shell the
 * first menu collapses near a 460px window, not 900px. A viewport media query
 * cannot see either neighbour and would collapse a bar with room to spare — the
 * same correction D-016 records for the launcher grid, in the same direction.
 */

export const MENU_BAR_OVERFLOW_PLUGIN_ID =
  '@d4n/shell-chrome:menu-bar-overflow';

/**
 * The contract between this plugin and `@d4n/ui-overrides`.
 *
 * `#jp-menu-panel` is a flex item that neither grows nor shrinks past its own
 * content, so the bar's width is its content's width and there is never a
 * shortfall to collapse for. The stylesheet fixes that — but ONLY under this
 * attribute, which is set once this plugin is running. A bar that is allowed to
 * shrink with nothing to catch the overflow would clip its trailing menus into
 * unreachability, so the CSS is never allowed to arrive on its own.
 */
const OVERFLOW_ATTRIBUTE = 'data-d4n-menubar-overflow';

/**
 * The label on the collapse trigger. `⋯` is the character §8.5.2 already
 * specifies for the status bar's collapse trigger, and the two are the same
 * affordance, so they get the same glyph. (Lumino's own default is three ASCII
 * periods, with an underline under the first one.)
 */
const TRIGGER_LABEL = '⋯';

/**
 * Width to reserve for the trigger before it has ever been rendered.
 *
 * Only used for the first collapse of a session; from then on the real measured
 * width replaces it. Deliberately generous — over-reserving collapses one menu
 * early, under-reserving puts the trigger itself past the edge.
 */
const TRIGGER_WIDTH_ESTIMATE = 40;

/**
 * Collapses the trailing menus of a `MenuBar` into a trigger, and puts them back.
 *
 * The whole thing is driven off two numbers: how wide each menu's item is, and
 * how much room the bar has. Both are read from the DOM, and the first is only
 * read WHEN NOTHING IS COLLAPSED — a collapsed bar is showing the trigger in
 * place of everything it swallowed, so measuring it would record the wrong set
 * and the bar could never work out that it has room to expand again.
 */
class MenuBarOverflow {
  constructor(bar: MenuBar, commands: Menu.IOptions['commands']) {
    this._bar = bar;
    this._commands = commands;
    this._canonical = [...bar.menus];
  }

  /**
   * Bring the bar into line with the room it has.
   *
   * Cheap enough to call on every resize: in the common case it measures eight
   * elements, does eight additions, finds the composition already correct and
   * returns without touching the widget.
   */
  sync(): void {
    if (this._syncing) {
      return;
    }
    // Lumino's own overflow is awake. Two things managing one menu bar is worse
    // than either alone, and upstream owns the widget.
    if (this._bar.overflowMenu !== null) {
      return;
    }
    const available = this._bar.node.offsetWidth;
    if (available <= 0) {
      // Detached, or mid theme swap. Measuring here is what breaks Lumino's own
      // implementation; it is not going to break this one.
      return;
    }
    this._syncing = true;
    try {
      this._reconcile();
      if (!this._canManage()) {
        this._compose(this._canonical.length);
        return;
      }
      if (this._isExpanded()) {
        this._measure();
      }
      if (this._widths.length !== this._canonical.length) {
        return;
      }
      this._compose(this._plan(available));
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Re-measure from scratch, expanding first if need be.
   *
   * Called when something has changed how wide an item RENDERS rather than how
   * much room it has: a theme switch restores core's padding and font, compact
   * density (P5-04) changes both, and a webfont arriving late changes every one
   * of them. None of those emits a resize, so none would be noticed otherwise.
   */
  recalibrate(): void {
    if (this._syncing || this._bar.overflowMenu !== null) {
      return;
    }
    this._syncing = true;
    try {
      this._reconcile();
      this._compose(this._canonical.length);
    } finally {
      this._syncing = false;
    }
    // The measurement has to happen after the expanded bar has been laid out,
    // which is a frame away.
    requestAnimationFrame(() => {
      this.sync();
    });
  }

  /** True when every menu is on the bar and the trigger is not. */
  private _isExpanded(): boolean {
    return this._trigger === null || !this._bar.menus.includes(this._trigger);
  }

  /**
   * Whether the bar's width still means "the room the bar has".
   *
   * EVERYTHING HERE RESTS ON THAT, and it is only true while the stylesheet's
   * `flex-grow` is in force — which it is not under a stock theme, because every
   * rule we ship is gated on the theme name so that selecting stock JupyterLab
   * gives back stock JupyterLab (AC10, D-003). Without the grow, `#jp-menu-panel`
   * hugs its content, so the bar's width IS its content's width, and any
   * collapse makes the bar narrower, which triggers another collapse. Measured
   * before this guard existed: switching to JupyterLab Light in a 420px window
   * ran the bar down to a single `⋯`, 31px wide, and it never came back — not
   * even at 1600px, because a hugging panel can never be wider than what is left
   * in it.
   *
   * Reading the computed `flex-grow` rather than the theme name keeps the test
   * on the thing that actually has to be true. If the stylesheet ever stops
   * applying for some other reason, this notices that too.
   */
  private _canManage(): boolean {
    const panel = this._bar.node.parentElement;
    if (!panel) {
      return false;
    }
    return parseFloat(getComputedStyle(panel).flexGrow) > 0;
  }

  /**
   * Keep `_canonical` honest about menus that appeared or went away.
   *
   * An extension may add a menu at any time, and `IMainMenu.addMenu` inserts it
   * by rank — into a bar whose composition is ours, not its own. A stray menu is
   * therefore adopted at the position it was inserted at, which is right when
   * nothing is collapsed and the best available guess when something is. Its
   * width is recorded as 0 (so it is never the reason something else collapses)
   * until the next fully-expanded sync measures it properly.
   */
  private _reconcile(): void {
    const menus = this._bar.menus;
    for (let i = 0; i < menus.length; i++) {
      const menu = menus[i];
      if (menu === this._trigger || this._canonical.indexOf(menu) !== -1) {
        continue;
      }
      const at = Math.min(i, this._canonical.length);
      this._canonical.splice(at, 0, menu);
      this._widths.splice(at, 0, 0);
    }
    for (let i = this._canonical.length - 1; i >= 0; i--) {
      if (this._canonical[i].isDisposed) {
        this._canonical.splice(i, 1);
        this._widths.splice(i, 1);
      }
    }
  }

  /**
   * Read the rendered width of every menu item.
   *
   * Reads the DOM rather than the model because that is the only place the
   * answer exists: item width is font, padding and label, and this file is not
   * in a position to know any of the three. Safe to call on a bar that is
   * narrower than its items — flex items floor at `min-width: auto`, so a
   * clipped bar still reports each item at its intrinsic width, which was
   * checked rather than assumed.
   */
  private _measure(): void {
    const content = this._bar.contentNode.children;
    if (content.length !== this._canonical.length) {
      return;
    }
    this._widths = Array.from(
      content,
      item => (item as HTMLElement).offsetWidth
    );
  }

  /** How many menus stay on the bar. `_canonical.length` means "all of them". */
  private _plan(available: number): number {
    const total = this._widths.reduce((sum, width) => sum + width, 0);
    if (total <= available) {
      return this._canonical.length;
    }
    // Everything does not fit, so the trigger has to be paid for as well.
    const reserved = this._triggerWidth || TRIGGER_WIDTH_ESTIMATE;
    let used = 0;
    let visible = 0;
    for (const width of this._widths) {
      if (used + width + reserved > available) {
        break;
      }
      used += width;
      visible++;
    }
    return visible;
  }

  /** Put exactly `visible` menus on the bar, with the rest under the trigger. */
  private _compose(visible: number): void {
    const wantsTrigger = visible < this._canonical.length;
    const desired = this._canonical.slice(0, visible);
    if (wantsTrigger) {
      desired.push(this._ensureTrigger());
    }

    const current = this._bar.menus;
    const unchanged =
      current.length === desired.length &&
      desired.every((menu, i) => current[i] === menu);
    if (unchanged) {
      this._rememberTriggerWidth(wantsTrigger, desired.length - 1);
      return;
    }

    if (this._trigger) {
      while (this._trigger.items.length > 0) {
        this._trigger.removeItemAt(0);
      }
      for (const menu of this._canonical.slice(visible)) {
        this._trigger.addItem({ type: 'submenu', submenu: menu });
      }
    }

    // Rebuilt wholesale rather than diffed. `clearMenus()` + `addMenu(_, false)`
    // is eight array pushes and one render; a diff would be more code for the
    // same result, and it is the composition being derived from `_canonical`
    // every time that keeps the menu ORDER stable — the single most visible
    // thing Lumino's own implementation gets wrong.
    this._bar.clearMenus();
    for (const menu of desired) {
      this._bar.addMenu(menu, false);
    }
    this._bar.update();
    this._rememberTriggerWidth(wantsTrigger, desired.length - 1);
  }

  /**
   * Replace the estimate with the trigger's real width, once there is one.
   *
   * Read after the render that created it, so the first collapse of a session
   * uses the estimate and every later decision uses the measurement.
   */
  private _rememberTriggerWidth(present: boolean, index: number): void {
    if (!present) {
      return;
    }
    const node = this._bar.contentNode.children[index] as
      HTMLElement | undefined;
    if (node && node.offsetWidth > 0) {
      this._triggerWidth = node.offsetWidth;
    }
  }

  /** The trigger menu, created on first use and reused for the session. */
  private _ensureTrigger(): Menu {
    if (!this._trigger) {
      const menu = new Menu({ commands: this._commands });
      menu.title.label = TRIGGER_LABEL;
      // -1 is "no mnemonic". Lumino stamps 0 on its own trigger, which draws an
      // underline under the first character of the label (M3 is about mnemonics
      // that MEAN something, not about underlining an ellipsis).
      menu.title.mnemonic = -1;
      this._trigger = menu;
    }
    return this._trigger;
  }

  private _bar: MenuBar;
  private _commands: Menu.IOptions['commands'];
  private _canonical: Menu[];
  private _widths: number[] = [];
  private _trigger: Menu | null = null;
  private _triggerWidth = 0;
  private _syncing = false;
}

/** The shell's menu bar, or null if this shell does not have one. */
function findMenuBar(shell: ILabShell): MenuBar | null {
  // 'menu' is where LabShell puts it on 4.x; 'top' is where it lived before the
  // menu area existed, and costs one extra iteration to keep working.
  for (const area of ['menu', 'top'] as ILabShell.Area[]) {
    for (const widget of shell.widgets(area)) {
      if (widget instanceof MenuBar) {
        return widget;
      }
    }
  }
  return null;
}

/** Resolve once the webfont is in, since item widths depend on it. */
async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    return;
  }
  try {
    await document.fonts.ready;
  } catch {
    // A browser that rejects `fonts.ready` still measures something, and a
    // slightly wrong collapse point beats no collapse at all.
  }
}

export function activateMenuBarOverflow(
  app: JupyterFrontEnd,
  shell: ILabShell,
  themeManager: IThemeManager | null
): void {
  void app.restored.then(async () => {
    const bar = findMenuBar(shell);
    if (!bar) {
      // Notebook 7, a JupyterLite build with no menu bar, a stripped deployment.
      // Nothing to collapse and nothing to warn about.
      return;
    }

    const overflow = new MenuBarOverflow(bar, app.commands);

    // Only now does the stylesheet get permission to let the bar shrink.
    document.body.setAttribute(OVERFLOW_ATTRIBUTE, 'on');

    await fontsReady();
    overflow.sync();

    themeManager?.themeChanged.connect(() => {
      void fontsReady().then(() => {
        overflow.recalibrate();
      });
    });
    density.changed.connect(() => {
      overflow.recalibrate();
    });

    if (typeof ResizeObserver !== 'undefined') {
      // Observing the BAR, not the window: the bar's width is the window minus
      // the logo lockup minus the right-hand cluster, and the last two change
      // without the window changing at all.
      //
      // `sync()` cannot feed this observer, which is the property that makes a
      // resize observer safe here: the menu panel grows to fill its slot, so
      // collapsing an item changes what the bar CONTAINS and never how wide it
      // is.
      new ResizeObserver(() => {
        overflow.sync();
      }).observe(bar.node);
    }
  });
}

export const menuBarOverflowPlugin: JupyterFrontEndPlugin<void> = {
  id: MENU_BAR_OVERFLOW_PLUGIN_ID,
  description:
    'Collapses the trailing menus into an overflow trigger at narrow widths (PRD §8.4.2).',
  requires: [ILabShell],
  optional: [IThemeManager],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    shell: ILabShell,
    themeManager: IThemeManager | null
  ) => {
    activateMenuBarOverflow(app, shell, themeManager);
  }
};
