import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISplashScreen } from '@jupyterlab/apputils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { LOGO_MARK_SVG } from '@d4n/icons';
import { tokensFor } from '@d4n/tokens';

/**
 * T3 replacement for `ISplashScreen` (PRD §6.1, §8.9, TODO P2-09).
 *
 * The splash is the first frame of the application, and core's is a hardcoded
 * inline SVG of the Jupyter mark — the one brand slot in §8.9 that no amount of
 * CSS can reach. So this plugin supplies the `ISplashScreen` token itself and
 * core's `apputils-extension:splash` is disabled alongside it, in the same
 * change (see jupyter-config/labconfig/page_config.json).
 *
 * TWO CONSTRAINTS SHAPE EVERYTHING BELOW. Both are easy to "clean up" into a
 * bug, so they are spelled out.
 *
 * (1) IT IS STYLED WITH INLINE STYLES, NOT A STYLESHEET.
 *
 *     The theme manager is what calls `splash.show(isLight)` — it raises the
 *     splash *while it loads a theme*. So at paint time `data-jp-theme-name` is
 *     not reliably on <body> yet, and every rule gated on it (docs/decisions.md
 *     D-003) is inert. A stylesheet would render an unstyled white rectangle for
 *     the exact window the splash exists to cover.
 *
 *     Values still come from the token source, via the typed export that exists
 *     for precisely this class of surface (PRD §7.9) — the same mechanism the
 *     terminal and DataGrid bridges use, and for the same reason: the surface
 *     cannot read CSS custom properties.
 *
 *     Only the two keyframe animations need a stylesheet, since `@keyframes`
 *     has no inline form. That element carries no colour and no geometry.
 *
 * (2) IT IS DARK IN BOTH MODES, so `light` is deliberately not consulted for
 *     colour. The splash is the application FRAME at its first frame, and D-007
 *     makes the frame dark in both modes; the imported mockup paints it on ink
 *     regardless too. Honouring `light` here would flash a white screen before
 *     a dark chrome — the opposite of what the frame decision is for.
 */

const SPLASH_ID = 'd4n-splash';
const KEYFRAMES_ID = 'd4n-splash-keyframes';

/** Keyframes only — no colour, no geometry, nothing a token should own. */
const KEYFRAMES = `
@keyframes d4n-splash-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes d4n-splash-slide {
  from { transform: translateX(-50%) }
  to { transform: translateX(50%) }
}`;

/**
 * Whether the user has asked for less motion.
 *
 * Read at show() rather than cached: a boot screen is the one surface a user
 * might well be seeing for the first time right after changing the setting.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Inject the keyframes once and LEAVE them in place.
 *
 * Not a leak, and not an oversight: the theme manager raises the splash on every
 * theme change, so this element is needed again on any switch. It is three lines
 * of fixed-size CSS with no colour and no geometry; removing and re-injecting it
 * per boot would be churn for nothing.
 */
