const guidId = value => {
  if (typeof value === 'string') return value;
  if (value && Number.isFinite(Number(value.sessionID)) && Number.isFinite(Number(value.localID))) return `${value.sessionID}:${value.localID}`;
  return null;
};

const plain = value => value == null ? value : JSON.parse(JSON.stringify(value));

function mapTrigger(value) {
  return ({ ON_CLICK: 'click', MOUSE_ENTER: 'mouseenter', MOUSE_LEAVE: 'mouseleave' })[value] || 'unsupported';
}

function mapTransition(action) {
  const sourceType = action.transitionType || 'INSTANT_TRANSITION';
  const duration = Number(action.transitionDuration ?? 0);
  const easing = Array.isArray(action.easingFunction) && action.easingFunction.length === 4
    ? action.easingFunction.map(Number) : null;
  return {
    kind: sourceType === 'SMART_ANIMATE' ? 'smart-animate' : sourceType === 'INSTANT_TRANSITION' ? 'instant' : 'unsupported',
    durationMs: sourceType === 'INSTANT_TRANSITION' ? 0 : Number.isFinite(duration) && duration >= 0 ? Math.round(duration * 1000) : 0,
    easing,
    source: { type: sourceType, durationSeconds: action.transitionDuration ?? null, easingType: action.easingType || null, easingFunction: plain(action.easingFunction) },
  };
}

function variableValue(data) {
  const value = data?.value;
  if (value && Object.hasOwn(value, 'textValue')) return value.textValue;
  if (value && Object.hasOwn(value, 'boolValue')) return value.boolValue;
  if (value && Object.hasOwn(value, 'numberValue')) return value.numberValue;
  if (value && Object.hasOwn(value, 'colorValue')) return plain(value.colorValue);
  return undefined;
}

