const test = require('node:test');
const assert = require('node:assert/strict');

test('ellipse masks compute a clip region relative to the artwork layer', async () => {
  const { maskClipStyle } = await import('../dist/mask-model.js');
  assert.equal(maskClipStyle(
    { left: '326px', top: '763px', width: '392px', height: '249px' },
    { left: '214px', top: '701px', width: '623px', height: '386px' },
    true,
  ), 'ellipse(196px 124.5px at 308px 186.5px)');
});

test('rectangular masks clip by the intersection of mask and artwork bounds', async () => {
  const { maskClipStyle } = await import('../dist/mask-model.js');
  assert.equal(maskClipStyle(
    { left: '20px', top: '30px', width: '60px', height: '50px', 'border-radius': '8px' },
    { left: '0px', top: '0px', width: '100px', height: '100px' },
  ), 'inset(30px 20px 20px 20px round 8px)');
});

test('mask fills are hidden while clipping and their original opacity is preserved for release', async () => {
  const { maskPresentation } = await import('../dist/mask-model.js');
  assert.deepEqual(maskPresentation({ opacity: '0.45' }, '0.45'), {
    originalOpacity: '0.45',
    hiddenStyle: { opacity: '0' },
  });
  assert.deepEqual(maskPresentation({}, '0.75'), {
    originalOpacity: '0.75',
    hiddenStyle: { opacity: '0' },
  });
});
