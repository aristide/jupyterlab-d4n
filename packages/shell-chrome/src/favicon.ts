import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';

import { FAVICON_DATA_URL } from './generated/favicon';

/**
 * The browser-tab icon (PRD §8.9, criterion B3, TODO P1-08, decision D-023).
 *
 * WHAT THE PRD GETS WRONG HERE
 * ----------------------------
 * §8.9.2 says the favicon is "not overridable from a labextension" and offers
 * three server-side routes. Measured on the running instance, that is not true
 * of the RUNTIME case: `jupyter_server`'s page template emits
 *
 *   {% block favicon %}
 *   <link rel="icon" href="…/favicons/favicon.ico"        class="idle favicon">
 *   <link rel=""     href="…/favicons/favicon-busy-1.ico" class="busy favicon">
 *   {% endblock %}
 *
 * Those are ordinary elements. Rewriting `href` from JavaScript works, and the
 * browser repaints the tab. What §8.9.2 IS right about is the first paint: the
 * stock mark is in the first byte of HTML and is already on screen before any
 * labextension runs, so this route cannot avoid a brief flash of it. D-023
 * records that trade — the frontend route is the only one that also covers a
 * plain `pip install` and JupyterLite, and neither of those has our server
 * config.
 *
 * WHY BOTH LINKS GET THE SAME ASSET
 * ---------------------------------
 * The busy/idle swap is upstream's, not ours: something in core flips `rel`
 * between the two elements on kernel activity, and `jupyter_server` ships seven
 * icons for it (idle, busy 1–3, file, notebook, terminal). D-023 refuses to
 * author a busy variant — a 16px glyph that changes on kernel activity is noise,
 * and the status bar already carries kernel state at a readable size.
 *
 * Refusing the variant is not the same as leaving the element alone. If the busy
 * link kept its stock href, the tab would show the Jupyter mark for as long as a
 * cell runs, which fails B3 exactly when a user is watching the tab. So both
 * links get our mark: the swap still happens, and it is invisible.
 *
 * WHY A PNG
 * ---------
 * PRD §4.2 puts Safari 17 in scope, and Safari does not render an SVG
 * referenced by `rel="icon"`. The SVG at `packages/icons/svg/brand/favicon.svg`
 * is the source; `jlpm build:favicon` rasterises it.
 *
 * It arrives as a DATA URL rather than an asset import, and that is not a style
 * choice. `@jupyterlab/builder` loads `.png` as `asset/resource`, which makes
 * webpack resolve a runtime public path — and inside a FEDERATED module that
 * resolution produced a bare directory URL. The browser refused
 * `…/@d4n/shell-chrome/static` as a script with MIME type `text/html`, and the
 * WHOLE extension failed to load: the splash, the terminal bridge, the adaptive
 * theme and the menu-bar overflow went with it. `jlpm test:selectors` caught it
 * as one broken selector, `body[data-d4n-menubar-overflow] #jp-menu-panel`,
 * which is exactly the canary that entry was registered to be.
 *
 * A data URL also satisfies §4.2's offline requirement without a request.
 */

export const FAVICON_PLUGIN_ID = '@d4n/shell-chrome:favicon';

/** `rel` values the page template and core use for the two favicon elements. */
const FAVICON_SELECTOR = 'link.favicon, link[rel~="icon"]';

/**
 * Point every favicon link at our mark, and report what to put back.
 *
 * Returns the undo, rather than performing it, so `deactivate` restores the
 * page exactly — a user disabling this plugin should get the stock tab icon
 * back without a reload.
 */
export function applyFavicon(doc: Document, href: string): () => void {
  const links = Array.from(
    doc.querySelectorAll<HTMLLinkElement>(FAVICON_SELECTOR)
  );
  const previous = links.map(link => ({
    link,
    href: link.getAttribute('href'),
    type: link.getAttribute('type')
  }));

  for (const link of links) {
    link.setAttribute('href', href);
    // The template declares `image/x-icon`. Leaving that on a PNG makes Firefox
    // refuse the file rather than sniff it.
    link.setAttribute('type', 'image/png');
  }

  return () => {
    for (const entry of previous) {
      if (entry.href === null) {
        entry.link.removeAttribute('href');
      } else {
        entry.link.setAttribute('href', entry.href);
      }
      if (entry.type === null) {
        entry.link.removeAttribute('type');
      } else {
        entry.link.setAttribute('type', entry.type);
      }
    }
  };
}

/** Set while the plugin is active, so `deactivate` can put the page back. */
let restore: IDisposable | null = null;

export const faviconPlugin: JupyterFrontEndPlugin<void> = {
  id: FAVICON_PLUGIN_ID,
  description: 'Replace the browser-tab icon with the Data4Now mark.',
  // No `requires`: the links are in the page template, so they exist before any
  // plugin runs. Waiting on a token would only lengthen the flash.
  autoStart: true,
  activate: (_app: JupyterFrontEnd): void => {
    restore = new DisposableDelegate(applyFavicon(document, FAVICON_DATA_URL));
  },
  deactivate: (): void => {
    restore?.dispose();
    restore = null;
  }
};
