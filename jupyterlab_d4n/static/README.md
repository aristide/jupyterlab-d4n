# Brand assets served by the server extension

Files dropped here are served at `/jupyterlab-d4n/brand/<name>` and shipped
inside the wheel.

This directory exists because two brand surfaces are **not reachable from a
frontend labextension** (PRD §8.9.2): the favicon is referenced by the Jupyter
server's page template, and kernelspec logos are served by the server from each
kernelspec's resource path.

It is currently empty, which is deliberate rather than unfinished — the favicon
delivery route is open question **Q11**, tracked as `TODO.md` **P1-08**. The
handler 404s cleanly until assets land, so the server extension ships without
blocking on the design decision.

## When you fill it

- `favicon.ico` / `favicon.svg` — the tab icon.
- `favicon-busy.svg` — only if the deployment uses busy/idle favicon swapping.
  If it does, **both** state variants need assets, or the busy state falls back
  to stock and the tab flickers between two brands (PRD §8.9.2).
- An SVG favicon can carry its own `@media (prefers-color-scheme: dark)` block
  and adapt to the *browser chrome*, which is a different setting from the
  JupyterLab theme. Design for a user running the light JupyterLab theme inside
  a dark OS.

Kernel logos are **not** served from here — see `docs/decisions.md` D-010. They
stay stock behind the launcher's neutral plate.
