const weights = [
  [/thin|hairline/, 100],
  [/(?:extra|ultra)light/, 200],
  [/light/, 300],
  [/medium/, 500],
  [/(?:semi|demi)bold/, 600],
  [/(?:extra|ultra)bold/, 800],
  [/bold/, 700],
  [/black|heavy/, 900],
];

const textCases = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };
const decorations = { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' };
const cssString = value => `"${value.replace(/["\\\n\r\f<>&]/g, character => `\\${character.charCodeAt(0).toString(16)} `)}"`;

export function figTextStyle(node) {
  const fontSize = Math.max(1, Number(node.fontSize) || 14);
  const font = node.fontName;
  const style = { 'font-size': `${fontSize}px`, 'white-space': 'pre-wrap' };
  if (typeof font?.family === 'string' && font.family.trim()) {
    style['font-family'] = `${cssString(font.family.trim())}, sans-serif`;
    const face = `${font.style || ''} ${font.postscript || ''}`.toLowerCase().replace(/[\s_-]/g, '');
    style['font-weight'] = String(weights.find(([pattern]) => pattern.test(face))?.[1] ?? 400);
    if (/italic|oblique/.test(face)) style['font-style'] = face.includes('italic') ? 'italic' : 'oblique';
  }
  if (textCases[node.textCase]) style['text-transform'] = textCases[node.textCase];
  if (decorations[node.textDecoration]) style['text-decoration'] = decorations[node.textDecoration];
  if (['LEFT', 'RIGHT', 'CENTER', 'JUSTIFIED', 'JUSTIFY'].includes(node.textAlignHorizontal)) {
    style['text-align'] = node.textAlignHorizontal.startsWith('JUSTIF') ? 'justify' : node.textAlignHorizontal.toLowerCase();
  }
  const lineHeight = Number(node.lineHeight?.value);
  if (node.lineHeight?.units === 'PIXELS' && lineHeight > 0) style['line-height'] = `${lineHeight}px`;
  if (node.lineHeight?.units === 'PERCENT' && lineHeight > 0) {
    const measured = Number(node.derivedTextData?.baselines?.[0]?.lineHeight);
    style['line-height'] = measured > 0 && Number.isFinite(measured)
      ? String(Number((measured / fontSize).toFixed(6))) : lineHeight === 100 ? 'normal' : `${lineHeight}%`;
  }
  const spacing = Number(node.letterSpacing?.value);
  if (Number.isFinite(spacing) && node.letterSpacing.units === 'PIXELS') style['letter-spacing'] = `${spacing}px`;
  if (Number.isFinite(spacing) && node.letterSpacing.units === 'PERCENT') style['letter-spacing'] = `${spacing / 100}em`;
  if (['HEIGHT', 'WIDTH_AND_HEIGHT'].includes(node.textAutoResize)) style.height = 'auto';
  if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
    style.width = 'max-content';
    style['white-space'] = 'pre';
  }
  return style;
}
