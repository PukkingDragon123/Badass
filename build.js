#!/usr/bin/env node
/* Inlines every <script src="src/*.js"> into a single self-contained HTML file.
   Output: dist/badass-apocalypse.html - open it straight off the filesystem. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let count = 0;
const out = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_m, src) => {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) throw new Error('missing script: ' + src);
  count++;
  return '<script>\n/* ---- ' + src + ' ---- */\n' + fs.readFileSync(file, 'utf8') + '\n</script>\n';
});

if (!count) throw new Error('no <script src> tags matched - did index.html change?');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const dest = path.join(root, 'dist', 'badass-apocalypse.html');
fs.writeFileSync(dest, out);
console.log(`inlined ${count} scripts -> dist/badass-apocalypse.html (${(out.length / 1024).toFixed(1)} KB)`);
