const test = require('node:test');
const assert = require('node:assert/strict');

test('fits the whole page using the tighter viewport dimension', async () => {
  const { calculateFitZoom } = await import('../dist/zoom-controller.js');
  assert.ok(Math.abs(calculateFitZoom({ width: 800, height: 600 }, { width: 1600, height: 900 }, 20)-47.5)<0.001);
});

test('fits narrow canvases continuously and allows enlarging small selections', async () => {
  const { calculateFitZoom } = await import('../dist/zoom-controller.js');
  assert.ok(Math.abs(calculateFitZoom({ width: 200, height: 400 }, { width: 1440, height: 900 }, 16)-11.6667)<0.001);
  assert.equal(calculateFitZoom({ width: 1000, height: 1000 }, { width: 100, height: 100 }, 16), 968);
});

test('parses manual percentage and multiplier zoom inputs', async () => {
  const { parseZoomInput } = await import('../dist/zoom-controller.js');
  assert.equal(parseZoomInput('125%'),125);assert.equal(parseZoomInput('1.25x'),125);assert.equal(parseZoomInput('0.5x'),50);assert.equal(parseZoomInput('100'),100);assert.equal(parseZoomInput('abc'),null);assert.equal(parseZoomInput('-5'),null);
});

test('zoom buttons follow the 1.5x viewer ladder and clamp at 25600 percent', async () => {
  const { nextZoomPreset } = await import('../dist/zoom-controller.js');
  assert.equal(nextZoomPreset(100,1),150);assert.equal(nextZoomPreset(150,-1),100);assert.equal(nextZoomPreset(800,1),1200);assert.equal(nextZoomPreset(20000,1),25600);
});

test('wheel zoom is continuous, normalizes line/page deltas, and preserves its screen anchor', async () => {
  const { normalizeWheelDelta,zoomFromWheel,coordsAfterAnchoredZoom,formatZoomPercent } = await import('../dist/zoom-controller.js');
  assert.equal(normalizeWheelDelta({deltaY:2,deltaMode:1},800,16),32);
  assert.equal(normalizeWheelDelta({deltaY:0.5,deltaMode:2},800),400);
  assert.ok(zoomFromWheel(100,-10)>100);
  const anchor={x:350,y:260},viewport={left:100,top:80,width:800,height:600},coords={x:-180,y:70},z0=75,z1=200;
  const next=coordsAfterAnchoredZoom(coords,anchor,viewport,z0,z1),world={x:viewport.width/2+(anchor.x-viewport.left-viewport.width/2-coords.x)/(z0/100),y:viewport.height/2+(anchor.y-viewport.top-viewport.height/2-coords.y)/(z0/100)};
  const anchored={x:viewport.left+viewport.width/2+(world.x-viewport.width/2)*(z1/100)+next.x,y:viewport.top+viewport.height/2+(world.y-viewport.height/2)*(z1/100)+next.y};
  assert.ok(Math.abs(anchored.x-anchor.x)<1e-9);assert.ok(Math.abs(anchored.y-anchor.y)<1e-9);
  assert.equal(formatZoomPercent(149.7),'150%');
});

test('toolbar zoom keeps the current viewport center on the same canvas point', async () => {
  const { coordsAfterAnchoredZoom,visibleCanvasCenter,coordsAfterViewportResize } = await import('../dist/zoom-controller.js');
  const viewport={left:0,top:0,width:800,height:600},coords={x:-120,y:90},center={x:400,y:300},oldZoom=50,newZoom=150;
  const next=coordsAfterAnchoredZoom(coords,center,viewport,oldZoom,newZoom);
  assert.deepEqual(next,{x:-360,y:270});
  assert.deepEqual(visibleCanvasCenter({width:800,height:600},coords,50),{x:640,y:120});
  const resized=coordsAfterViewportResize(coords,{width:800,height:600},{width:1000,height:800},50);
  assert.deepEqual(resized,{x:-70,y:140});
});

test('center delta aligns frame and viewport centers', async () => {
  const { calculateCenterDelta, calculateCenteredCoords } = await import('../dist/zoom-controller.js');
  assert.deepEqual(calculateCenterDelta({left:0,top:0,width:1000,height:800},{left:200,top:100,width:400,height:300}),{x:100,y:150});
  assert.deepEqual(calculateCenteredCoords({x:-20,y:10},{left:0,top:0,width:1000,height:800},{left:200,top:100,width:400,height:300}),{x:80,y:160});
});
