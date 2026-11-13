const test = require('node:test');
const assert = require('node:assert/strict');

test('tutorial canvas setup keeps pointer geometry, zoom anchoring, and grid metadata consistent', async () => {
  const { drawingBounds, drawingPoint } = await import('../dist/canvas-placement.js');
  const { coordsAfterAnchoredZoom } = await import('../dist/zoom-controller.js');
  const { gridMetadataCommand } = await import('../dist/layout-service.js');
  assert.deepEqual(drawingBounds({ x: 420, y: 310 }, { x: 190, y: 160 }), { x: 190, y: 160, width: 230, height: 150, dx: -230, dy: -150 });
  assert.deepEqual(drawingPoint({ clientX: 510, clientY: 360 }, 25), { x: 510, y: 360 });
  const viewport = { left: 0, top: 0, width: 900, height: 650 }, anchor = { x: 365, y: 270 };
  const moved = coordsAfterAnchoredZoom({ x: -130, y: 90 }, anchor, viewport, 50, 125);
  const world = { x: viewport.width / 2 + (anchor.x - viewport.width / 2 - (-130)) / .5, y: viewport.height / 2 + (anchor.y - viewport.height / 2 - 90) / .5 };
  assert.ok(Math.abs(viewport.width / 2 + (world.x - viewport.width / 2) * 1.25 + moved.x - anchor.x) < 1e-8);
  assert.ok(Math.abs(viewport.height / 2 + (world.y - viewport.height / 2) * 1.25 + moved.y - anchor.y) < 1e-8);
  let metadata = {};
  const project = { getLayoutMetadata: () => structuredClone(metadata), setLayoutMetadata: value => { metadata = structuredClone(value); } };
  const component = { get: () => 'desktop' };
  const command = gridMetadataCommand(component, project, { columns: 12, gutter: 15, margin: 80, maxWidth: 1110, alignment: 'center' });
  const before = command.apply();
  assert.deepEqual(metadata.desktop.grid, { columns: 12, gutter: 15, margin: 80, maxWidth: 1110, alignment: 'center' });
  command.revert(before);
  assert.deepEqual(metadata, {});
});

test('image crop controls map fit and focal point to persistent CSS for image and image-fill layers', async () => {
  const { imageFitFromInspector, imageFitToInspector, imagePositionStyle } = await import('../dist/image-fit-model.js');
  assert.equal(imageFitFromInspector('cover', { elementImage: true }), 'cover');
  assert.equal(imageFitFromInspector('fill'), '100% 100%');
  assert.equal(imageFitFromInspector('original', { elementImage: true }), 'none');
  assert.equal(imageFitToInspector('100% 100%'), 'fill');
  assert.equal(imageFitToInspector('auto'), 'original');
  assert.equal(imageFitToInspector('none', { elementImage: true }), 'original');
  assert.equal(imageFitToInspector('800px auto'), 'cover');
  assert.deepEqual(imagePositionStyle(78, 24, { elementImage: true }), { 'object-position': '78% 24%' });
  assert.deepEqual(imagePositionStyle(-10, 145), { 'background-position': '0% 100%' });
});

test('CTA button layout expands with content while preserving responsive padding and gaps', async () => {
  const { autoLayoutStyle, sizingStyle } = await import('../dist/layout-service.js');
  const style = autoLayoutStyle({ direction: 'row', gap: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 22, paddingRight: 22, align: 'center', justify: 'center', wrap: false, widthMode: 'hug', heightMode: 'fixed', height: 44 });
  assert.equal(style.display, 'flex');
  assert.equal(style['flex-direction'], 'row');
  assert.equal(style['flex-wrap'], 'nowrap');
  assert.equal(style['padding-left'], '22px');
  assert.equal(style['gap'], '12px');
  assert.equal(style.height, '44px');
  assert.equal(sizingStyle({ widthMode: 'fill', parentDirection: 'row' })['flex-grow'], '1');
});

test('testimonial layout constraints remain centered on the top edge when the frame width changes', async () => {
  const { constraintStyle } = await import('../dist/layout-service.js');
  const child = { x: 510, y: 130, width: 360, height: 220 };
  const style = constraintStyle(child, { width: 1440, height: 4000 }, { horizontal: 'center', vertical: 'top' });
  assert.equal(style.left, 'calc(50% - 210px)');
  assert.equal(style.top, '130px');
  assert.equal(style.width, '360px');
});

test('headline and background styling retain letter spacing, case, blend and opacity declarations', async () => {
  const resolver = (await import('../dist/style-resolver.js')).default;
  const { createFormaProject } = await import('../dist/project-model.js');
  const typography = {
    'font-family': 'Outfit, sans-serif', 'font-size': '64px', 'font-weight': '700',
    'letter-spacing': '-1px', 'text-transform': 'uppercase', 'text-align': 'center', 'mix-blend-mode': 'screen', opacity: '0.65',
  };
  const project = createFormaProject({ editor: { pages: [{ id: 'p', component: { components: [{ type: 'text', style: typography }] } }] } });
  const saved = project.editor.grapesjs.pages[0].component.components[0].style;
  assert.equal(saved['letter-spacing'], '-1px');
  assert.equal(saved['text-transform'], 'uppercase');
  assert.equal(saved['text-align'], 'center');
  assert.equal(saved['font-family'], 'Outfit, sans-serif');
  const result = resolver.resolve({ opacity: saved.opacity, 'background-image': 'radial-gradient(circle, #14D6CA 0%, #8338EC 100%)', 'box-shadow': '0 8px 20px #0004' });
  assert.equal(saved['mix-blend-mode'], 'screen');
  assert.equal(result.opacity, '0.65');
  assert.equal(result.gradient.type, 'radial');
  assert.equal(result.boxShadow.length, 1);
});

test('poster frame, gradient, mask and prototype preview/export keep tutorial styling data', async () => {
  const { gradientFill } = await import('../dist/canvas-placement.js');
  const { maskClipStyle } = await import('../dist/mask-model.js');
  const { preparePreviewDocument } = await import('../dist/preview-service.js');
  const fill = gradientFill('linear', '#14D6CA', '#8338EC', 135);
  assert.equal(fill['background-image'], 'linear-gradient(135deg, #14D6CA 0%, #8338EC 100%)');
  assert.equal(maskClipStyle({ left: '50px', top: '30px', width: '180px', height: '180px' }, { left: '0px', top: '0px', width: '300px', height: '200px' }, true), 'ellipse(90px 90px at 140px 120px)');
  const preview = preparePreviewDocument('<!doctype html><html><head></head><body><main style="height:4200px"><button>Get started</button></main></body></html>');
  assert.match(preview, /overflow-y:auto!important/);
  assert.match(preview, /Get started/);
  assert.match(preview, /height:4200px/);
});
