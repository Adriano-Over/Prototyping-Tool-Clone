const test = require('node:test');
const assert = require('node:assert/strict');

test('new objects target the Desktop frame even when a text layer has children', async () => {
  const { findCanvasBoard } = await import('../dist/canvas-placement.js');
  const wrapper = { name: 'Canvas', components: [] };
  const text = { name: 'Hero copy', components: [{ name: 'Line break', components: [] }] };
  const desktop = { name: 'Desktop', components: [] };
  wrapper.components = [text, desktop];
  assert.equal(findCanvasBoard(wrapper.components, wrapper), desktop);
});

test('new object coordinates are centered in the parent frame, independent of viewport zoom', async () => {
  const { centeredElementPosition } = await import('../dist/canvas-placement.js');
  assert.deepEqual(centeredElementPosition({ width: 1440, height: 4600 }, { width: 240, height: 45 }), { left: 600, top: 2277.5 });
  assert.deepEqual(centeredElementPosition({ width: 1040, height: 720 }, { width: 180, height: 120 }, 18), { left: 412, top: 282 });
});

test('drag bounds normalize all drag directions and constrain to a square', async () => {
  const { drawingBounds } = await import('../dist/canvas-placement.js');
  assert.deepEqual(drawingBounds({ x: 120, y: 90 }, { x: 40, y: 30 }), { x: 40, y: 30, width: 80, height: 60, dx: -80, dy: -60 });
  assert.deepEqual(drawingBounds({ x: 10, y: 10 }, { x: 22, y: 16 }, { constrain: true }), { x: 10, y: 10, width: 12, height: 12, dx: 12, dy: 12 });
});

test('canvas pointer coordinates stay iframe-local without applying canvas zoom twice', async () => {
  const { drawingPoint } = await import('../dist/canvas-placement.js');
  assert.deepEqual(drawingPoint({ clientX: 250, clientY: 200 }, 125), { x: 250, y: 200 });
  assert.deepEqual(drawingPoint({ clientX: 250, clientY: 200 }, 100), { x: 250, y: 200 });
});

test('canvas wrapper matches the frame bounds without one-sided padding', async () => {
  const { canvasWrapperExtent } = await import('../dist/canvas-placement.js');
  assert.deepEqual(canvasWrapperExtent({ left: 88, top: 72 }, { width: 1440, height: 5100 }), {
    width: 1528,
    height: 5172,
  });
  assert.deepEqual(canvasWrapperExtent({ left: 0, top: 0 }, { width: 600, height: 400 }), {
    width: 600,
    height: 400,
  });
});

test('linear and radial fills are generated from validated six-digit colors', async () => {
  const { gradientFill } = await import('../dist/canvas-placement.js');
  assert.deepEqual(gradientFill('linear', '#14D6CA', '8338EC', 135), {
    'background-color': 'transparent',
    'background-image': 'linear-gradient(135deg, #14D6CA 0%, #8338EC 100%)',
  });
  assert.match(gradientFill('radial', '#14D6CA', '#8338EC')['background-image'], /^radial-gradient\(/);
  assert.equal(gradientFill('linear', 'bad', '#8338EC'), null);
});
