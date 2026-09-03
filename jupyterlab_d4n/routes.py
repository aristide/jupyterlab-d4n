"""Server-side handlers.

This project is presentation-layer only (PRD §3.2): zero kernel, server or
execution behaviour changes.

WHAT THIS EXTENSION IS FOR, AS OF P1-08
---------------------------------------
It was written on the premise that two things were **provably unreachable**
from a frontend labextension. One of those turned out to be reachable.

* **The favicon** (PRD §8.9.2). §8.9.2 says a labextension cannot change it.
  Measured on a running instance, that is wrong at runtime: the page template
  emits ordinary ``<link class="idle favicon">`` and ``<link class="busy
  favicon">`` elements, and rewriting their ``href`` from JavaScript works.
  ``@d4n/shell-chrome:favicon`` does exactly that, and it ships the asset inside
  the labextension, so a plain ``pip install`` and a JupyterLite build get the
  mark too. See ``docs/decisions.md`` D-023. **The favicon no longer needs this
  server extension.**
* **Kernelspec logos** (PRD §7.8.2). ``logo-32x32.png`` / ``logo-64x64.png`` /
  ``logo-svg.svg`` live inside each kernelspec directory and are served by the
  server from the kernelspec resource path. Still unreachable from the
  frontend — and we deliberately do **not** intercept them. See D-010: leaving
  the language marks stock sidesteps the trademark question, works for kernels
  installed at any time, and the launcher's neutral plate makes the
  raster/vector difference read as intentional.

So what remains below is the status endpoint, which the Galata suite and
``jlpm test:selectors`` read to assert the extension is live before asserting
anything about the DOM, plus a brand-asset route that is now a **spare**: it is
the delivery path for any future asset that must have a URL rather than live
inside a bundle. It serves nothing today, and ``static/`` is empty.

Everything else the design does is CSS and frontend plugins.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

import tornado
from jupyter_server.base.handlers import APIHandler, JupyterHandler
from jupyter_server.utils import url_path_join

#: Assets shipped with the wheel. Empty, and expected to stay that way: P1-08
#: settled the favicon in the frontend (D-023), which was the only planned
#: occupant. The handler degrades to a 404, so the route costs nothing while it
#: waits for an asset that genuinely needs a URL.
STATIC_ROOT = Path(__file__).parent / "static"

NAMESPACE = "jupyterlab-d4n"


class StatusHandler(APIHandler):
    """Report what this installation is actually running.

    Read by the Galata suite and by ``jlpm test:selectors`` to assert the
    extension is live before asserting anything about the DOM, and useful by
    hand when answering "is this our bug or upstream's?" — the question the
    ``JUPYTERLAB_D4N=0`` escape hatch in ``docker/entrypoint.sh`` exists for.
    """

    @tornado.web.authenticated
    def get(self):
        from . import LABEXTENSIONS, NPM_SCOPE, __version__

        self.finish(
            {
                "version": __version__,
                "extensions": [f"{NPM_SCOPE}/{name}" for name in LABEXTENSIONS],
                "brandAssets": sorted(p.name for p in STATIC_ROOT.glob("**/*") if p.is_file()),
            }
        )


class BrandAssetHandler(JupyterHandler):
    """Serve a shipped brand asset, or 404 cleanly if it has not been authored.

    Deliberately NOT an ``APIHandler``: this serves binary assets referenced from
    a page template and from ``<link rel="icon">``, so it must not require the
    XSRF token an API handler enforces, and it must not force a JSON response.

    It is also deliberately read-only and path-constrained — see the resolve
    check below.
    """

    # These are public, unauthenticated assets by nature: a favicon is fetched
    # by the browser chrome before any session exists.
    @tornado.web.removeslash
    def get(self, name: str):
        target = (STATIC_ROOT / name).resolve()

        # Refuse anything that escapes STATIC_ROOT. `name` comes straight from
        # the URL, so `../../etc/passwd` is the obvious attempt; resolving both
        # sides and comparing prefixes is what makes traversal impossible rather
        # than merely inconvenient.
        try:
            target.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            raise tornado.web.HTTPError(403, "path traversal refused")

        if not target.is_file():
            raise tornado.web.HTTPError(404, f"no brand asset named {name!r}")

        content_type, _ = mimetypes.guess_type(str(target))
        self.set_header("Content-Type", content_type or "application/octet-stream")
        # Brand assets are versioned by the wheel, so they can cache hard.
        self.set_header("Cache-Control", "public, max-age=86400")
        self.finish(target.read_bytes())


def setup_route_handlers(web_app):
    """Register the handlers on the running Jupyter server."""
    base_url = web_app.settings["base_url"]

    handlers = [
        (url_path_join(base_url, NAMESPACE, "status"), StatusHandler),
        (
            url_path_join(base_url, NAMESPACE, "brand", r"(.+)"),
            BrandAssetHandler,
        ),
    ]

    web_app.add_handlers(".*$", handlers)
