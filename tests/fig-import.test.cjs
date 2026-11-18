const test = require('node:test');
const assert = require('node:assert/strict');

const guid = localID => ({ sessionID: 7, localID });
const id = localID => `7:${localID}`;

test('Figma instances import master layers with scoped IDs, overrides, and instance scaling', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(1), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const instance = {
    guid: guid(2), type: 'INSTANCE', name: 'Home icon', phase: 'CREATED',
    size: { x: 48, y: 48 }, transform: { m00: 1, m02: 20, m10: 0, m12: 30 },
    symbolData: {
      symbolID: guid(3),
      symbolOverrides: [{
        guidPath: { guids: [guid(3), guid(4)] },
        textData: { characters: 'Overridden label' },
        fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
      }],
    },
  };
  const master = {
    guid: guid(3), type: 'SYMBOL', name: 'Home master', phase: 'CREATED',
    size: { x: 24, y: 24 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 },
  };
  const label = {
    guid: guid(4), type: 'TEXT', name: 'Label', phase: 'CREATED',
    size: { x: 20, y: 8 }, transform: { m00: 1, m02: 2, m10: 0, m12: 3 },
    textData: { characters: 'Original label' }, fontSize: 12,
    fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
  };
  const nodes = [page, instance, master, label];
  const doc = {
    nodes,
    nodeMap: new Map(nodes.map(node => [id(node.guid.localID), node])),
    childrenMap: new Map([[id(1), [instance]], [id(3), [label]]]),
    images: new Map(),
    meta: { file_name: 'Instance fixture' },
    header: { version: 101 },
  };

  const project = importParsedFigDocument(doc);
  assert.equal(project.schemaVersion,3);
  assert.equal(project.forma.scene.version,1);
  assert.equal(project.forma.scene.pages.length,1);
  assert.equal(project.forma.scene.sourceDocuments[project.forma.importSources[0].id].sourceRecordsAssetId,project.forma.importSources[0].sourceRecordsAssetId);
  const frame = project.editor.grapesjs.pages[0].frames[0].component;
  const allNodes=[];const walk=node=>{allNodes.push(node);(node.components||[]).forEach(walk);};walk(frame);
  assert.ok(allNodes.every(node=>/^node_[A-Za-z0-9-]{8,}$/.test(node.formaNodeId||'')),'every imported occurrence receives a persistent Forma ID');
  assert.equal(new Set(allNodes.map(node=>node.formaNodeId)).size,allNodes.length,'master occurrences receive unique scoped IDs');
  assert.equal(project.forma.scene.nodes[frame.components[0].formaNodeId].source.nodeId,id(2));
  const importedInstance = frame.components.find(component => component.attributes['data-figma-node-type'] === 'INSTANCE');
  assert.ok(importedInstance, 'instance root remains represented');
  const instanceRelation = project.forma.scene.nodes[importedInstance.formaNodeId].instance;
  assert.equal(instanceRelation.definitionId, project.forma.components[0].id);
  assert.equal(instanceRelation.sourceComponentNodeId, id(3));
  assert.deepEqual(instanceRelation.overrides[0].sourceGuidPath, [id(3), id(4)]);
  assert.equal(instanceRelation.overrides[0].fields.textData.characters, 'Overridden label');
  const expandedMaster = importedInstance.components?.[0];
  assert.equal(expandedMaster.attributes['data-forma-instance-source'], id(2));
  assert.equal(expandedMaster.attributes['data-figma-node-id'], id(3));
  assert.equal(expandedMaster.style.transform, 'matrix(2, 0, 0, 2, 0, 0)');
  assert.equal(expandedMaster.style.left, '0px');
  const importedLabel = expandedMaster.components?.[0];
  assert.equal(importedLabel.content, 'Overridden label');
  assert.equal(importedLabel.style.color, 'rgba(255, 0, 0, 1)');
  assert.notEqual(importedLabel.attributes.id, id(4), 'clone receives a Forma-safe scoped CSS ID');
  const again=importParsedFigDocument(doc);
  assert.deepEqual(allNodes.map(node=>node.formaNodeId),(()=>{const values=[];const visit=node=>{values.push(node.formaNodeId);(node.components||[]).forEach(visit);};visit(again.editor.grapesjs.pages[0].frames[0].component);return values;})(),'the same decoded source and occurrence paths produce stable IDs');
});

