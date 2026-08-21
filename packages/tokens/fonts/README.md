# Bundled typefaces

PRD §4.2: _"must fully render with no network. No CDN fonts. All assets
bundled."_ These five `.woff2` files are that guarantee. Before they existed the
product had **zero** `@font-face` rules for its own families — Montserrat,
Roboto and JetBrains Mono rendered only on machines that happened to have them
installed locally, and fell through to `system-ui` in CI, in the Linux
container, and for every user who had not installed them by coincidence.

Nothing here is hand-referenced. `packages/tokens/build.mjs` holds the
declarative `FONT_FACES` table and emits
`packages/tokens/style/generated/fonts.css`, which
`packages/tokens/style/index.css` imports. The build fails if a row points at a
file that is not on disk, and fails if any `font.family.*` primitive leads with
a family that no row declares — that second check is the one that matters,
because a family-name typo is invisible: the browser just uses the fallback.

## What is here

| File                              | Family (CSS)     | `font-weight`               | Bytes  | SHA-256                                                            |
| --------------------------------- | ---------------- | --------------------------- | ------ | ------------------------------------------------------------------ |
| `montserrat-latin-variable.woff2` | `Montserrat`     | `100 900` (variable `wght`) | 37 956 | `06b16db7a969135d48d38c49183be7fb88d4452e2a3011957c7851941f4e4879` |
| `roboto-latin-variable.woff2`     | `Roboto`         | `100 900` (variable `wght`) | 43 136 | `1404ca348bd75ef836f4dd8b6f2cc719458642d1237c368296b2fc652dca47dc` |
| `jetbrains-mono-regular.woff2`    | `JetBrains Mono` | `400`                       | 92 164 | — upstream release artefact                                        |
| `jetbrains-mono-medium.woff2`     | `JetBrains Mono` | `500`                       | 93 824 | — upstream release artefact                                        |
| `jetbrains-mono-semibold.woff2`   | `JetBrains Mono` | `600`                       | 94 472 | — upstream release artefact                                        |

Total ≈ 353 KB, served from the federated bundle's `static/` directory
(`@jupyterlab/builder` has an `asset/resource` webpack rule for `.woff2`).

## Provenance

**Montserrat** — Google Fonts `css2` API, `latin` subset of the variable face,
Montserrat v31:
`https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2`

**Roboto** — Google Fonts `css2` API, `latin` subset of the variable face,
Roboto v51:
`https://fonts.gstatic.com/s/roboto/v51/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBA.woff2`

Both are served by Google as a **single variable file per family** — the four
requested weights (400/500/600/700 for Montserrat, 300/400/500/700 for Roboto)
all resolved to the same URL, which is why one file replaces four. The `wght`
axis spans 100–900 in both, so the table declares the full range rather than a
single weight. That distinction is load-bearing for Montserrat, whose variable
**default instance is Thin (100)**: pinning the face to `font-weight: 400`
while its default is 100 is the classic way to end up with a whole UI in Thin.

**JetBrains Mono** — the upstream release, not the Google subset:
`https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip`,
`fonts/webfonts/JetBrainsMono-{Regular,Medium,SemiBold}.woff2`.

## What was dropped, and what deliberately was not

**Dropped from Montserrat and Roboto:** the `cyrillic`, `cyrillic-ext`,
`greek`, `greek-ext`, `vietnamese` and `latin-ext` subsets — roughly five times
the bytes for coverage this product's chrome does not use. The `unicode-range`
in the generated CSS is Google's verbatim `latin` range; text outside it falls
through to the `system-ui` fallback already named in `font.family.ui` /
`font.family.content`. Revisit if the UI is localised beyond Latin script.

**Dropped from all three:** italic faces. Nothing in the token set or the
component CSS asks for one; browsers synthesise an oblique for the occasional
`<em>` in rendered markdown.

**NOT dropped — the mono family is not subset at all.** PRD §8.7.3 / R16 / T5:
xterm.js measures one glyph and grids the rest, so every character the terminal
can draw has to come from the same fixed-advance face. The Google `latin`
subset stops at U+2215 and contains **none** of U+2500–257F (box drawing) or
U+2580–259F (block elements) — exactly the glyphs `htop`, `ncdu` and `tree` are
made of. Those would fall through to a proportional system fallback and shear
the grid, which is the precise failure T5 exists to catch. The upstream
webfonts carry all 128 box-drawing and all 32 block glyphs, and (verified with
fontTools against all three files) every printable ASCII glyph **and** every
box-drawing glyph has the identical `600/1000` advance width, with
`post.isFixedPitch = 1` and PANOSE proportion 9 (monospaced).

## Licence

All three families are **SIL Open Font License 1.1**. Section 4 of the OFL
requires the licence to travel with the files, which is why these are here and
not only in a manifest:

- `OFL-Montserrat.txt` — Copyright 2024 The Montserrat Project Authors
- `OFL-Roboto.txt` — Copyright 2011 The Roboto Project Authors
- `OFL-JetBrainsMono.txt` — Copyright 2020 The JetBrains Mono Project Authors

The OFL also forbids selling the fonts on their own and requires that Reserved
Font Names not be reused by modified versions. We redistribute all three
unmodified and under their original names, so neither clause constrains us —
but re-subsetting any of them later counts as modification, and the result must
then be renamed.
