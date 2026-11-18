import crypto from 'node:crypto';
import { parseFig, nodeId, resolveVectorNodePaths } from 'openfig-core';
import { createSourceDocumentBundle, sourceOccurrenceKey, stableImportedNodeId } from './fig-import-source.mjs';
import { buildFigResourceIndex, figResourceManifest } from './fig-import-resource-index.mjs';
import { figVariablesToFormaState, normalizeFigVariables } from './fig-import-variables.mjs';
import { figStackChildStyle, figStackStyle, normalizeFigStackLayout } from './fig-import-layout.mjs';
import { importFigPrototypeInteractions } from './fig-import-prototype.mjs';
import { figTextStyle } from './fig-import-text.mjs';
import { preciseGeometryPath, preserveVectorSubpixelPosition, vectorPaintComponent } from './fig-import-vector-paint.mjs';
import { collectOverrides } from './dist/component-service.js';
import { cssVariableName } from './dist/variable-service.js';

const MAX_NODES = 250_000;
const colorCss = color => {
  if (!color) return null;
  const channel = value => Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${Math.max(0, Math.min(1, Number(color.a ?? 1)))})`;
};
const hashKey = value => {
  if (!value) return '';
  if (typeof value === 'string') return value.toLowerCase();
  return Buffer.from(value).toString('hex').toLowerCase();
};
const guidRefId = guid => guid?.guid ? nodeId(guid) : guid?.sessionID != null && guid?.localID != null ? `${guid.sessionID}:${guid.localID}` : null;
const safeName = value => String(value || 'Untitled').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
const cssId = (prefix, value) => `${prefix}-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
const cssNumber = value => {
  const normalized = Math.abs(Number(value)) < 1e-10 ? 0 : Number(value);
  return Number(normalized.toFixed(8));
};
function cssLinearMatrix(transform = {}, scaleX = 1, scaleY = 1) {
  const a = cssNumber(Number(transform.m00 ?? 1) * scaleX);
  const b = cssNumber(Number(transform.m10 || 0) * scaleY);
  const c = cssNumber(Number(transform.m01 || 0) * scaleX);
  const d = cssNumber(Number(transform.m11 ?? 1) * scaleY);
  return `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
}
function transformedNodeBounds(node) {
  const transform = node.transform || {};
  const width = Math.max(0, Number(node.size?.x || 0));
  const height = Math.max(0, Number(node.size?.y || 0));
  const a = Number(transform.m00 ?? 1), c = Number(transform.m01 || 0), e = Number(transform.m02 || 0);
  const b = Number(transform.m10 || 0), d = Number(transform.m11 ?? 1), f = Number(transform.m12 || 0);
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => ({ left: a * x + c * y + e, top: b * x + d * y + f }));
  return {
    left: Math.min(...corners.map(point => point.left)),
    top: Math.min(...corners.map(point => point.top)),
    right: Math.max(...corners.map(point => point.left)),
    bottom: Math.max(...corners.map(point => point.top)),
  };
}

function paintCss(paints, images, imageFills, variableColor = null) {
  const visible = (paints || []).filter(paint => paint?.visible !== false && Number(paint?.opacity ?? 1) > 0);
  const paint = visible[0];
  if (!paint) return null;
  if (paint.type === 'SOLID') return { color: variableColor?.(paint, colorWithOpacity(paint.color, paint.opacity), paint.opacity) || colorWithOpacity(paint.color, paint.opacity), opacity: Number(paint.opacity ?? 1) };
  if (paint.type === 'IMAGE') {
    const hash = hashKey(paint.image?.hash || paint.imageThumbnail?.hash);
    const image = images.get(hash);
    if (!image) return null;
    imageFills.push({ dataUrl: image.dataUrl, mode: paint.imageScaleMode || 'FILL' });
    return { image: image.dataUrl, mode: paint.imageScaleMode || 'FILL', opacity: Number(paint.opacity ?? 1) };
  }
  if (['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(paint.type) && paint.stops?.length) {
    const stops = paint.stops.map((stop, index) => `${variableColor?.(paint.stopsVar?.[index], colorWithOpacity(stop.color, paint.opacity), paint.opacity) || colorWithOpacity(stop.color, paint.opacity)} ${Math.max(0, Math.min(1, Number(stop.position))) * 100}%`).join(', ');
    const direction = paint.type === 'GRADIENT_LINEAR' ? '135deg' : 'circle';
    return { gradient: paint.type === 'GRADIENT_LINEAR' ? `linear-gradient(${direction}, ${stops})` : `radial-gradient(${stops})`, opacity: Number(paint.opacity ?? 1) };
  }
  return null;
}

function colorWithOpacity(color, opacity = 1) {
  return colorCss({ ...color, a: Number(color?.a ?? 1) * Number(opacity ?? 1) });
}

function imageFillLayer(paint, image, size = {}) {
  const mode = String(paint.imageScaleMode || 'FILL').toUpperCase();
  const width = Math.max(1, Number(size.x || paint.originalImageWidth || 1));
  const height = Math.max(1, Number(size.y || paint.originalImageHeight || 1));
  const opacity = Math.max(0, Math.min(1, Number(paint.opacity ?? 1)));
  const data = image.dataUrl;
  const transform = paint.transform || {};
  const rotation = Number(paint.rotation || 0);
  const isIdentity = Math.abs(Number(transform.m00 ?? 1) - 1) < 0.0001
    && Math.abs(Number(transform.m11 ?? 1) - 1) < 0.0001
    && Math.abs(Number(transform.m01 || 0)) < 0.0001
    && Math.abs(Number(transform.m10 || 0)) < 0.0001
    && Math.abs(Number(transform.m02 || 0)) < 0.0001
    && Math.abs(Number(transform.m12 || 0)) < 0.0001
    && Math.abs(rotation) < 0.0001;
  if (opacity === 1 && isIdentity) {
    if (mode === 'TILE') return { image: `url("${data}")`, size: 'auto', position: 'left top', repeat: 'repeat' };
    return { image: `url("${data}")`, size: mode === 'FIT' ? 'contain' : 'cover', position: 'center center', repeat: 'no-repeat' };
  }
  if (mode === 'TILE') {
    const scale = Math.max(0.01, Number(paint.scalingFactor ?? paint.scale ?? 1));
    const tileWidth = Math.max(1, Number(paint.originalImageWidth || width) * scale);
    const tileHeight = Math.max(1, Number(paint.originalImageHeight || height) * scale);
    const rotate = Math.abs(rotation) > 0.0001 ? ` transform="rotate(${rotation} ${tileWidth / 2} ${tileHeight / 2})"` : '';
    const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight}" viewBox="0 0 ${tileWidth} ${tileHeight}"><image href="${data}" width="${tileWidth}" height="${tileHeight}" opacity="${opacity}"${rotate}/></svg>`;
    return { image: `url("data:image/svg+xml;base64,${Buffer.from(tileSvg).toString('base64')}")`, size: 'auto', position: 'left top', repeat: 'repeat' };
  }
  const preserve = mode === 'FIT' ? 'xMidYMid meet' : 'xMidYMid slice';
  // Figma stores image crop transforms in normalized frame coordinates; convert
  // them to the SVG's pixel coordinate space before applying them to the image.
  const matrix = [
    Number(transform.m00 ?? 1),
    Number(transform.m10 || 0) * height / width,
    Number(transform.m01 || 0) * width / height,
    Number(transform.m11 ?? 1),
    Number(transform.m02 || 0) * width,
    Number(transform.m12 || 0) * height,
  ];
  const imageTransform = isIdentity ? '' : ` transform="matrix(${matrix.join(' ')})"`;
  const imageMarkup = `<image href="${data}" width="${width}" height="${height}" preserveAspectRatio="${preserve}" opacity="${opacity}"${imageTransform}/>`;
  const rotatedImage = Math.abs(rotation) > 0.0001
    ? `<g transform="rotate(${rotation} ${width / 2} ${height / 2})">${imageMarkup}</g>`
    : imageMarkup;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rotatedImage}</svg>`;
  return { image: `url("data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}")`, size: '100% 100%', position: 'center center', repeat: 'no-repeat' };
}

export function paintStackCss(paints, images, imageFills = [], size = {}, variableColor = null) {
  const visible = (paints || []).filter(paint => paint?.visible !== false && Number(paint?.opacity ?? 1) > 0);
  const layers = [];
  for (const paint of visible) {
    if (paint.type === 'IMAGE') {
      const hash = hashKey(paint.image?.hash || paint.imageThumbnail?.hash);
      const image = images.get(hash);
      if (!image) continue;
      imageFills.push({ dataUrl: image.dataUrl, mode: paint.imageScaleMode || 'FILL' });
      layers.push(imageFillLayer(paint, image, size));
    } else if (paint.type === 'SOLID' && paint.color) {
      const color = variableColor?.(paint, colorWithOpacity(paint.color, paint.opacity), paint.opacity) || colorWithOpacity(paint.color, paint.opacity);
      layers.push({ image: `linear-gradient(${color}, ${color})`, size: '100% 100%', position: 'center center', repeat: 'no-repeat' });
    } else if (['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(paint.type) && paint.stops?.length) {
      const stops = paint.stops.map((stop, index) => `${variableColor?.(paint.stopsVar?.[index], colorWithOpacity(stop.color, paint.opacity), paint.opacity) || colorWithOpacity(stop.color, paint.opacity)} ${Math.max(0, Math.min(1, Number(stop.position))) * 100}%`).join(', ');
      const gradient = paint.type === 'GRADIENT_LINEAR' ? `linear-gradient(135deg, ${stops})` : `radial-gradient(${stops})`;
      layers.push({ image: gradient, size: '100% 100%', position: 'center center', repeat: 'no-repeat' });
    }
  }
  if (!layers.length) return null;
  const cssLayers = layers.reverse();
  return {
    'background-image': cssLayers.map(layer => layer.image).join(', '),
    'background-size': cssLayers.map(layer => layer.size).join(', '),
    'background-position': cssLayers.map(layer => layer.position).join(', '),
    'background-repeat': cssLayers.map(layer => layer.repeat).join(', '),
  };
}

function vectorPathsToSvg(paths, { width = 1, height = 1, strokeWeight = 1, strokeCap = 'NONE', strokeJoin = 'MITER', paintColor = null, expandedStroke = false, strokeAlign = 'CENTER' } = {}) {
  width = Math.max(1, Number(width || 1));
  height = Math.max(1, Number(height || 1));
  const lineCap = ({ ROUND: 'round', SQUARE: 'square', NONE: 'butt' })[String(strokeCap).toUpperCase()] || 'butt';
  const lineJoin = ({ ROUND: 'round', BEVEL: 'bevel', MITER: 'miter' })[String(strokeJoin).toUpperCase()] || 'miter';
  const pathAttributes = entry => `d="${entry.svgPath.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" fill-rule="${entry.windingRule === 'ODD' ? 'evenodd' : 'nonzero'}"`;
  const serialize = (entry, isStroke) => {
    const paint = (entry.paints || []).find(item => item?.visible !== false);
    if (!entry.svgPath) return '';
    const resolvedColor = paint?.type === 'SOLID' ? (paintColor?.(paint) || colorCss(paint.color)) : 'none';
    const strokeWidth = isStroke ? Math.max(0.1, Number(strokeWeight || 1)) : 0;
    const opacity = Number(paint?.opacity ?? 1);
    const fill = isStroke ? 'none' : resolvedColor;
    const stroke = isStroke ? resolvedColor : 'none';
    return `<path ${pathAttributes(entry)} fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${isStroke ? ` stroke-opacity="${opacity}" stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}"` : ` fill-opacity="${opacity}"`}/>`;
  };
  const fills = (paths.fill || []).filter(entry => entry.svgPath);
  const fill = fills.map(entry => serialize(entry, false)).join('');
  let stroke = (paths.stroke || []).map(entry => serialize(entry, !expandedStroke)).join('');
  if (stroke && expandedStroke && fills.length && ['INSIDE', 'OUTSIDE'].includes(strokeAlign)) {
    const inside = strokeAlign === 'INSIDE';
    const silhouette = fills.map(entry => `<path ${pathAttributes(entry)} fill="${inside ? 'white' : 'black'}"/>`).join('');
    const base = inside ? '' : `<rect width="${width}" height="${height}" fill="white"/>`;
    stroke = `<defs><mask id="stroke-alignment" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">${base}${silhouette}</mask></defs><g mask="url(#stroke-alignment)">${stroke}</g>`;
  }
  const body = fill + stroke;
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

