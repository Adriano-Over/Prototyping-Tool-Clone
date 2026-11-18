const test = require('node:test');
const assert = require('node:assert/strict');

const guid = localID => ({ sessionID: 3, localID });
const id = localID => `3:${localID}`;

function componentModel(data = {}, parent = null) {
  const state = { type: 'default', tagName: 'div', attributes: {}, style: {}, classes: [], formaNodeId: `node-${Math.random()}`, ...structuredClone(data) };
  let children = [];
  const node = {
    get: key => state[key],
    set: (key, value) => { if (typeof key === 'object') Object.assign(state, key); else state[key] = value; },
    unset: key => delete state[key],
    getName: () => state.name || 'Layer',
    getId: () => state.attributes.id || state.formaNodeId,
    getAttributes: () => ({ ...state.attributes }),
    setAttributes: value => { state.attributes = { ...value }; },
    getStyle: () => ({ ...state.style }),
    setStyle: value => { state.style = { ...value }; },
    addStyle: value => Object.assign(state.style, value),
    setClass: value => { state.classes = value; },
    parent: () => parent,
    components: items => { if (items) children = items.map(item => componentModel(item, node)); return { models: children }; },
    append: item => { const child = componentModel(item, node); children.push(child); return [child]; },
    toJSON: () => ({ ...structuredClone(state), components: children.map(child => child.toJSON()) }),
  };
  node.components(data.components || []);
  return node;
}

test('resource index preserves decoder sibling order and resolves exact resource versions', async () => {
  const { buildFigResourceIndex, figResourceManifest } = await import('../fig-import-resource-index.mjs');
  const page = { guid: guid(1), type: 'CANVAS' };
  const later = { guid: guid(3), type: 'RECTANGLE', parentIndex: { guid: guid(1), position: 'b' } };
  const earlier = { guid: guid(2), type: 'RECTANGLE', parentIndex: { guid: guid(1), position: 'a' }, overrideKey: guid(8) };
  const setOld = { guid: guid(4), type: 'VARIABLE_SET', key: 'set-key', version: 'v1' };
  const setNew = { guid: guid(5), type: 'VARIABLE_SET', key: 'set-key', version: 'v2' };
  const variable = { guid: guid(6), type: 'VARIABLE', key: 'var-key', version: 'v3', variableSetID: { assetRef: { key: 'set-key', version: 'v1' } } };
  const sharedStyle = { guid: guid(8), type: 'ROUNDED_RECTANGLE', styleType: 'EFFECT', key: 'shadow', version: 'v4' };
  const styledNode = { guid: guid(9), type: 'FRAME', styleIdForEffect: { assetRef: { key: 'shadow', version: 'v4' } } };
  const paintNode = {
    guid: guid(7), type: 'RECTANGLE', fillPaints: [{ type: 'SOLID', colorVar: { dataType: 'ALIAS', value: { alias: { assetRef: { key: 'var-key', version: 'v3' } } } } }],
  };
  const nodes = [page, later, earlier, setOld, setNew, variable, paintNode, sharedStyle, styledNode];
  const index = buildFigResourceIndex({
    nodes,
    childrenMap: new Map([[id(1), [later, earlier]]]),
    images: new Map(), message: { blobs: [] },
  });
  assert.deepEqual(index.childrenByParent.get(id(1)).map(node => node.guid.localID), [2, 3]);
  assert.equal(index.variableSetsByAssetRef.get('set-key:v1'), setOld);
  assert.equal(index.variableSetsByAssetRef.get('set-key:v2'), setNew);
  assert.equal(index.variablesByAssetRef.get('var-key:v3'), variable);
  assert.deepEqual(index.nodesByOverrideKey.get(id(8)), [earlier]);
  assert.equal(index.stylesByAssetRef.get('shadow:v4'), sharedStyle);
  assert.equal(index.styleReferences.get('shadow:v4')[0].sourceNodeId, id(9));
  assert.deepEqual(index.diagnostics, []);
  assert.deepEqual(figResourceManifest(index).counts, {
    nodes: 9, overrideKeys: 1, symbols: 0, componentSets: 0, variableSets: 2, variables: 1,
    styles: 1, stylesReferenced: 1, images: 0, blobs: 0, diagnostics: 0,
  });
});