test('Figma affine transforms preserve scale, rotation, shear, and translated origin', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(50), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const frame = {
    guid: guid(51), type: 'FRAME', name: 'Affine frame', phase: 'CREATED',
    size: { x: 80, y: 40 },
    transform: { m00: 2, m01: 0.25, m02: 50, m10: 0.5, m11: 3, m12: 40 },
  };
  const vector = {
    guid: guid(52), type: 'VECTOR', name: 'Quarter turn', phase: 'CREATED',
    size: { x: 16, y: 0 },
    transform: { m00: 0, m01: -1, m02: 12, m10: 1, m11: 0, m12: 5 },
  };
  const project = importParsedFigDocument({
    nodes: [page, frame, vector],
    childrenMap: new Map([[id(50), [frame, vector]]]),
    images: new Map(), meta: {}, header: { version: 101 },
  });
  const pageRoot = project.editor.grapesjs.pages[0].frames[0].component;
  const [affine, rotated] = pageRoot.components;
  assert.equal(pageRoot.style.width, '208px', 'page width contains transformed corners instead of the untransformed frame box');
  assert.equal(pageRoot.style.height, '195px', 'page height contains transformed corners instead of the untransformed frame box');
  assert.equal(affine.style.left, '38px');
  assert.equal(affine.style.top, '35px');
  assert.equal(affine.style.width, '80px');
  assert.equal(affine.style.height, '40px');
  assert.equal(affine.style.transform, 'matrix(2, 0.5, 0.25, 3, 0, 0)');
  assert.equal(affine.style['transform-origin'], '0 0');
  assert.equal(rotated.style.transform, 'matrix(0, 1, -1, 0, 0, 0)');
  assert.equal(rotated.style.left, '0px');
  assert.equal(rotated.style.top, '0px');
  assert.equal(rotated.style['transform-origin'], '0 0');
  assert.deepEqual(project.forma.scene.nodes[affine.formaNodeId].localTransform, [2, 0.25, 0.5, 3, 50, 40]);
});

test('Figma layer export presets survive import with format, scale, crop, and suffix metadata', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(20), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const frame = {
    guid: guid(21), type: 'FRAME', name: 'Dashboard', phase: 'CREATED',
    size: { x: 1200, y: 800 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 },
    exportSettings: [{ suffix: '@2x', imageType: 'PNG', constraint: { type: 'CONTENT_SCALE', value: 2 }, contentsOnly: true, useAbsoluteBounds: false, colorProfile: 'DOCUMENT', useBicubicSampler: true }],
  };
  const nodes = [page, frame];
  const project = importParsedFigDocument({ nodes, nodeMap: new Map(nodes.map(node => [id(node.guid.localID), node])), childrenMap: new Map([[id(20), [frame]]]), images: new Map(), meta: {}, header: { version: 101 } });
  const importedFrame = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  assert.deepEqual(JSON.parse(importedFrame.attributes['data-figma-export-settings']), [{
    suffix: '@2x', imageType: 'PNG', constraint: { type: 'CONTENT_SCALE', value: 2 }, contentsOnly: true,
    useAbsoluteBounds: false, colorProfile: 'DOCUMENT', useBicubicSampler: true,
  }]);
  assert.equal(importedFrame.style.width, '1200px');
});

