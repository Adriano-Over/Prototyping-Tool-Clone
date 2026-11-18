const test = require('node:test');
const assert = require('node:assert/strict');

const guid = localID => ({ sessionID: 9, localID });
const id = localID => `9:${localID}`;

test('Figma prototype records map to stable Forma actions without enabling unsupported runtime behavior', async () => {
  const { importParsedFigDocument } = await import('../fig-import.mjs');
  const page = { guid: guid(1), type: 'CANVAS', name: 'Page', phase: 'CREATED' };
  const instance = { guid: guid(2), type: 'INSTANCE', name: 'Button instance', phase: 'CREATED', size: { x: 40, y: 20 }, transform: { m00: 1, m02: 20, m10: 0, m12: 20 }, symbolData: { symbolID: guid(3) } };
  const source = { guid: guid(3), type: 'SYMBOL', name: 'Button default', phase: 'CREATED', size: { x: 40, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 }, prototypeInteractions: [
    { id: guid(20), event: { interactionType: 'ON_CLICK' }, isDeleted: false, actions: [
      { connectionType: 'INTERNAL_NODE', navigationType: 'SWAP_STATE', transitionNodeID: guid(4), transitionType: 'SMART_ANIMATE', transitionDuration: 0.3, easingType: 'OUT_CUBIC', easingFunction: [0, 0, 0.58, 1] },
      { connectionType: 'SET_VARIABLE' },
      { connectionType: 'NONE', transitionType: 'SMART_ANIMATE' },
    ] },
    { id: guid(21), event: { interactionType: 'MOUSE_LEAVE' }, isDeleted: false, actions: [
      { connectionType: 'INTERNAL_NODE', navigationType: 'SWAP_STATE', transitionNodeID: guid(4), transitionType: 'INSTANT_TRANSITION', transitionDuration: 0.5 },
    ] },
    { id: guid(22), event: { interactionType: 'DRAG' }, isDeleted: false, actions: [{ connectionType: 'NONE' }] },
  ] };
  const target = { guid: guid(4), type: 'SYMBOL', name: 'Button hover', phase: 'CREATED', size: { x: 40, y: 20 }, transform: { m00: 1, m02: 0, m10: 0, m12: 0 } };
  const label = { guid: guid(5), type: 'TEXT', name: 'Label', phase: 'CREATED', parentIndex: { guid: guid(3), position: 'a' }, size: { x: 20, y: 10 }, transform: { m00: 1, m02: 4, m10: 0, m12: 4 }, textData: { characters: 'Button' } };
  const project = importParsedFigDocument({
    nodes: [page, instance, source, target, label],
    childrenMap: new Map([[id(1), [instance]], [id(3), [label]]]),
    images: new Map(), meta: {}, header: { version: 101 },
  });

  const visibleOccurrenceId = Object.values(project.forma.scene.nodes).find(node => node.source.nodeId === id(3) && !node.source.occurrencePath.includes('component-definition'))?.id;
  const imported = project.forma.prototype[visibleOccurrenceId];
  assert.ok(visibleOccurrenceId);
  assert.equal(imported.length, 3);
  assert.equal(imported[0].trigger, 'click');
  assert.equal(imported[0].enabled, false, 'source prototype stays inert until Forma has the compatible runtime');
  assert.equal(imported[0].status, 'pending-runtime');
  assert.deepEqual(imported[0].actions.map(action => action.status), ['mapped', 'disabled', 'disabled']);
  const stateAction = imported[0].actions[0];
  assert.equal(stateAction.action, 'change-component-state');
  assert.equal(stateAction.targetComponentId, project.forma.components.find(item => item.source.nodeId === id(4)).id);
  assert.equal(stateAction.targetVariant, 'Default');
  assert.equal(stateAction.transition.kind, 'smart-animate');
  assert.equal(stateAction.transition.durationMs, 300);
  assert.deepEqual(stateAction.transition.easing, [0, 0, 0.58, 1]);
  assert.equal(imported[1].trigger, 'mouseleave');
  assert.equal(imported[1].actions[0].transition.kind, 'instant');
  assert.equal(imported[1].actions[0].transition.durationMs, 0, 'Figma instant transitions ignore stale duration values');
  assert.equal(imported[2].trigger, 'unsupported');
  assert.equal(imported[2].status, 'disabled');
  assert.equal(imported[2].actions[0].status, 'disabled');
  assert.equal(project.forma.importSources[0].resourceManifest.prototypes.sourceInteractions, 3);
  assert.equal(project.forma.importSources[0].resourceManifest.prototypes.sourceActions, 5);
  assert.equal(project.forma.importSources[0].resourceManifest.prototypes.mappedStateActions, 2);
  assert.equal(project.forma.importSources[0].resourceManifest.prototypes.disabledActions, 3);
  assert.equal(project.importSummary.diagnostics.filter(item => item.code === 'PROTOTYPE_VARIABLE_TARGET_MISSING').length, 1);
  assert.equal(project.importSummary.diagnostics.filter(item => item.code === 'PROTOTYPE_ACTION_NO_CONNECTION').length, 2);
  assert.equal(project.importSummary.diagnostics.filter(item => item.code === 'PROTOTYPE_TRIGGER_UNSUPPORTED').length, 1);

  const { migrateProject } = await import('../dist/project-model.js');
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.forma.prototype[visibleOccurrenceId][0].id, imported[0].id);
  assert.equal(reopened.forma.prototype[visibleOccurrenceId][0].enabled, false);
  assert.deepEqual(reopened.forma.prototype[visibleOccurrenceId][0].actions, imported[0].actions);
  assert.deepEqual(reopened.forma.prototype[visibleOccurrenceId][0].source, imported[0].source);
  assert.equal(reopened.forma.importSources[0].resourceManifest.prototypes.sourceActions, 5);
});
