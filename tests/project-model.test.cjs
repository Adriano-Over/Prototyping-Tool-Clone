const test = require('node:test');
const assert = require('node:assert/strict');

test('migrates a legacy GrapesJS save into schema version 3 with empty scene metadata', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const project = migrateProject({id:'legacy',name:'Legacy',updatedAt:'2025-01-01T00:00:00.000Z',data:{pages:[{id:'p1'}]}},{now:'2026-01-01T00:00:00.000Z'});
  assert.equal(project.format,'forma-project');
  assert.equal(project.schemaVersion,3);
  assert.deepEqual(project.editor.grapesjs.pages,[{id:'p1'}]);
  assert.deepEqual(project.forma.components,[]);
  assert.equal(project.forma.scene,null);
  assert.deepEqual(project.forma.importSources,[]);
  assert.deepEqual(project.assets,[]);
});

test('preserves real imported CSS geometry rules used by the Rust converter fixture', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const fixture = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../fixtures/projects/forma-real-css-rules.json'), 'utf8'));
  const migrated = migrateProject(fixture, { now: '2026-11-19T00:00:00.000Z' });
  const editor = fixture.editor.grapesjs;
  assert.deepEqual(migrated.editor.grapesjs.pages, editor.pages);
  assert.deepEqual(migrated.editor.grapesjs.styles, editor.styles);
  assert.equal(editor.styles.find(rule => rule.selectors.includes('#fig-0eac98eef79c')).style.top, '1021px');
  assert.equal(editor.styles.find(rule => rule.selectors.includes('#fig-page-2725fd8c3f20')).style.width, '1024px');
});

test('preserves real imported flex layout rules used by the Rust converter fixture', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const fixture = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../fixtures/projects/forma-real-flex.json'), 'utf8'));
  const migrated = migrateProject(fixture, { now: '2026-11-19T00:00:00.000Z' });
  assert.deepEqual(migrated.editor.grapesjs.pages, fixture.editor.grapesjs.pages);
  assert.deepEqual(migrated.editor.grapesjs.styles, fixture.editor.grapesjs.styles);
  const dropdown = migrated.editor.grapesjs.styles.find(rule => rule.selectors.includes('#fig-91308b969527'));
  assert.equal(dropdown.style.display, 'flex');
  assert.equal(dropdown.style.gap, '6px');
  assert.equal(dropdown.style['padding-left'], '2px');
  assert.equal(dropdown.style['padding-right'], '4px');
});

test('preserves project-scoped Forma metadata through schema 2 to 3 normalization', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const input={format:'forma-project',schemaVersion:2,id:'a',name:'A',editor:{grapesjs:{pages:[{}]}},forma:{components:[{id:'c'}],variables:{mode:'dark',modes:{dark:{x:'1'}}},comments:{node_a:[{text:'note'}]},prototype:{node_a:{action:'message'}},layoutMetadata:{node_a:{}}},assets:[{id:'asset_a'}]};
  const result=migrateProject(input,{now:'2026-01-01T00:00:00.000Z'});
  assert.deepEqual(result.forma,{...input.forma,textStyles:[],scene:null,importSources:[],prototype:{node_a:[{id:'interaction-1',trigger:'click',action:'message',actions:[{action:'message'}]}]}});
  assert.deepEqual(result.assets,input.assets);
  assert.equal(result.schemaVersion,3);
});

test('preserves imported scene and source metadata through repeated normalization', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  const scene={version:1,sourceDocuments:{doc_a:{id:'doc_a',sha256:'abc',figVersion:101,parser:{name:'openfig-core',version:'0.4.1'},sourceRecordsAssetId:'asset_records'}},nodes:{node_a:{id:'node_a',source:{documentId:'doc_a',nodeId:'1:2',occurrencePath:[]},children:[],fills:[]}},pages:['node_a'],resources:{components:{},variables:{},collections:{},styles:{},assets:{}},sourceOccurrences:{'["doc_a",[],"1:2"]':'node_a'},diagnostics:[]};
  const importSources=[{id:'doc_a',sha256:'abc',figVersion:101,sourceRecordsAssetId:'asset_records',blobManifestAssetId:'asset_blobs'}];
  const input={format:'forma-project',schemaVersion:3,id:'a',name:'A',editor:{grapesjs:{pages:[{}]}},forma:{scene,importSources}};
  const once=migrateProject(input,{now:'2026-01-01T00:00:00.000Z'});
  const twice=migrateProject(JSON.parse(JSON.stringify(once)),{now:'2026-01-01T00:00:00.000Z'});
  assert.deepEqual(once.forma.scene,scene);
  assert.deepEqual(once.forma.importSources,importSources);
  assert.deepEqual(twice.forma.scene,scene);
  assert.deepEqual(twice.forma.importSources,importSources);
});

test('rejects unsupported future project schemas', async () => {
  const { migrateProject } = await import('../dist/project-model.js');
  assert.throws(()=>migrateProject({format:'forma-project',schemaVersion:99,editor:{grapesjs:{pages:[{}]}}}),/unsupported schema/i);
});