test('Figma vector serialization keeps fill paths filled and stroke paths stroked', async () => {
  const { vectorPathsToDataUrl } = await import('../fig-import.mjs');
  const color = { type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 }, opacity: 1, visible: true };
  const dataUrl = vectorPathsToDataUrl({
    fill: [{ svgPath: 'M0 0L4 0L4 4Z', paints: [color] }],
    stroke: [{ svgPath: 'M1 1L3 3', paints: [color] }],
  }, { width: 4, height: 4, strokeWeight: 2, strokeCap: 'ROUND', strokeJoin: 'BEVEL' });
  const svg = Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /fill="rgba\(26, 51, 77, 1\)" stroke="none"/);
  assert.match(svg, /fill="none" stroke="rgba\(26, 51, 77, 1\)" stroke-width="2" stroke-opacity="1" stroke-linecap="round" stroke-linejoin="bevel"/);
});

test('Figma renders saved Boolean glyphs and expanded stroke paths without repainting their operands', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const { encodeCommandsBlob, parseSVGPathData } = await import('openfig-core');
  const shape = 'M0 0L16 0L16 16L0 16ZM1 1L15 1L15 15L1 15Z';
  const blob = encodeCommandsBlob(parseSVGPathData(shape));
  const paint = { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true };
  const page = { guid: guid(90), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const base = { phase: 'CREATED', size: { x: 16, y: 16 }, transform: { m00: 1, m11: 1 } };
  const boolean = { ...base, guid: guid(91), type: 'BOOLEAN_OPERATION', name: 'Frame glyph', fillPaints: [paint], fillGeometry: [{ commandsBlob: 0, windingRule: 'ODD' }] };
  const operand = { ...base, guid: guid(92), type: 'RECTANGLE', name: 'Operand', fillPaints: [paint], parentIndex: { guid: boolean.guid, position: 'a' } };
  const vector = { ...base, guid: guid(93), type: 'VECTOR', name: 'Cursor outline', strokeWeight: 2, strokePaints: [paint], strokeGeometry: [{ commandsBlob: 0, windingRule: 'ODD' }] };
  const missing = { ...boolean, guid: guid(94), name: 'Unresolved Boolean', fillGeometry: [{ commandsBlob: 1 }] };
  const bubble = { ...base, guid: guid(95), type: 'ROUNDED_RECTANGLE', name: 'Comment', rectangleCornerRadiiIndependent: true, rectangleTopLeftCornerRadius: 8, rectangleTopRightCornerRadius: 8, rectangleBottomRightCornerRadius: 8, rectangleBottomLeftCornerRadius: 2 };
  const circle = { ...base, guid: guid(96), type: 'ELLIPSE', name: 'Resource dot' };
  const project = importParsedFigDocument({ nodes: [page, boolean, operand, vector, missing, bubble, circle], childrenMap: new Map([[id(90), [boolean, vector, missing, bubble, circle]], [id(91), [operand]]]), images: new Map(), message: { blobs: [blob] }, header: { version: 101 } });
  const [glyph, outline, fallback, comment, dot] = project.editor.grapesjs.pages[0].frames[0].component.components;
  const decode = value => Buffer.from(value.match(/base64,([\w+/=]+)/)[1], 'base64').toString('utf8');
  assert.equal(glyph.style['background-color'], undefined);
  const [vectorPaint, hiddenOperand] = glyph.components;
  assert.equal(vectorPaint.tagName, 'svg');
  assert.equal(vectorPaint.layerable, false);
  assert.equal(vectorPaint.style['pointer-events'], 'none');
  assert.equal(vectorPaint.components[0].attributes.d, shape);
  assert.equal(vectorPaint.components[0].attributes['fill-rule'], 'evenodd');
  assert.equal(hiddenOperand.style.display, 'none');
  assert.equal(hiddenOperand.attributes['data-forma-boolean-operand'], 'true');
  assert.deepEqual(project.forma.scene.nodes[glyph.formaNodeId].children, [hiddenOperand.formaNodeId]);
  assert.equal(project.forma.scene.nodes[hiddenOperand.formaNodeId].visible, true);
  assert.match(decode(outline.attributes.src), /fill-rule="evenodd" fill="rgba\(0, 0, 0, 1\)" stroke="none" stroke-width="0"/);
  assert.equal(fallback.style['background-color'], undefined);
  assert.ok(project.importSummary.diagnostics.some(item => item.code === 'BOOLEAN_GEOMETRY_UNSUPPORTED'));
  assert.equal(comment.style['border-radius'], '8px 8px 8px 2px');
  assert.equal(dot.style['border-radius'], '50%');
});

