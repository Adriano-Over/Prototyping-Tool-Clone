const test=require('node:test');const assert=require('node:assert/strict');
const project=(revision=1)=>({format:'forma-project',schemaVersion:2,id:'saved',name:'Saved',revision,updatedAt:'2026-10-19T10:00:00Z',editor:{grapesjs:{pages:[{id:'page'}]}},forma:{components:[]},assets:[]});
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
async function setup({disk=project(),cache,fail=false,quota=false}={}){
  const {createProjectStore}=await import('../dist/project-store.js');const saved=storage();if(cache)saved.setItem('forma-project-cache:saved',JSON.stringify(cache));
  if(quota)saved.setItem=()=>{throw Error('quota');};
  const calls=[],statuses=[];let id='saved',live=project();
  const store=createProjectStore({storage:saved,getId:()=>id,setId:value=>{id=value;},setName:()=>{},getProject:()=>live,onStatus:value=>statuses.push(value),request:async(url,options={})=>{calls.push({url,options});if(fail)throw Error('offline');return {ok:true,json:async()=>disk};}});
  return {store,saved,calls,statuses,setLive:value=>{live=value;}};
}
test('missing cache reopens disk; failed recovery never saves the sample over its ID',async()=>{
  const successful=await setup();assert.equal((await successful.store.recoverStartup()).name,'Saved');assert.equal(successful.calls.length,1);assert.equal(successful.calls[0].options.method,undefined);
  const failed=await setup({fail:true});await assert.rejects(failed.store.recoverStartup(),/has not been changed/);await assert.rejects(failed.store.saveToFolder(),/paused/);assert.equal(failed.calls.length,1);
});
test('newer matching browser edits recover; stale browser edits remain separate from newer disk data',async()=>{
  const cached={...project(),name:'Unsaved changes',updatedAt:'2026-10-19T11:00:00Z'};
  const same=await setup({cache:cached});assert.equal((await same.store.recoverStartup()).name,'Unsaved changes');
  const newer=await setup({cache:cached,disk:{...project(2),name:'Newer disk'}});assert.equal((await newer.store.recoverStartup()).name,'Newer disk');assert.equal([...newer.saved.values.keys()].filter(key=>key.startsWith('forma-recovery:')).length,1);
});
test('failed folder saves retain immediate browser recovery; quota failure is reported honestly',async()=>{
  const offline=await setup({cache:project(),fail:true});await offline.store.recoverStartup();await assert.rejects(offline.store.saveToFolder(),/offline/);assert.ok(offline.saved.getItem('forma-project-cache:saved'));assert.match(offline.statuses.at(-1),/folder save failed/);
  const full=await setup({quota:true});assert.equal(full.store.writeSnapshot(),false);assert.match(full.statuses.at(-1),/full/);
});
