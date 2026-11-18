const sourceId = value => value?.guid
  ? `${value.guid.sessionID}:${value.guid.localID}`
  : value?.sessionID != null && value?.localID != null
    ? `${value.sessionID}:${value.localID}`
    : null;

const assetRef = value => value?.assetRef?.key
  ? { key: String(value.assetRef.key), version: String(value.assetRef.version || '') }
  : null;

const stableId = (kind, documentId, sourceNodeId) => `fig-${kind}-${Buffer.from(JSON.stringify([documentId, sourceNodeId])).toString('base64url')}`;

function normalizeColor(value) {
  const color = value?.colorValue;
  if (!color || !['r', 'g', 'b'].every(key => Number.isFinite(Number(color[key])))) return null;
  return [Number(color.r), Number(color.g), Number(color.b), color.a == null ? 1 : Number(color.a)];
}

function normalizeValue(variable, entry, idByAssetRef) {
  const data = entry?.variableData;
  const raw = data?.value;
  const type = String(data?.resolvedDataType || data?.dataType || variable.variableResolvedType || '').toUpperCase();
  if (type === 'ALIAS' || raw?.alias?.assetRef) {
    const ref = assetRef(raw?.alias);
    const variableId = ref ? idByAssetRef.get(`${ref.key}:${ref.version}`) || null : null;
    return { value: { kind: 'alias', variableId, sourceRef: ref, unresolved: !variableId }, sourceType: 'ALIAS' };
  }
  if (type === 'COLOR') {
    const rgba = normalizeColor(raw);
    return rgba == null ? null : { value: { kind: 'color', rgba }, sourceType: type };
  }
  if (type === 'STRING' && typeof raw?.textValue === 'string') return { value: { kind: 'string', value: raw.textValue }, sourceType: type };
  if (type === 'NUMBER' && Number.isFinite(Number(raw?.floatValue ?? raw?.numberValue))) return { value: { kind: 'number', value: Number(raw.floatValue ?? raw.numberValue) }, sourceType: type };
  if (type === 'BOOLEAN' && typeof raw?.booleanValue === 'boolean') return { value: { kind: 'boolean', value: raw.booleanValue }, sourceType: type };
  return null;
}