const svgDataUrl = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export function vectorPathsToDataUrl(paths, options = {}) {
  const svg = vectorPathsToSvg(paths, options);
  return svg ? svgDataUrl(svg) : null;
}

function svgForVector(paths, node, variableIdByAssetRef) {
  const isBoolean = node.type === 'BOOLEAN_OPERATION';
  if (isBoolean && [...paths.fill, ...paths.stroke].some(entry =>
    entry.paints?.some(paint => paint.visible !== false && paint.type !== 'SOLID'))) return null;
  const options = {
    width: node.size?.x,
    height: node.size?.y,
    strokeWeight: node.strokeWeight,
    strokeCap: node.strokeCap,
    strokeJoin: node.strokeJoin,
    strokeAlign: node.strokeAlign,
    // Figma stores these paths as already expanded stroke outlines.
    expandedStroke: true,
  };
  const fallbackSvg = vectorPathsToSvg(paths, options);
  const variables = [];
  const tokenByVariableId = new Map();
  const svg = vectorPathsToSvg(paths, {
    ...options,
    paintColor: paint => {
      const ref = paint?.colorVar?.value?.alias?.assetRef;
      const id = ref?.key ? variableIdByAssetRef.get(`${ref.key}:${ref.version || ''}`) : null;
      if (!id) return null;
      if (!tokenByVariableId.has(id)) {
        const token = `__FORMA_VARIABLE_${variables.length}__`;
        tokenByVariableId.set(id, token);
        variables.push({ id, token });
      }
      return tokenByVariableId.get(id);
    },
  });
  return fallbackSvg ? { dataUrl: svgDataUrl(fallbackSvg), template: variables.length ? { svg, variables } : null } : null;
}

function inlineBooleanPaint(paths, node, key, style, colorForPaint) {
  const path = paths.fill[0];
  const paints = path?.paints?.filter(paint => paint?.visible !== false) || [];
  if (paths.fill.length !== 1 || paths.stroke.length || paints.length !== 1 ||
      paints[0]?.type !== 'SOLID' || !paints[0].color || !(node.size?.x > 0 && node.size?.y > 0)) return null;
  const d = preciseGeometryPath(path.commandsBlob);
  if (!d) return null;
  const paint = paints[0];
  style['--forma-vector-fill'] = colorForPaint(paint, colorWithOpacity(paint.color, paint.opacity), paint.opacity);
  return vectorPaintComponent(key, 'path', { d, 'fill-rule': path.windingRule === 'ODD' ? 'evenodd' : 'nonzero' }, { fill: 'var(--forma-vector-fill)' }, `0 0 ${node.size.x} ${node.size.y}`);
}

function inlineCenteredStroke(node, strokePaints, key) {
  if (!['RECTANGLE', 'ROUNDED_RECTANGLE', 'ELLIPSE'].includes(node.type) ||
      strokePaints.length !== 1 || strokePaints[0].type !== 'SOLID' ||
      !node.strokeGeometry?.length || !(node.size?.x > 0 && node.size?.y > 0) ||
      node.rectangleCornerRadiiIndependent || node.cornerSmoothing > 0 || node.dashPattern?.length ||
      node.fillPaints?.some(paint => paint?.visible !== false && Number(paint.opacity ?? 1) > 0)) return null;
  const arc = node.arcData;
  if (arc && (Math.abs(arc.startingAngle || 0) > 1e-6 || Math.abs((arc.endingAngle ?? 2 * Math.PI) - 2 * Math.PI) > 1e-6 || arc.innerRadius > 0)) return null;
  const ellipse = node.type === 'ELLIPSE';
  const attributes = ellipse ? { cx: '50%', cy: '50%', rx: '50%', ry: '50%' } : { width: '100%', height: '100%' };
  const style = { fill: 'none', stroke: 'var(--forma-vector-stroke-color)', 'stroke-width': 'var(--forma-vector-stroke-width)' };
  if (!ellipse) {
    style.rx = 'var(--forma-vector-stroke-radius, 0px)';
    style['stroke-linejoin'] = ({ BEVEL: 'bevel', ROUND: 'round' })[node.strokeJoin] || 'miter';
  }
  return vectorPaintComponent(key, ellipse ? 'ellipse' : 'rect', attributes, style);
}