test('Figma variables retain stable identities, collection modes, typed values, and alias targets', async () => {
  const { buildFigResourceIndex } = await import('../fig-import-resource-index.mjs');
  const { figVariablesToFormaState, normalizeFigVariables } = await import('../fig-import-variables.mjs');
  const { createVariableService, cssVariableName, resolveVariable } = await import('../dist/variable-service.js');
  const set = { guid: guid(90), type: 'VARIABLE_SET', name: 'Theme', variableSetModes: [{ id: guid(91), name: 'Light' }, { id: guid(92), name: 'Dark' }] };
  const color = { guid: guid(93), type: 'VARIABLE', name: 'Surface', key: 'surface-key', version: '1', variableSetID: { assetRef: { key: 'set-key', version: '1' } }, variableResolvedType: 'COLOR', variableDataValues: { entries: [
    { modeID: guid(91), variableData: { dataType: 'COLOR', value: { colorValue: { r: 1, g: 0, b: 0, a: 0.5 } } } },
    { modeID: guid(92), variableData: { dataType: 'COLOR', value: { colorValue: { r: 0, g: 0, b: 1, a: 1 } } } },
  ] } };
  const alias = { guid: guid(94), type: 'VARIABLE', name: 'Surface Alias', key: 'alias-key', version: '2', variableSetID: { assetRef: { key: 'set-key', version: '1' } }, variableResolvedType: 'COLOR', variableDataValues: { entries: [
    { modeID: guid(91), variableData: { dataType: 'ALIAS', value: { alias: { assetRef: { key: 'surface-key', version: '1' } } } } },
  ] } };
  const duplicateName = { guid: guid(95), type: 'VARIABLE', name: 'Surface', key: 'surface-other', version: '1', variableSetID: { assetRef: { key: 'set-key', version: '1' } }, variableResolvedType: 'STRING', variableDataValues: { entries: [{ modeID: guid(91), variableData: { dataType: 'STRING', value: { textValue: 'text' } } }] } };
  const index = buildFigResourceIndex({ nodes: [set, color, alias, duplicateName], childrenMap: new Map(), images: new Map() });
  // Supply the exact set asset reference used by the variables.
  set.key = 'set-key'; set.version = '1';
  index.variableSetsByAssetRef.set('set-key:1', set);
  const result = normalizeFigVariables(index, 'source-doc');
  const values = Object.values(result.variables);
  assert.equal(Object.keys(result.collections).length, 1);
  assert.deepEqual(Object.values(result.collections)[0].modes.map(mode => mode.name), ['Light', 'Dark']);
  assert.equal(values.length, 3);
  assert.equal(new Set(values.map(item => item.id)).size, 3);
  assert.equal(values.filter(item => item.name === 'Surface').length, 2);
  const colorVar = values.find(item => item.source.nodeId === id(93));
  assert.deepEqual(colorVar.values, { Light: { kind: 'color', rgba: [1, 0, 0, 0.5] }, Dark: { kind: 'color', rgba: [0, 0, 1, 1] } });
  const aliasVar = values.find(item => item.source.nodeId === id(94));
  assert.equal(aliasVar.values.Light.kind, 'alias');
  assert.equal(aliasVar.values.Light.variableId, colorVar.id);
  assert.equal(aliasVar.values.Light.unresolved, false);
  assert.deepEqual(result.diagnostics, []);
  let nativeState = figVariablesToFormaState(result);
  const importedColorId = colorVar.id;
  const importedCollection = nativeState.collections[aliasVar.collectionId];
  assert.equal(Object.values(nativeState.definitions).filter(definition => definition.displayName === 'Surface').length, 2);
  assert.equal(resolveVariable(nativeState, aliasVar.id), 'rgba(255, 0, 0, 0.5)');
  const styles = {};
  const root = { get: () => undefined, parent: () => null, getStyle: () => ({ ...styles }), addStyle: value => Object.assign(styles, value), components: () => ({ models: [] }) };
  const editor = { Pages: { getAll: () => [{ getMainComponent: () => root }] } };
  const projectState = { getVariables: () => structuredClone(nativeState), setVariables: value => { nativeState = structuredClone(value); }, subscribe: () => () => {} };
  const service = createVariableService({ editor, projectState, scheduleSave: () => {} });
  service.apply();
  assert.equal(styles[cssVariableName(importedColorId)], 'rgba(255, 0, 0, 0.5)');
  service.mode(aliasVar.collectionId, importedCollection.modes.find(modeId => importedCollection.modeNames[modeId] === 'Dark'));
  assert.equal(resolveVariable(nativeState, importedColorId), 'rgba(0, 0, 255, 1)');
  assert.equal(styles[cssVariableName(importedColorId)], 'rgba(0, 0, 255, 1)');
});

