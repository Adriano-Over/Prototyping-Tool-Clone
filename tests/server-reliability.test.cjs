const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');const {once}=require('node:events');

test('portable assets, revision conflicts and local API boundaries',async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'forma-reliability-'));
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../server.mjs'),String(port)],{cwd:temporary,stdio:['ignore','pipe','pipe'],windowsHide:true});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}assert.equal(path.dirname(temporary),os.tmpdir());assert.ok(path.basename(temporary).startsWith('forma-reliability-'));await fs.rm(temporary,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited before listening');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);timer.unref();})]);
  const base=`http://127.0.0.1:${port}`,{token}=await (await fetch(base+'/api/session')).json();
  const request=(route,options={})=>fetch(base+route,{...options,headers:{'content-type':'application/json','x-forma-token':token,...options.headers}});
  const json=async(route,body)=>{const response=await request(route,{method:'POST',body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const project={format:'forma-project',schemaVersion:2,id:'source',name:'Source',editor:{grapesjs:{pages:[{id:'p1',component:{type:'wrapper',components:[]}}]}},forma:{components:[],variables:{mode:'dark',modes:{dark:{brand:'#123456'}}},comments:{node:[{text:'Keep me'}]},prototype:{},layoutMetadata:{}},assets:[]};
  const first=await json('/api/projects',project);
  const assetResponse=await request('/api/projects/source/assets',{method:'POST',headers:{'content-type':'image/png'},body:png});assert.equal(assetResponse.status,200);const asset=await assetResponse.json();
  const src=`/api/projects/source/assets/${asset.id}`;project.assets=[asset];project.editor.grapesjs.pages[0].component.components=[{type:'image',formaNodeId:'node',assetId:asset.id,attributes:{src}}];project.forma.components=[{name:'Picture',data:{type:'image',attributes:{src}}}];
  const saved=await json('/api/projects',{...project,baseRevision:first.revision});
  const backup=await json('/api/portable',project);assert.match(backup.assets[0].dataUrl,/^data:image\/png;base64,/);assert.equal(JSON.stringify(backup).includes('/api/projects/'),false);
  const copy=await json('/api/projects',{...backup,id:'',name:'Copy'});assert.equal((await fetch(base+`/api/projects/${copy.id}/assets/${asset.id}`)).status,200);
  const stale=await request('/api/projects',{method:'POST',body:JSON.stringify({...project,baseRevision:first.revision})});assert.equal(stale.status,409);assert.equal((await (await fetch(base+'/api/projects/source')).json()).revision,saved.revision);
  const concurrent=await Promise.all([1,2].map(()=>request('/api/projects',{method:'POST',body:JSON.stringify({...project,baseRevision:saved.revision})})));assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);
  const bundle=await json('/api/exports',{id:'bundle',name:'Bundle',project:project.editor.grapesjs,workbench:project.forma,html:`<img src="${src}">`,css:`.image{background-image:url('${src}')}`});
  const folder=path.join(temporary,'GrapesJS/exports',bundle.id),html=await fs.readFile(path.join(folder,'preview.html'),'utf8'),index=JSON.parse(await fs.readFile(path.join(folder,'assets/index.json'),'utf8'));
  assert.equal(index.length,1);assert.equal(html.includes('/api/projects/'),false);assert.ok(html.includes('assets/'+index[0].file));assert.deepEqual(await fs.readFile(path.join(folder,'assets',index[0].file)),png);
  const standalone=await json('/api/portable',{id:'source',html:`<img src="${src}">`});assert.ok(standalone.html.includes('data:image/png;base64,'));
  assert.equal((await request('/api/projects/source',{method:'DELETE'})).status,200);
  const imported=await json('/api/projects',{...backup,id:'',name:'Imported after source removal'});assert.equal((await fetch(base+`/api/projects/${imported.id}/assets/${asset.id}`)).status,200);
  const loaded=await (await fetch(base+'/api/projects/'+imported.id)).json();assert.equal(loaded.forma.comments.node[0].text,'Keep me');assert.ok(loaded.forma.components[0].data.attributes.src.includes(imported.id));
  const svg=await request(`/api/projects/${imported.id}/assets`,{method:'POST',headers:{'content-type':'image/svg+xml'},body:'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'});const svgAsset=await svg.json();const servedSvg=await fetch(base+`/api/projects/${imported.id}/assets/${svgAsset.id}`);assert.match(servedSvg.headers.get('content-security-policy'),/sandbox/);
  await t.test('rejects foreign origin, missing token, wrong host and simple text requests',async()=>{
    assert.equal((await request('/api/projects',{method:'POST',headers:{origin:'https://untrusted.invalid'},body:JSON.stringify(project)})).status,403);
    assert.equal((await fetch(base+'/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(project)})).status,403);
    assert.equal((await request('/api/projects',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify(project)})).status,415);
    const wrongHost=await new Promise((resolve,reject)=>{require('node:http').get(base+'/api/session',{headers:{host:'untrusted.invalid'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});assert.equal(wrongHost,403);
    assert.equal((await fetch(base+'/api/session',{headers:{origin:'https://untrusted.invalid'}})).status,403);
  });
});
