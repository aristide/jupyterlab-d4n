import type { Extension, Text } from '@codemirror/state';
import { StateEffect } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { ViewPlugin } from '@codemirror/view';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  EditorExtensionRegistry,
  IEditorExtensionRegistry
} from '@jupyterlab/codemirror';
import { IDebugger } from '@jupyterlab/debugger';

import type { BreakpointState, IBreakpointMark } from './debugDecorations';
import {
  debugEditorHost,
  setBreakpointGutterEffect,
  setBreakpointsEffect,
  setExecutionLineEffect
} from './debugDecorations';

/**
 * P3-08 — the half of PRD §8.6.4 that talks to the debugger.
 *
 * `debugDecorations.ts` owns the CodeMirror side: two state fields, a gutter, a
 * line decoration and the glyphs. It imports nothing from JupyterLab. This file
 * owns the other side. It finds the editors, decides which of them the debugger
 * is driving, and turns DAP breakpoints and the stop event into the effects
 * those fields read.
 *
 * WE KEEP UPSTREAM'S HANDLER AND REPLACE ONLY ITS TWO VISUALS (D-035)
 * ------------------------------------------------------------------
 * `@jupyterlab/debugger` attaches an `EditorHandler` to every editor it debugs.
 * That handler owns the whole round trip: it dumps the cell, sends
 * `setBreakpoints` over DAP, restores state after a kernel restart, and matches
 * a stack frame's source path to an editor. None of that is design-system work,
 * so it keeps running. What we take over is the two things it draws — its
 * `cm-breakpoint-gutter` column and its `jp-DebuggerEditor-highlight` line
 * class, both hidden by the base theme in `debugDecorations.ts`.
 *
 * HOW AN EDITOR IS FOUND, AND WHY NOT THROUGH THE WIDGET TRACKERS
 * ---------------------------------------------------------------
 * The extension is registered in `IEditorExtensionRegistry`, so every editor
 * JupyterLab builds gets it, and a small `ViewPlugin` inside it reports the
 * `EditorView` back here. That covers surfaces no tracker holds — in particular
 * the read-only editors the debugger opens for a stack frame in its Sources
 * panel, which are plain `CodeEditorWrapper`s inside the debugger's own widget.
 * Walking `INotebookTracker`, `IConsoleTracker` and `IEditorTracker` instead
 * would have missed those and would have duplicated upstream's cell lifecycle.
 */

const PLUGIN_ID = '@d4n/editor-theme:debug-decorations';

/**
 * Upstream's gutter column, used here as the signal "the debugger attached an
 * `EditorHandler` to this editor".
 *
 * It is the precise set we want. `data-jp-debugger` sits on the whole notebook
 * panel, so it cannot tell a code cell from a markdown cell, and upstream skips
 * markdown cells. Upstream's gutter exists in exactly the editors upstream
 * decorates: code cells, the file editor, and the Sources panel.
 *
 * If a future JupyterLab renames the class, the query stops matching, we never
 * mount our gutter, and the user sees upstream's own. That degrades to stock
 * JupyterLab, which is the failure AC10 asks for.
 */
const UPSTREAM_GUTTER_SELECTOR = '.cm-breakpoint-gutter';

/** Every live editor carrying our host extension. */
const views = new Set<EditorView>();

/**
 * What each editor was last told to draw.
 *
 * A sweep that finds no difference dispatches nothing. That is not an
 * optimisation: our own dispatch is a transaction, a transaction is a view
 * update, and a view update runs the sweep again. Without this comparison the
 * pair loops forever.
 */
const painted = new WeakMap<EditorView, string>();

/** What a freshly built editor already shows: no gutter, no marks, no line. */
const NOTHING_PAINTED = '-';

/**
 * Map one DAP breakpoint onto one of the three §8.6.4 glyph states.
 *
 * `verified` is the adapter's answer to "could this breakpoint be set". debugpy
 * returns `false` for a line it will not stop on, and upstream keeps such a
 * breakpoint in the model rather than dropping it, so the hollow ring is the
 * honest glyph for it.
 *
 * `'conditional'` is unreachable today, and that is not an oversight — see
 * D-035. `IDebugger.IBreakpoint` extends the DAP *response* type
 * `DebugProtocol.Breakpoint`, which carries no `condition`, and JupyterLab has
 * no user interface that sets one. The glyph is specified, built and measured.
 * Nothing in JupyterLab 4.6 can ask for it.
 */
