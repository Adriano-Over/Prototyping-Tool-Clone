import { nodeId } from 'openfig-core';

const guidId = value => value?.guid ? nodeId(value) : value?.sessionID != null && value?.localID != null ? `${value.sessionID}:${value.localID}` : null;
const refKey = ref => ref?.assetRef?.key ? `${ref.assetRef.key}:${ref.assetRef.version || ''}` : null;
const hashKey = value => value instanceof Uint8Array || ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex').toLowerCase() : typeof value === 'string' ? value.replace(/\.[^.]+$/, '').toLowerCase() : '';

export function buildFigResourceIndex(doc) {
  const diagnostics = [];
  const nodesById = new Map(), nodesByOverrideKey = new Map(), sourceOrdinal = new Map(), childrenByParent = new Map();
  const symbolsById = new Map(), symbolsByKey = new Map(), componentSetsById = new Map();
  const variableSetsById = new Map(), variableSetsByAssetRef = new Map();
  const variablesById = new Map(), variablesByAssetRef = new Map();
  const stylesById = new Map(), stylesByAssetRef = new Map(), styleReferences = new Map();
  const imagesByHash = new Map(), blobsByIndex = new Map();
  const addDiagnostic = item => diagnostics.push(item);

  for (const [ordinal, node] of (doc.nodes || []).entries()) {
    const id = nodeId(node);
    if (!id) {
      addDiagnostic({ severity: 'error', code: 'SOURCE_NODE_ID_MISSING', propertyPath: `nodes[${ordinal}].guid`, reason: 'A decoded source node has no stable Figma GUID.' });
      continue;
    }
    if (nodesById.has(id)) {
      addDiagnostic({ severity: 'error', code: 'SOURCE_NODE_ID_DUPLICATE', sourceNodeId: id, propertyPath: 'guid', reason: 'More than one source record uses the same Figma GUID.' });
      continue;
    }
    nodesById.set(id, node);
    sourceOrdinal.set(id, ordinal);
    const overrideKey = guidId(node.overrideKey);
    if (overrideKey) {
      if (!nodesByOverrideKey.has(overrideKey)) nodesByOverrideKey.set(overrideKey, []);
      nodesByOverrideKey.get(overrideKey).push(node);
    }
    const parentId = guidId(node.parentIndex?.guid);
    if (parentId) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(node);
    }
    if (node.type === 'SYMBOL') {
      symbolsById.set(id, node);
      for (const key of [node.componentKey, node.key, node.sourceLibraryKey].filter(Boolean)) {
        if (!symbolsByKey.has(String(key))) symbolsByKey.set(String(key), []);
        symbolsByKey.get(String(key)).push(node);
      }
    }
    if (node.type === 'FRAME' && node.isStateGroup === true) componentSetsById.set(id, node);
    if (node.type === 'VARIABLE_SET') {
      variableSetsById.set(id, node);
      const key = node.key && node.version ? `${node.key}:${node.version}` : null;
      if (key) variableSetsByAssetRef.set(key, node);
    }
    if (node.type === 'VARIABLE') {
      variablesById.set(id, node);
      const key = node.key && node.version ? `${node.key}:${node.version}` : null;
      if (key) variablesByAssetRef.set(key, node);
    }
    if (node.styleType && node.key && node.version) stylesByAssetRef.set(`${node.key}:${node.version}`, node);
    for (const field of ['styleIdForStrokeFill', 'styleIdForEffect', 'styleIdForGrid']) {
      if (node[field] == null) continue;
      const value = refKey(node[field]) || String(node[field]);
      if (!styleReferences.has(value)) styleReferences.set(value, []);
      styleReferences.get(value).push({ sourceNodeId: id, field, assetRef: node[field]?.assetRef || null });
    }
    for (const key of ['styleID', 'styleId']) if (node[key] != null) stylesById.set(String(node[key]), node);
  }

  // The decoder's child map is authoritative for membership, but it follows
  // node-change order. Figma's parentIndex.position stores the layer order.
  // Compare these fractional keys by code-unit order (locale/numeric collation
  // changes punctuation and can put layers in the wrong order).
  for (const [parentId, children] of doc.childrenMap || []) {
    const indexed = children.map(child => nodesById.get(nodeId(child))).filter(Boolean);
    if (indexed.length) childrenByParent.set(String(parentId), indexed);
  }
  // Keep any parent-linked records the decoder did not include in childrenMap.
  for (const [parentId, children] of childrenByParent) {
    const seen = new Set(children.map(nodeId));
    const missing = [...nodesById.values()].filter(node => guidId(node.parentIndex?.guid) === parentId && !seen.has(nodeId(node)));
    if (missing.length) children.push(...missing.sort((a, b) => sourceOrdinal.get(nodeId(a)) - sourceOrdinal.get(nodeId(b))));
    const sourceOrder = new Map(children.map((node, index) => [nodeId(node), index]));
    const positions = children.map(node => node.parentIndex?.position).filter(position => position != null).map(String);
    if (positions.length !== children.length) addDiagnostic({ severity: 'warning', code: 'SIBLING_POSITION_MISSING', sourceNodeId: parentId, propertyPath: 'children.parentIndex.position', reason: 'One or more siblings have no Figma position key; their decoder order is retained around positioned siblings.', fallback: 'The original child records and order remain in the source archive.' });
    if (new Set(positions).size !== positions.length) addDiagnostic({ severity: 'warning', code: 'SIBLING_POSITION_DUPLICATE', sourceNodeId: parentId, propertyPath: 'children.parentIndex.position', reason: 'Two or more siblings share a Figma position key; decoder order breaks the tie.', fallback: 'The source order is retained for equal keys.' });
    if (positions.length === children.length) children.sort((a, b) => {
      const left = String(a.parentIndex.position), right = String(b.parentIndex.position);
      return left < right ? -1 : left > right ? 1 : sourceOrder.get(nodeId(a)) - sourceOrder.get(nodeId(b));
    });
  }
  for (const [hash, bytes] of (doc.images || new Map())) imagesByHash.set(hashKey(hash), bytes);
  for (const [index, blob] of (doc.message?.blobs || []).entries()) blobsByIndex.set(index, blob);

  for (const [id, node] of nodesById) {
    const parentId = guidId(node.parentIndex?.guid);
    if (parentId && !nodesById.has(parentId)) addDiagnostic({ severity: 'warning', code: 'PARENT_REFERENCE_UNRESOLVED', sourceNodeId: id, propertyPath: 'parentIndex.guid', reason: `Parent ${parentId} does not exist in the decoded node index.`, fallback: 'The node remains in source records and is imported detached.' });
    if (node.type === 'INSTANCE' && node.symbolData?.symbolID) {
      const symbolId = guidId(node.symbolData.symbolID);
      if (!symbolsById.has(symbolId)) addDiagnostic({ severity: 'warning', code: 'COMPONENT_SOURCE_UNRESOLVED', sourceNodeId: id, propertyPath: 'symbolData.symbolID', reason: `Component source ${symbolId || 'is invalid'} does not resolve to a SYMBOL record.`, fallback: 'The instance remains detached and its source data is retained.' });
    }
    if (node.type === 'INSTANCE') for (const [index, override] of (node.symbolData?.symbolOverrides || []).entries()) {
      for (const [pathIndex, pathGuid] of (override.guidPath?.guids || []).entries()) {
        const pathId = guidId(pathGuid);
        if (pathId && !nodesById.has(pathId) && !nodesByOverrideKey.has(pathId)) addDiagnostic({ severity: 'warning', code: 'OVERRIDE_GUID_UNRESOLVED', sourceNodeId: id, propertyPath: `symbolData.symbolOverrides[${index}].guidPath.guids[${pathIndex}]`, reason: `Override path GUID ${pathId} does not resolve by source ID or overrideKey.`, fallback: 'The complete original GUID path remains in source records.' });
      }
      const replacementId = guidId(override.overriddenSymbolID);
      if (replacementId && !symbolsById.has(replacementId)) addDiagnostic({ severity: 'warning', code: 'OVERRIDE_COMPONENT_SWAP_UNRESOLVED', sourceNodeId: id, propertyPath: `symbolData.symbolOverrides[${index}].overriddenSymbolID`, reason: `Replacement component ${replacementId} does not resolve to an indexed SYMBOL.`, fallback: 'The original replacement reference remains in source records.' });
    }
    if (node.type === 'VARIABLE' && node.variableSetID?.assetRef) {
      const key = refKey(node.variableSetID);
      const target = variableSetsByAssetRef.get(key);
      if (!target) addDiagnostic({ severity: 'warning', code: 'VARIABLE_SET_REFERENCE_UNRESOLVED', sourceNodeId: id, propertyPath: 'variableSetID.assetRef', reason: `Variable set reference ${key} does not resolve.`, fallback: 'The variable record is retained but cannot be assigned to a collection.' });
    }
    for (const field of ['styleIdForStrokeFill', 'styleIdForEffect', 'styleIdForGrid']) {
      const ref = node[field];
      if (ref?.assetRef && !stylesByAssetRef.has(refKey(ref))) addDiagnostic({ severity: 'warning', code: 'STYLE_REFERENCE_UNRESOLVED', sourceNodeId: id, propertyPath: field, reason: `Style reference ${refKey(ref)} does not resolve to an imported style definition.`, fallback: 'The original style reference remains in the preserved source record.' });
    }
    if (node.vectorData?.vectorNetworkBlob != null) {
      const blobIndex = Number(node.vectorData.vectorNetworkBlob);
      if (!Number.isInteger(blobIndex) || !blobsByIndex.has(blobIndex)) addDiagnostic({ severity: 'warning', code: 'VECTOR_BLOB_UNRESOLVED', sourceNodeId: id, propertyPath: 'vectorData.vectorNetworkBlob', reason: `Vector blob index ${node.vectorData.vectorNetworkBlob} does not resolve.`, fallback: 'The source vector data is retained; vector geometry may not render.' });
    }
    const inspectPaint = (paint, propertyPath) => {
      if (paint?.type === 'IMAGE') {
        const imageHash = hashKey(paint.image?.hash || paint.imageThumbnail?.hash);
        if (imageHash && !imagesByHash.has(imageHash)) addDiagnostic({ severity: 'warning', code: 'IMAGE_REFERENCE_UNRESOLVED', sourceNodeId: id, propertyPath, reason: `Image hash ${imageHash} is absent from the decoded image table.`, fallback: 'The paint is retained without an image preview.' });
      }
      const refs = [...(paint?.colorVar ? [{ ref: paint.colorVar, path: `${propertyPath}.colorVar` }] : []), ...(paint?.stopsVar || []).flatMap((stop, index) => stop?.colorVar ? [{ ref: stop.colorVar, path: `${propertyPath}.stopsVar[${index}].colorVar` }] : [])];
      for (const { ref, path } of refs) {
        const alias = ref?.value?.alias;
        if (ref?.dataType === 'ALIAS' && alias?.assetRef && !variablesByAssetRef.has(refKey(alias))) addDiagnostic({ severity: 'warning', code: 'VARIABLE_ALIAS_UNRESOLVED', sourceNodeId: id, propertyPath: path, reason: `Variable alias ${refKey(alias)} does not resolve to a source variable.`, fallback: 'The authored literal color remains available as the paint fallback.' });
      }
    };
    (node.fillPaints || []).forEach((paint, index) => inspectPaint(paint, `fillPaints[${index}]`));
    (node.strokePaints || []).forEach((paint, index) => inspectPaint(paint, `strokePaints[${index}]`));
  }

  for (const [id, node] of nodesById) {
    let current = id;
    const path = new Set();
    while (current) {
      if (path.has(current)) {
        addDiagnostic({ severity: 'error', code: 'PARENT_CYCLE', sourceNodeId: id, propertyPath: 'parentIndex.guid', reason: `Parent references contain a cycle through ${current}.` });
        break;
      }
      path.add(current);
      current = guidId(nodesById.get(current)?.parentIndex?.guid);
    }
  }

  return {
    nodesById, nodesByOverrideKey, sourceOrdinal, childrenByParent, symbolsById, symbolsByKey, componentSetsById,
    variableSetsById, variableSetsByAssetRef, variablesById, variablesByAssetRef,
    stylesById, stylesByAssetRef, styleReferences, imagesByHash, blobsByIndex, diagnostics,
  };
}

