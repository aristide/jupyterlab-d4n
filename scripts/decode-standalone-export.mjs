/**
 * Rebuild a readable design-reference document from a Claude Design
 * "standalone" export.
 *
 * A standalone export is a bundle, not a document. The real page sits inside a
 * `<script type="__bundler/template">` block as one JSON string, and every
 * external reference (stylesheet, font, image, script) is replaced by an opaque
 * asset id. Read directly, the file is three lines of 2 MB each.
 *
 * This script extracts the page and undoes the two bundler rewrites, so the
 * result keeps the line numbering that COMPONENT-INDEX.md and TODO.md cite.
 *
 *   node scripts/decode-standalone-export.mjs <export.html> <out.html>
 *
 * See TODO.md P0-02 and design-reference/README.md.
 */
import fs from 'node:fs';

const FOUNDATION_LINK =
  '<link rel="stylesheet" href="preview-assets/colors_and_type.css">';

// Asset ids seen in the 2026-09-02 export of "JupyterLab Theme", mapped back to
// the values the pre-truncation import carried. Add a line when a new export
// introduces a new id: an unmapped id is a hard error, never a silent pass.
const RESTORE = {
  'b2c213f1-32c6-4451-b91e-953eea0f7e14': 'preview-assets/logo.png',
  '8a09dc77-e1cb-4e93-9f76-ef394f35490a': 'preview-assets/logo-dark.png',
  'bb9853bb-834d-43a7-a34a-6c3fdd760650':
    'https://unpkg.com/react@18.3.1/umd/react.development.js',
  '937d2181-42bf-4ec7-a21b-0b9a8f789b56':
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  '857e6917-56cf-48b8-9fa0-f5a519242514':
    'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  'b70d46e6-eb7d-47e2-9b53-ba0f8b8b4584': 'tweaks-panel.jsx'
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

function fail(message) {
  console.error(`decode-standalone-export: ${message}`);
  process.exit(1);
}

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  fail('usage: decode-standalone-export.mjs <export.html> <out.html>');
}

const bundle = fs.readFileSync(inFile, 'utf8');
const template = bundle.match(
  /<script type="__bundler\/template">\n([\s\S]*?)\n {2}<\/script>/
);
if (!template) {
  fail('no <script type="__bundler/template"> block — not a standalone export');
}
const lines = JSON.parse(template[1]).split('\n');

// The bundler inlines the linked foundation stylesheet, with its Google Fonts
// @import expanded to 748 @font-face rules, as the first <style> of the head.
// That block is byte-equal to preview-assets/colors_and_type.css, so put the
// <link> back rather than carry a second copy.
if (lines[1] !== '<html lang="en"><head>') {
  fail(`expected the head to open on line 2, found: ${lines[1]}`);
}
const styleOpen = lines.findIndex(line => line.startsWith('<style>'));
const styleClose = lines.indexOf('</style>', styleOpen);
if (styleOpen !== 5 || styleClose < 0 || lines[styleClose + 2] !== '<style>') {
  fail('the inlined foundation stylesheet is not where it was expected');
}

let doc = [
  lines[0],
  '<html lang="en">',
  '<head>',
  lines[2],
  lines[3],
  lines[4],
  FOUNDATION_LINK
]
  .concat(lines.slice(styleClose + 2))
  .join('\n');

for (const [id, original] of Object.entries(RESTORE)) {
  if (!doc.includes(`"${id}"`)) {
    fail(`asset id ${id} is not in this export — check the RESTORE table`);
  }
  doc = doc.split(`"${id}"`).join(`"${original}"`);
}
const orphan = doc.match(UUID);
if (orphan) {
  fail(`asset id ${orphan[0]} has no entry in the RESTORE table`);
}

fs.writeFileSync(outFile, doc, 'utf8');
const written = doc.split('\n');
console.log(
  `wrote ${outFile}: ${Buffer.byteLength(doc, 'utf8')} bytes, ${written.length} lines, ends ${JSON.stringify(written[written.length - 1])}`
);