test('imported Figma variables are attached to the canonical scene resources', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const { migrateProject } = await import('../dist/project-model.js');
  const page = { guid: guid(96), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const set = { guid: guid(97), type: 'VARIABLE_SET', name: 'Theme', key: 'theme-key', version: 'v1', phase: 'CREATED', variableSetModes: [{ id: guid(98), name: 'Light' }] };
  const variable = { guid: guid(99), type: 'VARIABLE', name: 'Surface', key: 'surface-key', version: 'v1', phase: 'CREATED', variableSetID: { assetRef: { key: 'theme-key', version: 'v1' } }, variableResolvedType: 'COLOR', variableDataValues: { entries: [{ modeID: guid(98), variableData: { dataType: 'COLOR', value: { colorValue: { r: 1, g: 1, b: 1, a: 1 } } } }] } };
  const project = importParsedFigDocument({ nodes: [page, set, variable], childrenMap: new Map(), images: new Map(), meta: {}, header: { version: 101 } });
  const collections = Object.values(project.forma.scene.resources.collections);
  const variables = Object.values(project.forma.scene.resources.variables);
  assert.equal(collections.length, 1);
  assert.equal(variables.length, 1);
  assert.equal(variables[0].collectionId, collections[0].id);
  assert.deepEqual(variables[0].values.Light, { kind: 'color', rgba: [1, 1, 1, 1] });
  assert.equal(variables[0].source.nodeId, id(99));
  const [nativeVariableId] = Object.keys(project.forma.variables.definitions);
  assert.equal(project.forma.variables.definitions[nativeVariableId].displayName, 'Surface');
  assert.equal(project.forma.variables.definitions[nativeVariableId].values[id(98)], 'rgba(255, 255, 255, 1)');
  assert.equal(project.forma.variables.collections[collections[0].id].mode, id(98));
  const reopened = migrateProject(project);
  assert.deepEqual(reopened.forma.scene.resources.variables, project.forma.scene.resources.variables);
  assert.deepEqual(reopened.forma.scene.resources.collections, project.forma.scene.resources.collections);
  assert.deepEqual(reopened.forma.variables, project.forma.variables);
});

