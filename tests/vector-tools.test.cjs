const test = require('node:test');
const assert = require('node:assert/strict');

test('text-on-path creates SVG text attached to an SVG path', async () => {
  const { createTextPathComponent } = await import('../dist/vector-tools.js');
  const component = createTextPathComponent({ x: 10, y: 20, width: 240, height: 48, text: 'Forma', points: [{ x: 0, y: 40 }, { x: 240, y: 12 }] });
  assert.equal(component.name, 'Text on path');
  assert.equal(component.components[0].components[0].tagName, 'path');
  assert.equal(component.components[1].components[0].tagName, 'textPath');
  assert.equal(component.components[1].components[0].content, 'Forma');
  assert.match(component.components[1].components[0].attributes.href, /^#forma-text-path-/);
  assert.equal(component.style.left, '10px');
  const clickTool = createTextPathComponent({ x: 0, y: 0, width: 240, height: 48, points: [{ x: 120, y: 24 }, { x: 120, y: 24 }] });
  assert.notEqual(clickTool.components[0].components[0].attributes.d, 'M 120 24 Q 120 24 120 24');
});

test('Pen and Pencil components preserve editable vector anchors in the project model', async () => {
  const { createEditableVectorComponent, moveVectorPoint, simplifyVectorPoints, vectorPathData } = await import('../dist/vector-tools.js');
  const points = [{ x: 0, y: 5 }, { x: 35, y: 20 }, { x: 80, y: 5 }];
  const component = createEditableVectorComponent({ x: 10, y: 20, width: 80, height: 30, points, name: 'Pen path' });
  assert.equal(component.attributes['data-forma-vector-points'], JSON.stringify(points));
  assert.equal(component.components[0].attributes.d, 'M 0 5 L 35 20 L 80 5');
  assert.equal(component.components[0].attributes.fill, 'none');
  assert.deepEqual(moveVectorPoint(points, 1, { x: 42, y: -10 }, 80, 30), [points[0], { x: 42, y: 0 }, points[2]]);
  assert.equal(vectorPathData([{ x: 1, y: 2 }, { x: 4, y: 6 }, { x: 8, y: 2 }], { closed: true }), 'M 1 2 L 4 6 L 8 2 Z');
  assert.deepEqual(simplifyVectorPoints([{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 1.5, y: 0 }, { x: 4, y: 0 }], 1), [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 4, y: 0 }]);
});

test('vector anchors can grow into editable smooth Bézier handles', async () => {
  const { addSmoothVectorHandles, moveVectorHandle, vectorPathData } = await import('../dist/vector-tools.js');
  const points = addSmoothVectorHandles([{ x: 0, y: 20 }, { x: 50, y: 0 }, { x: 100, y: 20 }]);
  assert.ok(points.every(point => point.handleIn && point.handleOut));
  assert.match(vectorPathData(points), / C /);
  const moved = moveVectorHandle(points, 1, 'handleOut', { x: 65, y: 8 }, 100, 40);
  assert.deepEqual(moved[1].handleOut, { x: 65, y: 8 });
  assert.ok(moved[1].handleIn.x < moved[1].x);
  assert.match(vectorPathData(moved), / C /);
});

test('moving an anchor preserves its Bézier handle offsets', async () => {
  const { moveVectorPoint } = await import('../dist/vector-tools.js');
  const points = [{ x: 10, y: 10, handleIn: { x: 5, y: 10 }, handleOut: { x: 15, y: 10 } }, { x: 40, y: 10 }];
  const moved = moveVectorPoint(points, 0, { x: 20, y: 25 }, 100, 100);
  assert.deepEqual(moved[0], { x: 20, y: 25, handleIn: { x: 15, y: 25 }, handleOut: { x: 25, y: 25 } });
});

test('vector midpoint insertion and anchor removal keep a drawable path', async () => {
  const { insertVectorMidpoint, removeVectorPoint, vectorPathData } = await import('../dist/vector-tools.js');
  const points = [{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 80, y: 0 }];
  const inserted = insertVectorMidpoint(points, 1);
  assert.deepEqual(inserted[2], { x: 60, y: 10 });
  const removed = removeVectorPoint(inserted, 2);
  assert.equal(removed.length, 3);
  assert.equal(removeVectorPoint(removed, 0).length, 2);
  assert.match(vectorPathData(removed), /^M /);
});

test('canvas comments reject blank text and preserve the placed position', async () => {
  const { createCanvasCommentRecord } = await import('../dist/vector-tools.js');
  assert.equal(createCanvasCommentRecord({ id: 'pin', text: '  ', x: 20, y: 30 }), null);
  assert.deepEqual(createCanvasCommentRecord({ id: 'pin', text: '  Check spacing  ', x: 20, y: 30, createdAt: 'now' }), {
    id: 'pin', nodeId: 'pin', author: 'Adriano', text: 'Check spacing', createdAt: 'now', resolved: false, canvas: { x: 20, y: 30 },
  });
});
