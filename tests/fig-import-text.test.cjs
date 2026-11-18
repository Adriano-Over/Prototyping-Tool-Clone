const test = require('node:test');
const assert = require('node:assert/strict');

test('Figma text stays editable and retains the cover typography through import', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const guid = localID => ({ sessionID: 1, localID });
  const page = { guid: guid(1), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const layer = (localID, extra) => ({
    guid: guid(localID), type: 'TEXT', name: `Text ${localID}`, phase: 'CREATED',
    parentIndex: { guid: guid(1), position: String(localID) },
    size: { x: 169, y: 47 }, transform: { m00: 1, m11: 1, m12: localID * 50 }, ...extra,
  });
  const title = layer(2, {
    fontName: { family: 'Oswald', style: 'ExtraLight' }, fontSize: 100,
    textData: { characters: 'Editable & visible' }, textAutoResize: 'HEIGHT', textCase: 'UPPER',
    lineHeight: { units: 'PIXELS', value: 138 }, textAlignHorizontal: 'CENTER',
  });
  const label = layer(3, {
    fontName: { family: 'Oswald', style: 'SemiBold' }, fontSize: 28,
    textData: { characters: 'First line\nSecond line' }, textAutoResize: 'WIDTH_AND_HEIGHT', textDecoration: 'UNDERLINE',
    lineHeight: { units: 'PERCENT', value: 100 }, derivedTextData: { baselines: [{ lineHeight: 42 }] },
    letterSpacing: { units: 'PERCENT', value: -2 },
  });
  const result = importParsedFigDocument({ header: { version: 101 }, nodes: [page, title, label], images: new Map(), childrenMap: new Map([['1:1',[title,label]]]) });
  const [titleLayer, labelLayer] = result.editor.grapesjs.pages[0].frames[0].component.components;
  assert.equal(titleLayer.type,'text');
  assert.equal(titleLayer.content,'Editable &amp; visible');
  assert.equal(titleLayer.style['font-family'],'"Oswald", sans-serif');
  assert.equal(titleLayer.style['font-weight'],'200');
  assert.equal(titleLayer.style['text-transform'],'uppercase');
  assert.equal(titleLayer.style['text-align'],'center');
  assert.equal(titleLayer.style['line-height'],'138px');
  assert.equal(titleLayer.style['height'],'auto');
  assert.equal(titleLayer.style['width'],'169px');
  assert.equal(labelLayer.content,'First line\nSecond line');
  assert.equal(labelLayer.style['font-weight'],'600');
  assert.equal(labelLayer.style['font-family'],'"Oswald", sans-serif');
  assert.equal(labelLayer.style['line-height'],'1.5');
  assert.equal(labelLayer.style['letter-spacing'],'-0.02em');
  assert.equal(labelLayer.style['text-decoration'],'underline');
  assert.equal(labelLayer.style['white-space'],'pre');
  assert.equal(labelLayer.style['width'],'max-content');
});