test('Figma regular polygons import as editable SVG geometry without an unsupported-node diagnostic', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const { encodeCommandsBlob, parseSVGPathData } = await import('openfig-core');
  const polygonPath = 'M8 0L16 6L13 16L3 16L0 6Z';
  const blob = encodeCommandsBlob(parseSVGPathData(polygonPath));
  const page = { guid: guid(80), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const polygon = {
    guid: guid(81), type: 'REGULAR_POLYGON', name: 'Five-sided polygon', phase: 'CREATED',
    size: { x: 16, y: 16 }, transform: { m00: 1, m02: 24, m10: 0, m12: 32 },
    fillPaints: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6, a: 1 }, opacity: 1, visible: true }],
    fillGeometry: [{ commandsBlob: 0, windingRule: 'NONZERO' }],
  };
  const project = importParsedFigDocument({
    nodes: [page, polygon], childrenMap: new Map([[id(80), [polygon]]]),
    images: new Map(), message: { blobs: [blob] }, header: { version: 101 },
  });
  const imported = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  assert.equal(imported.attributes['data-figma-node-type'], 'REGULAR_POLYGON');
  assert.equal(imported.type, 'image');
  assert.match(imported.attributes.src, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(imported.attributes.src.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, new RegExp(polygonPath));
  assert.match(svg, /fill="rgba\(51, 102, 153, 1\)"/);
  assert.equal(project.importSummary.unsupportedTypes.includes('REGULAR_POLYGON'), false);
  assert.equal(project.importSummary.diagnostics.some(item => item.code === 'NODE_TYPE_UNSUPPORTED' && item.sourceNodeId === id(81)), false);
});

test('imported centered vector strokes keep fractional origins and nominal layer bounds', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const { preciseGeometryPath } = await import('../fig-import-vector-paint.mjs');
  const { encodeCommandsBlob, parseSVGPathData } = await import('openfig-core');
  const blob = encodeCommandsBlob(parseSVGPathData('M0.001953125 0L5 0L5 5Z'));
  assert.equal(preciseGeometryPath(blob.bytes || blob), 'M0.001953125 0L5 0L5 5Z');
  assert.equal(preciseGeometryPath(Uint8Array.from([1, 0, 0])), null);
  const page = { guid: guid(90), type: 'CANVAS', phase: 'CREATED' };
  const frame = { guid: guid(91), type: 'FRAME', phase: 'CREATED', size: { x: 100, y: 100 } };
  const group = { guid: guid(92), type: 'FRAME', phase: 'CREATED', size: { x: 16, y: 16 }, transform: { m02: 0.5, m12: 1.25 }, parentIndex: { guid: frame.guid, position: 'a' } };
  const shape = { guid: guid(93), type: 'ELLIPSE', phase: 'CREATED', size: { x: 5.125, y: 5.25 }, transform: { m02: 10.25, m12: 7.5 }, parentIndex: { guid: group.guid, position: 'a' },
    strokeAlign: 'CENTER', strokeWeight: 1, strokePaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }], strokeGeometry: [{ commandsBlob: 0 }] };
  const project = importParsedFigDocument({ nodes: [page, frame, group, shape], childrenMap: new Map([[id(90), [frame]], [id(91), [group]], [id(92), [shape]]]), images: new Map(), message: { blobs: [blob] }, header: { version: 101 } });
  const [root] = project.editor.grapesjs.pages[0].frames[0].component.components;
  const [container] = root.components;
  const [ellipse] = container.components;
  assert.equal(container.style.translate, '0.5px 0.25px');
  assert.equal(container.style['overflow-clip-margin'], '1px');
  assert.equal(ellipse.style.translate, '0.25px 0.5px');
  assert.equal(ellipse.style.width, '5.125px');
  assert.equal(ellipse.style['--forma-vector-stroke-width'], '1px');
  assert.equal(ellipse.components[0].components[0].tagName, 'ellipse');
});

