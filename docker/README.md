# Docker dev environment

Development environment for **jupyterlab-d4n**, run via plain `docker compose`
(no VS Code / Dev Containers required) — and **no image to build**, locally or
in CI.

This replaces the previous `.devcontainer/` setup, which needed VS Code and a
hand-built `aristidetm/labextension-dev` image that had to be rebuilt whenever
the tooling changed.

The `docker-compose.yml` lives at the repo root; run everything below from there.

## Quick start

```bash
cp .env.sample .env      # optional — every value has a working default
docker compose up -d
docker compose logs -f jupyter
```

JupyterLab is served at <http://localhost:8890/lab> (no token). Open a shell in
the running container with:

```bash
docker compose exec jupyter bash
```

Stop with `docker compose down` (add `-v` to also drop the `node_modules` and
`usr-local` volumes for a clean slate — costs a few minutes on the next `up`).

### Why port 8890

Host ports are offset from JupyterLab's usual 8888/9999 so this stack can run
alongside the other extension projects on the same machine:

| Project                  | Host ports      |
| ------------------------ | --------------- |
| `jupyterlab-db-explorer` | 8888 / 9999     |
| `jupyterlab-airflow`     | 8889 / 9998     |
| **`jupyterlab-d4n`**     | **8890 / 9997** |

Inside the container it is still 8888/9999.

## How it works — no build, live reload both ways

The `jupyter` service runs
[`nikolaik/python-nodejs:python3.12-nodejs22`](https://github.com/nikolaik/docker-python-nodejs) —
a pre-built Python 3.12 + Node 22 image pulled straight from Docker Hub,
unmodified. There is no `docker/Dockerfile` and `docker compose up` never builds
anything; the first run just pulls the image.

The repo is bind-mounted at `/workspace`. On every `up` / restart,
`docker/entrypoint.sh` runs and:

1. `pip install jupyterlab hatchling hatch-jupyter-builder hatch-nodejs-version pyyaml`
2. `jlpm install` — one install at the root covers all nine workspaces
3. `pip install -e ".[dev]"` — editable install, which also runs the full
   TS/webpack build once via the `hatch-jupyter-builder` hook
4. `jupyter labextension develop . --overwrite` — symlinks **all eight**
   federated extensions in one call
5. `jupyter server extension enable jupyterlab_d4n`
6. `jlpm watch` in the background — rebuilds every package on source change
7. `jupyter lab --autoreload` in the foreground

So:

- **Frontend** (`packages/*/src`, `packages/*/style`) changes are picked up by
  `jlpm watch`; refresh the browser tab.
- **Tokens** (`packages/tokens/src/*.tokens.json`, `mapping/jp-adapter.yaml`)
  need `jlpm build:tokens` — the watch does not regenerate them, because the
  generated files are committed and a watch that rewrites them on every keypress
  makes the diff unreadable.
- **Backend** (`jupyterlab_d4n/*.py`) changes are picked up automatically —
  `--autoreload` restarts the server on any imported `.py` change.
- **Dependency** changes (`package.json`, `pyproject.toml`) are picked up on the
  next `docker compose restart jupyter`, since steps 1–3 re-run every start.
- There is genuinely **nothing to rebuild, ever** — not even after changing this
  dev environment's own tooling, since none of it is baked into an image.

### The one workaround, and why it is there

`jupyter labextension develop --overwrite` (step 4) replaces the real
directories pip's editable install populated under
`/usr/local/share/jupyter/labextensions/@d4n/` with **symlinks** into the
bind-mounted repo. Because `/usr/local` is a persisted volume, those symlinks
persist too — so the _next_ `pip install -e .` finds an "existing installation"
and starts its uninstall-then-reinstall dance. Its uninstall step expects the
real files the RECORD listed and instead finds a symlink to a directory missing
one of them, and crashes mid-rollback.

`docker/entrypoint.sh` wipes this package's own install footprint (dist-info,
the `.pth` file, the `@d4n` labextensions scope directory, the shipped
`overrides.json` and `page_config.json`, and the two `jupyter_*_config.d` JSON
files) before every install, so it is always a clean install for that one
package. Its dependencies are untouched and stay cached in the volume.

The container runs as **root**: the base image's default user (`pn`) cannot
write the root-owned named volumes, and `sudo` is not installed. Fine for a
disposable local dev container; `jupyter lab` gets `--allow-root` accordingly.

### Volumes

`node_modules` and `/usr/local` live in named volumes rather than on the
bind-mounted workspace, so installs stay native to the container's Linux
filesystem (no host/container binary mismatches) and survive
`docker compose down` + `up`.

Note there is **one** `node_modules` volume, at the workspace root, and that is
deliberate: this is a yarn **workspaces** monorepo, so yarn hoists every
dependency into the root and leaves only symlinks in `packages/*/node_modules`.
Adding per-package volumes would shadow those symlinks and break resolution.

## Environment variables

All optional; set them in `.env`.

| Variable                 | Default             | What it does                                                                                                                                                                                                        |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST_SSH_DIR`           | `./docker/ssh-keys` | Bind-mounted read-only to `/root/.ssh`. Point at your real `~/.ssh` to use your own keys for git inside the container.                                                                                              |
| `JUPYTERLAB_D4N_THEME`   | _(empty)_           | Pin one theme instead of following the OS preference. Writes a **user-level** setting, which wins over the shipped `overrides.json`, so a deterministic screenshot or Galata run needs no edit to a committed file. |
| `JUPYTERLAB_D4N_DENSITY` | `comfortable`       | `comfortable` or `compact` (PRD §11 P5).                                                                                                                                                                            |
| `JUPYTERLAB_D4N`         | `1`                 | Set to `0` to disable every `@d4n` plugin and restore the four core plugins we replace — stock JupyterLab.                                                                                                          |

### `JUPYTERLAB_D4N=0` is the debugging tool worth knowing about

```bash
JUPYTERLAB_D4N=0 docker compose up -d
```

This is the PRD §15 Stage 4 opt-out, and it is the fastest way to answer "is
this our bug or upstream's?" — the single most common question while working on
a project that overrides someone else's interface. It writes a user-level
`page_config.json` that both disables the `@d4n` extensions and re-enables the
core plugins the distribution replaces; unsetting it removes that file again, so
the opt-out is not sticky.

## Common tasks

```bash
# Rebuild tokens after editing src/*.tokens.json or mapping/jp-adapter.yaml
docker compose exec jupyter jlpm build:tokens

# The gates
docker compose exec jupyter jlpm test:contrast
docker compose exec jupyter jlpm lint:check

# Full clean rebuild of all nine packages
docker compose exec jupyter jlpm clean:all
docker compose exec jupyter jlpm build

# Watch log (jlpm watch runs in the background)
docker compose exec jupyter tail -f /tmp/jlpm-watch.log
```

## Troubleshooting

**The extension does not appear.** `docker compose exec jupyter jupyter labextension list`
should show eight `@d4n/*` entries as `enabled OK`. If they are missing, the
build failed — check `/tmp/jlpm-watch.log` and the `up` logs.

**CSS changes do nothing.** Check the theme is actually active: everything is
gated on `body[data-jp-theme-name^='Data4Now']` (see `docs/decisions.md` D-003),
so a stock theme correctly renders none of our CSS.

**A token change does not show up.** `jlpm build:tokens` is not part of the
watch — run it explicitly.

**Autoreload misbehaves.** `docker compose restart jupyter` is the fallback.
Still a process restart, not a rebuild.
