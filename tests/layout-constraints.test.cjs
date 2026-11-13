const test = require('node:test');
const assert = require('node:assert/strict');

test('frame constraints preserve the original geometry for every anchor mode', async () => {
  const { constraintStyle } = await import('../dist/layout-service.js');
  const child = { x: 120, y: 70, width: 80, height: 40 }, parent = { width: 600, height: 400 };
  const leftTop = constraintStyle(child, parent, { horizontal: 'left', vertical: 'top' });
  assert.deepEqual([leftTop.left, leftTop.top, leftTop.width, leftTop.height], ['120px', '70px', '80px', '40px']);
  const rightBottom = constraintStyle(child, parent, { horizontal: 'right', vertical: 'bottom' });
  assert.deepEqual([rightBottom.right, rightBottom.bottom], ['400px', '290px']);
  const stretch = constraintStyle(child, parent, { horizontal: 'stretch', vertical: 'stretch' });
  assert.deepEqual([stretch.left, stretch.right, stretch.width, stretch.top, stretch.bottom, stretch.height], ['120px', '400px', 'auto', '70px', '290px', 'auto']);
  const center = constraintStyle(child, parent, { horizontal: 'center', vertical: 'center' });
  assert.deepEqual([center.left, center.top], ['calc(50% - 180px)', 'calc(50% - 130px)']);
  const scale = constraintStyle(child, parent, { horizontal: 'scale', vertical: 'scale' });
  assert.deepEqual([scale.left, scale.width, scale.top, scale.height], ['20%', '13.333333333333334%', '17.5%', '10%']);
});

test('constraint geometry uses frame content bounds and removes canvas zoom from child coordinates', async () => {
  const { constraintGeometry } = await import('../dist/layout-service.js');
  const makeRect = (left, top, width, height) => ({ left, top, width, height });
  const ownerDocument = { defaultView: { getComputedStyle: element => element.computed } };
  const parent = { ownerDocument, offsetWidth: 604, offsetHeight: 404, clientWidth: 600, clientHeight: 400, clientLeft: 2, clientTop: 2, computed: { width: '600px', height: '400px' }, getBoundingClientRect: () => makeRect(50, 30, 302, 202) };
  const child = { ownerDocument, offsetLeft: 123, offsetTop: 73, offsetWidth: 81, offsetHeight: 41, computed: { width: '80.25px', height: '40.5px' }, getBoundingClientRect: () => makeRect(111, 66, 40.125, 20.25) };
  const result = constraintGeometry(child, parent, { left: '123px', top: '73px', width: '80px', height: '40px' }, { width: '600px', height: '400px' });
  assert.deepEqual(result, { child: { x: 120, y: 70, width: 80.25, height: 40.5 }, parent: { width: 600, height: 400 } });
  const resized = constraintGeometry({ ...child, getBoundingClientRect: () => makeRect(111, 66, 40.125, 20.25) }, parent, {}, {});
  assert.equal(resized.child.x, 120);
  assert.equal(resized.child.y, 70);
});

test('applying and undoing constraints persists the metadata and restores prior styles', async () => {
  const { constraintCommand } = await import('../dist/layout-service.js');
  let metadata = {}, childStyle = { position: 'absolute', left: '120px', top: '70px', width: '80px', height: '40px', color: 'red' };
  const parentEl = { offsetWidth: 600, offsetHeight: 400, clientWidth: 600, clientHeight: 400, clientLeft: 0, clientTop: 0, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) };
  const childEl = { ownerDocument: { defaultView: { getComputedStyle: () => ({ width: '80px', height: '40px' }) } }, getBoundingClientRect: () => ({ left: 120, top: 70, width: 80, height: 40 }) };
  const parent = { view: { el: parentEl }, getStyle: () => ({ width: '600px', height: '400px' }) };
  const component = { view: { el: childEl }, parent: () => parent, get: key => key === 'formaNodeId' ? 'child-1' : undefined, getStyle: () => structuredClone(childStyle), setStyle: value => { childStyle = structuredClone(value); }, addStyle: value => { childStyle = { ...childStyle, ...value }; } };
  const projectState = { getLayoutMetadata: () => structuredClone(metadata), setLayoutMetadata: value => { metadata = structuredClone(value); } };
  const command = constraintCommand(component, projectState, { horizontal: 'right', vertical: 'bottom' });
  const before = command.apply();
  assert.equal(childStyle.right, '400px');
  assert.equal(childStyle.bottom, '290px');
  assert.deepEqual(metadata['child-1'].constraints, { horizontal: 'right', vertical: 'bottom' });
  command.revert(before);
  assert.deepEqual(childStyle, { position: 'absolute', left: '120px', top: '70px', width: '80px', height: '40px', color: 'red' });
  assert.deepEqual(metadata, {});
});