test('expanded outside strokes exclude the inside of the Figma glyph', async () => {
  const { vectorPathsToDataUrl } = await import('../fig-import.mjs');
  const outer = { svgPath: 'M0 0L16 0L16 16L0 16Z', paints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] };
  const inside = { svgPath: 'M1 1L15 1L15 15L1 15Z', paints: [] };
  const svg = Buffer.from(vectorPathsToDataUrl({fill:[inside],stroke:[outer]}, {width:16,height:16,expandedStroke:true,strokeAlign:'OUTSIDE'}).split(',')[1], 'base64').toString();
  assert.match(svg, /<mask [^>]+><rect width="16" height="16" fill="white"\/><path d="M1 1L15 1L15 15L1 15Z" fill-rule="nonzero" fill="black"/);
  assert.match(svg, /<g mask="url\(#stroke-alignment\)"><path d="M0 0L16 0L16 16L0 16Z"/);
});

test('Figma inside and outside strokes keep the original shape bounds', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(10), type: 'CANVAS', name: 'Page 1', phase: 'CREATED' };
  const paint = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true };
  const inside = { guid: guid(11), type: 'RECTANGLE', name: 'Inside stroke', phase: 'CREATED', size: { x: 40, y: 30 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, strokePaints: [paint], strokeWeight: 2, strokeAlign: 'INSIDE' };
  const outside = { guid: guid(12), type: 'RECTANGLE', name: 'Outside stroke', phase: 'CREATED', size: { x: 50, y: 35 }, transform: { m00: 1, m02: 60, m10: 0, m12: 0 }, strokePaints: [paint], strokeWeight: 3, strokeAlign: 'OUTSIDE' };
  const nodes = [page, inside, outside];
  const doc = { nodes, nodeMap: new Map(nodes.map(node => [id(node.guid.localID), node])), childrenMap: new Map([[id(10), [inside, outside]]]), images: new Map(), meta: {}, header: { version: 101 } };
  const root = importParsedFigDocument(doc).editor.grapesjs.pages[0].frames[0].component;
  const [inner, outer] = root.components;
  assert.equal(inner.style.width, '40px');
  assert.equal(inner.style.height, '30px');
  assert.equal(inner.style.border, undefined);
  assert.equal(inner.style['box-shadow'], 'inset 0 0 0 2px rgba(255, 0, 0, 1)');
  assert.equal(outer.style.width, '50px');
  assert.equal(outer.style.height, '35px');
  assert.equal(outer.style.border, undefined);
  assert.equal(outer.style['box-shadow'], '0 0 0 3px rgba(255, 0, 0, 1)');
});

