const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeBounds(bounds = {}) {
  const x = finite(bounds.x), y = finite(bounds.y);
  return { x, y, width: Math.max(1, finite(bounds.width, 1)), height: Math.max(1, finite(bounds.height, 1)) };
}

export function selectionBounds(items = []) {
  if (!items.length) return null;
  const boxes = items.map(normalizeBounds);
  const left = Math.min(...boxes.map(box => box.x));
  const top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function alignedPositions(items = [], direction = 'left') {
  const boxes = items.map(normalizeBounds), bounds = selectionBounds(boxes);
  if (!bounds || !['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(direction)) return [];
  return boxes.map(box => ({
    x: direction === 'left' ? bounds.x : direction === 'center' ? bounds.x + (bounds.width - box.width) / 2 : direction === 'right' ? bounds.x + bounds.width - box.width : box.x,
    y: direction === 'top' ? bounds.y : direction === 'middle' ? bounds.y + (bounds.height - box.height) / 2 : direction === 'bottom' ? bounds.y + bounds.height - box.height : box.y,
  }));
}

export function distributedPositions(items = [], axis = 'horizontal') {
  const boxes = items.map(normalizeBounds), horizontal = axis === 'horizontal';
  if (boxes.length < 3 || !horizontal && axis !== 'vertical') return [];
  const coordinate = horizontal ? 'x' : 'y', dimension = horizontal ? 'width' : 'height';
  const ordered = boxes.map((box, index) => ({ ...box, index })).sort((a, b) => a[coordinate] - b[coordinate]);
  const first = ordered[0], last = ordered.at(-1), start = first[coordinate];
  const end = last[coordinate] + last[dimension];
  const freeSpace = end - start - ordered.reduce((sum, box) => sum + box[dimension], 0);
  const gap = freeSpace / (ordered.length - 1);
  let cursor = start;
  const result = Array(boxes.length);
  ordered.forEach(box => {
    result[box.index] = { x: horizontal ? cursor : box.x, y: horizontal ? box.y : cursor };
    cursor += box[dimension] + gap;
  });
  return result;
}

export function tidyPositions(items = [], { rowTolerance } = {}) {
  const boxes = items.map(normalizeBounds);
  if (boxes.length < 2) return [];
  const typicalHeight = boxes.map(box => box.height).sort((a, b) => a - b)[Math.floor(boxes.length / 2)];
  const tolerance = Math.max(2, finite(rowTolerance, typicalHeight * 0.35));
  const ordered = boxes.map((box, index) => ({ ...box, index, centerY: box.y + box.height / 2 })).sort((a, b) => a.centerY - b.centerY);
  const rows = [];
  ordered.forEach(box => {
    let row = rows.find(item => Math.abs(item.centerY - box.centerY) <= tolerance);
    if (!row) { row = { centerY: box.centerY, items: [] }; rows.push(row); }
    row.items.push(box);
    row.centerY = row.items.reduce((sum, item) => sum + item.centerY, 0) / row.items.length;
  });
  const result = Array(boxes.length);
  rows.forEach(row => {
    const positions = distributedPositions(row.items, 'horizontal');
    row.items.forEach((box, index) => { result[box.index] = positions[index] || { x: box.x, y: box.y }; });
  });
  if (rows.length > 2) {
    const rowBoxes = rows.map(row => selectionBounds(row.items));
    const vertical = distributedPositions(rowBoxes, 'vertical');
    rows.forEach((row, rowIndex) => {
      const dy = vertical[rowIndex].y - rowBoxes[rowIndex].y;
      row.items.forEach(box => { result[box.index].y += dy; });
    });
  }
  return result;
}

export function nearestSnap(bounds, peers = [], threshold = 6) {
  const box = normalizeBounds(bounds), xMarks = [box.x, box.x + box.width / 2, box.x + box.width], yMarks = [box.y, box.y + box.height / 2, box.y + box.height];
  const peerBoxes = peers.map(normalizeBounds), xTargets = peerBoxes.flatMap(item => [item.x, item.x + item.width / 2, item.x + item.width]), yTargets = peerBoxes.flatMap(item => [item.y, item.y + item.height / 2, item.y + item.height]);
  const find = (marks, targets) => {
    let best = null;
    marks.forEach(mark => targets.forEach(target => {
      const delta = target - mark;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target };
    }));
    return best;
  };
  const x = find(xMarks, xTargets), y = find(yMarks, yTargets);
  return { x: x?.delta || 0, y: y?.delta || 0, guideX: x?.target ?? null, guideY: y?.target ?? null };
}
