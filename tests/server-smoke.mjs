import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:5194',id='forma-integration-smoke';
const {token}=await (await fetch(base+'/api/session')).json();
const localFetch=(url,options={})=>fetch(url,{...options,headers:{'content-type':'application/json','x-forma-token':token,...options.headers}});
const project={format:'forma-project',schemaVersion:2,id,name:'Integration smoke',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),editor:{grapesjs:{pages:[{id:'smoke-page',component:{type:'wrapper',components:[]}}]}},forma:{components:[],variables:{mode:'light',modes:{light:{},dark:{}}},comments:[],prototype:{},layoutMetadata:{}},assets:[]};
const json=async(path,options)=>{const response=await localFetch(base+path,options),text=await response.text();assert.ok(response.ok,`${options?.method||'GET'} ${path}: ${response.status} ${text}`);return JSON.parse(text);};
try{
  const saved=await json('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(project)});assert.equal(saved.id,id);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const asset=await json(`/api/projects/${id}/assets`,{method:'POST',headers:{'content-type':'image/png','x-file-name':'pixel.png'},body:png});assert.ok(asset.id);
  const assetResponse=await fetch(`${base}/api/projects/${id}/assets/${asset.id}`);assert.ok(assetResponse.ok);assert.equal((await assetResponse.arrayBuffer()).byteLength,png.length);
  const version=await json(`/api/projects/${id}/versions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Smoke version',project})});assert.ok(version.id);
  const versions=await json(`/api/projects/${id}/versions`);assert.equal(versions.versions.length,1);
  const loaded=await json(`/api/projects/${id}`);assert.equal(loaded.id,id);
  console.log(JSON.stringify({projectSchema:loaded.schemaVersion,assetBytes:png.length,versions:versions.versions.length}));
} finally { await localFetch(`${base}/api/projects/${id}`,{method:'DELETE'}); }
