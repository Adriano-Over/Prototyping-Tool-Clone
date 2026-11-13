const resolver = (() => {
  function splitTopLevel(input) {
    const parts = [];
    let start = 0, depth = 0, quote = '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quote) { if (ch === quote && input[i - 1] !== '\\') quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(input.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(input.slice(start).trim());
    return parts;
  }
  function gradientSource(value) {
    const match = String(value || '').trim().match(/^(repeating-)?(linear|radial|conic)-gradient\(/i);
    if (!match) return null;
    const open = value.indexOf('(', match[0].length - 1);
    let depth = 1, quote = '';
    for (let i = open + 1; i < value.length; i++) {
      const ch = value[i];
      if (quote) { if (ch === quote && value[i - 1] !== '\\') quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')' && --depth === 0) return { prefix: value.slice(0, open + 1), body: value.slice(open + 1, i), suffix: value.slice(i), type: `${match[1] || ''}${match[2].toLowerCase()}` };
    }
    return null;
  }
  function colorEnd(value) {
    const s = value.trimStart();
    const offset = value.length - s.length;
    if (s[0] === '#') { const m = s.match(/^#[\da-f]{3,8}\b/i); return m ? offset + m[0].length : 0; }
    const fn = s.match(/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i);
    if (fn) { let depth = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '(') depth++; if (s[i] === ')' && --depth === 0) return offset + i + 1; } }
    const named = s.match(/^(transparent|currentcolor|[a-z]+)\b/i);
    return named ? offset + named[0].length : 0;
  }
  function parseGradient(value) {
    const source = gradientSource(value);
    if (!source) return null;
    const parts = splitTopLevel(source.body);
    let heading = '';
    const first = parts[0] || '';
    if (/^(to\s+|[-+\d.]+(?:deg|rad|turn)|circle\b|ellipse\b|closest-|farthest-|at\s+|from\s+)/i.test(first)) heading = parts.shift();
    const stops = parts.map(raw => {
      const end = colorEnd(raw);
      if (!end) return { raw, color: '', position: '' };
      const color = raw.trim().slice(0, end - (raw.length - raw.trimStart().length));
      const position = raw.trim().slice(end - (raw.length - raw.trimStart().length)).trim();
      return { raw, color, position };
    });
    return { type: source.type, heading, stops, source };
  }
  function resolve(style) {
    const s = style || {};
    const image = s['background-image'] && s['background-image'] !== 'none' ? s['background-image'] : '';
    const gradient = parseGradient(image);
    const shadows = splitTopLevel(s['box-shadow'] && s['box-shadow'] !== 'none' ? s['box-shadow'] : '');
    return {
      fillType: gradient ? `${gradient.type}-gradient` : image ? (/url\(/i.test(image) ? 'image' : 'layered') : (s['background-color'] && s['background-color'] !== 'transparent' ? 'solid' : 'none'),
      backgroundImage: image,
      gradient,
      boxShadow: shadows.filter(Boolean),
      backdropFilter: s['backdrop-filter'] || s['-webkit-backdrop-filter'] || 'none',
      filter: s.filter || 'none',
      opacity: s.opacity || '1'
    };
  }
  function setStop(value, index, color, position) {
    const parsed = parseGradient(value);
    if (!parsed || !parsed.stops[index]) return value;
    const parts = splitTopLevel(parsed.source.body);
    if (parsed.heading) parts.shift();
    const heading = parsed.heading ? [parsed.heading] : [];
    const stopIndex = index;
    const old = parsed.stops[index];
    const pos = position === undefined ? old.position : String(position).trim();
    parts[stopIndex] = `${color}${pos ? ` ${pos}` : ''}`;
    return parsed.source.prefix + [...heading, ...parts].join(', ') + parsed.source.suffix;
  }
  function setHeading(value, headingValue) {
    const parsed=parseGradient(value);if(!parsed)return value;const parts=splitTopLevel(parsed.source.body);if(parsed.heading)parts.shift();const heading=String(headingValue||'').trim();return parsed.source.prefix+[...(heading?[heading]:[]),...parts].join(', ')+parsed.source.suffix;
  }
  function addStop(value,color='#14d6ca') {
    const parsed=parseGradient(value);if(!parsed||parsed.stops.length<2)return value;const parts=splitTopLevel(parsed.source.body);if(parsed.heading)parts.shift();const index=Math.max(0,parts.length-1);parts.splice(index,0,`${color} 50%`);return parsed.source.prefix+[...(parsed.heading?[parsed.heading]:[]),...parts].join(', ')+parsed.source.suffix;
  }
  function removeStop(value,index) {
    const parsed=parseGradient(value);if(!parsed||parsed.stops.length<=2||!parsed.stops[index])return value;const parts=splitTopLevel(parsed.source.body);if(parsed.heading)parts.shift();parts.splice(index,1);return parsed.source.prefix+[...(parsed.heading?[parsed.heading]:[]),...parts].join(', ')+parsed.source.suffix;
  }
  return { splitTopLevel, parseGradient, resolve, setStop, setHeading, addStop, removeStop };
})();

if (typeof window !== 'undefined') window.FormaStyleResolver = resolver;
export default resolver;
