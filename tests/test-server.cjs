const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),{once}=require('node:events');
module.exports=async function start(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'forma-platform-test-'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../server.mjs'),String(port)],{cwd:directory,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stderr.on('data',value=>output+=value);
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}if(path.dirname(directory)!==os.tmpdir()||!path.basename(directory).startsWith('forma-platform-test-'))throw Error('Unexpected test directory');await fs.rm(directory,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server failed: '+output);}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out: '+output)),10000);timer.unref();})]);
  const base=`http://127.0.0.1:${port}`,{token}=await(await fetch(base+'/api/session')).json();
  const raw=(route,options={})=>fetch(base+route,{...options,headers:{'content-type':'application/json','x-forma-token':token,...options.headers}});
  const account=()=>{let cookie='';return {get cookie(){return cookie;},raw:(route,options={})=>raw('/api/workspace'+route,{...options,headers:{cookie,...options.headers}}),request:async(route,body,method=body===undefined?'GET':'POST')=>{const response=await raw('/api/workspace'+route,{method,headers:{cookie},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,value:await response.json(),headers:response.headers};}};};
  return {directory,base,raw,account};
};