test('variable-linked Figma paints render through Forma CSS variables and retain their paint path', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const { cssVariableName } = await import('../dist/variable-service.js');
  const page = { guid: guid(110), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const set = { guid: guid(111), type: 'VARIABLE_SET', name: 'Theme', key: 'theme', version: '1', phase: 'CREATED', variableSetModes: [{ id: guid(112), name: 'Light' }] };
  const variable = { guid: guid(113), type: 'VARIABLE', name: 'Surface', key: 'surface', version: '1', phase: 'CREATED', variableSetID: { assetRef: { key: 'theme', version: '1' } }, variableResolvedType: 'COLOR', variableDataValues: { entries: [{ modeID: guid(112), variableData: { dataType: 'COLOR', value: { colorValue: { r: 0.2, g: 0.4, b: 0.6, a: 1 } } } }] } };
  const rect = { guid: guid(114), type: 'ROUNDED_RECTANGLE', name: 'Surface layer', phase: 'CREATED', parentIndex: { guid: guid(110), position: 'a' }, size: { x: 40, y: 30 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, fillPaints: [{ type: 'SOLID', opacity: 1, color: { r: 0.2, g: 0.4, b: 0.6, a: 1 }, colorVar: { dataType: 'ALIAS', resolvedDataType: 'COLOR', value: { alias: { assetRef: { key: 'surface', version: '1' } } } } }] };
  const project = importParsedFigDocument({ nodes: [page, set, variable, rect], childrenMap: new Map([[id(110), [rect]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const layer = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  const semanticNode = project.forma.scene.nodes[layer.formaNodeId];
  const variableId = Object.keys(project.forma.variables.definitions)[0];
  assert.equal(layer.style['background-color'], `var(${cssVariableName(variableId)})`);
  assert.deepEqual(semanticNode.paintBindings, [{ role: 'fill', paintIndex: 0, sourceRef: { key: 'surface', version: '1' }, variableId }]);
  assert.deepEqual(project.forma.variables.definitions[variableId].values[id(112)], 'rgba(51, 102, 153, 1)');
  assert.ok(!project.forma.scene.diagnostics.some(item => item.code === 'VARIABLE_VECTOR_PAINT_UNSUPPORTED'));
});

test('fractional sibling keys use stable code-unit order instead of locale collation', async () => {
  const { buildFigResourceIndex } = await import('../fig-import-resource-index.mjs');
  const parent = { guid: guid(40), type: 'FRAME' };
  const children = [
    { guid: guid(41), parentIndex: { guid: guid(40), position: '"QT' } },
    { guid: guid(42), parentIndex: { guid: guid(40), position: '"QQO' } },
    { guid: guid(43), parentIndex: { guid: guid(40), position: '"QO' } },
  ];
  const index = buildFigResourceIndex({ nodes: [parent, ...children], childrenMap: new Map([[id(40), children]]), images: new Map(), message: { blobs: [] } });
  assert.deepEqual(index.childrenByParent.get(id(40)).map(node => id(node.guid.localID)), [id(43), id(42), id(41)]);
  assert.deepEqual(index.diagnostics, []);
});

test('resource index reports unresolved active resources and rejects parent cycles', async () => {
  const { buildFigResourceIndex } = await import('../fig-import-resource-index.mjs');
  const vector = {
    guid: guid(11), type: 'VECTOR', vectorData: { vectorNetworkBlob: 4 },
    styleIdForEffect: { assetRef: { key: 'missing-style', version: 'v1' } },
    fillPaints: [{ type: 'IMAGE', image: { hash: Uint8Array.from([1, 2]) } }],
    strokePaints: [{ type: 'SOLID', colorVar: { dataType: 'ALIAS', value: { alias: { assetRef: { key: 'missing', version: '1' } } } } }],
  };
  const variable = { guid: guid(12), type: 'VARIABLE', variableSetID: { assetRef: { key: 'missing-set', version: '1' } } };
  const a = { guid: guid(13), type: 'FRAME', parentIndex: { guid: guid(14) } };
  const b = { guid: guid(14), type: 'FRAME', parentIndex: { guid: guid(13) } };
  const index = buildFigResourceIndex({ nodes: [vector, variable, a, b], images: new Map(), message: { blobs: [] } });
  const codes = index.diagnostics.map(item => item.code);
  for (const code of ['VECTOR_BLOB_UNRESOLVED', 'IMAGE_REFERENCE_UNRESOLVED', 'VARIABLE_ALIAS_UNRESOLVED', 'VARIABLE_SET_REFERENCE_UNRESOLVED', 'STYLE_REFERENCE_UNRESOLVED', 'PARENT_CYCLE']) assert.ok(codes.includes(code), `${code} should be reported`);
  assert.equal(index.diagnostics.filter(item => item.code === 'PARENT_CYCLE').length, 2);
});

test('import refuses duplicate source IDs before producing a partial page tree', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const duplicateA = { guid: guid(21), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const duplicateB = { guid: guid(21), type: 'RECTANGLE', name: 'Collision', phase: 'CREATED' };
  assert.throws(
    () => importParsedFigDocument({ nodes: [duplicateA, duplicateB], childrenMap: new Map(), images: new Map(), meta: {}, header: { version: 101 } }),
    /resource indexing failed: SOURCE_NODE_ID_DUPLICATE/i,
  );
});

test('page visibility uses internalOnly metadata and keeps internal masters available to visible instances', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const visiblePage = { guid: guid(31), type: 'CANVAS', name: 'Internal Only Canvas', phase: 'CREATED' };
  const hiddenPage = { guid: guid(32), type: 'CANVAS', name: 'Component Library', internalOnly: true, visible: false, phase: 'CREATED' };
  const instance = { guid: guid(33), type: 'INSTANCE', name: 'Button instance', phase: 'CREATED', symbolData: { symbolID: guid(34) }, size: { x: 40, y: 20 }, transform: { m00: 1, m02: 8, m10: 0, m12: 9 } };
  const master = { guid: guid(34), type: 'SYMBOL', name: 'Button master', phase: 'CREATED', parentIndex: { guid: guid(32) }, size: { x: 40, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const label = { guid: guid(35), type: 'TEXT', name: 'Label', phase: 'CREATED', parentIndex: { guid: guid(34) }, size: { x: 20, y: 10 }, transform: { m00: 1, m02: 4, m10: 0, m12: 4 }, textData: { characters: 'Library source' } };
  const nodes = [visiblePage, hiddenPage, instance, master, label];
  const project = importParsedFigDocument({
    nodes,
    childrenMap: new Map([[id(31), [instance]], [id(32), [master]], [id(34), [label]]]),
    images: new Map(), meta: {}, header: { version: 101 },
  });
  assert.deepEqual(project.forma.scene.pages.map(pageId => project.forma.scene.nodes[pageId].source.nodeId), [id(31)]);
  const manifest = project.forma.scene.sourceDocuments[project.forma.importSources[0].id].resourceManifest;
  assert.deepEqual(manifest.pages, { visible: [id(31)], internal: [id(32)] });
  assert.ok(manifest.sourceIds.symbols.includes(id(34)), 'internal symbols remain in the source-resource index');
  const importedInstance = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  const expandedMaster = importedInstance.components[0];
  assert.equal(expandedMaster.attributes['data-figma-node-id'], id(34));
  assert.equal(expandedMaster.components[0].content, 'Library source');
});

test('import persists component sets, property IDs, variant assignments, and stable resource identities', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(50), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const library = { guid: guid(51), type: 'CANVAS', name: 'Library', internalOnly: true, phase: 'CREATED' };
  const set = {
    guid: guid(52), type: 'FRAME', name: 'Button', isStateGroup: true, version: 'v8',
    parentIndex: { guid: guid(51), position: 'a' },
    componentPropDefs: [{ id: guid(59), name: 'State', type: 'VARIANT', preferredValues: { Default: true, Active: true } }],
    stateGroupPropertyValueOrders: { State: ['Default', 'Active'] },
  };
  const defaultVariant = { guid: guid(53), type: 'SYMBOL', name: 'State=Default', key: 'button-default', version: 'v1', parentIndex: { guid: guid(52), position: 'a' }, variantPropSpecs: [{ propDefId: guid(59), value: 'Default' }] };
  const activeVariant = { guid: guid(54), type: 'SYMBOL', name: 'State=Active', key: 'button-active', version: 'v2', parentIndex: { guid: guid(52), position: 'b' }, variantPropSpecs: [{ propDefId: guid(59), value: 'Active' }] };
  const label = { guid: guid(55), type: 'TEXT', name: 'Caption', phase: 'CREATED', parentIndex: { guid: guid(53), position: 'a' }, size: { x: 30, y: 10 }, transform: { m00: 1, m02: 2, m10: 0, m12: 2 }, textData: { characters: 'Component body' } };
  const activeLabel = { guid: guid(56), type: 'TEXT', name: 'Caption', phase: 'CREATED', parentIndex: { guid: guid(54), position: 'a' }, size: { x: 30, y: 10 }, transform: { m00: 1, m02: 2, m10: 0, m12: 2 }, textData: { characters: 'Active body' } };
  const nodes = [page, library, set, defaultVariant, activeVariant, label, activeLabel];
  const project = importParsedFigDocument({
    nodes,
    childrenMap: new Map([[id(51), [set]], [id(52), [defaultVariant, activeVariant]], [id(53), [label]], [id(54), [activeLabel]]]),
    images: new Map(), meta: {}, header: { version: 101 },
  });
  const resources = Object.values(project.forma.scene.resources.components);
  const componentSet = resources.find(resource => resource.kind === 'component-set');
  const components = resources.filter(resource => resource.kind === 'component');
  assert.ok(componentSet);
  assert.equal(componentSet.source.nodeId, id(52));
  assert.equal(componentSet.properties[0].id.localID, 59);
  assert.deepEqual(componentSet.variantPropertyValueOrders, { State: ['Default', 'Active'] });
  assert.equal(componentSet.variants.length, 2);
  assert.deepEqual(components.map(resource => resource.variantAssignments[0].value), ['Default', 'Active']);
  assert.ok(components.every(resource => resource.componentSetId === componentSet.id));
  assert.equal(project.forma.components.length, 1, 'a Figma component set is registered as one native component');
  const nativeDefault = project.forma.components[0];
  assert.equal(nativeDefault.source.nodeId, id(52));
  assert.equal(nativeDefault.defaultVariant, 'State=Default');
  assert.deepEqual(Object.keys(nativeDefault.variants), ['State=Default', 'State=Active']);
  assert.equal(nativeDefault.data.components[0].content, 'Component body');
  assert.ok(nativeDefault.data.formaPartKey);
  assert.equal(project.forma.scene.nodes[nativeDefault.mainNodeId].source.nodeId, id(53));
  const pageRoot = componentModel({ name: 'Page' });
  let selected = null, saves = 0;
  const registryState = {
    getComponents: () => structuredClone(project.forma.components),
    setComponents: value => { project.forma.components = structuredClone(value); },
    subscribe: () => () => {},
  };
  const { createComponentService } = await import('../dist/component-service.js');
  const componentService = createComponentService({
    editor: { Pages: { getAll: () => [{ getMainComponent: () => pageRoot }] }, getWrapper: () => pageRoot, on: () => {}, select: node => { selected = node; } },
    projectState: registryState,
    get selected() { return selected; },
    scheduleSave: () => { saves++; }, renderLayers: () => {},
    history: { restoring: false },
  });
  const inserted = componentService.insert(nativeDefault.id);
  assert.equal(inserted.get('formaInstance').definitionId, nativeDefault.id);
  assert.equal(inserted.components().models[0].get('content'), 'Component body');
  assert.equal(saves, 1, 'inserting an imported definition uses Forma’s ordinary component lifecycle');
  componentService.updateInstance(inserted, { variant: 'State=Active' });
  assert.equal(inserted.get('formaInstance').variant, 'State=Active');
  assert.equal(inserted.components().models[0].get('content'), 'Active body');
  assert.equal(saves, 2, 'switching to another imported variant uses Forma’s ordinary instance update');
  const again = importParsedFigDocument({ nodes, childrenMap: new Map([[id(51), [set]], [id(52), [defaultVariant, activeVariant]], [id(53), [label]], [id(54), [activeLabel]]]), images: new Map(), meta: {}, header: { version: 101 } });
  assert.deepEqual(Object.keys(again.forma.scene.resources.components).sort(), Object.keys(project.forma.scene.resources.components).sort());
  assert.deepEqual(again.forma.components.map(definition => definition.data.formaPartKey), project.forma.components.map(definition => definition.data.formaPartKey));
});

test('imported canvas instances stay linked and retain source overrides through refresh and reset', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(60), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const instanceNode = { guid: guid(61), type: 'INSTANCE', name: 'Button instance', phase: 'CREATED', size: { x: 40, y: 20 }, transform: { m00: 1, m02: 80, m10: 0, m12: 50 }, symbolData: { symbolID: guid(62), symbolOverrides: [
    { guidPath: { guids: [guid(62)] }, stackHorizontalPadding: 12, stackPaddingRight: 16, stackPrimaryAlignItems: 'CENTER' },
    { guidPath: { guids: [guid(62), guid(63)] }, textData: { characters: 'Figma override' }, fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }] },
  ] } };
  const master = { guid: guid(62), type: 'SYMBOL', name: 'Button master', phase: 'CREATED', size: { x: 40, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, stackMode: 'HORIZONTAL', stackSpacing: 4, stackHorizontalPadding: 4, stackVerticalPadding: 2, stackPrimaryAlignItems: 'MIN', stackCounterAlignItems: 'CENTER' };
  const label = { guid: guid(63), type: 'TEXT', name: 'Label', phase: 'CREATED', size: { x: 30, y: 10 }, transform: { m00: 1, m02: 4, m10: 0, m12: 4 }, textData: { characters: 'Base label' }, fontSize: 12, fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }] };
  const project = importParsedFigDocument({ nodes: [page, instanceNode, master, label], childrenMap: new Map([[id(60), [instanceNode]], [id(62), [label]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const imported = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  assert.ok(imported.formaInstance, 'the visible instance is a native Forma linked instance');
  assert.equal(imported.components[0].components[0].content, 'Figma override');
  assert.equal(imported.components[0].style['padding-left'], '12px');
  assert.equal(imported.components[0].style['padding-right'], '16px');
  assert.equal(imported.components[0].style['justify-content'], 'center');
  assert.equal(imported.formaInstance.overrides[imported.formaInstance.baseline.components[0].formaPartKey].content, 'Figma override');
  assert.equal(imported.formaInstance.overrides[imported.formaInstance.baseline.formaPartKey].style['padding-left'], '12px');
  const { migrateProject } = await import('../dist/project-model.js');
  const reopened = migrateProject({ ...project, id: 'instance-roundtrip', createdAt: '2026-11-16T00:00:00.000Z' });
  assert.deepEqual(reopened.editor.grapesjs.pages[0].frames[0].component.components[0].formaInstance, imported.formaInstance);
  assert.deepEqual(reopened.forma.components, project.forma.components);

  const pageRoot = componentModel({ name: 'Page' });
  const instanceModel = pageRoot.append(imported)[0];
  let selected = null, saves = 0;
  const { createComponentService } = await import('../dist/component-service.js');
  const service = createComponentService({
    editor: { Pages: { getAll: () => [{ getMainComponent: () => pageRoot }] }, getWrapper: () => pageRoot, on: () => {}, select: node => { selected = node; } },
    projectState: { getComponents: () => structuredClone(project.forma.components), setComponents: () => {}, subscribe: () => () => {} },
    get selected() { return selected; }, scheduleSave: () => { saves++; }, renderLayers: () => {}, history: { restoring: false },
  });
  const renderRoot = () => instanceModel.components().models.find(node => node.get('formaPartKey') === instanceModel.get('formaInstance').renderedPartKey);
  const originalWrapperId = instanceModel.getId();
  service.updateInstance(instanceModel);
  assert.equal(instanceModel.getId(), originalWrapperId);
  assert.equal(renderRoot().getStyle()['padding-left'], '12px');
  assert.equal(renderRoot().getStyle()['padding-right'], '16px');
  assert.equal(renderRoot().getStyle()['justify-content'], 'center');
  assert.equal(renderRoot().components().models[0].get('content'), 'Figma override');
  service.updateInstance(instanceModel, { reset: true });
  assert.equal(renderRoot().getStyle()['padding-left'], '4px');
  assert.equal(renderRoot().getStyle()['padding-right'], '4px');
  assert.equal(renderRoot().getStyle()['justify-content'], 'flex-start');
  assert.equal(renderRoot().components().models[0].get('content'), 'Base label');
  assert.notEqual(renderRoot().components().models[0].getStyle().color, 'rgba(255, 0, 0, 1)');
  assert.equal(saves, 2);
});

test('nested Figma override paths replace only the addressed component instance', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(70), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const host = { guid: guid(71), type: 'INSTANCE', name: 'Host instance', phase: 'CREATED', size: { x: 100, y: 40 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, symbolData: { symbolID: guid(72), symbolOverrides: [{ guidPath: { guids: [{ sessionID: 8, localID: 11127 }, { sessionID: 8, localID: 11111 }] }, overriddenSymbolID: guid(74) }] } };
  const outerMaster = { guid: guid(72), type: 'SYMBOL', name: 'Outer master', phase: 'CREATED', size: { x: 100, y: 40 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const nestedInstance = { guid: guid(73), type: 'INSTANCE', name: 'Nested icon', overrideKey: { sessionID: 8, localID: 11127 }, phase: 'CREATED', parentIndex: { guid: guid(72), position: 'a' }, size: { x: 16, y: 16 }, transform: { m00: 1, m02: 10, m10: 0, m12: 10 }, symbolData: { symbolID: guid(76) } };
  const original = { guid: guid(76), type: 'SYMBOL', name: 'Original icon', phase: 'CREATED', size: { x: 16, y: 16 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const innerInstance = { guid: guid(77), type: 'INSTANCE', name: 'Inner glyph', overrideKey: { sessionID: 8, localID: 11111 }, phase: 'CREATED', parentIndex: { guid: guid(76), position: 'a' }, size: { x: 12, y: 12 }, transform: { m00: 1, m02: 2, m10: 0, m12: 2 }, symbolData: { symbolID: guid(78) } };
  const innerMaster = { guid: guid(78), type: 'SYMBOL', name: 'Original glyph', phase: 'CREATED', size: { x: 12, y: 12 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const replacement = { guid: guid(74), type: 'SYMBOL', name: 'Replacement icon', phase: 'CREATED', size: { x: 16, y: 16 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const replacementPath = { guid: guid(75), type: 'VECTOR', name: 'Replacement path', overrideKey: { sessionID: 8, localID: 11111 }, phase: 'CREATED', parentIndex: { guid: guid(74), position: 'a' }, size: { x: 16, y: 16 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const doc = {
    nodes: [page, host, outerMaster, nestedInstance, original, innerInstance, innerMaster, replacement, replacementPath],
    childrenMap: new Map([[id(70), [host]], [id(72), [nestedInstance]], [id(76), [innerInstance]], [id(74), [replacementPath]]]),
    images: new Map(), meta: {}, header: { version: 101 },
  };
  const project = importParsedFigDocument(doc);
  const importedHost = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  const outer = importedHost.components[0];
  const nested = outer.components[0];
  assert.equal(nested.attributes['data-figma-node-id'], id(73));
  const originalGlyphInstance = nested.components[0].components[0];
  assert.equal(originalGlyphInstance.attributes['data-figma-node-id'], id(77));
  assert.equal(originalGlyphInstance.components[0].attributes['data-figma-node-id'], id(74));
  assert.equal(originalGlyphInstance.components[0].components[0].attributes['data-figma-node-id'], id(75));
  assert.equal(project.forma.scene.nodes[importedHost.formaNodeId].instance.overrides[0].replacementComponentId, id(74));
});

test('instance variable-mode overrides target the nested occurrence and diagnose missing mode IDs', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(120), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const set = { guid: guid(121), type: 'VARIABLE_SET', name: 'Theme', key: 'theme-key', version: 'v1', phase: 'CREATED', variableSetModes: [{ id: guid(122), name: 'Default' }, { id: guid(123), name: 'Dark' }] };
  const variable = { guid: guid(124), type: 'VARIABLE', name: 'Surface', key: 'surface', version: 'v1', phase: 'CREATED', variableSetID: { assetRef: { key: 'theme-key', version: 'v1' } }, variableResolvedType: 'COLOR', variableDataValues: { entries: [{ modeID: guid(122), variableData: { dataType: 'COLOR', value: { colorValue: { r: 1, g: 1, b: 1, a: 1 } } } }, { modeID: guid(123), variableData: { dataType: 'COLOR', value: { colorValue: { r: 0, g: 0, b: 0, a: 1 } } } }] } };
  const host = {
    guid: guid(125), type: 'INSTANCE', name: 'Host', phase: 'CREATED', size: { x: 40, y: 40 },
    transform: { m00: 1, m02: 0, m10: 0, m12: 0 },
    symbolData: { symbolID: guid(126), symbolOverrides: [
      { guidPath: { guids: [{ sessionID: 8, localID: 551 }] }, variableModeBySetMap: { entries: [
        { variableSetID: { assetRef: { key: 'theme-key', version: 'v1' } }, variableModeID: guid(123) },
        { variableSetID: { assetRef: { key: 'theme-key', version: 'v1' } } },
      ] } },
    ] },
  };
  const outer = { guid: guid(126), type: 'SYMBOL', name: 'Outer', phase: 'CREATED', size: { x: 40, y: 40 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const nested = { guid: guid(127), overrideKey: { sessionID: 8, localID: 551 }, type: 'INSTANCE', name: 'Nested', phase: 'CREATED', parentIndex: { guid: guid(126), position: 'a' }, size: { x: 20, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, symbolData: { symbolID: guid(128) } };
  const nestedMaster = { guid: guid(128), type: 'SYMBOL', name: 'Nested main', phase: 'CREATED', size: { x: 20, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const paintedChild = {
    guid: guid(129), type: 'ROUNDED_RECTANGLE', name: 'Theme surface', phase: 'CREATED',
    parentIndex: { guid: guid(128), position: 'a' }, size: { x: 8, y: 8 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 },
    fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, colorVar: {
      dataType: 'ALIAS', value: { alias: { assetRef: { key: 'surface', version: 'v1' } } },
    } }],
  };
  const project = importParsedFigDocument({ nodes: [page, set, variable, host, outer, nested, nestedMaster, paintedChild], childrenMap: new Map([[id(120), [host]], [id(126), [nested]], [id(128), [paintedChild]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const importedHost = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  const nestedLayer = importedHost.components[0].components[0];
  const collection = Object.values(project.forma.scene.resources.collections)[0];
  assert.deepEqual(nestedLayer.formaVariableModes, { [collection.id]: id(123) });
  assert.deepEqual(project.forma.scene.nodes[nestedLayer.formaNodeId].variableModes, { [collection.id]: id(123) });
  assert.ok(project.importSummary.diagnostics.some(item => item.code === 'VARIABLE_MODE_OVERRIDE_INCOMPLETE'));
  assert.equal(project.importSummary.diagnostics.filter(item => item.code === 'OVERRIDE_PROPERTY_UNSUPPORTED' && item.propertyPath.endsWith('variableModeBySetMap')).length, 0);
  const { createVariableService, cssVariableName } = await import('../dist/variable-service.js');
  const root = componentModel(project.editor.grapesjs.pages[0].frames[0].component);
  let variableState = structuredClone(project.forma.variables);
  const variableService = createVariableService({
    editor: { Pages: { getAll: () => [{ getMainComponent: () => root }] } },
    projectState: { getVariables: () => structuredClone(variableState), setVariables: value => { variableState = structuredClone(value); }, subscribe: () => () => {} },
    scheduleSave: () => {},
  });
  variableService.apply();
  const walk = node => node.getAttributes()['data-figma-node-id'] === id(129) ? node : node.components().models.map(walk).find(Boolean);
  const importedPaint = walk(root);
  const variableId = Object.keys(project.forma.variables.definitions)[0];
  assert.equal(importedPaint.parent().parent().getStyle()[cssVariableName(variableId)], 'rgba(0, 0, 0, 1)');
});
