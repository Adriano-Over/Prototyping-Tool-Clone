import { createEditableVectorComponent } from './vector-tools.js';
import { drawingPoint } from './canvas-placement.js';

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function boundsOf(points) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

/** Adds Figma-style click-to-place Pen paths to the editor canvas. */
export function bindPenTool({ editor, toolState, board, scheduleSave, renderLayers, syncCanvasWrapperExtent, history, toast }) {
  const bind = frameWindow => {
    const doc = frameWindow?.document;
    if (!doc || doc.body.dataset.formaPenBound) return;
    doc.body.dataset.formaPenBound = 'true';
    let path = null, preview = null, hoverPoint = null, dragAnchor = null;
    const canvasPoint = event => {
      const frame = editor.Canvas.getFrameEl()?.getBoundingClientRect();
      if (!frame) return null;
      const point = drawingPoint(event, editor.Canvas.getZoom?.() || 100);
      if (document.body.classList.contains('pixel-grid-snap')) {
        point.x = Math.round(point.x / 8) * 8;
        point.y = Math.round(point.y / 8) * 8;
      }
      return point;
    };
    const hidePreview = () => { preview?.remove(); preview = null; };
    const updatePreview = () => {
      if (!path?.points.length) return hidePreview();
      const frame = editor.Canvas.getFrameEl()?.getBoundingClientRect();
      if (!frame) return;
      preview ||= document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      preview.setAttribute('aria-hidden', 'true');
      preview.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;overflow:visible;z-index:2147483000;pointer-events:none';
      const scale = (Number(editor.Canvas.getZoom?.()) || 100) / 100;
      const points = [...path.points, ...(hoverPoint && distance(hoverPoint, path.points.at(-1)) > 0.5 ? [hoverPoint] : [])];
      const d = points.map((point, index) => `${index ? 'L' : 'M'} ${frame.left + point.x * scale} ${frame.top + point.y * scale}`).join(' ');
      preview.replaceChildren();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', d); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#1688f2');
      line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round');
      preview.append(line);
      if (!preview.isConnected) document.body.append(preview);
    };
    const cancel = () => { path = null; hoverPoint = null; dragAnchor = null; hidePreview(); };
    const finish = closed => {
      if (!path) return false;
      const points = path.points.slice();
      if (points.length > 1 && distance(points[0], points.at(-1)) < 0.5) points.pop();
      if (points.length < 2) { cancel(); toast('Add at least two Pen points to create a path'); return false; }
      const box = boundsOf(points), frame = board(), style = frame?.getStyle?.() || {};
      const fx = Number.parseFloat(style.left) || 0, fy = Number.parseFloat(style.top) || 0;
      const fw = Number.parseFloat(style.width) || 1400, fh = Number.parseFloat(style.height) || 1100;
      const inside = box.x >= fx && box.y >= fy && box.x + box.width <= fx + fw && box.y + box.height <= fy + fh;
      const parent = inside ? frame : editor.getWrapper();
      const dx = inside ? fx : 0, dy = inside ? fy : 0;
      const localBox = { x: box.x - dx, y: box.y - dy };
      const localPoints = points.map(point => ({ ...point,
        x: point.x - dx - localBox.x, y: point.y - dy - localBox.y,
        ...(point.handleIn ? { handleIn: { x: point.handleIn.x - dx - localBox.x, y: point.handleIn.y - dy - localBox.y } } : {}),
        ...(point.handleOut ? { handleOut: { x: point.handleOut.x - dx - localBox.x, y: point.handleOut.y - dy - localBox.y } } : {}) }));
      const component = parent.append(createEditableVectorComponent({
        ...localBox, width: box.width, height: box.height, points: localPoints,
        closed, fill: closed ? '#b9d9c3' : 'none', name: 'Pen path', stroke: '#188466', strokeWidth: 2,
      }))[0];
      cancel(); dragAnchor = null; editor.select(component); syncCanvasWrapperExtent(); renderLayers(); history?.flush(); scheduleSave();
      return true;
    };

    const finishAndClear = () => finish(false);
    window.formaFinishPendingPen = finishAndClear;
    doc.addEventListener('pointerdown', event => {
      if (event.button !== 0 || toolState.current() !== 'pen') return;
      const point = canvasPoint(event); if (!point) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const closeTolerance = 8 / ((Number(editor.Canvas.getZoom?.()) || 100) / 100);
      if (path && path.points.length >= 3 && distance(point, path.points[0]) <= closeTolerance) {
        finish(true); return;
      }
      if (!path) path = { points: [point] };
      else if (distance(point, path.points.at(-1)) > 0.5) path.points.push(point);
      dragAnchor = { pointerId: event.pointerId, index: path.points.length - 1, origin: point };
      try { doc.body.setPointerCapture(event.pointerId); } catch {}
      hoverPoint = point; updatePreview();
    }, { capture: true });
    doc.addEventListener('pointermove', event => {
      if (!path) return;
      const point = canvasPoint(event); if (!point) return;
      if (dragAnchor?.pointerId === event.pointerId && (event.buttons & 1)) {
        const anchor = path.points[dragAnchor.index], dx = point.x - dragAnchor.origin.x, dy = point.y - dragAnchor.origin.y;
        if (Math.hypot(dx, dy) > 1) {
          anchor.handleOut = point;
          anchor.handleIn = { x: anchor.x - dx, y: anchor.y - dy };
        }
      }
      hoverPoint = point; updatePreview();
    }, { capture: true });
    const releaseHandle = event => {
      if (dragAnchor?.pointerId !== event.pointerId) return;
      dragAnchor = null; hoverPoint = path?.points.at(-1) || null; updatePreview();
    };
    doc.addEventListener('pointerup', releaseHandle, { capture: true });
    doc.addEventListener('pointercancel', releaseHandle, { capture: true });
    doc.addEventListener('dblclick', event => {
      if (!path || toolState.current() !== 'pen') return;
      event.preventDefault(); event.stopImmediatePropagation(); finish(false);
    }, { capture: true });
    doc.addEventListener('keydown', event => {
      if (!path || toolState.current() !== 'pen') return;
      if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); finish(false); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); toolState.setPersistent('select'); }
    }, { capture: true });
  };
  editor.on('canvas:frame:load', event => bind(event.window));
  setTimeout(() => bind(editor.Canvas.getWindow?.()), 0);
}
