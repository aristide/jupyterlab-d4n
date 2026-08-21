"""Server extension tests.

Deliberately thin. This is a presentation-layer project (PRD §3.2) and the
server extension does exactly two things, so the tests cover exactly those two
plus the traversal guard — which is the only place here where a bug would be a
security bug rather than a cosmetic one.
"""

import json

import pytest

# NOTE: `pytest_plugins` is declared in the ROOT conftest.py, not here — pytest 8
# raises if it appears in a nested conftest and ignores it in a test module.


@pytest.fixture
def jp_server_config(jp_server_config):
    return {"ServerApp": {"jpserver_extensions": {"jupyterlab_d4n": True}}}


async def test_status_reports_all_eight_extensions(jp_fetch):
    response = await jp_fetch("jupyterlab-d4n", "status")
    assert response.code == 200

    payload = json.loads(response.body)
    assert payload["version"]
    # If this count drifts, either a package was added without registering it in
    # _jupyter_labextension_paths (so it will not be symlinked or shipped), or
    # one was removed and the entrypoint's EXTENSIONS list is now stale.
    assert len(payload["extensions"]) == 8
    assert "@d4n/theme-light" in payload["extensions"]
    assert "@d4n/shell-chrome" in payload["extensions"]


async def test_missing_brand_asset_404s_cleanly(jp_fetch):
    """The directory ships empty on purpose (TODO P1-08); a 404 is correct."""
    from tornado.httpclient import HTTPClientError

    with pytest.raises(HTTPClientError) as excinfo:
        await jp_fetch("jupyterlab-d4n", "brand", "favicon.svg")
    assert excinfo.value.code == 404


@pytest.mark.parametrize(
    "attempt",
    [
        "../__init__.py",
        "../../pyproject.toml",
        "..%2F..%2Fpyproject.toml",
    ],
)
async def test_brand_handler_refuses_path_traversal(jp_fetch, attempt):
    from tornado.httpclient import HTTPClientError

    with pytest.raises(HTTPClientError) as excinfo:
        await jp_fetch("jupyterlab-d4n", "brand", attempt)
    # 403 from our guard, or 404 from the router normalising the path away.
    # Either is a refusal; what must never happen is a 200 with file contents.
    assert excinfo.value.code in (403, 404)
