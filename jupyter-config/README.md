# Shipped Jupyter configuration

Three directories, three destinations, three different merge rules. Getting one
of them wrong is silent — the file installs and nothing reads it — so the
mapping is spelled out here and in `pyproject.toml`'s `shared-data` block.

| Source           | Installs to                            | Read by                                                              |
| ---------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `server-config/` | `etc/jupyter/jupyter_server_config.d/` | Jupyter Server, to auto-enable the `jupyterlab_d4n` server extension |
| `labconfig/`     | `etc/jupyter/labconfig/`               | JupyterLab at page load, for `disabledExtensions`                    |
| `lab-settings/`  | `share/jupyter/lab/settings/`          | The settings registry, as defaults beneath any user setting          |

## `lab-settings/overrides.json`

Shipped **defaults**, not a lockdown. Every value here is still changeable by the
user in Settings, and PRD §7.10 makes that a hard requirement (AC10): anything
that traps a user in our UI is a bug.

Two entries earn a note:

- **`@jupyterlab/apputils-extension:themes`** — adaptive theming is on, so the
  interface follows the OS preference (PRD §5.4). `theme` is the fallback used
  when the browser reports no preference. The `shell-chrome` plugin _also_
  registers a `matchMedia` listener as a version-independent fallback; that
  fallback is required regardless, so the settings layer needs no conditional
  logic.
- **`@jupyterlab/terminal-extension:plugin`** — `theme: "inherit"` is deliberate
  and it is _not_ us giving up on the terminal. It pins the setting so core's
  behaviour is predictable, and the `shell-chrome` terminal bridge then applies
  the full 16-colour palette _after_ core on `themeChanged`. Setting this to
  `light` or `dark` instead would make the outcome depend on signal connection
  order, which is the race PRD R14 describes. See `docs/decisions.md` D-004.

## `labconfig/page_config.json` — currently empty, on purpose

PRD §7.10 lists four core plugins this distribution eventually replaces:

```
@jupyterlab/apputils-extension:splash      -> shell-chrome (ISplashScreen)
@jupyterlab/statusbar-extension:plugin     -> shell-chrome (IStatusBar)
@jupyterlab/launcher-extension:plugin      -> shell-chrome (ILauncher)
@jupyterlab/csvviewer-extension:csv        -> shell-chrome (DataGrid bridge)
```

They are **not** disabled yet. Disabling a core plugin before its replacement
supplies the same token does not degrade gracefully — it removes the launcher,
or the status bar, from the application entirely. Each line gets added here in
the same change that lands its replacement, which is how TODO.md sequences them
(P2-07, P2-08, P3-11).

`docker/entrypoint.sh` writes a _user-level_ `page_config.json` when
`JUPYTERLAB_D4N=0`, which merges over this one and turns every `@d4n` extension
off while putting these four core plugins back. That is the PRD §15 Stage 4
opt-out, and it is the quickest way to tell one of our bugs from an upstream one.
