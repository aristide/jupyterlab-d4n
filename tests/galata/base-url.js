/**
 * Where the JupyterLab under test lives. One definition, two readers.
 *
 * `playwright.config.js` needs it for `use.baseURL` and the `webServer` probe.
 * `fixtures.ts` needs it in a WORKER-scoped fixture, and Playwright's builtin
 * `baseURL` is test-scoped, so a worker fixture cannot ask for it. Rather than
 * write the expression twice and let the two drift, both read this.
 *
 * THE DEFAULT IS CI's PORT, NOT THE DEV CONTAINER'S. `.github/workflows/
 * build.yml` starts `jupyter lab --port=8890` on the runner. Our docker compose
 * stack maps host 8890 to container 8888, so a suite run from INSIDE the
 * container must be told:
 *
 *   JUPYTER_URL=http://localhost:8888 jlpm test:galata
 *
 * `jlpm test:selectors` has the same default and the same trap.
 */
module.exports = process.env.JUPYTER_URL ?? 'http://localhost:8890';
