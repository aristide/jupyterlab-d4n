"""Root pytest configuration.

`pytest_plugins` has to live in the ROOTDIR conftest — pytest 8 raises on the
declaration appearing in any nested conftest, and silently ignores it in a test
module, which is the more annoying failure because the suite then fails with a
missing-fixture error that points nowhere near the cause.
"""

pytest_plugins = ["pytest_jupyter.jupyter_server"]
