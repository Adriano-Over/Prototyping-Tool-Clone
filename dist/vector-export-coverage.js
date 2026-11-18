const SVG = 'http://www.w3.org/2000/svg';
const VECTOR_PAINT = '[data-forma-vector-paint]';
const MAX_SHAPE_PIXELS = 2048;
const MAX_FRAME_SAMPLES = 262144;
const rotatedSamples = [[3 / 8, 1 / 8], [7 / 8, 3 / 8], [1 / 8, 5 / 8], [5 / 8, 7 / 8]];
const samples = [[0, 0], [1, 0], [0, 1], [1, 1]].flatMap(([u, v]) =>
  rotatedSamples.map(([x, y]) => [(x + u) / 2, (y + v) / 2]));

// Imported paths use absolute M/L/C/Z commands and carry their full coordinates.
function pathContains(d, evenOdd) {
  if (!d || d.length > 4096) return null;
  const tokens = d.match(/[MLCZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) || [];
  if (tokens.join('') !== d.replace(/[\s,]/g, '')) return null;
  let cursor = 0;
  let start;
  let last;
  const edges = [];
  const point = () => [Number(tokens[cursor++]), Number(tokens[cursor++])];
  function line(next) {
    if (last[1] !== next[1]) edges.push([...last, ...next]);
    last = next;
  }
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'M') {
      if (start) line(start);
      last = start = point();
      if (!last.every(Number.isFinite)) return null;
    } else if (!start) {
      return null;
    } else if (command === 'L') {
      const next = point();
      if (!next.every(Number.isFinite)) return null;
      line(next);
    } else if (command === 'C') {
      const a = last, b = point(), c = point(), end = point();
      if (![...b, ...c, ...end].every(Number.isFinite)) return null;
      for (let step = 1; step <= 64; step++) {
        const t = step / 64, u = 1 - t;
        line(a.map((v, axis) => u ** 3 * v + 3 * u ** 2 * t * b[axis] + 3 * u * t ** 2 * c[axis] + t ** 3 * end[axis]));
      }
    } else if (command === 'Z') {
      line(start);
      start = null;
    } else {
      return null;
    }
  }
  if (start) line(start);
  return (x, y) => {
    let winding = 0;
    for (const [x1, y1, x2, y2] of edges) {
      if ((y1 > y) !== (y2 > y) && x < x1 + (x2 - x1) * (y - y1) / (y2 - y1)) {
        winding += y2 > y1 ? 1 : -1;
      }
    }
    return evenOdd ? Boolean(winding & 1) : winding !== 0;
  };
}

function roundedRectangle(x, y, width, height, radius) {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  if (!radius) return true;
  const dx = Math.max(0, radius - x, x - (width - radius));
  const dy = Math.max(0, radius - y, y - (height - radius));
  return dx ** 2 + dy ** 2 < radius ** 2;
}

function primitiveStroke(tag, style, width, height, outset) {
  if (tag === 'ellipse' && Math.abs(width - height) < 0.00001) {
    const radius = width / 2;
    return (x, y) => {
      const distance = Math.hypot(x - radius, y - radius);
      return distance <= radius + outset && distance >= radius - outset;
    };
  }
  if (tag !== 'rect') return null;
  const radius = Math.min(parseFloat(style.rx) || 0, width / 2, height / 2);
  if (!radius && style.strokeLinejoin !== 'miter') return null;
  return (x, y) => roundedRectangle(x + outset, y + outset, width + 2 * outset, height + 2 * outset, radius ? radius + outset : 0)
    && !roundedRectangle(x - outset, y - outset, width - 2 * outset, height - 2 * outset, Math.max(0, radius - outset));
}

function pixelBounds(matrix, left, top, right, bottom) {
  const corners = [[left, top], [right, top], [left, bottom], [right, bottom]];
  const xs = corners.map(([x, y]) => matrix.a * x + matrix.c * y + matrix.e);
  const ys = corners.map(([x, y]) => matrix.b * x + matrix.d * y + matrix.f);
  return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))];
}

export function sampleVectorPixels(bounds, inverse, contains) {
  const [left, top, right, bottom] = bounds;
  const tiles = Array.from({ length: samples.length + 1 }, () => []);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      let count = 0;
      for (const [dx, dy] of samples) {
        const sx = x + dx, sy = y + dy;
        count += Number(contains(inverse.a * sx + inverse.c * sy + inverse.e, inverse.b * sx + inverse.d * sy + inverse.f));
      }
      if (count) tiles[count].push(`M${x} ${y}h1v1h-1Z`);
    }
  }
  return tiles;
}