test('Figma image fills preserve image-over-solid stacking, opacity, and crop mode', async () => {
  const { paintStackCss } = await import('../fig-import.mjs');
  const image = { dataUrl: 'data:image/jpeg;base64,/9j/2Q==' };
  const images = new Map([['0102', image]]);
  const imageFills = [];
  const style = paintStackCss([
    { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true },
    { type: 'IMAGE', image: { hash: Uint8Array.from([1, 2]) }, imageScaleMode: 'FILL', opacity: 0.65, visible: true },
  ], images, imageFills, { x: 50, y: 50 });
  assert.match(style['background-image'], /^url\("data:image\/svg\+xml;base64,/);
  assert.match(style['background-image'], /linear-gradient\(rgba\(255, 255, 255, 1\)/);
  assert.equal(style['background-size'], '100% 100%, 100% 100%');
  assert.equal(style['background-repeat'], 'no-repeat, no-repeat');
  const encoded = style['background-image'].match(/url\("data:image\/svg\+xml;base64,([^"]+)"\)/)?.[1];
  const svg = Buffer.from(encoded, 'base64').toString('utf8');
  assert.match(svg, /data:image\/jpeg;base64,/);
  assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(svg, /opacity="0\.65"/);
  assert.equal(imageFills.length, 1);

  const opaqueStyle = paintStackCss([
    { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true },
    { type: 'IMAGE', image: { hash: Uint8Array.from([1, 2]) }, imageScaleMode: 'FILL', opacity: 1, visible: true },
  ], images, [], { x: 50, y: 50 });
  assert.match(opaqueStyle['background-image'], /^url\("data:image\/jpeg;base64,/);
  assert.match(opaqueStyle['background-image'], /, linear-gradient\(rgba\(255, 255, 255, 1\)/);
  assert.equal(opaqueStyle['background-size'], 'cover, 100% 100%');
});

test('Figma FIT and TILE image fills retain their distinct behavior', async () => {
  const { paintStackCss } = await import('../fig-import.mjs');
  const images = new Map([['0102', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]]);
  const paint = mode => ({ type: 'IMAGE', image: { hash: Uint8Array.from([1, 2]) }, imageScaleMode: mode, opacity: 1, visible: true, originalImageWidth: 16, originalImageHeight: 8 });
  const fit = paintStackCss([paint('FIT')], images, [], { x: 40, y: 40 });
  assert.equal(fit['background-size'], 'contain');
  assert.match(fit['background-image'], /data:image\/png;base64,iVBORw0KGgo=/);
  const tile = paintStackCss([paint('TILE')], images, [], { x: 40, y: 40 });
  assert.equal(tile['background-repeat'], 'repeat');
  assert.equal(tile['background-size'], 'auto');
  assert.match(tile['background-image'], /data:image\/png;base64,iVBORw0KGgo=/);
});

test('Figma image rotation, crop transforms, and tile scaling are applied', async () => {
  const { paintStackCss } = await import('../fig-import.mjs');
  const images = new Map([['0102', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]]);
  const base = { type: 'IMAGE', image: { hash: Uint8Array.from([1, 2]) }, opacity: 1, visible: true, originalImageWidth: 16, originalImageHeight: 8 };
  const rotated = paintStackCss([{ ...base, imageScaleMode: 'FIT', rotation: 90 }], images, [], { x: 40, y: 20 });
  const rotatedSvg = Buffer.from(rotated['background-image'].match(/data:image\/svg\+xml;base64,([^"]+)/)[1], 'base64').toString('utf8');
  assert.match(rotatedSvg, /<g transform="rotate\(90 20 10\)">/);

  const cropped = paintStackCss([{ ...base, imageScaleMode: 'CROP', transform: { m00: 0.5, m01: 0, m02: 0.25, m10: 0, m11: 0.5, m12: 0.25 } }], images, [], { x: 40, y: 20 });
  const croppedSvg = Buffer.from(cropped['background-image'].match(/data:image\/svg\+xml;base64,([^"]+)/)[1], 'base64').toString('utf8');
  assert.match(croppedSvg, /transform="matrix\(0\.5 0 0 0\.5 10 5\)"/);

  const tiled = paintStackCss([{ ...base, imageScaleMode: 'TILE', scalingFactor: 2, rotation: 90 }], images, [], { x: 40, y: 20 });
  const tileSvg = Buffer.from(tiled['background-image'].match(/data:image\/svg\+xml;base64,([^"]+)/)[1], 'base64').toString('utf8');
  assert.match(tileSvg, /width="32" height="16"/);
  assert.match(tileSvg, /transform="rotate\(90 16 8\)"/);
});
