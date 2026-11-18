function value(model, key) {
  return typeof model?.get === 'function' ? model.get(key) : model?.[key];
}

function style(model) {
  const result = typeof model?.getStyle === 'function' ? { ...(model.getStyle() || {}) } : { ...(model?.style || {}) };
  const element = model?.view?.el;
  const view = element?.ownerDocument?.defaultView;
  if (!element || !view) return result;
  try {
    const computed = view.getComputedStyle(element);
    for (const key of ['position', 'left', 'top', 'width', 'height']) {
      const value = computed.getPropertyValue(key);
      if (value && value !== 'auto') result[key] = value;
    }
  } catch {}
  if (!Number.parseFloat(result.width) && element.offsetWidth) result.width = `${element.offsetWidth}px`;
  if (!Number.parseFloat(result.height) && element.offsetHeight) result.height = `${element.offsetHeight}px`;
  return result;
}

function children(model) {
  const result = typeof model?.components === 'function' ? model.components() : model?.components;
  return Array.isArray(result?.models) ? result.models : Array.isArray(result) ? result : [];
}

export function hasMultipleImportedArtboards(root) {
  return children(root).filter(item => {
    const attributes = item?.getAttributes?.() || value(item, 'attributes');
    return Boolean(attributes?.['data-figma-node-id']);
  }).length > 1;
}

export function findCanvasBoard(components, fallback) {
  const direct = Array.isArray(components?.models) ? components.models : Array.isArray(components) ? components : [];
  const all = [];
  const visit = items => items.forEach(item => {
    all.push(item);
    visit(children(item));
  });
  visit(direct);

  const desktop = direct.find(item => /^desktop$/i.test(String(value(item, 'name') || '')))
    || all.find(item => /^desktop$/i.test(String(value(item, 'name') || '')));
  if (desktop) return desktop;
  const frame = direct.find(item => value(item, 'type') === 'frame' || /^frame$/i.test(String(value(item, 'name') || '')))
    || all.find(item => value(item, 'type') === 'frame' || /^frame$/i.test(String(value(item, 'name') || '')));
  if (frame) return frame;
  const largestSized = items => items.filter(item => {
    const current = style(item);
    return Number.parseFloat(current.width) >= 600 && Number.parseFloat(current.height) >= 400;
  }).sort((a, b) => {
    const aStyle = style(a), bStyle = style(b);
    return (Number.parseFloat(bStyle.width) * Number.parseFloat(bStyle.height))
      - (Number.parseFloat(aStyle.width) * Number.parseFloat(aStyle.height));
  })[0];
  const importedFrames = direct.filter(item => value(item, 'attributes')?.['data-figma-node-type'] === 'FRAME');
  return largestSized(importedFrames) || largestSized(direct) || largestSized(all) || fallback;
}

export function centeredElementPosition(parentSize, elementSize, offset = 0) {
  const width = Math.max(1, Number(parentSize?.width) || 1400);
  const height = Math.max(1, Number(parentSize?.height) || 1100);
  const elementWidth = Math.max(0, Number(elementSize?.width) || 0);
  const elementHeight = Math.max(0, Number(elementSize?.height) || 0);
  return {
    left: (width - elementWidth) / 2 - (Number(offset) || 0),
    top: (height - elementHeight) / 2 - (Number(offset) || 0),
  };
}

export function drawingBounds(start = {}, end = {}, { constrain = false, minSize = 1 } = {}) {
  let dx = Number(end.x) - Number(start.x), dy = Number(end.y) - Number(start.y);
  if (!Number.isFinite(dx)) dx = 0;
  if (!Number.isFinite(dy)) dy = 0;
  if (constrain) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const min = Math.max(0, Number(minSize) || 0);
  const x = Math.min(Number(start.x) || 0, (Number(start.x) || 0) + dx);
  const y = Math.min(Number(start.y) || 0, (Number(start.y) || 0) + dy);
  return { x, y, width: Math.max(min, Math.abs(dx)), height: Math.max(min, Math.abs(dy)), dx, dy };
}

export function drawingPoint(event, zoom = 100) {
  // GrapesJS scales the canvas iframe itself. Pointer client coordinates from
  // inside that iframe are already expressed in its document's CSS pixels;
  // dividing by the canvas zoom a second time pushes every new object away
  // from the pointer (most visibly toward the lower-right at low zoom).
  // Keep the parameter for callers from older Forma releases.
  void zoom;
  return { x: Number(event.clientX), y: Number(event.clientY) };
}

export function canvasWrapperExtent(framePosition = {}, frameSize = {}) {
  const left = Number(framePosition.left) || 0;
  const top = Number(framePosition.top) || 0;
  const width = Math.max(0, Number(frameSize.width) || 0);
  const height = Math.max(0, Number(frameSize.height) || 0);
  // Mirror the frame's leading inset on the trailing edges so the workspace
  // stays centered around the frame instead of ending at its right/bottom.
  return {
    width: Math.max(1, Math.ceil(left * 2 + width)),
    height: Math.max(1, Math.ceil(top * 2 + height)),
  };
}

export function canvasContentExtent(currentSize = {}, items = []) {
  const cssNumber = value => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  let width = Math.max(1, cssNumber(currentSize.width));
  let height = Math.max(1, cssNumber(currentSize.height));
  for (const item of items || []) {
    const left = cssNumber(item?.left);
    const top = cssNumber(item?.top);
    const itemWidth = Math.max(0, cssNumber(item?.width));
    const itemHeight = Math.max(0, cssNumber(item?.height));
    width = Math.max(width, left + itemWidth);
    height = Math.max(height, top + itemHeight);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export function gradientFill(mode, start, end, angle = 135) {
  const normalize = color => {
    const value = String(color || '').trim();
    if (!/^#?[\da-f]{6}$/i.test(value)) return null;
    return value.startsWith('#') ? value : `#${value}`;
  };
  const from = normalize(start);
  const to = normalize(end);
  if (mode === 'solid') return { 'background-image': 'none' };
  if (!from || !to || !['linear', 'radial'].includes(mode)) return null;
  const degrees = Math.max(0, Math.min(360, Number(angle) || 0));
  const image = mode === 'radial'
    ? `radial-gradient(circle at center, ${from} 0%, ${to} 100%)`
    : `linear-gradient(${degrees}deg, ${from} 0%, ${to} 100%)`;
  return { 'background-color': 'transparent', 'background-image': image };
}