export function normalizeFigVariables(index, documentId) {
  const collections = {};
  const collectionIdBySourceId = new Map();
  const modeNameByCollectionAndId = new Map();
  const collectionIdsByModeId = new Map();
  const diagnostics = [];

  for (const [sourceNodeId, node] of index.variableSetsById) {
    const id = stableId('variable-collection', documentId, sourceNodeId);
    const modes = (node.variableSetModes || []).map(mode => {
      const modeId = sourceId(mode.id);
      if (modeId) modeNameByCollectionAndId.set(`${id}:${modeId}`, String(mode.name || modeId));
      if (modeId) {
        if (!collectionIdsByModeId.has(modeId)) collectionIdsByModeId.set(modeId, new Set());
        collectionIdsByModeId.get(modeId).add(id);
      }
      return { id: modeId, name: String(mode.name || modeId || 'Mode'), sortPosition: mode.sortPosition ?? null };
    });
    const sortedModes = [...modes].sort((a, b) => {
      const left = a.sortPosition == null ? null : String(a.sortPosition);
      const right = b.sortPosition == null ? null : String(b.sortPosition);
      return left == null || right == null ? modes.indexOf(a) - modes.indexOf(b) : left < right ? -1 : left > right ? 1 : modes.indexOf(a) - modes.indexOf(b);
    });
    const namedDefault = modes.find(mode => mode.name.toLowerCase() === 'default');
    const namedLight = modes.find(mode => mode.name.toLowerCase() === 'light');
    const chosenDefault = namedDefault || namedLight || sortedModes[0] || null;
    collections[id] = {
      id,
      name: String(node.name || 'Variables'),
      source: { documentId, nodeId: sourceNodeId, key: node.key || null, version: node.version || null },
      modes,
      defaultModeId: chosenDefault?.id || null,
      defaultModeSelection: namedDefault ? 'named-default' : namedLight ? 'named-light' : modes.length === 1 ? 'single-mode' : chosenDefault ? 'sort-position-fallback' : 'unavailable',
    };
    collectionIdBySourceId.set(sourceNodeId, id);
  }

  const variableIdBySourceId = new Map();
  const idByAssetRef = new Map();
  for (const [sourceNodeId, node] of index.variablesById) {
    const id = stableId('variable', documentId, sourceNodeId);
    variableIdBySourceId.set(sourceNodeId, id);
    if (node.key && node.version) idByAssetRef.set(`${node.key}:${node.version}`, id);
  }

  const variables = {};
  for (const [sourceNodeId, node] of index.variablesById) {
    const setRef = assetRef(node.variableSetID);
    const set = setRef ? index.variableSetsByAssetRef.get(`${setRef.key}:${setRef.version}`) : null;
    let collectionId = set ? collectionIdBySourceId.get(sourceId(set)) || null : null;
    if (!collectionId) {
      const modeIds = (node.variableDataValues?.entries || []).map(entry => sourceId(entry.modeID)).filter(Boolean);
      const candidates = modeIds.map(modeId => collectionIdsByModeId.get(modeId)).filter(Boolean);
      const intersection = candidates.length ? [...candidates[0]].filter(candidate => candidates.every(setIds => setIds.has(candidate))) : [];
      if (intersection.length === 1) collectionId = intersection[0];
      else if (modeIds.length) diagnostics.push({ severity: 'warning', code: 'VARIABLE_COLLECTION_UNRESOLVED', sourceNodeId, propertyPath: 'variableSetID', reason: 'The source variable has no set reference and its mode IDs do not identify exactly one collection.', fallback: 'The values remain preserved under their source mode IDs.' });
    }
    const collection = collectionId ? collections[collectionId] : null;
    const values = {};
    const modeIds = {};
    for (const [entryIndex, entry] of (node.variableDataValues?.entries || []).entries()) {
      const modeId = sourceId(entry.modeID);
      const modeName = collection && modeId
        ? modeNameByCollectionAndId.get(`${collectionId}:${modeId}`)
        : null;
      const normalized = normalizeValue(node, entry, idByAssetRef);
      if (!normalized) {
        diagnostics.push({ severity: 'warning', code: 'VARIABLE_VALUE_UNSUPPORTED', sourceNodeId, propertyPath: `variableDataValues.entries[${entryIndex}]`, reason: `Variable value type ${entry.variableData?.resolvedDataType || entry.variableData?.dataType || node.variableResolvedType || 'unknown'} cannot be normalized yet.`, fallback: 'The complete source value remains in the preserved Figma source records.' });
        continue;
      }
      const key = modeName || modeId || `unmapped-${entryIndex}`;
      values[key] = normalized.value;
      if (modeId) modeIds[key] = modeId;
      if (normalized.sourceType === 'ALIAS' && normalized.value.unresolved) diagnostics.push({ severity: 'warning', code: 'VARIABLE_ALIAS_UNRESOLVED', sourceNodeId, propertyPath: `variableDataValues.entries[${entryIndex}].value.alias`, reason: `Alias ${normalized.value.sourceRef?.key || 'unknown'}:${normalized.value.sourceRef?.version || ''} is not present in this source file.`, fallback: 'The alias reference and authored source value remain available.' });
    }
    variables[variableIdBySourceId.get(sourceNodeId)] = {
      id: variableIdBySourceId.get(sourceNodeId),
      name: String(node.name || sourceNodeId),
      type: String(node.variableResolvedType || 'UNKNOWN').toUpperCase(),
      collectionId,
      source: { documentId, nodeId: sourceNodeId, key: node.key || null, version: node.version || null, setRef },
      values,
      modeIds,
    };
  }
  return { collections, variables, diagnostics };
}

export function figVariablesToFormaState(sceneResources) {
  const collections = {};
  for (const [id, collection] of Object.entries(sceneResources?.collections || {})) {
    const modeNames = Object.fromEntries((collection.modes || []).filter(mode => mode.id).map(mode => [mode.id, mode.name]));
    collections[id] = {
      name: collection.name,
      modes: Object.keys(modeNames),
      modeNames,
      mode: collection.defaultModeId,
      source: collection.source,
    };
  }
  const definitions = {};
  for (const [id, variable] of Object.entries(sceneResources?.variables || {})) {
    const values = {};
    for (const [modeName, value] of Object.entries(variable.values || {})) {
      const modeId = variable.modeIds?.[modeName] || modeName;
      if (value?.kind === 'color') {
        const [r, g, b, a] = value.rgba;
        values[modeId] = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
      } else if (value?.kind === 'alias') {
        values[modeId] = value.variableId ? { alias: value.variableId } : { alias: value.sourceRef?.key || '' };
      } else if (value?.kind === 'number' || value?.kind === 'string' || value?.kind === 'boolean') {
        values[modeId] = value.value;
      } else values[modeId] = value;
    }
    definitions[id] = {
      displayName: variable.name,
      type: variable.type,
      collectionId: variable.collectionId || 'legacy',
      values,
      source: variable.source,
    };
  }
  return { mode: 'light', modes: { light: {}, dark: {} }, collections, definitions };
}
