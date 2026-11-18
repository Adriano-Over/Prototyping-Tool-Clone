const test=require('node:test');const assert=require('node:assert/strict');
test('asset manager rejects unsupported and oversized files before upload',async()=>{const {createAssetManager}=await import('../dist/asset-manager.js');const manager=createAssetManager({projectState:{getAssets:()=>[],setAssets(){}},getProjectId:()=> 'p'});await assert.rejects(()=>manager.importFile({type:'application/pdf',size:1}),/PNG/);await assert.rejects(()=>manager.importFile({type:'image/png',size:26*1024*1024}),/25 MB/);});

test('asset manager imports an accepted image and records its project-backed URL',async t=>{
  const {createAssetManager}=await import('../dist/asset-manager.js');
  const original=global.fetch;let assets=[];const calls=[];
  global.fetch=async(url,options={})=>{calls.push([url,options]);if(url==='/api/session')return{ok:true,json:async()=>({token:'test-token'})};return{ok:true,json:async()=>({id:'image-1',name:'portrait.png'})};};
  t.after(()=>{global.fetch=original;});
  const manager=createAssetManager({projectState:{getAssets:()=>structuredClone(assets),setAssets:value=>{assets=structuredClone(value);}},getProjectId:()=> 'project-1'});
  const result=await manager.importFile({name:'portrait.png',type:'image/png',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});
  assert.equal(result.src,'/api/projects/project-1/assets/image-1');
  assert.deepEqual(assets,[{id:'image-1',name:'portrait.png'}]);
  assert.equal(calls[1][0],'/api/projects/project-1/assets');
  assert.equal(calls[1][1].headers.get('X-Forma-Token'),'test-token');
});

test('variable-generated SVG assets retain their current mode without a redundant upload',async()=>{
  const {createAssetManager}=await import('../dist/asset-manager.js');
  const manager=createAssetManager({getProjectId:()=> 'project-1'});
  const vector={
    get:key=>({type:'image',assetId:'previous-mode',formaVectorTemplate:{svg:'<svg/>',variables:[]}})[key],
    getAttributes:()=>({src:'data:image/svg+xml,%3Csvg%2F%3E'}),
    addAttributes:()=>assert.fail('a saved fallback must not replace a generated vector'),
  };
  const editor={Pages:{getAll:()=>[{getMainComponent:()=>vector}]}};
  manager.resolve(editor);
  assert.equal(await manager.migrateDataUrls(editor),0);
});

