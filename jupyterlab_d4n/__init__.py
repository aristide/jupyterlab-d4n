"""Data4Now JupyterLab distribution.

This Python package is the single installable artifact (PRD G7/AC1). It ships:

* eight prebuilt federated labextensions under ``labextensions/@d4n/`` (see
  ``_jupyter_labextension_paths``),
* a small server extension whose only job is the handful of things a frontend
  labextension provably cannot do — favicon and kernelspec logo delivery
  (PRD §7.8.2, §8.9.2) plus the token/adapter introspection endpoint the
  contrast audit and the selector-integrity job read,
* shipped defaults in ``etc/jupyter/`` and ``share/jupyter/lab/settings/``.

There are **no** kernel, server, or execution behaviour changes here — this is a
presentation-layer distribution (PRD §3.2).
"""

try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode:
    # https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings

    warnings.warn("Importing 'jupyterlab_d4n' outside a proper installation.")
    __version__ = "dev"

from .routes import setup_route_handlers

#: The npm scope every federated extension in this distribution lives under.
NPM_SCOPE = "@d4n"

#: The eight federated extensions, in the order PRD §7.1 lists them.
#:
#: ``tokens`` is deliberately absent: it is a plain build-time library that
#: generates CSS/TS/JSON for the others, not a labextension. Adding it here
#: would make ``jupyter labextension develop`` look for a build output that
#: never exists.
LABEXTENSIONS = (
    "theme-light",
    "theme-dark",
    "ui-overrides",
    "icons",
    "editor-theme",
    "settings-forms",
    "shell-chrome",
    "compat-shim",
)


def _jupyter_labextension_paths():
    """Return one entry per federated extension.

    ``jupyter labextension develop .`` reads this list, so a single invocation
    symlinks all eight into the JupyterLab application directory.
    """
    return [
        {
            "src": f"labextensions/{NPM_SCOPE}/{name}",
            "dest": f"{NPM_SCOPE}/{name}",
        }
        for name in LABEXTENSIONS
    ]


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_d4n"}]


def _load_jupyter_server_extension(server_app):
    """Register the API handlers that back the server-side half of the design system.

    Parameters
    ----------
    server_app: jupyterlab.labapp.LabApp
        JupyterLab application instance
    """
    setup_route_handlers(server_app.web_app)
    server_app.log.info("Registered jupyterlab_d4n server extension")
