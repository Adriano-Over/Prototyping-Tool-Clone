const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');

test('editor, canvas, and portable preview load fonts without internet requests', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
  const fonts = fs.readFileSync(path.join(dist, 'vendor', 'inter.css'), 'utf8');

  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/i);
  assert.doesNotMatch(app, /fonts\.(?:googleapis|gstatic)\.com/i);
  assert.match(app, /canvas:\{styles:\['\/vendor\/inter\.css'\]\}/);
  assert.match(app, /function previewDoc\(\)\{return prototypePreviewDoc\(\);\}/);
  assert.match(fonts, /Inter-Variable\.ttf/);
});