export function figResourceSummary(index) {
  return {
    nodes: index.nodesById.size,
    overrideKeys: index.nodesByOverrideKey.size,
    symbols: index.symbolsById.size,
    componentSets: index.componentSetsById.size,
    variableSets: index.variableSetsById.size,
    variables: index.variablesById.size,
    styles: index.stylesByAssetRef.size,
    stylesReferenced: [...index.styleReferences.values()].reduce((sum, refs) => sum + refs.length, 0),
    images: index.imagesByHash.size,
    blobs: index.blobsByIndex.size,
    diagnostics: index.diagnostics.length,
  };
}

export function figResourceManifest(index) {
  const pageNodes = [...index.nodesById.values()].filter(node => node.type === 'CANVAS' && node.phase !== 'REMOVED');
  return {
    counts: figResourceSummary(index),
    pages: {
      visible: pageNodes.filter(node => node.internalOnly !== true).map(nodeId),
      internal: pageNodes.filter(node => node.internalOnly === true).map(nodeId),
    },
    sourceIds: {
      nodes: [...index.nodesById.keys()],
      symbols: [...index.symbolsById.keys()],
      componentSets: [...index.componentSetsById.keys()],
      variableSets: [...index.variableSetsById.keys()],
      variables: [...index.variablesById.keys()],
      styles: [...index.stylesByAssetRef.keys()],
    },
  };
}
