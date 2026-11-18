import fs from 'node:fs/promises';
import path from 'node:path';
import { bundledFontRules, bundledFontStylesheet, fontCssWithUrl } from './dist/bundled-fonts.js';

export async function readBundledDesignFonts(root, content) {
  const stylesheet = await fs.readFile(path.join(root, bundledFontStylesheet.slice(1)), 'utf8');
  return Promise.all(bundledFontRules(stylesheet, content).map(async entry => ({
    ...entry,
    bytes: await fs.readFile(path.join(root, 'vendor', entry.file)),
  })));
}

export function embeddedFontCss(entries) {
  return entries.map(entry => fontCssWithUrl(entry, `data:font/ttf;base64,${entry.bytes.toString('base64')}`)).join('\n');
}
