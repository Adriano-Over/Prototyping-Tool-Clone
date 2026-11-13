export function normalizeVectorPoints(points, width, height) {
  const maxX = Math.max(1, Number(width) || 1);
  const maxY = Math.max(1, Number(height) || 1);
  return (Array.isArray(points) ? points : [])
    .filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
    .map(point => ({
      x: Math.max(0, Math.min(maxX, Number(point.x))),
      y: Math.max(0, Math.min(maxY, Number(point.y))),
      ...(point.handleIn ? { handleIn: { x: Math.max(0, Math.min(maxX, Number(point.handleIn.x))), y: Math.max(0, Math.min(maxY, Number(point.handleIn.y))) } } : {}),
      ...(point.handleOut ? { handleOut: { x: Math.max(0, Math.min(maxX, Number(point.handleOut.x))), y: Math.max(0, Math.min(maxY, Number(point.handleOut.y))) } } : {}),
    }));
}

export function vectorPathData(points, { closed = false } = {}) {
  const values = (Array.isArray(points) ? points : []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!values.length) return '';
  const n = value => Number(Number(value).toFixed(3));
  let path = `M ${n(values[0].x)} ${n(values[0].y)}`;
  for (let index = 1; index < values.length; index++) {
    const previous = values[index - 1], point = values[index];
    if (previous.handleOut || point.handleIn) {
      const out = previous.handleOut || previous, incoming = point.handleIn || point;
      path += ` C ${n(out.x)} ${n(out.y)} ${n(incoming.x)} ${n(incoming.y)} ${n(point.x)} ${n(point.y)}`;
    } else path += ` L ${n(point.x)} ${n(point.y)}`;
  }
  return closed && values.length > 2 ? `${path} Z` : path;
}

export function addSmoothVectorHandles(points) {
  const values = (Array.isArray(points) ? points : []).map(point => ({ x: Number(point.x), y: Number(point.y) }));
  return values.map((point, index) => {
    const previous = values[Math.max(0, index - 1)], next = values[Math.min(values.length - 1, index + 1)];
    const dx = next.x - previous.x, dy = next.y - previous.y, length = Math.hypot(dx, dy) || 1;
    const before = index ? Math.hypot(point.x - previous.x, point.y - previous.y) : Math.hypot(next.x - point.x, next.y - point.y);
    const after = index < values.length - 1 ? Math.hypot(next.x - point.x, next.y - point.y) : before;
    const radius = Math.min(before, after) * 0.25, ux = dx / length, uy = dy / length;
    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    return { ...point, handleIn: { x: clamp(point.x - ux * radius, Math.max(...values.map(item => item.x))), y: clamp(point.y - uy * radius, Math.max(...values.map(item => item.y))) }, handleOut: { x: clamp(point.x + ux * radius, Math.max(...values.map(item => item.x))), y: clamp(point.y + uy * radius, Math.max(...values.map(item => item.y))) } };
  });
}

export function moveVectorHandle(points, index, side, nextPoint, width, height) {
  const current = (Array.isArray(points) ? points : []).map(point => ({ ...point }));
  if (!Number.isInteger(index) || index < 0 || index >= current.length || !['handleIn', 'handleOut'].includes(side)) return current;
  const next = normalizeVectorPoints([nextPoint], width, height)[0];
  if (!next) return current;
  const anchor = current[index];
  anchor[side] = next;
  const opposite = side === 'handleIn' ? 'handleOut' : 'handleIn', old = anchor[opposite];
  if (old) {
    const dx = next.x - anchor.x, dy = next.y - anchor.y, length = Math.hypot(dx, dy) || 1;
    const oldLength = Math.hypot(old.x - anchor.x, old.y - anchor.y);
    anchor[opposite] = { x: Math.max(0, Math.min(width, anchor.x - dx / length * oldLength)), y: Math.max(0, Math.min(height, anchor.y - dy / length * oldLength)) };
  }
  return current;
}

export function insertVectorMidpoint(points, index = 0) {
  const values = (Array.isArray(points) ? points : []).map(point => ({ ...point }));
  if (values.length < 2) return values;
  const at = Math.max(0, Math.min(values.length - 2, Number(index) || 0));
  const start = values[at], end = values[at + 1];
  const point = start.handleOut || end.handleIn
    ? { x: (start.x + 3 * (start.handleOut?.x ?? start.x) + 3 * (end.handleIn?.x ?? end.x) + end.x) / 8, y: (start.y + 3 * (start.handleOut?.y ?? start.y) + 3 * (end.handleIn?.y ?? end.y) + end.y) / 8 }
    : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  values.splice(at + 1, 0, point);
  return values;
}

