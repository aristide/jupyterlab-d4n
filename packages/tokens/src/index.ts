/**
 * `@d4n/tokens` — the typed half of the token pipeline.
 *
 * The CSS half lives in `style/generated/`. This half exists for the T4 bridges
 * (PRD §7.9): xterm.js, both Lumino DataGrids and the CodeMirror 6 theme are
 * JavaScript-driven and cannot read CSS custom properties, so they read the same
 * numbers from here that `tokens.css` writes into CSS.
 *
 * That shared origin is the whole point. PRD §7.2: it "eliminates the single
 * most common failure mode in this class of project — the terminal being one
 * shade off from the notebook."
 *
 * Everything under `./generated/` is produced by `packages/tokens/build.mjs`.
 * Do not edit it; edit `src/*.tokens.json` and run `jlpm build:tokens`.
 */
export { d4n, tokensFor } from './generated/tokens';
export type { D4nMode, D4nTokens } from './generated/tokens';
