export const bundledFontStylesheet = '/vendor/inter.css';

export function bundledFontRules(stylesheet, content) {
  const used = content.toLowerCase();
  return [...stylesheet.matchAll(/@font-face\s*\{[^}]+\}/g)].flatMap(([rule]) => {
    const family = rule.match(/font-family:\s*'([^']+)'/)?.[1];
    const file = rule.match(/url\('\/vendor\/([\w-]+\.ttf)'\)/)?.[1];
    if (!family || !file || (family !== 'Inter' && !used.includes(family.toLowerCase()))) return [];
    return [{ file, rule }];
  });
}

export function fontCssWithUrl({ file, rule }, url) {
  return rule.replace(`/vendor/${file}`, () => url);
}

export function inlineBundledFontStylesheet(html, css) {
  const link = /<link\b[^>]*\bhref=["']\/vendor\/inter\.css["'][^>]*>/gi;
  return css ? html.replace(link, () => `<style id="forma-bundled-fonts">${css}</style>`) : html;
}
