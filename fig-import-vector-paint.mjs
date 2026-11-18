const geometryCommands = [ ['Z', 0], ['M', 2], ['L', 2], null, ['C', 6] ];

export function preciseGeometryPath(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const commands = [];
  for (let offset = 0; offset < bytes.byteLength;) {
    const command = geometryCommands[view.getUint8(offset++)];
    if (!command || offset + command[1] * 4 > bytes.byteLength) return null;
    const [letter, length] = command;
    const values = [];
    for (let index = 0; index < length; index++, offset += 4) {
      const value = view.getFloat32(offset, true);
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }
    commands.push(letter + values.join(' '));
  }
  return commands.join('');
}

const helperFlags = { selectable: false, hoverable: false, layerable: false, draggable: false, droppable: false, copyable: false };

export function vectorPaintComponent(key, tagName, attributes, style, viewBox) {
  return {
    ...helperFlags, type: 'svg', tagName: 'svg', formaPartKey: `${key}/paint`,
    attributes: { 'data-forma-vector-paint': 'true', 'aria-hidden': 'true', ...(viewBox ? { viewBox } : {}) },
    style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', 'pointer-events': 'none' },
    components: [{ ...helperFlags, type: 'svg-in', tagName, formaPartKey: `${key}/paint/shape`, attributes, style }],
  };
}

// Keep layout and visual placement equivalent, but let the SVG paint at the
// fractional coordinate before Chromium snaps the HTML box to the pixel grid.
export function preserveVectorSubpixelPosition(style, sourceX, sourceY) {
  if (!['relative', 'absolute'].includes(style.position)) return;
  const offset = value => Number.isFinite(value) ? Number((value - Math.floor(value)).toFixed(5)) % 1 : 0;
  const relative = style.position === 'relative';
  const left = relative ? sourceX : parseFloat(style.left);
  const top = relative ? sourceY : parseFloat(style.top);
  const x = offset(left), y = offset(top);
  if (!x && !y) return;
  if (x) style.left = `${relative ? -x : Math.floor(left)}px`;
  if (y) style.top = `${relative ? -y : Math.floor(top)}px`;
  style.translate = `${x}px ${y}px`;
}