export function removeVectorPoint(points, index) {
  const values = (Array.isArray(points) ? points : []).map(point => ({ ...point }));
  if (values.length <= 2 || !Number.isInteger(index) || index < 0 || index >= values.length) return values;
  values.splice(index, 1);
  return values;
}

export function simplifyVectorPoints(points, tolerance = 1) {
  const values = (Array.isArray(points) ? points : []).filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
  if (values.length < 3) return values.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  const limit = Math.max(0, Number(tolerance) || 0), limitSquared = limit * limit;
  const result = [{ x: Number(values[0].x), y: Number(values[0].y) }];
  let last = values[0];
  for (let index = 1; index < values.length - 1; index++) {
    const point = values[index], dx = Number(point.x) - Number(last.x), dy = Number(point.y) - Number(last.y);
    if (dx * dx + dy * dy >= limitSquared) {
      result.push({ x: Number(point.x), y: Number(point.y) });
      last = point;
    }
  }
  const end = values.at(-1);
  result.push({ x: Number(end.x), y: Number(end.y) });
  return result;
}

export function moveVectorPoint(points, index, nextPoint, width, height) {
  const current = normalizeVectorPoints(points, width, height);
  if (!Number.isInteger(index) || index < 0 || index >= current.length) return current;
  const next = normalizeVectorPoints([nextPoint], width, height)[0];
  if (next) {
    const previous = current[index], dx = next.x - previous.x, dy = next.y - previous.y;
    if (previous.handleIn) next.handleIn = { x: Math.max(0, Math.min(width, previous.handleIn.x + dx)), y: Math.max(0, Math.min(height, previous.handleIn.y + dy)) };
    if (previous.handleOut) next.handleOut = { x: Math.max(0, Math.min(width, previous.handleOut.x + dx)), y: Math.max(0, Math.min(height, previous.handleOut.y + dy)) };
    current[index] = next;
  }
  return current;
}

export function createEditableVectorComponent({ x, y, width, height, points = [], name = 'Pen path', stroke = '#188466', strokeWidth = 2, closed = false, fill = 'none' }) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const normalized = normalizeVectorPoints(points, safeWidth, safeHeight);
  const d = vectorPathData(normalized, { closed });
  return {
    tagName: 'svg',
    name,
    attributes: {
      viewBox: `0 0 ${safeWidth} ${safeHeight}`,
      width: safeWidth,
      height: safeHeight,
      'data-forma-vector-points': JSON.stringify(normalized),
      'data-forma-vector-closed': String(Boolean(closed)),
      role: 'img',
      'aria-label': name,
    },
    style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${safeWidth}px`, height: `${safeHeight}px`, overflow: 'visible' },
    components: [{
      tagName: 'path',
      attributes: { d, fill: closed ? fill : 'none', stroke, 'stroke-width': String(strokeWidth), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' },
    }],
  };
}

export function createTextPathComponent({ x, y, width, height, points = [], text = 'Your text here' }) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  const first = points[0];
  const last = points.at(-1);
  const hasDistinctEndpoints = first && last && points.length > 1 && (first.x !== last.x || first.y !== last.y);
  const start = hasDistinctEndpoints
    ? { x: clamp(first.x, safeWidth), y: clamp(first.y, safeHeight) }
    : { x: 0, y: safeHeight / 2 };
  const end = hasDistinctEndpoints
    ? { x: clamp(last.x, safeWidth), y: clamp(last.y, safeHeight) }
    : { x: safeWidth, y: safeHeight / 2 };
  const bend = Math.max(8, Math.min(safeHeight * 0.8, Math.abs(end.x - start.x) * 0.18));
  const control = { x: (start.x + end.x) / 2, y: Math.max(0, (start.y + end.y) / 2 - bend) };
  const id = `forma-text-path-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
  const d = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  return {
    tagName: 'svg',
    name: 'Text on path',
    attributes: { viewBox: `0 0 ${safeWidth} ${safeHeight}`, width: safeWidth, height: safeHeight, role: 'img', 'aria-label': String(text) },
    style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${safeWidth}px`, height: `${safeHeight}px`, overflow: 'visible' },
    components: [
      { tagName: 'defs', components: [{ tagName: 'path', attributes: { id, d } }] },
      { tagName: 'text', attributes: { fill: '#274d38', 'font-size': '24', 'font-family': 'Inter, Arial, sans-serif' }, components: [{ tagName: 'textPath', attributes: { href: `#${id}`, startOffset: '0%' }, content: String(text) }] },
    ],
  };
}

export function createCanvasCommentRecord({ id, text, x, y, author = 'Adriano', createdAt = new Date().toISOString() }) {
  const message = String(text || '').trim();
  const left = Number(x), top = Number(y);
  if (!id || !message || !Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { id, nodeId: id, author, text: message, createdAt, resolved: false, canvas: { x: left, y: top } };
}
