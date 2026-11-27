// The GitHub Pages file must match the sources, and every inline script in it must parse.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { build } = require('../tools/build');
const out = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
assert(out === build(), 'docs/index.html is out of date: run  npm run build');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, n = 0;
while ((m = re.exec(out))) { n++; new Function(m[1]); }
assert(n >= 5, 'expected the inline scripts');
assert(!/google\.script|<\?/.test(out), 'no Apps Script left in the page');
console.log('BUILD PASS: docs/index.html up to date,', n, 'scripts parse');