export function importFigProject(bytes, filename = 'Imported Figma design') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) throw new Error('This file is empty or too small to be a Figma design file.');
  if (bytes.length > 200 * 1024 * 1024) throw new Error('Figma files must be 200 MB or smaller.');
  const doc = parseFig(new Uint8Array(bytes));
  if (doc.header?.prelude !== 'fig-kiwi') throw new Error('This is not a Figma Design .fig file.');
  if (doc.nodes.length > MAX_NODES) throw new Error('This design has more than 250,000 layers, which exceeds Forma’s import limit.');
  return importParsedFigDocument(doc, filename, bytes);
}

export function importParsedFigDocument(doc, filename = 'Imported Figma design', sourceBytes = null) {
  const resourceIndex = buildFigResourceIndex(doc);
  const indexErrors = resourceIndex.diagnostics.filter(item => item.severity === 'error');
  if (indexErrors.length) throw new Error(`Figma resource indexing failed: ${indexErrors.map(item => item.code).join(', ')}.`);
  const sourceBundle = createSourceDocumentBundle(doc, filename, sourceBytes);
  sourceBundle.sourceDocument.resourceManifest = figResourceManifest(resourceIndex);
  const images = new Map();
  for (const image of sourceBundle.imageAssets) images.set(String(image.figmaHash).replace(/\.[^.]+$/, '').toLowerCase(), { dataUrl: image.dataUrl, bytes: image.bytes });

  const unsupported = new Set();
  const diagnostics = [...resourceIndex.diagnostics];
  const appliedSourceOverrides = new WeakSet();
  const appliedSourceSwaps = new WeakSet();
  const appliedSourceVariableModes = new WeakSet();
  const diagnosticKeys = new Set(diagnostics.map(item => `${item.code}:${item.sourceNodeId || ''}:${item.propertyPath || ''}`));
  const addDiagnostic = item => {
    const key = `${item.code}:${item.sourceNodeId || ''}:${item.propertyPath || ''}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(item);
  };
  const scene = {
    version: 1,
    sourceDocuments: { [sourceBundle.documentId]: sourceBundle.sourceDocument },
    nodes: {},
    pages: [],
    resources: { components: {}, variables: {}, collections: {}, styles: {}, assets: {} },
    sourceOccurrences: {},
    diagnostics,
  };
  const nativeLayoutMetadata = {};
  const importedBaseStyles = new WeakMap();
  const vectorPaintByComponent = new WeakMap();
  const importedVariables = normalizeFigVariables(resourceIndex, sourceBundle.documentId);
  scene.resources.collections = importedVariables.collections;
  scene.resources.variables = importedVariables.variables;
  const nativeVariableState = figVariablesToFormaState(scene.resources);
  const variableIdByAssetRef = new Map(Object.values(scene.resources.variables).filter(variable => variable.source?.key && variable.source?.version).map(variable => [`${variable.source.key}:${variable.source.version}`, variable.id]));
  const collectionIdByAssetRef = new Map(Object.values(scene.resources.collections).filter(collection => collection.source?.key && collection.source?.version).map(collection => [`${collection.source.key}:${collection.source.version}`, collection.id]));
  const resolvePaintVariable = (paint, fallback, opacity = 1) => {
    const ref = paint?.colorVar?.value?.alias?.assetRef;
    const variableId = ref?.key ? variableIdByAssetRef.get(`${ref.key}:${ref.version || ''}`) : null;
    if (!variableId) return fallback;
    const variable = `var(${cssVariableName(variableId)})`;
    const alpha = Math.max(0, Math.min(1, Number(opacity ?? 1)));
    return alpha < 1 ? `color-mix(in srgb, ${variable} ${alpha * 100}%, transparent)` : variable;
  };
  const paintVariableBindings = (role, paints) => (paints || []).flatMap((paint, paintIndex) => {
    const entries = [{ paint, stopIndex: null }, ...(paint.stopsVar || []).map((stop, stopIndex) => ({ paint: stop, stopIndex }))];
    return entries.flatMap(({ paint: source, stopIndex }) => {
      const ref = source?.colorVar?.value?.alias?.assetRef;
      if (!ref?.key) return [];
      return [{ role, paintIndex, ...(stopIndex == null ? {} : { stopIndex }), sourceRef: { key: String(ref.key), version: String(ref.version || '') }, variableId: variableIdByAssetRef.get(`${ref.key}:${ref.version || ''}`) || null }];
    });
  });
  const normalizeVariableModes = (map, sourceNodeId) => {
    const result = {};
    for (const [index, entry] of (map?.entries || []).entries()) {
      const ref = entry?.variableSetID?.assetRef;
      const refKey = ref?.key ? `${ref.key}:${ref.version || ''}` : null;
      const collectionId = refKey ? collectionIdByAssetRef.get(refKey) : null;
      const modeId = guidRefId(entry?.variableModeID);
      const collection = collectionId ? scene.resources.collections[collectionId] : null;
      if (!collection) {
        addDiagnostic({ severity: 'warning', code: 'VARIABLE_MODE_OVERRIDE_COLLECTION_UNRESOLVED', sourceNodeId, propertyPath: `symbolData.symbolOverrides.variableModeBySetMap.entries[${index}].variableSetID`, reason: `Variable collection ${refKey || 'unknown'} is not present in this imported document.`, fallback: 'The original collection reference remains in the preserved instance override record.' });
        continue;
      }
      if (!modeId) {
        addDiagnostic({ severity: 'warning', code: 'VARIABLE_MODE_OVERRIDE_INCOMPLETE', sourceNodeId, propertyPath: `symbolData.symbolOverrides.variableModeBySetMap.entries[${index}].variableModeID`, reason: 'The source override identifies a variable collection but does not provide a mode ID.', fallback: `The collection default mode ${collection.defaultModeId || 'unset'} remains active.` });
        continue;
      }
      if (!collection.modes.some(mode => mode.id === modeId)) {
        addDiagnostic({ severity: 'warning', code: 'VARIABLE_MODE_OVERRIDE_UNRESOLVED', sourceNodeId, propertyPath: `symbolData.symbolOverrides.variableModeBySetMap.entries[${index}].variableModeID`, reason: `Mode ${modeId} is not a member of collection ${collection.name}.`, fallback: 'The collection default mode remains active.' });
        continue;
      }
      result[collectionId] = modeId;
      appliedSourceVariableModes.add(entry);
    }
    return result;
  };
  for (const item of importedVariables.diagnostics) addDiagnostic(item);
  for (const asset of [...sourceBundle.imageAssets, ...(sourceBundle.sourceAsset ? [sourceBundle.sourceAsset] : [])]) {
    scene.resources.assets[asset.id] = { id: asset.id, mime: asset.mime, sha256: asset.sha256, bytes: asset.bytes };
  }
  const componentResourceId = sourceNodeId => cssId('fig-component', `${sourceBundle.documentId}:${sourceNodeId}`);
  for (const [setId, setNode] of resourceIndex.componentSetsById) {
    const resourceId = componentResourceId(`set:${setId}`);
    const variants = (resourceIndex.childrenByParent.get(setId) || []).filter(node => node.type === 'SYMBOL').map(node => componentResourceId(nodeId(node)));
    scene.resources.components[resourceId] = {
      id: resourceId,
      kind: 'component-set',
      source: { documentId: sourceBundle.documentId, nodeId: setId },
      name: safeName(setNode.name),
      version: setNode.version || null,
      properties: Array.isArray(setNode.componentPropDefs) ? setNode.componentPropDefs : [],
      variantPropertyValueOrders: setNode.stateGroupPropertyValueOrders || {},
      variants,
    };
  }
  for (const [sourceNodeId, symbol] of resourceIndex.symbolsById) {
    const parentId = guidRefId(symbol.parentIndex?.guid);
    const parentSet = parentId ? resourceIndex.componentSetsById.get(parentId) : null;
    const resourceId = componentResourceId(sourceNodeId);
    scene.resources.components[resourceId] = {
      id: resourceId,
      kind: 'component',
      source: { documentId: sourceBundle.documentId, nodeId: sourceNodeId },
      name: safeName(symbol.name),
      key: symbol.key || null,
      version: symbol.version || null,
      componentSetId: parentSet ? componentResourceId(`set:${parentId}`) : null,
      variantAssignments: Array.isArray(symbol.variantPropSpecs) ? symbol.variantPropSpecs.map(spec => ({
        propertyId: guidRefId(spec.propDefId) || null,
        value: spec.value ?? null,
      })) : [],
    };
  }
  let converted = 0;
  const pages = [...resourceIndex.nodesById.values()].filter(node => node.type === 'CANVAS' && node.phase !== 'REMOVED' && node.internalOnly !== true);
  if (!pages.length) throw new Error('No editable Figma pages were found in this file.');

  const makeNode = (sourceNode, parentId, rootOrigin = { x: 0, y: 0 }, context = {}) => {
    const id = nodeId(sourceNode);
    if (!id || sourceNode.phase === 'REMOVED') return null;
    const parentSourcePath = context.sourcePath || [];
    const parentOverridePath = context.overridePath || [];
    const sourceIsDefinitionRoot = context.componentDefinitionRootId === id;
    const currentSourcePath = sourceIsDefinitionRoot ? parentSourcePath : [...parentSourcePath, id];
    const currentOverridePath = sourceIsDefinitionRoot ? parentOverridePath : [...parentOverridePath, { id, overrideKey: guidRefId(sourceNode.overrideKey) }];
    const overrideFields = {};
    const matchedOverrides = [];
    for (const scope of context.overrideScopes || []) {
      const relativePath = currentOverridePath.slice(scope.basePath.length);
      for (const override of scope.records || []) {
        let expectedPath = (override.guidPath?.guids || []).map(guidRefId).filter(Boolean);
        if (expectedPath[0] === scope.rootSourceId) expectedPath = expectedPath.slice(1);
        const directTarget = expectedPath.length === 1 && (expectedPath[0] === id || expectedPath[0] === guidRefId(sourceNode.overrideKey));
        const fullPathTarget = expectedPath.length === relativePath.length && expectedPath.every((value, index) => value === relativePath[index].id || value === relativePath[index].overrideKey);
        if (directTarget || fullPathTarget) {
          appliedSourceOverrides.add(override);
          matchedOverrides.push(override);
          Object.assign(overrideFields, Object.fromEntries(Object.entries(override).filter(([key]) => key !== 'guidPath')));
        }
      }
    }
    const node = Object.keys(overrideFields).length ? { ...sourceNode, ...overrideFields } : sourceNode;
    const instancePath = context.instancePath || [];
    const formaNodeId = stableImportedNodeId(sourceBundle.documentId, instancePath, id);
    const occurrenceKey = sourceOccurrenceKey(sourceBundle.documentId, instancePath, id);
    const parentFormaNodeId = context.parentFormaNodeId || null;
    const componentId = context.instanceScope ? cssId('fig-instance', `${context.instanceScope}:${id}`) : cssId('fig', id);
    const type = node.type;
    const variableModes = node.variableModeBySetMap ? normalizeVariableModes(node.variableModeBySetMap, id) : {};
    const stackLayout = normalizeFigStackLayout(node);
    if (!stackLayout && node.stackMode && !['NONE', 'UNKNOWN'].includes(String(node.stackMode).toUpperCase())) addDiagnostic({ severity: 'warning', code: 'LAYOUT_MODE_UNSUPPORTED', sourceNodeId: id, propertyPath: 'stackMode', reason: `Stack mode ${node.stackMode} does not have a Forma layout adapter yet.`, fallback: 'Source children and their saved coordinates remain available.' });
    const supported = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SYMBOL', 'RECTANGLE', 'ROUNDED_RECTANGLE', 'ELLIPSE', 'STAR', 'POLYGON', 'REGULAR_POLYGON', 'LINE', 'VECTOR', 'TEXT', 'BOOLEAN_OPERATION', 'SLICE']);
    if (!supported.has(type)) {
      unsupported.add(type || 'unknown');
      addDiagnostic({ severity: 'warning', code: 'NODE_TYPE_UNSUPPORTED', sourceNodeId: id, propertyPath: 'type', reason: `Node type ${type || 'unknown'} has no dedicated Forma renderer.`, fallback: 'Preserved as a basic editable layer.' });
    }
    const component = { type: type === 'TEXT' ? 'text' : 'default', name: safeName(node.name), resizable: true, formaNodeId, attributes: { id: componentId, 'data-figma-node-id': id, 'data-figma-node-type': type } };
    if (Object.keys(variableModes).length) component.formaVariableModes = variableModes;
    const partPath = context.partPath || [];
    component.formaPartKey = cssId('fig-part', JSON.stringify([sourceBundle.documentId, context.componentRootSourceId || '', [...partPath, id]]));
    const sourceTransform = node.transform || {};
    scene.nodes[formaNodeId] = {
      id: formaNodeId,
      source: { documentId: sourceBundle.documentId, nodeId: id, occurrencePath: [...instancePath] },
      kind: String(type || 'unknown').toLowerCase(),
      name: safeName(node.name),
      parentId: parentFormaNodeId,
      children: [],
      localTransform: [Number(sourceTransform.m00 ?? 1), Number(sourceTransform.m01 || 0), Number(sourceTransform.m10 || 0), Number(sourceTransform.m11 ?? 1), Number(sourceTransform.m02 || 0), Number(sourceTransform.m12 || 0)],
      size: { width: Number(node.size?.x || 0), height: Number(node.size?.y || 0) },
      visible: node.visible !== false,
      locked: node.locked === true,
      opacity: Number(node.opacity ?? 1),
      fills: Array.isArray(node.fillPaints) ? node.fillPaints : [],
      strokes: Array.isArray(node.strokePaints) ? node.strokePaints : [],
      paintBindings: [...paintVariableBindings('fill', node.fillPaints), ...paintVariableBindings('stroke', node.strokePaints)],
      ...(node.variableModeBySetMap ? { variableModes } : {}),
      ...(stackLayout ? { layout: { kind: 'auto-layout', ...stackLayout } } : {}),
      effects: Array.isArray(node.effects) ? node.effects : [],
      sourceRecordRef: `${sourceBundle.documentId}/${id}`,
    };
    scene.sourceOccurrences[occurrenceKey] = formaNodeId;
    if (Array.isArray(node.exportSettings) && node.exportSettings.length) {
      const exportSettings = node.exportSettings.filter(setting => setting && typeof setting === 'object').map(setting => ({
        suffix: String(setting.suffix || '').slice(0, 120),
        imageType: String(setting.imageType || '').toUpperCase(),
        constraint: setting.constraint && typeof setting.constraint === 'object' ? {
          type: String(setting.constraint.type || ''),
          value: Number.isFinite(Number(setting.constraint.value)) ? Number(setting.constraint.value) : null,
        } : null,
        contentsOnly: setting.contentsOnly !== false,
        useAbsoluteBounds: setting.useAbsoluteBounds === true,
        colorProfile: String(setting.colorProfile || ''),
        useBicubicSampler: setting.useBicubicSampler === true,
      })).filter(setting => ['PNG', 'JPG', 'JPEG', 'SVG', 'PDF'].includes(setting.imageType));
      if (exportSettings.length) component.attributes['data-figma-export-settings'] = JSON.stringify(exportSettings);
    }
    const style = { position: 'absolute' };
    const transform = node.transform || {};
    const x = Number(transform.m02 || 0) - (parentId === null ? rootOrigin.x : 0);
    const y = Number(transform.m12 || 0) - (parentId === null ? rootOrigin.y : 0);
    if (Number.isFinite(x)) style.left = `${x}px`;
    if (Number.isFinite(y)) style.top = `${y}px`;
    if (Number.isFinite(node.size?.x)) style.width = `${Math.max(0, node.size.x)}px`;
    if (Number.isFinite(node.size?.y)) style.height = `${Math.max(0, node.size.y)}px`;
    if (node.visible === false) style.display = 'none';
    if (Number.isFinite(node.opacity) && node.opacity < 1) style.opacity = String(Math.max(0, node.opacity));
    const linearIsIdentity = Math.abs(Number(transform.m00 ?? 1) - 1) < 1e-8
      && Math.abs(Number(transform.m11 ?? 1) - 1) < 1e-8
      && Math.abs(Number(transform.m01 || 0)) < 1e-8
      && Math.abs(Number(transform.m10 || 0)) < 1e-8;
    if (!linearIsIdentity) {
      style.transform = cssLinearMatrix(transform);
      style['transform-origin'] = '0 0';
    }
    if (['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SYMBOL'].includes(type) && node.frameMaskDisabled !== true) style.overflow = 'hidden';
    const radius = node.cornerRadius ?? node.rectangleTopLeftCornerRadius;
    if (type === 'ELLIPSE') style['border-radius'] = '50%';
    else if (node.rectangleCornerRadiiIndependent === true) {
      // CSS order is clockwise, starting from the top left.
      const corners = [node.rectangleTopLeftCornerRadius, node.rectangleTopRightCornerRadius, node.rectangleBottomRightCornerRadius, node.rectangleBottomLeftCornerRadius];
      style['border-radius'] = corners.map(value => `${Math.max(0, Number(value ?? radius) || 0)}px`).join(' ');
    } else if (Number.isFinite(radius) && radius > 0) style['border-radius'] = `${radius}px`;

    const imageFills = [];
    const hasImageFill = type !== 'TEXT' && (node.fillPaints || []).some(paint => paint?.type === 'IMAGE' && paint.visible !== false);
    const fill = hasImageFill ? null : paintCss(node.fillPaints, images, imageFills, resolvePaintVariable);
    if (hasImageFill) Object.assign(style, paintStackCss(node.fillPaints, images, imageFills, node.size, resolvePaintVariable) || {});
    if (fill?.color) style[type === 'TEXT' ? 'color' : 'background-color'] = fill.color;
    if (fill?.gradient) style['background-image'] = fill.gradient;
    if (fill?.image) {
      style['background-image'] = `url("${fill.image}")`;
      style['background-size'] = fill.mode === 'FIT' ? 'contain' : fill.mode === 'TILE' ? 'auto' : 'cover';
      style['background-position'] = 'center';
      style['background-repeat'] = fill.mode === 'TILE' ? 'repeat' : 'no-repeat';
    }
    if (fill?.opacity < 1) style['background-blend-mode'] = 'normal';
    const shadows = (node.effects || []).filter(effect => effect?.visible !== false && ['DROP_SHADOW', 'INNER_SHADOW'].includes(effect.type)).map(effect => `${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${Number(effect.offset?.x || 0)}px ${Number(effect.offset?.y || 0)}px ${Math.max(0, Number(effect.radius || 0))}px ${Number(effect.spread || 0)}px ${colorCss(effect.color) || 'rgba(0,0,0,.25)'}`);
    const strokePaints = (node.strokePaints || []).filter(paint => paint?.visible !== false && Number(paint?.opacity ?? 1) > 0);
    const stroke = ['VECTOR', 'BOOLEAN_OPERATION', 'REGULAR_POLYGON'].includes(type) ? null : paintCss(strokePaints, images, [], resolvePaintVariable);
    let vectorPaint = null;
    let paintOutset = 0;
    if (stroke?.color && Number(node.strokeWeight) > 0) {
      const weight = Math.max(0, Number(node.strokeWeight));
      const align = String(node.strokeAlign || 'CENTER').toUpperCase();
      if (align === 'CENTER') {
        vectorPaint = inlineCenteredStroke(node, strokePaints, component.formaPartKey);
        if (vectorPaint) {
          style['--forma-vector-stroke-color'] = stroke.color;
          style['--forma-vector-stroke-width'] = `${weight}px`;
          style['--forma-vector-stroke-radius'] = `${Math.max(0, Number(radius) || 0)}px`;
          paintOutset = weight / 2;
        } else if (['RECTANGLE', 'ROUNDED_RECTANGLE', 'ELLIPSE'].includes(type) && node.strokeGeometry?.length) {
          style.outline = `${weight}px solid ${stroke.color}`;
          style['outline-offset'] = `${-weight / 2}px`;
        } else style.border = `${weight}px solid ${stroke.color}`;
      }
      else {
        const inset = align === 'INSIDE' ? 'inset ' : '';
        shadows.unshift(`${inset}0 0 0 ${weight}px ${stroke.color}`);
      }
    }
    if (shadows.length) style['box-shadow'] = shadows.join(', ');
    const foregroundBlur = (node.effects || []).find(effect => effect?.visible !== false && effect.type === 'FOREGROUND_BLUR');
    const backgroundBlur = (node.effects || []).find(effect => effect?.visible !== false && effect.type === 'BACKGROUND_BLUR');
    if (foregroundBlur) style.filter = `blur(${Math.max(0, Number(foregroundBlur.radius || 0))}px)`;
    if (backgroundBlur) style['backdrop-filter'] = `blur(${Math.max(0, Number(backgroundBlur.radius || 0))}px)`;
    if (type === 'TEXT') {
      component.content = String(node.textData?.characters || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      Object.assign(style, figTextStyle(node));
    }
    let resolvedBoolean = false;
    if (type === 'VECTOR' || type === 'BOOLEAN_OPERATION' || type === 'REGULAR_POLYGON') {
      const paths = resolveVectorNodePaths(doc, node);
      if (type === 'BOOLEAN_OPERATION') vectorPaint = inlineBooleanPaint(paths, node, component.formaPartKey, style, resolvePaintVariable);
      const vector = vectorPaint ? null : svgForVector(paths, node, variableIdByAssetRef);
      if (scene.nodes[formaNodeId].paintBindings.some(binding => !binding.variableId)) addDiagnostic({ severity: 'warning', code: 'VARIABLE_VECTOR_PAINT_UNRESOLVED', sourceNodeId: id, propertyPath: 'vectorData.vectorNetworkBlob.paints', reason: 'A vector paint points to a variable that is not available to the current project.', fallback: 'The authored source color remains rendered and the full paint reference remains in scene metadata.' });
      if (vector || vectorPaint) {
        delete style['background-color'];
        delete style['background-image'];
        delete style['color'];
        if (type === 'BOOLEAN_OPERATION') {
          resolvedBoolean = true;
          if (vector) {
            style['background-image'] = `url("${vector.dataUrl}")`;
            style['background-size'] = '100% 100%';
            style['background-repeat'] = 'no-repeat';
            if (vector.template) component.formaVectorTemplate = { ...vector.template, target: 'background-image' };
          }
        } else {
          component.type = 'image';
          component.attributes.src = vector.dataUrl;
          component.attributes.alt = node.name || 'Vector';
          if (vector.template) component.formaVectorTemplate = vector.template;
        }
      } else if (type === 'BOOLEAN_OPERATION') {
        delete style['background-color'];
        delete style['background-image'];
        addDiagnostic({ severity: 'warning', code: 'BOOLEAN_GEOMETRY_UNSUPPORTED', sourceNodeId: id, propertyPath: 'fillGeometry', reason: 'The saved Boolean result has no usable solid-paint path.', fallback: 'The original operands are retained without synthesizing a rectangular result.' });
      }
    }
    if (imageFills.some(item => item.dataUrl)) {
      component.attributes['data-figma-image-fill'] = 'true';
    }
    const styleBeforeAutoLayout = { ...style };
    if (stackLayout) Object.assign(style, figStackStyle(stackLayout));
    importedBaseStyles.set(component, { ...style });
    if (context.parentStackLayout) Object.assign(style, figStackChildStyle(node, context.parentStackLayout));
    if (type === 'LINE' && style.position === 'relative' && stroke?.color && Number(node.strokeWeight) > 0 && node.size?.x > 0 && node.size?.y === 0 &&
        Math.abs(Number(transform.m00)) < 1e-6 && Math.abs(Number(transform.m11)) < 1e-6 &&
        Math.abs(Number(transform.m10) - 1) < 1e-6 && Math.abs(Number(transform.m01) + 1) < 1e-6) {
      // A quarter-turn divider occupies zero width in the Figma stack.
      const weight = Number(node.strokeWeight);
      delete style.transform;
      delete style['transform-origin'];
      delete style.border;
      style.width = `${weight}px`;
      style.height = `${node.size.x}px`;
      style['margin-right'] = `${-weight}px`;
      style['background-color'] = stroke.color;
      if (!shadows.length || (stroke && shadows.length === 1 && !node.effects?.length)) delete style['box-shadow'];
    }
    component.style = style;
    const explicitChildren = (resourceIndex.childrenByParent.get(id) || []).filter(child => child.phase !== 'REMOVED');
    let children = explicitChildren.map(child => makeNode(child, id, { x: 0, y: 0 }, { ...context, parentStackLayout: stackLayout, sourcePath: currentSourcePath, overridePath: currentOverridePath, partPath: [...partPath, id], parentFormaNodeId: formaNodeId })).filter(Boolean);
    if (resolvedBoolean) {
      for (const operand of children) {
        operand.attributes['data-forma-boolean-operand'] = 'true';
        operand.style.display = 'none';
      }
    }
    if (type === 'INSTANCE' && !explicitChildren.length && node.symbolData?.symbolID) {
      const originalMasterId = guidRefId(node.symbolData.symbolID);
      const masterId = guidRefId(node.overriddenSymbolID) || originalMasterId;
      const master = resourceIndex.symbolsById.get(masterId) || resourceIndex.nodesById.get(masterId);
      if (master && master.phase !== 'REMOVED' && masterId !== id && !context.instanceAncestry?.has(masterId)) {
        const instanceScope = context.instanceScope ? `${context.instanceScope}/${id}` : id;
        const instanceAncestry = new Set(context.instanceAncestry || []);
        instanceAncestry.add(masterId);
        const overrideScopes = [...(context.overrideScopes || [])];
        if (node.symbolData.symbolOverrides?.length) overrideScopes.push({ records: node.symbolData.symbolOverrides, rootSourceId: originalMasterId || masterId, basePath: currentOverridePath });
        const expandedMaster = makeNode(master, id, { x: 0, y: 0 }, {
          ...context,
          instanceScope,
          overrideScopes,
          instanceAncestry,
          instancePath: [...instancePath, id],
          sourcePath: currentSourcePath,
          overridePath: currentOverridePath,
          componentDefinitionRootId: masterId,
          componentRootSourceId: context.componentRootSourceId || (resourceIndex.componentSetsById.has(guidRefId(master.parentIndex?.guid)) ? guidRefId(master.parentIndex?.guid) : masterId),
          partPath: context.componentRootSourceId ? [...partPath, id] : [],
          parentStackLayout: null,
          parentFormaNodeId: formaNodeId,
        });
        if (expandedMaster) {
          for (const override of matchedOverrides) {
            if (guidRefId(override.overriddenSymbolID)) appliedSourceSwaps.add(override);
          }
          expandedMaster.attributes['data-forma-instance-source'] = id;
          const masterWidth = Number(master.size?.x || 0);
          const masterHeight = Number(master.size?.y || 0);
          const instanceWidth = Number(node.size?.x || masterWidth);
          const instanceHeight = Number(node.size?.y || masterHeight);
          const scaleX = masterWidth > 0 ? instanceWidth / masterWidth : 1;
          const scaleY = masterHeight > 0 ? instanceHeight / masterHeight : 1;
          // The master is positioned out of flow, so a hugging outer instance
          // cannot use it to determine its intrinsic size in CSS.
          if (style.width === 'max-content' && instanceWidth > 0) style.width = `${instanceWidth}px`;
          if (style.height === 'max-content' && instanceHeight > 0) style.height = `${instanceHeight}px`;
          expandedMaster.style.left = '0px';
          expandedMaster.style.top = '0px';
          for (const property of ['background-color', 'background-image', 'box-shadow']) {
            if (style[property] && style[property] === expandedMaster.style[property]) delete expandedMaster.style[property];
          }
          if (Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001) {
            const masterTransform = master.transform || {};
            expandedMaster.style.transform = cssLinearMatrix(masterTransform, scaleX, scaleY);
            expandedMaster.style['transform-origin'] = 'top left';
          }
          children = [expandedMaster];
        }
      } else if (!master || master.phase === 'REMOVED') {
        addDiagnostic({ severity: 'warning', code: 'COMPONENT_MASTER_MISSING', sourceNodeId: id, propertyPath: 'symbolData.symbolID', reason: `The instance source ${masterId || 'is not identified'} could not be resolved.`, fallback: 'The instance remains as a detached editable layer.' });
      } else if (context.instanceAncestry?.has(masterId)) {
        addDiagnostic({ severity: 'warning', code: 'COMPONENT_CYCLE', sourceNodeId: id, propertyPath: 'symbolData.symbolID', reason: `Expanding the source would re-enter component ${masterId}.`, fallback: 'Expansion stops at this instance to prevent an infinite loop.' });
      }
    }
    const visibleChildren = children.filter(child => child.style.display !== 'none');
    if (vectorPaint || visibleChildren.some(child => vectorPaintByComponent.has(child))) {
      preserveVectorSubpixelPosition(style, x, y);
    }
    if (style.overflow === 'hidden' && !stackLayout && !fill && !hasImageFill && !stroke &&
        visibleChildren.length && visibleChildren.every(child => vectorPaintByComponent.has(child))) {
      const outset = Math.max(...visibleChildren.map(child => vectorPaintByComponent.get(child)));
      if (outset > 0) {
        // Centered strokes extend around an icon's geometry. Allow the painted
        // edge while keeping content farther outside this frame clipped.
        style.overflow = 'clip';
        style['overflow-clip-margin'] = `${Math.ceil(outset)}px`;
      }
    }
    if (vectorPaint) vectorPaintByComponent.set(component, paintOutset);
    if (children.length || vectorPaint) component.components = vectorPaint ? [vectorPaint, ...children] : children;
    scene.nodes[formaNodeId].children = children.map(child => child.formaNodeId).filter(Boolean);
    if (stackLayout) {
      nativeLayoutMetadata[formaNodeId] = {
        ...(nativeLayoutMetadata[formaNodeId] || {}),
        autoLayout: {
          source: 'figma',
          options: stackLayout,
          before: { style: styleBeforeAutoLayout, children: children.map(child => ({ id: child.formaNodeId, style: importedBaseStyles.get(child) || child.style || {} })) },
        },
      };
    }
    if (!context.resourceOnly) converted++;
    return component;
  };

  const toComponentData = component => ({
    type: component.type || 'default',
    tagName: component.tagName || 'div',
    name: component.name || 'Component',
    formaPartKey: component.formaPartKey,
    attributes: Object.fromEntries(Object.entries(component.attributes || {}).filter(([key]) => key !== 'id' && key !== 'data-forma-instance-source')),
    classes: [],
    ...(component.layerable === false ? { layerable: false, selectable: false, hoverable: false, draggable: false, droppable: false, copyable: false } : {}),
    style: { ...(component.style || {}) },
    content: component.content || '',
    formaBindings: {},
    formaVariableModes: { ...(component.formaVariableModes || {}) },
    ...(component.formaVectorTemplate ? { formaVectorTemplate: component.formaVectorTemplate } : {}),
    components: (component.components || []).map(toComponentData),
  });
  const nativeComponentDefinitionsBySource = new Map();
  const sourceComponentBySymbol = new Map();
  for (const [sourceNodeId, symbol] of resourceIndex.symbolsById) {
    const sourceDefinition = makeNode(symbol, null, { x: 0, y: 0 }, {
      resourceOnly: true,
      instancePath: ['component-definition', sourceNodeId],
      componentRootSourceId: resourceIndex.componentSetsById.has(guidRefId(symbol.parentIndex?.guid)) ? guidRefId(symbol.parentIndex?.guid) : sourceNodeId,
      componentDefinitionRootId: sourceNodeId,
      sourcePath: [],
      overridePath: [],
      partPath: [],
    });
    if (!sourceDefinition) continue;
    const resourceId = componentResourceId(sourceNodeId);
    const parentSetId = guidRefId(symbol.parentIndex?.guid);
    const definitionData = toComponentData(sourceDefinition);
    nativeComponentDefinitionsBySource.set(sourceNodeId, {
      id: resourceId,
      name: safeName(symbol.name),
      createdAt: '1970-01-01T00:00:00.000Z',
      mainNodeId: sourceDefinition.formaNodeId,
      data: definitionData,
      variants: { Default: { data: definitionData } },
      defaultVariant: 'Default',
      source: { documentId: sourceBundle.documentId, nodeId: sourceNodeId, key: symbol.key || null, version: symbol.version || null },
      sourceComponentSetId: resourceIndex.componentSetsById.has(parentSetId) ? componentResourceId(`set:${parentSetId}`) : null,
      sourceVariantAssignments: Array.isArray(symbol.variantPropSpecs) ? symbol.variantPropSpecs.map(spec => ({ propertyId: guidRefId(spec.propDefId) || null, value: spec.value ?? null })) : [],
    });
  }
  const nativeComponentDefinitions = [...nativeComponentDefinitionsBySource.values()].filter(definition => !definition.sourceComponentSetId);
  for (const [sourceNodeId, definition] of nativeComponentDefinitionsBySource) {
    if (!definition.sourceComponentSetId) sourceComponentBySymbol.set(sourceNodeId, {
      definitionId: definition.id, variant: 'Default', variantProperties: definition.sourceVariantAssignments,
    });
  }
  for (const [setId, setNode] of resourceIndex.componentSetsById) {
    const memberNodes = (resourceIndex.childrenByParent.get(setId) || []).filter(node => node.type === 'SYMBOL' && nativeComponentDefinitionsBySource.has(nodeId(node)));
    if (!memberNodes.length) continue;
    const propDefs = Array.isArray(setNode.componentPropDefs) ? setNode.componentPropDefs : [];
    const propNames = new Map(propDefs.map(definition => [guidRefId(definition.id), safeName(definition.name || guidRefId(definition.id))]));
    const variants = {};
    const variantSourceIds = {};
    const orderedVariantNames = [];
    for (const [variantIndex, symbol] of memberNodes.entries()) {
      const source = nativeComponentDefinitionsBySource.get(nodeId(symbol));
      const assignments = source.sourceVariantAssignments.map(item => ({
        ...item,
        name: propNames.get(item.propertyId) || item.propertyId || 'Variant',
      }));
      const rawName = assignments.length
        ? assignments.map(item => `${item.name}=${String(item.value ?? '')}`).join(', ')
        : safeName(symbol.name || `Variant ${variantIndex + 1}`);
      const variantName = rawName in variants ? `${rawName} [${nodeId(symbol)}]` : rawName;
      variants[variantName] = { data: source.data, sourceNodeId: nodeId(symbol), properties: source.sourceVariantAssignments };
      variantSourceIds[variantName] = nodeId(symbol);
      sourceComponentBySymbol.set(nodeId(symbol), {
        definitionId: componentResourceId(`set:${setId}`),
        variant: variantName,
        variantProperties: source.sourceVariantAssignments,
      });
      orderedVariantNames.push(variantName);
    }
    let defaultVariant = orderedVariantNames.find(name => Object.values(variants[name].properties || {}).some(item => String(item.value).toLowerCase() === 'default'));
    if (!defaultVariant) {
      const initial = new Map(propDefs.map(definition => [guidRefId(definition.id), definition.initialValue?.textValue?.characters ?? definition.initialValue?.value ?? null]));
      defaultVariant = orderedVariantNames.find(name => variants[name].properties?.length && variants[name].properties.every(item => initial.get(item.propertyId) != null && String(initial.get(item.propertyId)) === String(item.value)));
    }
    if (!defaultVariant) {
      defaultVariant = orderedVariantNames[0];
      addDiagnostic({ severity: 'warning', code: 'VARIANT_DEFAULT_UNSPECIFIED', sourceNodeId: setId, propertyPath: 'componentPropDefs.initialValue', reason: 'Figma did not identify a default variant value; the first source-ordered variant is used for Forma insertion.', fallback: `Selected ${defaultVariant} deterministically.` });
    }
    const defaultSource = nativeComponentDefinitionsBySource.get(variantSourceIds[defaultVariant]);
    const resourceId = componentResourceId(`set:${setId}`);
    nativeComponentDefinitions.push({
      id: resourceId,
      name: safeName(setNode.name),
      createdAt: '1970-01-01T00:00:00.000Z',
      mainNodeId: defaultSource.mainNodeId,
      data: defaultSource.data,
      variants,
      defaultVariant,
      source: { documentId: sourceBundle.documentId, nodeId: setId, version: setNode.version || null },
      sourceProperties: propDefs,
      sourceVariantOrder: orderedVariantNames,
      sourceVariantNodeIds: variantSourceIds,
    });
  }

  const importedPages = pages.map((page, index) => {
    const pageId = nodeId(page);
    const pageChildren = (resourceIndex.childrenByParent.get(pageId) || []).filter(node => node.phase !== 'REMOVED');
    const render = index === 0 ? doc.meta?.client_meta?.render_coordinates || {} : {};
    const bounds = pageChildren.map(transformedNodeBounds);
    const contentLeft = bounds.length ? Math.min(...bounds.map(bound => bound.left)) : 0;
    const contentTop = bounds.length ? Math.min(...bounds.map(bound => bound.top)) : 0;
    const contentRight = bounds.length ? Math.max(...bounds.map(bound => bound.right)) : 1440;
    const contentBottom = bounds.length ? Math.max(...bounds.map(bound => bound.bottom)) : 1100;
    const hasRenderOrigin = Number.isFinite(render.x) && Number.isFinite(render.y);
    // Figma's render coordinates describe the saved viewport, not guaranteed
    // page bounds. Union them with the top-level node bounds so large frames
    // are not clipped by the imported page's overflow boundary.
    const origin = {
      x: Math.min(hasRenderOrigin ? render.x : contentLeft, contentLeft),
      y: Math.min(hasRenderOrigin ? render.y : contentTop, contentTop),
    };
    const renderRight = hasRenderOrigin && Number.isFinite(render.width) && render.width > 0
      ? render.x + render.width : contentRight;
    const renderBottom = hasRenderOrigin && Number.isFinite(render.height) && render.height > 0
      ? render.y + render.height : contentBottom;
    const width = Math.max(1, Math.max(renderRight, contentRight) - origin.x);
    const height = Math.max(1, Math.max(renderBottom, contentBottom) - origin.y);
    const wrapperId = cssId('fig-page', pageId);
    const pageFormaNodeId = stableImportedNodeId(sourceBundle.documentId, [], pageId);
    const pageOccurrenceKey = sourceOccurrenceKey(sourceBundle.documentId, [], pageId);
    const children = pageChildren.map(node => makeNode(node, null, origin, { sourcePath: [], overridePath: [], parentFormaNodeId: pageFormaNodeId })).filter(Boolean);
    scene.nodes[pageFormaNodeId] = {
      id: pageFormaNodeId,
      source: { documentId: sourceBundle.documentId, nodeId: pageId, occurrencePath: [] },
      kind: 'page', name: safeName(page.name || `Page ${index + 1}`), parentId: null,
      children: children.map(child => child.formaNodeId).filter(Boolean),
      localTransform: [1, 0, 0, 1, 0, 0], size: { width, height },
      visible: page.visible !== false, locked: page.locked === true, opacity: 1,
      fills: [], strokes: [], effects: [], sourceRecordRef: `${sourceBundle.documentId}/${pageId}`,
    };
    scene.sourceOccurrences[pageOccurrenceKey] = pageFormaNodeId;
    scene.pages.push(pageFormaNodeId);
    const bg = doc.meta?.client_meta?.background_color;
    const pageStyle = { width: `${width}px`, height: `${height}px`, position: 'relative', overflow: 'hidden' };
    if (bg) pageStyle['background-color'] = colorCss(bg);
    const component = { type: 'wrapper', formaNodeId: pageFormaNodeId, attributes: { id: wrapperId }, style: pageStyle, components: children };
    return { name: safeName(page.name || `Page ${index + 1}`), frames: [{ component }] };
  });

  const nativeDefinitionsById = new Map(nativeComponentDefinitions.map(definition => [definition.id, definition]));
  const walkImported = (component, visit) => {
    visit(component);
    for (const child of component.components || []) walkImported(child, visit);
  };
  for (const page of importedPages) for (const frame of page.frames || []) walkImported(frame.component, component => {
    const sourceInstanceId = component.attributes?.['data-figma-node-id'];
    const sourceNode = sourceInstanceId ? resourceIndex.nodesById.get(sourceInstanceId) : null;
    if (sourceNode?.type !== 'INSTANCE' || !sourceNode.symbolData?.symbolID) return;
    const sourceComponentNodeId = guidRefId(sourceNode.symbolData.symbolID);
    const resolved = sourceComponentBySymbol.get(sourceComponentNodeId);
    const definition = resolved && nativeDefinitionsById.get(resolved.definitionId);
    const renderedMaster = (component.components || []).find(child => child.attributes?.['data-forma-instance-source'] === sourceInstanceId);
    if (!definition || !renderedMaster) return;
    const base = definition.variants?.[resolved.variant]?.data || definition.data;
    const current = toComponentData(renderedMaster);
    component.formaInstance = {
      definitionId: definition.id,
      variant: resolved.variant,
      baseline: base,
      overrides: collectOverrides(current, base),
      renderedPartKey: renderedMaster.formaPartKey,
      sourceInstanceNodeId: sourceInstanceId,
    };
  });

  for (const sceneNode of Object.values(scene.nodes)) {
    const sourceNode = resourceIndex.nodesById.get(sceneNode.source.nodeId);
    if (sourceNode?.type !== 'INSTANCE' || !sourceNode.symbolData?.symbolID) continue;
    const sourceComponentNodeId = guidRefId(sourceNode.symbolData.symbolID);
    const resolved = sourceComponentBySymbol.get(sourceComponentNodeId);
    if (!resolved) {
      addDiagnostic({ severity: 'warning', code: 'INSTANCE_DEFINITION_UNRESOLVED', sourceNodeId: sceneNode.source.nodeId, propertyPath: 'symbolData.symbolID', reason: `No Forma component definition was produced for source component ${sourceComponentNodeId || 'unknown'}.`, fallback: 'The expanded editable tree remains available and source metadata is preserved.' });
      continue;
    }
    const master = resourceIndex.symbolsById.get(sourceComponentNodeId);
    const scaleX = Number(master?.size?.x) > 0 ? Number(sourceNode.size?.x || master.size.x) / Number(master.size.x) : 1;
    const scaleY = Number(master?.size?.y) > 0 ? Number(sourceNode.size?.y || master.size.y) / Number(master.size.y) : 1;
    sceneNode.instance = {
      definitionId: resolved.definitionId,
      sourceComponentNodeId,
      variant: resolved.variant,
      variantProperties: resolved.variantProperties,
      ...(Math.abs(scaleX - scaleY) < 0.0001 && Math.abs(scaleX - 1) > 0.0001 ? { uniformScale: scaleX } : {}),
      overrides: (sourceNode.symbolData.symbolOverrides || []).map(override => ({
        sourceGuidPath: (override.guidPath?.guids || []).map(guidRefId).filter(Boolean),
        fields: Object.fromEntries(Object.entries(override).filter(([key]) => key !== 'guidPath')),
        replacementComponentId: guidRefId(override.overriddenSymbolID),
      })),
    };
  }
  const supportedOverrideFields = new Set([
    'guidPath', 'overriddenSymbolID', 'size', 'name', 'fillPaints', 'strokePaints', 'textData', 'variableModeBySetMap',
    'stackMode', 'stackSpacing', 'stackCounterSpacing', 'stackHorizontalPadding', 'stackVerticalPadding',
    'stackPaddingTop', 'stackPaddingRight', 'stackPaddingBottom', 'stackPaddingLeft', 'stackPrimarySizing',
    'stackCounterSizing', 'stackPrimaryAlignItems', 'stackCounterAlignItems', 'stackWrap', 'stackChildAlignSelf', 'stackPositioning',
  ]);
  let totalSourceOverrides = 0;
  let matchedSourceOverrides = 0;
  let totalSourceComponentSwaps = 0;
  let appliedSourceComponentSwaps = 0;
  for (const [sourceNodeId, sourceNode] of resourceIndex.nodesById) {
    if (sourceNode.type !== 'INSTANCE') continue;
    for (const [index, override] of (sourceNode.symbolData?.symbolOverrides || []).entries()) {
      totalSourceOverrides++;
      if (appliedSourceOverrides.has(override)) matchedSourceOverrides++;
      if (guidRefId(override.overriddenSymbolID)) {
        totalSourceComponentSwaps++;
        if (appliedSourceSwaps.has(override)) appliedSourceComponentSwaps++;
      }
      if (!appliedSourceOverrides.has(override)) addDiagnostic({
        severity: 'warning', code: 'OVERRIDE_PATH_UNRESOLVED', sourceNodeId,
        propertyPath: `symbolData.symbolOverrides[${index}].guidPath`,
        reason: 'No imported occurrence matched the complete source GUID path for this override.',
        fallback: 'The original override record remains in the source instance metadata.',
      });
      if (guidRefId(override.overriddenSymbolID) && !appliedSourceSwaps.has(override)) addDiagnostic({
        severity: 'warning', code: 'OVERRIDE_COMPONENT_SWAP_UNAPPLIED', sourceNodeId,
        propertyPath: `symbolData.symbolOverrides[${index}].overriddenSymbolID`,
        reason: 'The component-swap override did not resolve to an expanded replacement component at its GUID path.',
        fallback: 'The original swap target remains available in the imported instance metadata.',
      });
      for (const field of Object.keys(override).filter(key => !supportedOverrideFields.has(key))) addDiagnostic({
        severity: 'warning', code: 'OVERRIDE_PROPERTY_UNSUPPORTED', sourceNodeId,
        propertyPath: `symbolData.symbolOverrides[${index}].${field}`,
        reason: `Override property ${field} is preserved but has no complete renderer mapping yet.`,
        fallback: 'The source value remains available in the imported instance metadata.',
      });
    }
  }
  const importedPrototype = importFigPrototypeInteractions({
    resourceIndex, scene, components: nativeComponentDefinitions, sourceComponentBySymbol, variableIdByAssetRef, addDiagnostic,
  });
  sourceBundle.sourceDocument.resourceManifest.prototypes = importedPrototype.summary;
  sourceBundle.sourceDocument.resourceManifest.overrides = {
    total: totalSourceOverrides,
    matchedByGuidPath: matchedSourceOverrides,
    componentSwaps: totalSourceComponentSwaps,
    appliedComponentSwaps: appliedSourceComponentSwaps,
    variableModeEntries: [...resourceIndex.nodesById.values()].flatMap(sourceNode => sourceNode.symbolData?.symbolOverrides || []).flatMap(override => override.variableModeBySetMap?.entries || []).length,
    appliedVariableModeEntries: [...resourceIndex.nodesById.values()].flatMap(sourceNode => sourceNode.symbolData?.symbolOverrides || []).flatMap(override => override.variableModeBySetMap?.entries || []).filter(entry => appliedSourceVariableModes.has(entry)).length,
  };

  return {
    format: 'forma-project', schemaVersion: 3, name: safeName(doc.meta?.file_name || filename.replace(/\.fig$/i, '')),
    editor: { grapesjs: { pages: importedPages, styles: [], assets: [] } },
    forma: { components: nativeComponentDefinitions, variables: nativeVariableState, comments: {}, prototype: importedPrototype.prototype, layoutMetadata: nativeLayoutMetadata, scene, importSources: [sourceBundle.sourceDocument] },
    assets: [...sourceBundle.imageAssets, ...(sourceBundle.sourceAsset ? [sourceBundle.sourceAsset] : [])],
    importSummary: { nodes: converted, renderedOccurrences: converted, sourceRecords: sourceBundle.sourceRecords?.records || 0, pages: importedPages.length, images: images.size, unsupportedTypes: [...unsupported].sort(), diagnostics, figVersion: doc.header.version },
  };
}
