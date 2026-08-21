# Data4Now — JupyterLab Theme

A custom JupyterLab 4.x theme that wraps your notebooks in the Data4Now
brand: navy primary, teal accents, magenta for emphasis, Montserrat for
chrome, Roboto for prose, JetBrains Mono for code.

## What's in this folder

```
jupyterlab-data4now-theme/
├── package.json          ← npm/labextension manifest
├── src/index.ts          ← plugin entry — registers theme with ThemeManager
├── style/
│   ├── index.css           ← LIGHT entry, layered atop JupyterLab's base CSS
│   ├── index-dark.css      ← DARK entry (paired theme)
│   ├── variables.css       ← --jp-* tokens — light
│   ├── variables-dark.css  ← --jp-* tokens — dark
│   ├── index.js            ← style-only entry (for prebuilt extensions)
│   └── images/
│       ├── logo.png        ← top-left lockup (light bg)
│       └── logo-dark.png   ← lightened wordmark for dark menubar
└── README.md
```

## Install (production)

Once published to npm:

```bash
pip install jupyterlab
jupyter labextension install @data4now/jupyterlab-theme
```

Then open JupyterLab → **Settings → Theme → Data4Now** (light)
or **Data4Now Dark**.

## Install (local dev)

```bash
# in this folder
jlpm install
jlpm run build
jupyter labextension develop . --overwrite
jupyter lab
```

## What you get

| Token group        | Mapped to                                      |
| ------------------ | ---------------------------------------------- |
| `--jp-brand-*`     | Navy `#0F3D6E` family                          |
| `--jp-accent-*`    | Teal `#1FA0A0` family                          |
| `--jp-error-*`     | Magenta `#E63558` family (logo accent)         |
| `--jp-layout-*`    | Paper / fog / mist neutrals                    |
| `--jp-ui-font-*`   | Montserrat                                     |
| `--jp-content-*`   | Roboto                                         |
| `--jp-code-font-*` | JetBrains Mono                                 |

Plus chrome touches that aren't expressible via tokens alone:
- Navy top menubar with teal pillar accent (mirrors logo)
- Data4Now wordmark replaces the Jupyter logo top-left
- Dark ink left sidebar with teal "active tab" stripe
- Teal cell collapser on the active cell

## Tweaking

All overrides live in **`style/variables.css`**. Change a hex there and
every notebook updates. The file is heavily commented so non-frontend
folks can edit it safely.
