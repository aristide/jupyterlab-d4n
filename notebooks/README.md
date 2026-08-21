# notebooks/

This directory is the container's `--notebook-dir`: it is what you see in the
file browser at <http://localhost:8890/lab>, and it is bind-mounted from the
repo, so anything you create here survives `docker compose down`.

It is also the **file-browser fixture** for `jlpm test:selectors`. That job
asserts every selector in `packages/ui-overrides/style/selectors.json` matches at
least one element in a running JupyterLab — and roughly a dozen of the
`file-browser.css` selectors (`.jp-DirListing-item`, `-itemIcon`,
`-itemModified`, …) only exist when the listing has at least one **visible** row.

A `.gitkeep` does not count: the file browser hides dotfiles, so a directory
containing only `.gitkeep` renders the empty state and every one of those
selectors reports as broken. That looked like upstream markup drift and was
really just an empty folder.

This file is that visible row. Keep at least one non-hidden file here.
