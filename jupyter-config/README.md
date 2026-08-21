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

## `labconfig/page_config.json` — one entry so far

PRD §7.10 lists four core plugins this distribution replaces:

```
@jupyterlab/apputils-extension:splash      -> shell-chrome (ISplashScreen)   DISABLED
@jupyterlab/statusbar-extension:plugin     -> shell-chrome (IStatusBar)      pending P2-07
@jupyterlab/launcher-extension:plugin      -> shell-chrome (ILauncher)       pending P2-08
@jupyterlab/csvviewer-extension:csv        -> shell-chrome (DataGrid bridge) pending P3-11
```

Only the splash is disabled, because only the splash has a replacement.

**The rule this file exists to enforce:** a core plugin is disabled in the SAME
change that lands the plugin supplying its token, never before. Disabling one
early does not degrade gracefully — it removes the launcher, or the status bar,
from the application entirely, and the symptom (a missing surface) points
nowhere near the cause (a config file).

For the splash, disabling core's plugin is **required, not preferable**:
`ISplashScreen` is a `provides`, and two plugins cannot provide the same token —
JupyterLab refuses to start with both enabled.

### JupyterLab writes back to this file

Verified after a container restart: the installed copy at
`etc/jupyter/labconfig/page_config.json` gains a `lockedExtensions` key we do
not ship, mirroring whatever is in `disabledExtensions`. JupyterLab adds it at
startup — an extension disabled at the sys-prefix level is treated as locked, so
the extension manager will not offer to re-enable it.

Two consequences worth knowing:

- **The installed file is not byte-identical to the shipped one.** Do not write
  a CI check that compares them; compare `disabledExtensions` only.
- **The lock is correct here rather than a trap.** PRD AC10 forbids trapping a
  user in our UI, and normally a locked extension would be exactly that. But
  re-enabling core's splash alongside ours would break startup outright, so
  there is nothing useful to allow. Users who want stock JupyterLab have the
  whole-distribution opt-out (`JUPYTERLAB_D4N=0`), which is the escape hatch
  AC10 actually asks for.

That reasoning does **not** transfer to the launcher or the status bar (P2-08,
P2-07). Those replace surfaces a user might reasonably prefer stock, so check
what locking implies before disabling them.

`docker/entrypoint.sh` writes a _user-level_ `page_config.json` when
`JUPYTERLAB_D4N=0`, which merges over this one and turns every `@d4n` extension
off while putting these four core plugins back. That is the PRD §15 Stage 4
opt-out, and it is the quickest way to tell one of our bugs from an upstream one.