function glyphState(breakpoint: IDebugger.IBreakpoint): BreakpointState {
  return breakpoint.verified === false ? 'disabled' : 'set';
}

function breakpointMarksFor(
  service: IDebugger,
  codeId: string
): IBreakpointMark[] {
  if (!codeId) {
    return [];
  }
  const marks: IBreakpointMark[] = [];
  for (const breakpoint of service.model.breakpoints.getBreakpoints(codeId)) {
    if (typeof breakpoint.line === 'number') {
      marks.push({ line: breakpoint.line, state: glyphState(breakpoint) });
    }
  }
  return marks;
}

/**
 * The 1-based line the kernel is stopped on in THIS editor, or `null`.
 *
 * The frame's `source.path` is the temporary file the kernel dumped the cell
 * to, which is exactly what `getCodeId` returns for the same text. So one key
 * answers both questions and no path bookkeeping is needed.
 */
function executionLineFor(service: IDebugger, codeId: string): number | null {
  const frame = service.model.callstack.frame;
  if (!frame || !codeId || frame.source?.path !== codeId) {
    return null;
  }
  return typeof frame.line === 'number' ? frame.line : null;
}

/**
 * The line a click on `clicked` should actually toggle, or `null` for none.
 *
 * A BLANK LINE IS NOT A BREAKPOINT, AND UPSTREAM ALREADY KNEW THAT. Its
 * `_getEffectiveClickedLine` walks back from a blank line to the nearest
 * non-blank line above it, and sets nothing when there is none. Our gutter
 * replaces upstream's, so it has to make the same choice — otherwise clicking
 * blank space asks the kernel for a breakpoint upstream would never have
 * requested, and the model fills up with lines nothing can bind.
 *
 * The range guard is the second half. `syncView` computes the line from a
 * gutter cell so it is in range by construction today, but a breakpoint line
 * that leaves the document is the exact shape of the fault this file already
 * defends against elsewhere, and upstream's own painter does NOT guard: at
 * `handlers/editor.ts:410` it calls `doc.line(b.line!)` unguarded, which throws
 * `RangeError: Invalid line number 0` (measured on 2026-09-05, and reproduced
 * with every `@d4n` extension disabled — see D-035).
 */
function effectiveLine(doc: Text, clicked: number): number | null {
  if (!Number.isInteger(clicked) || clicked < 1 || clicked > doc.lines) {
    return null;
  }
  let line = clicked;
  while (line >= 1 && doc.line(line).text.trim() === '') {
    line -= 1;
  }
  return line >= 1 ? line : null;
}

/**
 * Toggle the breakpoint on `line`, through the debugger service.
 *
 * Upstream's gutter is hidden, so its click handler is out of reach and this
 * does the same job. It deliberately does NOT touch the editor state:
 * `updateBreakpoints` re-dumps the cell, asks the kernel to set the lines, and
 * writes the kernel's answer back into the model. That change returns here as a
 * `changed` signal and repaints the gutter, so a line the kernel moves or
 * refuses shows where the kernel put it rather than where the click landed.
 */
function toggleBreakpoint(
  service: IDebugger,
  line: number,
  view: EditorView
): void {
  if (!service.isStarted) {
    return;
  }
  const target = effectiveLine(view.state.doc, line);
  if (target === null) {
    return;
  }
  const code = view.state.doc.toString();
  const codeId = service.getCodeId(code);
  if (!codeId) {
    return;
  }
  const existing = service.model.breakpoints.getBreakpoints(codeId);
  const next = existing.some(breakpoint => breakpoint.line === target)
    ? existing.filter(breakpoint => breakpoint.line !== target)
    : [
        ...existing,
        { line: target, verified: true, source: { path: codeId } }
      ].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

  void service.updateBreakpoints(code, next);
}

