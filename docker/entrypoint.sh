#!/usr/bin/env bash
# Dev entrypoint for the `jupyter` service.
#
# Runs on every `docker compose up` / restart, against a plain, pre-built
# Python+Node image — there is no docker/Dockerfile and nothing is ever built.
# This script installs/refreshes the JS and Python dependencies for whatever is
# currently on disk (bind-mounted from the host), then starts JupyterLab with
# both halves live-reloading:
#   - frontend: a background `jlpm watch` rebuilds TS/CSS for all nine packages
#   - backend:  `jupyter lab --autoreload` restarts the server process whenever
#               an imported .py file (incl. jupyterlab_d4n/) changes
set -euo pipefail

cd /workspace

PY_PKG=jupyterlab_d4n
NPM_SCOPE=@d4n
# The eight federated extensions this distribution ships (PRD §7.1). `tokens`
# is deliberately absent: it is a plain build-time library producing CSS/TS/JSON
# for the others, not a labextension.
EXTENSIONS=(
    "${NPM_SCOPE}/theme-light"
    "${NPM_SCOPE}/theme-dark"
    "${NPM_SCOPE}/ui-overrides"
    "${NPM_SCOPE}/icons"
    "${NPM_SCOPE}/editor-theme"
    "${NPM_SCOPE}/settings-forms"
    "${NPM_SCOPE}/shell-chrome"
    "${NPM_SCOPE}/compat-shim"
)
# Core plugins this distribution replaces (PRD §7.10). Listed here only so the
# JUPYTERLAB_D4N=0 escape hatch below can put them back.
REPLACED_CORE_PLUGINS=(
    "@jupyterlab/apputils-extension:splash"
    "@jupyterlab/statusbar-extension:plugin"
    "@jupyterlab/launcher-extension:plugin"
    "@jupyterlab/csvviewer-extension:csv"
)

echo "==> Installing JupyterLab + build tooling"
# Pinned to >=4.5 per the project decision on PRD §16 Q6: track current rather
# than the PRD's original 4.2–4.4 draft window.
pip install --no-cache-dir \
    "jupyterlab>=4.5.0,<5" \
    "hatchling>=1.21" \
    "hatch-jupyter-builder>=0.9" \
    "hatch-nodejs-version>=0.3.2" \
    "pyyaml>=6.0"

echo "==> Installing JS dependencies (jlpm install, yarn workspaces)"
# One install at the root covers all nine workspaces; yarn hoists into the
# persisted /workspace/node_modules volume.
jlpm install

echo "==> Installing Python package in editable mode"
# `jupyter labextension develop --overwrite` (below) replaces the real
# directories pip's editable install populated under
# /usr/local/share/jupyter/labextensions/@d4n/ with SYMLINKS into the
# bind-mounted /workspace/jupyterlab_d4n/labextensions/. With /usr/local
# persisted in a volume those symlinks persist too, so the *next*
# `pip install -e .` finds an "existing installation" and does its
# uninstall-then-reinstall dance; its uninstall step expects the RECORD's real
# files under that path (incl. build_log.json) and instead finds a symlink to a
# directory that doesn't have that file, crashing mid-rollback. Wiping this
# package's own install footprint first makes every install a clean "not
# currently installed" install — its dependencies (jupyterlab, hatchling, ...)
# stay untouched and cached in the volume regardless.
SITE_PACKAGES=$(python3 -c 'import sysconfig; print(sysconfig.get_path("purelib"))')
rm -rf "${SITE_PACKAGES}/${PY_PKG}"-*.dist-info \
       "${SITE_PACKAGES}/_editable_impl_${PY_PKG}.pth" \
       "/usr/local/share/jupyter/labextensions/${NPM_SCOPE}" \
       "/usr/local/share/jupyter/lab/settings/overrides.json" \
       "/usr/local/etc/jupyter/labconfig/page_config.json" \
       "/usr/local/etc/jupyter/jupyter_server_config.d/${PY_PKG}.json" \
       "/usr/local/etc/jupyter/jupyter_notebook_config.d/${PY_PKG}.json"
pip install --no-cache-dir -e ".[dev]"

echo "==> Linking labextensions for development"
# One call covers all eight: _jupyter_labextension_paths() in
# jupyterlab_d4n/__init__.py returns one entry per federated extension.
jupyter labextension develop . --overwrite

echo "==> Enabling server extension"
jupyter server extension enable "${PY_PKG}"

# --- Opt-out escape hatch (PRD §15 Stage 4) --------------------------------
# JUPYTERLAB_D4N=0 boots stock JupyterLab: every @d4n plugin off, and the four
# core plugins we normally replace put back. Written to the USER labconfig,
# which is merged over (and wins against) the sys-prefix page_config.json this
# package ships. The fastest way to tell "our bug" from "upstream's bug".
USER_LABCONFIG="${HOME}/.jupyter/labconfig"
mkdir -p "${USER_LABCONFIG}"
if [[ "${JUPYTERLAB_D4N:-1}" == "0" ]]; then
    echo "==> JUPYTERLAB_D4N=0 — disabling every D4N plugin, restoring core"
    {
        echo '{"disabledExtensions": {'
        for ext in "${EXTENSIONS[@]}"; do echo "  \"${ext}\": true,"; done
        for i in "${!REPLACED_CORE_PLUGINS[@]}"; do
            comma=","; [[ $i -eq $(( ${#REPLACED_CORE_PLUGINS[@]} - 1 )) ]] && comma=""
            echo "  \"${REPLACED_CORE_PLUGINS[$i]}\": false${comma}"
        done
        echo '}}'
    } > "${USER_LABCONFIG}/page_config.json"
else
    # Remove a page_config left behind by a previous JUPYTERLAB_D4N=0 run;
    # otherwise the opt-out would be sticky across restarts.
    rm -f "${USER_LABCONFIG}/page_config.json"
fi

# --- Optional theme pin ----------------------------------------------------
# The shipped overrides.json defaults to adaptive theming (follow the OS
# preference, PRD §5.4). Setting JUPYTERLAB_D4N_THEME pins one mode instead, by
# writing a USER setting — which wins over the shipped overrides — so a
# deterministic screenshot or Galata baseline run needs no edit to a committed
# file.
USER_SETTINGS="${HOME}/.jupyter/lab/user-settings/@jupyterlab/apputils-extension"
mkdir -p "${USER_SETTINGS}"
if [[ -n "${JUPYTERLAB_D4N_THEME:-}" ]]; then
    echo "==> Pinning theme to '${JUPYTERLAB_D4N_THEME}' (adaptive theming off)"
    cat > "${USER_SETTINGS}/themes.jupyterlab-settings" <<EOF
{
  "theme": "${JUPYTERLAB_D4N_THEME}",
  "adaptive-theme": false
}
EOF
else
    rm -f "${USER_SETTINGS}/themes.jupyterlab-settings"
fi

echo "==> Density: ${JUPYTERLAB_D4N_DENSITY:-comfortable}"

echo "==> Starting TypeScript/labextension watch (background, logs: /tmp/jlpm-watch.log)"
jlpm watch >/tmp/jlpm-watch.log 2>&1 &

echo "==> Starting JupyterLab on :8888 (published on the host as :8890)"
exec jupyter lab \
    --ip=0.0.0.0 \
    --port=8888 \
    --no-browser \
    --allow-root \
    --autoreload \
    --ServerApp.token='' \
    --notebook-dir=/workspace/notebooks
