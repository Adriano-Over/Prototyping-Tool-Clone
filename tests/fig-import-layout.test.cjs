const test = require('node:test');
const assert = require('node:assert/strict');

const guid = localID => ({ sessionID: 5, localID });
const id = localID => `5:${localID}`;
const transform = (x = 0, y = 0) => ({ m00: 1, m02: x, m10: 0, m12: y });

test('Figma stack layouts become editable Forma flex layout with source metadata', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(1), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const frame = { guid: guid(2), type: 'FRAME', name: 'Row', phase: 'CREATED', parentIndex: { guid: guid(1), position: 'a' }, size: { x: 100, y: 40 }, transform: transform(50, 60), stackMode: 'HORIZONTAL', stackSpacing: 4, stackHorizontalPadding: 10, stackVerticalPadding: 6, stackPrimaryAlignItems: 'SPACE_BETWEEN', stackCounterAlignItems: 'CENTER', stackPrimarySizing: 'FIXED', stackCounterSizing: 'RESIZE_TO_FIT_WITH_IMPLICIT_SIZE' };
  const first = { guid: guid(3), type: 'RECTANGLE', name: 'First', phase: 'CREATED', parentIndex: { guid: guid(2), position: 'a' }, size: { x: 20, y: 12 }, transform: transform(10, 14) };
  const second = { guid: guid(4), type: 'RECTANGLE', name: 'Second', phase: 'CREATED', parentIndex: { guid: guid(2), position: 'b' }, size: { x: 20, y: 12 }, transform: transform(34, 14), stackChildAlignSelf: 'STRETCH' };
  const project = importParsedFigDocument({ nodes: [page, frame, first, second], childrenMap: new Map([[id(1), [frame]], [id(2), [first, second]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const importedFrame = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  assert.equal(importedFrame.style.display, 'flex');
  assert.equal(importedFrame.style['flex-direction'], 'row');
  assert.equal(importedFrame.style.gap, '4px');
  assert.equal(importedFrame.style['padding-top'], '6px');
  assert.equal(importedFrame.style['padding-right'], '10px');
  assert.equal(importedFrame.style['padding-bottom'], '6px');
  assert.equal(importedFrame.style['padding-left'], '10px');
  assert.equal(importedFrame.style['justify-content'], 'space-between');
  assert.equal(importedFrame.style['align-items'], 'center');
  assert.equal(importedFrame.style.width, '100px');
  assert.equal(importedFrame.style.height, 'max-content');
  assert.equal(importedFrame.components[0].style.position, 'relative');
  assert.equal(importedFrame.components[0].style.left, 'auto');
  assert.equal(importedFrame.components[0].style.top, 'auto');
  assert.equal(importedFrame.components[1].style['align-self'], 'stretch');
  assert.equal(importedFrame.components[1].style.height, 'auto');
  const sceneFrame = project.forma.scene.nodes[importedFrame.formaNodeId];
  assert.equal(sceneFrame.layout.kind, 'auto-layout');
  assert.equal(project.forma.layoutMetadata[importedFrame.formaNodeId].autoLayout.source, 'figma');
  assert.deepEqual(project.forma.layoutMetadata[importedFrame.formaNodeId].autoLayout.before.children.map(child => child.id), importedFrame.components.map(child => child.formaNodeId));
  const { migrateProject } = await import('../dist/project-model.js');
  assert.deepEqual(migrateProject(project).forma.layoutMetadata, project.forma.layoutMetadata);
  const { removeAutoLayoutCommand } = await import('../dist/layout-service.js');
  const makeModel = (data, parent = null) => {
    const state = structuredClone(data);
    let children = (data.components || []).map(child => makeModel(child));
    return {
      get: key => state[key],
      getStyle: () => ({ ...(state.style || {}) }),
      setStyle: value => { state.style = { ...value }; },
      addStyle: value => Object.assign(state.style, value),
      parent: () => parent,
      components: () => ({ models: children }),
    };
  };
  const frameModel = makeModel(importedFrame);
  const metadata = structuredClone(project.forma.layoutMetadata);
  const projectState = { getLayoutMetadata: () => structuredClone(metadata), setLayoutMetadata: value => { Object.keys(metadata).forEach(key => delete metadata[key]); Object.assign(metadata, value); } };
  removeAutoLayoutCommand(frameModel, projectState).apply();
  assert.equal(frameModel.getStyle().display, undefined);
  assert.equal(frameModel.components().models[0].getStyle().position, 'absolute');
});

test('Figma vertical wrap uses separate main and counter spacing', async () => {
  const { normalizeFigStackLayout, figStackStyle, figStackChildStyle } = await import('../fig-import-layout.mjs');
  const layout = normalizeFigStackLayout({ stackMode: 'VERTICAL', stackSpacing: 5, stackCounterSpacing: 12, stackWrap: 'WRAP', stackPrimaryAlignItems: 'CENTER', stackCounterAlignItems: 'MAX', size: { x: 90, y: 100 } });
  const style = figStackStyle(layout);
  assert.equal(layout.direction, 'column');
  assert.equal(style['flex-direction'], 'column');
  assert.equal(style['row-gap'], '5px');
  assert.equal(style['column-gap'], '12px');
  assert.equal(style['flex-wrap'], 'wrap');
  assert.equal(style['justify-content'], 'center');
  assert.equal(style['align-items'], 'flex-end');
  assert.deepEqual(figStackChildStyle({ stackPrimarySizing: 'FILL' }, layout), { position: 'relative', left: 'auto', top: 'auto', right: 'auto', bottom: 'auto', height: 'auto', 'flex-grow': '1', 'flex-basis': '0px', 'min-height': '0px' });
  const credit = figStackChildStyle({ stackChildAlignSelf: 'STRETCH', stackCounterSizing: 'RESIZE_TO_FIT_WITH_IMPLICIT_SIZE' }, layout);
  assert.equal(credit.width,'auto');
  assert.equal(credit['align-self'],'stretch');
  assert.equal(credit['flex-grow'],undefined);
});

test('nested component stack overrides change the expanded variant layout', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(10), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const host = { guid: guid(11), type: 'INSTANCE', name: 'Toolbar toggle', phase: 'CREATED', size: { x: 80, y: 24 }, transform: transform(), stackMode: 'HORIZONTAL', stackCounterSizing:'RESIZE_TO_FIT_WITH_IMPLICIT_SIZE', symbolData: { symbolID: guid(12), symbolOverrides: [{ guidPath: { guids: [guid(12)] }, stackHorizontalPadding: 12, stackPaddingRight: 16, stackPrimaryAlignItems: 'CENTER' }] } };
  const main = { guid: guid(12), type: 'SYMBOL', name: 'Toggle main', phase: 'CREATED', size: { x: 80, y: 24 }, transform: transform(), stackMode: 'HORIZONTAL', stackSpacing: 8, stackHorizontalPadding: 4, stackCounterAlignItems: 'CENTER' };
  const child = { guid: guid(13), type: 'RECTANGLE', name: 'Toggle label', phase: 'CREATED', parentIndex: { guid: guid(12), position: 'a' }, size: { x: 24, y: 16 }, transform: transform(4, 4) };
  const project = importParsedFigDocument({ nodes: [page, host, main, child], childrenMap: new Map([[id(10), [host]], [id(12), [child]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const importedHost = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  const expandedMain = importedHost.components[0];
  assert.equal(importedHost.style.height, '24px');
  assert.equal(expandedMain.style.display, 'flex');
  assert.equal(expandedMain.style['padding-left'], '12px');
  assert.equal(expandedMain.style['padding-right'], '16px');
  assert.equal(expandedMain.style['justify-content'], 'center');
  assert.equal(expandedMain.components[0].style.position, 'relative');
  assert.equal(project.importSummary.diagnostics.filter(item => item.code === 'OVERRIDE_PROPERTY_UNSUPPORTED').length, 0);
});

test('a saved narrower nested stack stays centered despite an inherited stretch flag', async () => {
  const { figStackChildStyle, normalizeFigStackLayout } = await import('../fig-import-layout.mjs');
  const parent = normalizeFigStackLayout({ stackMode: 'VERTICAL', stackCounterAlignItems: 'CENTER', size: { x: 418, y: 116 } });
  const child = { stackMode: 'HORIZONTAL', stackChildAlignSelf: 'STRETCH', size: { x: 234, y: 48 } };
  assert.equal(figStackChildStyle(child, parent).width, undefined);
  assert.equal(figStackChildStyle(child, parent)['align-self'], undefined);
  assert.equal(figStackChildStyle({ ...child, size: { x: 418, y: 48 } }, parent).width, 'auto');
});