function ensureKeyframes(): void {
  if (document.getElementById(KEYFRAMES_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}

/** Build the splash node. Exported so a Galata test can render it in isolation. */
export function buildSplashNode(): HTMLElement {
  // Always the DARK palette — see constraint (2) above.
  const t = tokensFor(false);
  const s = t.splash;
  const calm = prefersReducedMotion();

  const root = document.createElement('div');
  root.id = SPLASH_ID;
  // `role="status"` + polite live region: a screen reader announces the boot
  // state instead of a silent several-second gap (PRD A13). `alert` would
  // interrupt, which is wrong for progress.
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'Loading Data4Now');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    // Above the shell but below dialogs, matching the mockup's z-index: 110.
    zIndex: '110',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    padding: t.space['8'],
    background: s.bg,
    animation: calm ? 'none' : `d4n-splash-fade ${s.fadeDuration} ease-out`
  } as Partial<CSSStyleDeclaration>);

  // Dot-pattern wash. A pseudo-element in the mockup; a real child here,
  // because inline styles cannot address ::before.
  const wash = document.createElement('div');
  wash.setAttribute('aria-hidden', 'true');
  Object.assign(wash.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    backgroundImage: `radial-gradient(circle at 1px 1px, ${s.washDot} 1px, transparent 0)`,
    backgroundSize: '22px 22px'
  } as Partial<CSSStyleDeclaration>);
  root.appendChild(wash);

  // --- Lockup --------------------------------------------------------------
  const lockup = document.createElement('div');
  Object.assign(lockup.style, {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: t.space['6']
  } as Partial<CSSStyleDeclaration>);

  // PRD B5: the splash and the top panel use the SAME mark, and `LOGO_MARK_SVG`
  // is the same string `ui-components:jupyter` is overridden with, so that is
  // enforced by the import rather than by remembering. The glyph replaces the
  // letterform the mockup drew here; the mockup's separate magenta dot is gone
  // because its own comment said it echoed the pie wedge, and the wedge is now
  // present.
  const mark = document.createElement('div');
  mark.setAttribute('aria-hidden', 'true');
  Object.assign(mark.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: s.markSize,
    height: s.markSize,
    borderRadius: s.markRadius,
    background: `linear-gradient(135deg, ${s.markBgFrom} 0%, ${s.markBgTo} 100%)`,
    // The mark's letterform sector is `currentColor`. The wedge carries its own
    // brand magenta, so only this one value is set.
    color: s.wordmark,
    boxShadow: `0 16px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 ${s.markInnerEdge}`
  } as Partial<CSSStyleDeclaration>);

  const glyph = document.createElement('span');
  Object.assign(glyph.style, {
    display: 'flex',
    width: s.markGlyphSize,
    height: s.markGlyphSize
  } as Partial<CSSStyleDeclaration>);
  // The asset is ours and is linted (`jlpm lint:icons`): no <style>, no id, no
  // script. It is the only markup on this surface that does not come from a
  // string literal in this file.
  glyph.innerHTML = LOGO_MARK_SVG;
  const glyphSvg = glyph.querySelector('svg');
  if (glyphSvg) {
    glyphSvg.setAttribute('width', '100%');
    glyphSvg.setAttribute('height', '100%');
  }
  mark.appendChild(glyph);
  lockup.appendChild(mark);

  const wordmark = document.createElement('div');
  Object.assign(wordmark.style, {
    display: 'flex',
    alignItems: 'baseline',
    gap: t.space['2'],
    color: s.wordmark,
    fontFamily: t.font.family.ui,
    fontWeight: t.font.weight.bold,
    fontSize: '22px'
  } as Partial<CSSStyleDeclaration>);
  wordmark.appendChild(document.createTextNode('Data4Now'));

  const product = document.createElement('span');
  product.textContent = 'Notebooks';
  Object.assign(product.style, {
    color: s.accent,
    fontFamily: t.font.family.mono,
    fontSize: t.font.size.ui.sm,
    fontWeight: t.font.weight.medium,
    letterSpacing: t.font.letterSpacing.eyebrow,
    textTransform: 'uppercase'
  } as Partial<CSSStyleDeclaration>);
  wordmark.appendChild(product);
  lockup.appendChild(wordmark);
  root.appendChild(lockup);

  // --- Loader --------------------------------------------------------------
  const loader = document.createElement('div');
  Object.assign(loader.style, {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: t.space['3'],
    width: s.loaderWidth
  } as Partial<CSSStyleDeclaration>);

  const track = document.createElement('div');
  track.setAttribute('aria-hidden', 'true');
  Object.assign(track.style, {
    position: 'relative',
    height: s.loaderTrackHeight,
    borderRadius: t.radius.pill,
    background: s.loaderTrack,
    overflow: 'hidden'
  } as Partial<CSSStyleDeclaration>);

  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'absolute',
    inset: '0',
    borderRadius: t.radius.pill,
    background: `linear-gradient(90deg, transparent 0%, ${s.accent} 40%, ${s.dot} 80%, transparent 100%)`,
    // Under reduced motion the bar stops travelling and simply sits filled, so
    // the surface still reads as "working" without animating (PRD A8).
    animation: calm
      ? 'none'
      : `d4n-splash-slide ${s.slideDuration} cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`
  } as Partial<CSSStyleDeclaration>);
  track.appendChild(bar);
  loader.appendChild(track);

  const status = document.createElement('div');
  Object.assign(status.style, {
    display: 'flex',
    justifyContent: 'space-between',
    color: s.muted,
    fontFamily: t.font.family.mono,
    fontSize: t.font.size.ui.xs,
    letterSpacing: t.font.letterSpacing.normal
  } as Partial<CSSStyleDeclaration>);
  const left = document.createElement('span');
  left.textContent = 'Starting JupyterLab';
  const right = document.createElement('span');
  right.textContent = 'Data4Now';
  Object.assign(right.style, {
    color: s.accent
  } as Partial<CSSStyleDeclaration>);
  status.append(left, right);
  loader.appendChild(status);
  root.appendChild(loader);

  return root;
}

/**
 * The splash service.
 *
 * `show()` is reference-counted because the theme manager raises it on EVERY
 * theme change, not only at boot, and two overlapping loads would otherwise
 * leave the first disposal tearing down a splash the second still needs.
 */
class D4nSplash implements ISplashScreen {
  private _node: HTMLElement | null = null;
  private _count = 0;

  show(_light?: boolean): IDisposable {
    ensureKeyframes();
    this._count += 1;

    if (!this._node) {
      this._node = buildSplashNode();
      document.body.appendChild(this._node);
    }

    let disposed = false;
    return new DisposableDelegate(() => {
      // Guard against a caller disposing the same handle twice — that would
      // decrement the count below the number of live shows and tear the splash
      // out from under another one.
      if (disposed) {
        return;
      }
      disposed = true;
      this._count -= 1;
      if (this._count > 0) {
        return;
      }
      const node = this._node;
      this._node = null;
      node?.remove();
    });
  }
}

export const SPLASH_PLUGIN_ID = '@d4n/shell-chrome:splash';

export const splashPlugin: JupyterFrontEndPlugin<ISplashScreen> = {
  id: SPLASH_PLUGIN_ID,
  description: 'Data4Now branded splash screen (replaces the core splash).',
  provides: ISplashScreen,
  autoStart: true,
  activate: (_app: JupyterFrontEnd): ISplashScreen => new D4nSplash()
};

export default splashPlugin;
