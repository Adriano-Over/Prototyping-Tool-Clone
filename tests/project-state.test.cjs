const test = require('node:test');
const assert = require('node:assert/strict');

test('switching projects replaces all Workbench metadata', async () => {
  const { createProjectState } = await import('../dist/project-state.js');
  let id='a',name='A';const editor={getProjectData:()=>({pages:[{id:'page'}]})};
  const state=createProjectState({getEditor:()=>editor,getId:()=>id,getName:()=>name});
  state.setComponents([{id:'button-a'}]);state.setComments({node_a:[{text:'A'}]});const savedA=state.serialize();
  id='b';name='B';state.load({id,name,editor:{grapesjs:{pages:[{}]}},forma:{components:[],variables:{mode:'light',modes:{}},comments:{},prototype:{},layoutMetadata:{}},assets:[]});
  assert.deepEqual(state.getComponents(),[]);assert.deepEqual(state.getComments(),{});
  id='a';name='A';state.load(savedA);assert.deepEqual(state.getComponents(),[{id:'button-a'}]);assert.deepEqual(state.getComments(),{node_a:[{text:'A'}]});
});

test('serializes GrapesJS and Workbench state into one envelope', async () => {
  const { createProjectState } = await import('../dist/project-state.js');
  const state=createProjectState({getEditor:()=>({getProjectData:()=>({pages:[{id:'p'}]})}),getId:()=> 'project',getName:()=> 'Project'});
  state.setVariables({mode:'dark',modes:{dark:{primary:'#000'}}});const value=state.serialize();
  assert.equal(value.format,'forma-project');assert.equal(value.schemaVersion,2);assert.equal(value.forma.variables.mode,'dark');assert.equal(value.editor.grapesjs.pages[0].id,'p');
});

