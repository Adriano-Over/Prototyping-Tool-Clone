const test = require('node:test');
const assert = require('node:assert/strict');

test('migrates a legacy GrapesJS save into schema version 2', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const project = migrateProject({id:'legacy',name:'Legacy',updatedAt:'2025-01-01T00:00:00.000Z',data:{pages:[{id:'p1'}]}},{now:'2026-01-01T00:00:00.000Z'});
  assert.equal(project.format,'forma-project');
  assert.equal(project.schemaVersion,2);
  assert.deepEqual(project.editor.grapesjs.pages,[{id:'p1'}]);
  assert.deepEqual(project.forma.components,[]);
  assert.deepEqual(project.assets,[]);
});

test('preserves project-scoped Forma metadata through normalization', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const input={format:'forma-project',schemaVersion:2,id:'a',name:'A',editor:{grapesjs:{pages:[{}]}},forma:{components:[{id:'c'}],variables:{mode:'dark',modes:{dark:{x:'1'}}},comments:{node_a:[{text:'note'}]},prototype:{node_a:{action:'message'}},layoutMetadata:{node_a:{}}},assets:[{id:'asset_a'}]};
  const result=migrateProject(input,{now:'2026-01-01T00:00:00.000Z'});
  assert.deepEqual(result.forma,{...input.forma,textStyles:[],prototype:{node_a:[{id:'interaction-1',trigger:'click',action:'message',actions:[{action:'message'}]}]}});
  assert.deepEqual(result.assets,input.assets);
});

test('rejects unsupported future project schemas', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  assert.throws(()=>migrateProject({format:'forma-project',schemaVersion:99,editor:{grapesjs:{pages:[{}]}}}),/unsupported schema/i);
});

