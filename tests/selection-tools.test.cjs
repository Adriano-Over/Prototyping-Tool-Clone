const test = require('node:test');
const assert = require('node:assert/strict');

test('multi-selection alignment and distribution preserve dimensions and outer bounds', async () => {
  const { alignedPositions, distributedPositions } = await import('../dist/selection-tools.js');
  const items = [{ x: 20, y: 30, width: 20, height: 10 }, { x: 80, y: 70, width: 40, height: 20 }, { x: 150, y: 10, width: 30, height: 15 }];
  assert.deepEqual(alignedPositions(items, 'middle').map(position => position.y), [45, 40, 42.5]);
  const positions = distributedPositions(items, 'horizontal');
  assert.deepEqual(positions.map(position => position.x), [20, 75, 150]);
});

test('tidy positions distributes a row evenly and keeps a multi-row arrangement ordered', async () => {
  const { tidyPositions } = await import('../dist/selection-tools.js');
  const row = [{ x: 0, y: 10, width: 20, height: 20 }, { x: 50, y: 12, width: 30, height: 18 }, { x: 130, y: 9, width: 10, height: 20 }];
  assert.deepEqual(tidyPositions(row).map(position => position.x), [0, 60, 130]);
  const grid = [{ x: 0, y: 0, width: 20, height: 20 }, { x: 100, y: 2, width: 20, height: 20 }, { x: 0, y: 100, width: 20, height: 20 }, { x: 100, y: 102, width: 20, height: 20 }];
  const positions = tidyPositions(grid);
  assert.deepEqual(positions.map(position => position.x), [0, 100, 0, 100]);
  assert.ok(positions[2].y > positions[0].y);
});

test('smart guide snapping finds the closest center or edge within a zoom-aware threshold', async () => {
  const { nearestSnap } = await import('../dist/selection-tools.js');
  const result = nearestSnap({ x: 39, y: 89, width: 20, height: 20 }, [{ x: 20, y: 50, width: 40, height: 40 }], 2);
  assert.equal(result.x, 1);
  assert.equal(result.y, 1);
  assert.equal(result.guideX, 40);
  assert.equal(result.guideY, 90);
  assert.deepEqual(nearestSnap({ x: 0, y: 0, width: 10, height: 10 }, [{ x: 20, y: 20, width: 10, height: 10 }], 2), { x: 0, y: 0, guideX: null, guideY: null });
});