/** Push the current debugger state into one editor, if it changed. */
function syncView(service: IDebugger, view: EditorView): void {
  // Upstream mounts its handler only after `start()`, so both halves of this
  // are true together in practice. `isStarted` is the one that goes false
  // first during teardown, which is when we want the gutter taken away.
  const wantGutter =
    service.isStarted &&
    view.dom.querySelector(UPSTREAM_GUTTER_SELECTOR) !== null;

  // The code id is a hash of the whole document, so it is computed only for the
  // editors the debugger is actually driving.
  const codeId = wantGutter ? service.getCodeId(view.state.doc.toString()) : '';
  const marks = wantGutter ? breakpointMarksFor(service, codeId) : [];
  const line = wantGutter ? executionLineFor(service, codeId) : null;

  const wanted = wantGutter
    ? `${line ?? ''}:${marks.map(mark => `${mark.line}${mark.state[0]}`).join(',')}`
    : NOTHING_PAINTED;
  if ((painted.get(view) ?? NOTHING_PAINTED) === wanted) {
    return;
  }
  const hadGutter = (painted.get(view) ?? NOTHING_PAINTED) !== NOTHING_PAINTED;
  painted.set(view, wanted);

  const effects: StateEffect<unknown>[] = [
    setBreakpointsEffect.of(marks),
    setExecutionLineEffect.of(line)
  ];
  if (wantGutter !== hadGutter) {
    effects.push(
      setBreakpointGutterEffect(
        wantGutter
          ? {
              onToggle: (clicked, target) =>
                toggleBreakpoint(service, clicked, target)
            }
          : null
      )
    );
  }

  view.dispatch({ effects });
}

/**
 * Re-sync every editor.
 *
 * Coalesced onto a microtask because the debugger emits several signals for one
 * user action — `restored`, then `changed`, then `currentFrameChanged` — and
 * each would otherwise cost a pass over every open editor.
 */
function makeSweeper(service: IDebugger): () => void {
  let queued = false;
  return () => {
    if (queued) {
      return;
    }
    queued = true;
    void Promise.resolve().then(() => {
      queued = false;
      for (const view of views) {
        try {
          syncView(service, view);
        } catch (error) {
          // One editor in a bad state — a disposed view, a document shorter
          // than a stale breakpoint — must not stop the others repainting.
          console.warn(`${PLUGIN_ID}: could not sync an editor`, error);
        }
      }
    });
  };
}

/**
 * True when a transaction added extensions to the editor's configuration.
 *
 * This is how upstream attaching is detected. `EditorHandler` installs its
 * gutter with `injectExtension`, which dispatches `StateEffect.appendConfig`,
 * and it emits no debugger signal we could listen to instead. Every other kind
 * of transaction — typing, moving the cursor, our own dispatch — is ignored, so
 * the sweep does no work per keystroke and cannot re-trigger itself.
 */
function addsExtensions(update: ViewUpdate): boolean {
  return update.transactions.some(transaction =>
    transaction.effects.some(effect => effect.is(StateEffect.appendConfig))
  );
}

/** The `ViewPlugin` that reports editors to this module. */
function viewReporter(sweep: () => void): Extension {
  return ViewPlugin.define(view => {
    views.add(view);
    sweep();
    return {
      update: (update: ViewUpdate) => {
        if (addsExtensions(update)) {
          sweep();
        }
      },
      destroy: () => {
        views.delete(view);
        painted.delete(view);
      }
    };
  });
}

/**
 * Connect every signal that can change what an editor must draw.
 *
 * `sessionChanged` covers starting and stopping the debugger, `eventMessage`
 * covers `stopped` and `continued`, `restored` covers a kernel restart, and
 * `changed` covers every breakpoint edit — including the ones our own gutter
 * makes.
 */
function connect(service: IDebugger, sweep: () => void): void {
  service.sessionChanged.connect(sweep);
  service.eventMessage.connect(sweep);
  service.model.breakpoints.changed.connect(sweep);
  service.model.breakpoints.restored.connect(sweep);
  service.model.callstack.currentFrameChanged.connect(sweep);
}

/**
 * PRD §8.6.4 — breakpoint gutter and execution line, wired to the debugger.
 *
 * `IDebugger` is optional so that a deployment without the debugger extension
 * still activates this plugin and simply registers nothing. Without the service
 * there is no sweeper, the gutter is never mounted, and every editor is left
 * exactly as JupyterLab built it.
 */
export const debugDecorationsPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Data4Now design system — breakpoint gutter and execution line (PRD §8.6.4).',
  requires: [IEditorExtensionRegistry],
  optional: [IDebugger],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    extensions: IEditorExtensionRegistry,
    service: IDebugger | null
  ) => {
    if (!service) {
      return;
    }

    const sweep = makeSweeper(service);
    connect(service, sweep);

    // No `schema`, so the extension is not user-configurable and lands on every
    // editor. That is deliberate: the gutter is the only part with a visible
    // cost, and it stays unmounted until `syncView` mounts it.
    extensions.addExtension({
      name: 'd4nDebugDecorations',
      factory: () =>
        EditorExtensionRegistry.createImmutableExtension([
          debugEditorHost(),
          viewReporter(sweep)
        ])
    });
  }
};