function vectorSampleMatrix(svg, actual, style, width, height) {
  if (!svg.hasAttribute('viewBox')) return actual;
  const view = svg.viewBox.baseVal;
  const viewport = (w, h) => {
    const scale = Math.min(w / view.width, h / view.height);
    return new DOMMatrix([scale, 0, 0, scale, (w - scale * view.width) / 2, (h - scale * view.height) / 2]);
  };
  // Chromium uses 1/64px layout units and shortens the reported decimal.
  // Remove that viewport's transform and restore the authored float sizes.
  const layoutUnit = value => Math.round(parseFloat(value) * 64) / 64;
  return actual.multiply(viewport(layoutUnit(style.width), layoutUnit(style.height)).inverse()).multiply(viewport(width, height));
}

export function rasterizeExportVectors(original, clone, width, height) {
  const window = original.ownerDocument.defaultView;
  const frame = original.getBoundingClientRect();
  if (Math.abs(frame.width - width) > 0.02 || Math.abs(frame.height - height) > 0.02) return;
  const sources = original.querySelectorAll(VECTOR_PAINT), targets = clone.querySelectorAll(VECTOR_PAINT);
  const rootStyle = window.getComputedStyle(original);
  if (rootStyle.transform !== 'none' || rootStyle.rotate !== 'none') return;
  let remaining = MAX_FRAME_SAMPLES;
  for (let index = 0; index < sources.length && remaining > 0; index++) {
    const svg = sources[index], shape = svg.firstElementChild, target = targets[index];
    if (!shape?.getScreenCTM || !target?.firstElementChild || svg.children.length !== 1 || !svg.getClientRects().length) continue;
    const style = window.getComputedStyle(shape);
    const isStroke = style.fill === 'none' && style.stroke !== 'none';
    const color = isStroke ? style.stroke : style.fill;
    const opacity = Number(isStroke ? style.strokeOpacity : style.fillOpacity);
    if (!/^rgba?\(/.test(color) || style.visibility !== 'visible' || Number(style.opacity) !== 1 ||
        !(opacity > 0 && opacity <= 1) || style.filter !== 'none' ||
        (isStroke ? style.strokeDasharray !== 'none' || style.vectorEffect !== 'none' : style.stroke !== 'none' || shape.localName !== 'path')) continue;
    const authored = svg.parentElement.computedStyleMap?.();
    const w = authored?.get('width'), h = authored?.get('height'), screen = shape.getScreenCTM();
    if (!screen || w?.unit !== 'px' || h?.unit !== 'px' || !(w.value > 0 && h.value > 0)) continue;
    const actual = new DOMMatrix([screen.a, screen.b, screen.c, screen.d, screen.e - frame.x, screen.f - frame.y]);
    const sampleMatrix = vectorSampleMatrix(svg, actual, window.getComputedStyle(svg), w.value, h.value);
    const inverse = actual.inverse(), sampleInverse = sampleMatrix.inverse();
    if (!Number.isFinite(inverse.a) || !Number.isFinite(sampleInverse.a)) continue;
    const outset = isStroke ? parseFloat(style.strokeWidth) / 2 : 0;
    const box = isStroke ? { x: 0, y: 0, width: w.value, height: h.value } : shape.getBBox();
    const bounds = pixelBounds(sampleMatrix, box.x - outset, box.y - outset, box.x + box.width + outset, box.y + box.height + outset);
    const area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
    if (!(area > 0 && area <= MAX_SHAPE_PIXELS && area * samples.length <= remaining)) continue;
    const contains = isStroke ? primitiveStroke(shape.localName, style, w.value, h.value, outset)
      : pathContains(shape.getAttribute('d'), style.fillRule === 'evenodd');
    if (!contains) continue;
    remaining -= area * samples.length;
    const tiles = sampleVectorPixels(bounds, sampleInverse, contains);
    const group = clone.ownerDocument.createElementNS(SVG, 'g');
    group.setAttribute('transform', inverse.toString());
    group.setAttribute('fill', color);
    group.setAttribute('shape-rendering', 'crispEdges');
    for (let count = 1; count < tiles.length; count++) {
      if (!tiles[count].length) continue;
      const tile = clone.ownerDocument.createElementNS(SVG, 'path');
      tile.setAttribute('d', tiles[count].join(''));
      tile.setAttribute('fill-opacity', String(opacity * count / samples.length));
      group.append(tile);
    }
    target.firstElementChild.replaceWith(group);
  }
}
