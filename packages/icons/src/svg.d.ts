/**
 * `@jupyterlab/builder`'s webpack config loads `.svg` as `asset/source` when the
 * importer compiles to `.js` (webpack.config.base.js, rule `issuer: /\.js$/`),
 * so an SVG import is the file's raw text — exactly what `LabIcon.svgstr` wants.
 *
 * The wildcard form matters for more than typing: because TypeScript treats
 * `*.svg` as an ambient module rather than a file to resolve, `svg/` can live
 * outside `rootDir` (`src/`) without `tsc` complaining that an input file is not
 * under the root.
 */
declare module '*.svg' {
  const value: string;
  export default value;
}