export function importFigPrototypeInteractions({ resourceIndex, scene, components, sourceComponentBySymbol, variableIdByAssetRef, addDiagnostic }) {
  const nativeDefinitions = new Map((components || []).map(item => [item.id, item]));
  const nativePrototype = {};
  const summary = { sourceNodes: 0, sourceInteractions: 0, sourceActions: 0, occurrenceBindings: 0, mappedStateActions: 0, mappedVariableActions: 0, disabledActions: 0 };

  for (const [sourceNodeId, sourceNode] of resourceIndex.nodesById) {
    const sourceInteractions = Array.isArray(sourceNode.prototypeInteractions) ? sourceNode.prototypeInteractions : [];
    if (!sourceInteractions.length) continue;
    summary.sourceNodes++;
    summary.sourceInteractions += sourceInteractions.length;
    summary.sourceActions += sourceInteractions.reduce((count, interaction) => count + (interaction.actions || []).length, 0);
    const occurrences = Object.values(scene.nodes).filter(node => node.source?.nodeId === sourceNodeId);
    if (!occurrences.length) continue;
    for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
      const interactions = [];
      for (const [interactionIndex, sourceInteraction] of sourceInteractions.entries()) {
        const trigger = mapTrigger(sourceInteraction.event?.interactionType);
        if (trigger === 'unsupported') addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_TRIGGER_UNSUPPORTED', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].event.interactionType`, reason: `Trigger ${sourceInteraction.event?.interactionType || 'missing'} has no compatible Forma preview event.`, fallback: 'The complete source interaction is retained as disabled.' });
        if (sourceInteraction.isDeleted === true) addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_INTERACTION_DELETED', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].isDeleted`, reason: 'The source marks this interaction as deleted.', fallback: 'It remains preserved but disabled.' });
        const sourceInteractionId = guidId(sourceInteraction.id) || `${sourceNodeId}-${interactionIndex + 1}`;
        const actions = [];
        for (const [actionIndex, sourceAction] of (sourceInteraction.actions || []).entries()) {
          const actionId = `${sourceInteractionId}-${actionIndex + 1}`;
          if (sourceAction.connectionType === 'INTERNAL_NODE' && sourceAction.navigationType === 'SWAP_STATE') {
            const targetSourceNodeId = guidId(sourceAction.transitionNodeID);
            const resolved = targetSourceNodeId && sourceComponentBySymbol.get(targetSourceNodeId);
            const definition = resolved && nativeDefinitions.get(resolved.definitionId);
            const targetVariant = definition?.sourceVariantNodeIds
              ? Object.entries(definition.sourceVariantNodeIds).find(([, id]) => id === targetSourceNodeId)?.[0]
              : resolved?.variant;
            if (definition && targetVariant) {
              const transition = mapTransition(sourceAction);
              if (transition.kind === 'unsupported') addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_TRANSITION_UNSUPPORTED', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].actions[${actionIndex}].transitionType`, reason: `Transition ${transition.source.type} has no Forma mapping.`, fallback: 'The complete source transition is retained; runtime must skip or approximate it explicitly.' });
              actions.push({
                id: actionId, action: 'change-component-state', status: 'mapped',
                targetComponentId: definition.id, targetVariant, targetSourceNodeId,
                transition, source: plain(sourceAction),
              });
              if (occurrenceIndex === 0) summary.mappedStateActions++;
              continue;
            }
            addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_STATE_TARGET_UNRESOLVED', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].actions[${actionIndex}].transitionNodeID`, reason: `State target ${targetSourceNodeId || 'missing'} does not resolve to an imported component variant.`, fallback: 'The complete source interaction is retained as a disabled action.' });
          } else if (sourceAction.connectionType === 'SET_VARIABLE') {
            const ref = sourceAction.targetVariable?.id?.assetRef;
            const refKey = ref?.key ? `${ref.key}:${ref.version || ''}` : null;
            const variableId = refKey ? variableIdByAssetRef.get(refKey) : null;
            const value = variableValue(sourceAction.targetVariableData);
            if (variableId && value !== undefined) {
              actions.push({ id: actionId, action: 'set-variable', status: 'mapped', variableId, value, source: plain(sourceAction) });
              if (occurrenceIndex === 0) summary.mappedVariableActions++;
              continue;
            }
            addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_VARIABLE_TARGET_MISSING', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].actions[${actionIndex}]`, reason: 'The source variable action does not include a resolvable variable and value.', fallback: 'The original action is retained as disabled; no variable is changed.' });
          } else if (sourceAction.connectionType === 'NONE') {
            addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_ACTION_NO_CONNECTION', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].actions[${actionIndex}]`, reason: 'The source action has connection type NONE.', fallback: 'The source action is retained as disabled.' });
          } else {
            addDiagnostic({ severity: 'warning', code: 'PROTOTYPE_ACTION_UNSUPPORTED', sourceNodeId, propertyPath: `prototypeInteractions[${interactionIndex}].actions[${actionIndex}].connectionType`, reason: `Connection ${sourceAction.connectionType || 'missing'} has no Forma mapping.`, fallback: 'The source action is retained as disabled.' });
          }
          actions.push({ id: actionId, action: 'disabled', status: 'disabled', source: plain(sourceAction) });
          if (occurrenceIndex === 0) summary.disabledActions++;
        }
        const supportedTrigger = trigger !== 'unsupported' && sourceInteraction.isDeleted !== true;
        interactions.push({
          id: `fig-${sourceNodeId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${sourceInteractionId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
          trigger,
          enabled: false,
          status: supportedTrigger ? 'pending-runtime' : 'disabled',
          source: { nodeId: sourceNodeId, interactionId: sourceInteractionId, event: plain(sourceInteraction.event), record: plain(sourceInteraction) },
          actions,
        });
      }
      if (interactions.length) {
        nativePrototype[occurrence.id] = interactions;
        summary.occurrenceBindings++;
      }
    }
  }
  return { prototype: nativePrototype, summary };
}
