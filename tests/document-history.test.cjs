const test=require('node:test');
const assert=require('node:assert/strict');

test('canvas styles and Workbench metadata undo in chronological order, including compound actions',async()=>{
  const {createDocumentHistory}=await import('../dist/document-history.js');
  const {createCommandService}=await import('../dist/command-service.js');
  let state={data:{css:{gradient:'red',width:100},variables:{mode:'light'},prototype:{},attributes:{}}};
  const history=createDocumentHistory({read:()=>state,write:value=>{state=value;}});
  const commands=createCommandService({history});history.reset();
  state.data.css.gradient='blue';history.flush();
  commands.execute({id:'dark-mode',apply(){state.data.variables.mode='dark';state.data.css.color='white';},revert(){}});history.flush();
  state.data.css.width=240;history.flush();
  commands.undo();assert.equal(state.data.css.width,100);assert.equal(state.data.variables.mode,'dark');
  commands.undo();assert.equal(state.data.variables.mode,'light');assert.equal(state.data.css.color,undefined);assert.equal(state.data.css.gradient,'blue');
  commands.undo();assert.equal(state.data.css.gradient,'red');
  commands.redo();commands.redo();commands.redo();assert.equal(state.data.css.width,240);assert.equal(state.data.variables.mode,'dark');
  history.pause();
});

test('undo commits pending edits; a new edit invalidates redo; project reset isolates history',async()=>{
  const {createDocumentHistory}=await import('../dist/document-history.js');
  let state={data:{name:'A'},context:{node:'first'}};
  const history=createDocumentHistory({read:()=>state,write:value=>{state=value;}});history.reset();
  state.data.name='B';history.schedule();history.undo();assert.equal(state.data.name,'A');
  state.data.name='C';history.flush();assert.equal(history.canRedo(),false);
  state={data:{name:'Other project'}};history.reset();assert.equal(history.canUndo(),false);history.pause();
});

test('failed restoration keeps the previous document and history position',async()=>{
  const {createDocumentHistory}=await import('../dist/document-history.js');let state={value:1};
  const history=createDocumentHistory({read:()=>state,write:value=>{if(value.value===1)throw Error('restore failed');state=value;}});
  history.reset();state={value:2};history.flush();assert.throws(()=>history.undo(),/restore failed/);assert.equal(state.value,2);assert.equal(history.canUndo(),true);history.pause();
});
