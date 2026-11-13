const clampPercent = value => Math.max(0, Math.min(100, Number(value) || 0));

export function imageFitStyle(fit, { elementImage = false } = {}) {
  const allowed = elementImage ? ['cover', 'contain', 'fill', 'none'] : ['cover', 'contain', '100% 100%', 'auto'];
  if (!allowed.includes(fit)) throw new Error('Unsupported image fit mode.');
  return elementImage ? { 'object-fit': fit } : { 'background-size': fit };
}

export function imagePositionStyle(x, y, { elementImage = false } = {}) {
  const value = `${clampPercent(x)}% ${clampPercent(y)}%`;
  return elementImage ? { 'object-position': value } : { 'background-position': value };
}

export function imageFitFromInspector(value, { elementImage = false } = {}) {
  if (value === 'fill' && !elementImage) return '100% 100%';
  if (value === 'original') return elementImage ? 'none' : 'auto';
  return imageFitStyle(value, { elementImage })[elementImage ? 'object-fit' : 'background-size'];
}

export function imageFitToInspector(value, { elementImage = false } = {}) {
  if (value === 'cover' || value === 'contain' || value === 'fill') return value;
  if (elementImage && value === 'none') return 'original';
  if (!elementImage && (value === 'auto' || value === 'none')) return 'original';
  if (!elementImage && value === '100% 100%') return 'fill';
  return 'cover';
}
