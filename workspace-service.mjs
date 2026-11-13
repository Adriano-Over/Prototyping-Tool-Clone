import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {projectToGraph,graphToProject,applyGraphChanges,conflictingChanges,diffGraphs} from './dist/collaboration-model.js';
const scrypt=promisify(crypto.scrypt),clone=value=>structuredClone(value),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
const publicUser=user=>({id:user.id,name:user.name,email:user.email});
const roles=new Set(['owner','editor','commenter','viewer']);
const writeRolesFor=(document,user)=>['owner','editor'].includes(document.members[user.id]);
export async function createWorkspaceService({directory,writeAtomic,readBody,sendJson}){
  const file=path.join(directory,'workspace.json');let database;
  try{database=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;database={version:1,users:{},sessions:{},files:{},libraries:{},audit:[]};}
  let queue=Promise.resolve();const streams=new Map(),presence=new Map(),attempts=new Map();
  async function transaction(work){
    const operation=queue.catch(()=>{}).then(async()=>{const draft=clone(database),value=await work(draft);await writeAtomic(file,JSON.stringify(draft));database=draft;return value;});queue=operation;return operation;
  }
  const fileTransaction=(id,user,allowed,work)=>transaction(draft=>{const document=draft.files[id];if(!document||!document.members[user.id])throw fail(404,'Shared design not found.');if(!allowed.includes(document.members[user.id]))throw fail(403,'Your role does not allow this action.');return work(draft,document);});
  const cookieToken=req=>{const pair=String(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('forma_workspace='));return pair?pair.slice('forma_workspace='.length):'';};
  const userFor=req=>{const session=database.sessions[hash(cookieToken(req))];return session&&session.expiresAt>Date.now()?database.users[session.userId]:null;};
  const requireUser=req=>{const user=userFor(req);if(!user)throw fail(401,'Sign in to your workspace.');return user;};
  function access(fileId,user,allowed){const document=database.files[fileId];if(!document||!document.members[user.id])throw fail(404,'Shared design not found.');const role=document.members[user.id];if(allowed&&!allowed.includes(role))throw fail(403,'Your role does not allow this action.');return document;}
  const summary=(document,user)=>({id:document.id,name:document.name+(document.branchName?' / '+document.branchName:''),revision:document.revision,role:document.members[user.id],updatedAt:document.updatedAt,ownerId:document.ownerId,branchOf:document.branchOf,mergedAt:document.mergedAt});
  function log(draft,actor,action,fileId){draft.audit.push({id:crypto.randomUUID(),actorId:actor.id,action,fileId,at:new Date().toISOString()});if(draft.audit.length>1000)draft.audit.shift();}
  function publish(fileId,message){for(const stream of streams.get(fileId)||[]){const session=database.sessions[stream.session],document=database.files[fileId];if(!session||session.expiresAt<=Date.now()||!document?.members[stream.userId]){stream.res.write(`data: ${JSON.stringify({type:'access-revoked'})}\n\n`);stream.res.end();continue;}stream.res.write(`data: ${JSON.stringify(message)}\n\n`);}}
  function currentPresence(fileId){const now=Date.now(),items=presence.get(fileId)||new Map();for(const [key,value] of items)if(now-value.at>30000)items.delete(key);return [...items.values()].map(({at,...item})=>item);}
  function auditAuth(email){const now=Date.now(),value=attempts.get(email)||{count:0,until:now+15*60*1000};if(value.until<now){value.count=0;value.until=now+15*60*1000;}if(++value.count>10)throw fail(429,'Too many sign-in attempts. Try again in 15 minutes.');attempts.set(email,value);}
  async function sessionFor(user,res){const token=crypto.randomBytes(32).toString('base64url');await transaction(draft=>{for(const [key,value] of Object.entries(draft.sessions))if(value.expiresAt<Date.now())delete draft.sessions[key];draft.sessions[hash(token)]={userId:user.id,expiresAt:Date.now()+7*86400000};});res.setHeader('Set-Cookie',`forma_workspace=${token}; HttpOnly; SameSite=Strict; Path=/api/workspace; Max-Age=604800`);return publicUser(user);}
  async function handle(req,res,url){
    try{
      const route=url.pathname.slice('/api/workspace'.length),method=req.method;
      if(route==='/me'&&method==='GET'){const user=userFor(req);return sendJson(res,200,{user:user?publicUser(user):null});}
      if(['/auth/register','/auth/login'].includes(route)&&method==='POST'){
        const body=await readBody(req),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>1024)throw fail(400,'Enter a valid email and a password of 12–1024 characters.');auditAuth(email);
        let user;
        if(route==='/auth/register'){
          const salt=crypto.randomBytes(16).toString('hex'),passwordHash=(await scrypt(password,salt,64)).toString('hex');
          user=await transaction(draft=>{if(Object.values(draft.users).some(value=>value.email===email))throw fail(409,'An account with this email already exists.');const value={id:crypto.randomUUID(),name:String(body.name||email.split('@')[0]).slice(0,120),email,salt,passwordHash,createdAt:new Date().toISOString()};draft.users[value.id]=value;log(draft,value,'account-created');return value;});
        }else{
          user=Object.values(database.users).find(value=>value.email===email);const salt=user?.salt||'00000000000000000000000000000000',candidate=await scrypt(password,salt,64);
          if(!user||!crypto.timingSafeEqual(candidate,Buffer.from(user.passwordHash,'hex')))throw fail(401,'Email or password is incorrect.');
        }
        attempts.delete(email);return sendJson(res,200,{user:await sessionFor(user,res)});
      }
      if(route==='/auth/logout'&&method==='POST'){
        const digest=hash(cookieToken(req));await transaction(draft=>{delete draft.sessions[digest];});res.setHeader('Set-Cookie','forma_workspace=; HttpOnly; SameSite=Strict; Path=/api/workspace; Max-Age=0');for(const id of streams.keys())publish(id,{type:'presence',people:currentPresence(id)});return sendJson(res,200,{signedOut:true});
      }
      const user=requireUser(req);
      if(route==='/files'&&method==='GET')return sendJson(res,200,{files:Object.values(database.files).filter(document=>document.members[user.id]).map(document=>summary(document,user))});
      if(route==='/files'&&method==='POST'){
        const body=await readBody(req),graph=projectToGraph(body.project);graphToProject(graph);
        const document=await transaction(draft=>{const id='file_'+crypto.randomUUID(),now=new Date().toISOString();const value={id,name:graph.meta.name,graph,ownerId:user.id,members:{[user.id]:'owner'},revision:1,createdAt:now,updatedAt:now,transactions:[],versions:[],threads:[]};draft.files[id]=value;log(draft,user,'file-created',id);return value;});return sendJson(res,201,summary(document,user));
      }
      if(route==='/libraries'&&method==='GET')return sendJson(res,200,{libraries:Object.values(database.libraries).filter(library=>database.files[library.fileId]?.members[user.id]).map(({components,variables,...library})=>library)});
      const libraryRoute=route.match(/^\/libraries\/([^/]+)$/);
      if(libraryRoute&&method==='GET'){const library=database.libraries[libraryRoute[1]];if(!library)throw fail(404,'Library not found.');access(library.fileId,user);return sendJson(res,200,library);}
      const match=route.match(/^\/files\/(file_[a-f0-9-]+)(.*)$/);if(!match)throw fail(404,'Workspace route not found.');
      const id=match[1],suffix=match[2],document=access(id,user);
      if(!suffix&&method==='GET')return sendJson(res,200,{...summary(document,user),graph:document.graph,project:graphToProject(document.graph)});
      if(suffix==='/events'&&method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive'});res.flushHeaders();
        const stream={res,userId:user.id,session:hash(cookieToken(req))};if(!streams.has(id))streams.set(id,new Set());streams.get(id).add(stream);
        res.write(`data: ${JSON.stringify({type:'connected',revision:document.revision,people:currentPresence(id)})}\n\n`);
        const heartbeat=setInterval(()=>{if(!userFor(req)){res.end();return;}res.write(': heartbeat\n\n');const before=presence.get(id)?.size||0,people=currentPresence(id);if(before!==people.length)publish(id,{type:'presence',people});},15000);heartbeat.unref();
        res.on('close',()=>{clearInterval(heartbeat);streams.get(id)?.delete(stream);});return;
      }
      if(suffix==='/presence'&&method==='POST'){
        const body=await readBody(req);if(!/^[a-zA-Z0-9-]{8,80}$/.test(body.clientId||''))throw fail(400,'Invalid client identity.');
        if(!presence.has(id))presence.set(id,new Map());const key=user.id+':'+body.clientId;
        if(body.leave)presence.get(id).delete(key);else presence.get(id).set(key,{clientId:body.clientId,userId:user.id,name:user.name,pageId:String(body.pageId||'').slice(0,120),nodeId:String(body.nodeId||'').slice(0,120),x:Math.max(-1000000,Math.min(1000000,Number(body.x)||0)),y:Math.max(-1000000,Math.min(1000000,Number(body.y)||0)),color:'#'+hash(user.id).slice(0,6),at:Date.now()});
        publish(id,{type:'presence',people:currentPresence(id)});return sendJson(res,200,{ok:true});
      }
      if(suffix==='/ops'&&method==='POST'){
        access(id,user,['owner','editor']);const body=await readBody(req);
        if(!/^[a-zA-Z0-9-]{8,100}$/.test(body.operationId||'')||!Number.isInteger(body.baseRevision)||body.baseRevision<1||!Array.isArray(body.changes))throw fail(400,'Invalid operation envelope.');
        const result=await fileTransaction(id,user,['owner','editor'],draft=>{
          const current=draft.files[id],prior=current.transactions.find(item=>item.operationId===body.operationId);
          const requestHash=hash(JSON.stringify({baseRevision:body.baseRevision,changes:body.changes}));
          if(prior){if(prior.actorId!==user.id||prior.requestHash!==requestHash)throw fail(409,'This operation identity was already used for a different request.');return {revision:current.revision,graph:current.graph,duplicate:true};}
          if(current.mergedAt)throw fail(409,'This branch was already merged and is read-only.');
          if(body.baseRevision>current.revision)throw fail(409,'The shared file revision is ahead of the server.');
          const conflicts=conflictingChanges(body.changes,current.transactions,body.baseRevision);if(conflicts.length)throw fail(409,'Concurrent edits affect the same document property.',{conflicts:conflicts.map(change=>change.path),revision:current.revision});
          const next=applyGraphChanges(current.graph,body.changes);if(Object.keys(next.nodes||{}).length>100000)throw fail(413,'The shared design exceeds 100,000 layers.');graphToProject(next);
          current.graph=next;current.name=next.meta.name;current.revision++;current.updatedAt=new Date().toISOString();current.transactions.push({operationId:body.operationId,actorId:user.id,requestHash,revision:current.revision,changes:body.changes,at:current.updatedAt});
          return {revision:current.revision,graph:next};
        });publish(id,{type:'document',revision:result.revision,actorId:user.id});return sendJson(res,200,result);
      }
      if(suffix==='/branches'&&method==='POST'){
        access(id,user,['owner','editor']);const body=await readBody(req);const branch=await fileTransaction(id,user,['owner','editor'],draft=>{
          const source=draft.files[id],branchId='file_'+crypto.randomUUID(),now=new Date().toISOString();
          const value={...clone(source),id:branchId,branchOf:id,branchName:String(body.name||'Branch').slice(0,120),baseGraph:clone(source.graph),baseRevision:source.revision,revision:1,transactions:[],versions:[],threads:[],createdAt:now,updatedAt:now};delete value.mergedAt;delete value.mergeOperationId;draft.files[branchId]=value;log(draft,user,'branch-created',branchId);return value;
        });return sendJson(res,201,summary(branch,user));
      }
      if(suffix==='/merge'&&method==='POST'){
        access(id,user,['owner','editor']);const body=await readBody(req);if(!/^[a-zA-Z0-9-]{8,100}$/.test(body.operationId||''))throw fail(400,'A merge operation identity is required.');
        const result=await fileTransaction(id,user,['owner','editor'],(draft,branch)=>{
          if(!branch.branchOf)throw fail(400,'Only a branch can be merged.');const target=draft.files[branch.branchOf];if(!target||!writeRolesFor(target,user))throw fail(403,'You cannot merge into the main file.');
          if(branch.mergedAt){if(branch.mergeOperationId===body.operationId)return {fileId:target.id,revision:target.revision,duplicate:true};throw fail(409,'This branch was already merged.');}
          const changes=diffGraphs(branch.baseGraph,branch.graph),conflicts=conflictingChanges(changes,target.transactions,branch.baseRevision);if(conflicts.length)throw fail(409,'The branch conflicts with changes in the main file.',{conflicts:conflicts.map(change=>change.path)});
          const graph=applyGraphChanges(target.graph,changes);graphToProject(graph);target.versions.unshift({id:crypto.randomUUID(),name:'Before merging '+branch.branchName,createdAt:new Date().toISOString(),actorId:user.id,revision:target.revision,graph:clone(target.graph)});
          target.graph=graph;target.name=graph.meta.name;target.revision++;target.updatedAt=new Date().toISOString();target.transactions.push({operationId:'merge-'+body.operationId,actorId:user.id,revision:target.revision,changes,at:target.updatedAt});branch.mergedAt=target.updatedAt;branch.mergeOperationId=body.operationId;log(draft,user,'branch-merged',target.id);return {fileId:target.id,revision:target.revision};
        });publish(result.fileId,{type:'document',revision:result.revision});publish(id,{type:'permissions'});return sendJson(res,200,result);
      }
      if(suffix==='/members'&&method==='GET')return sendJson(res,200,{members:Object.entries(document.members).map(([userId,role])=>({...publicUser(database.users[userId]),role}))});
      if(suffix==='/members'&&method==='POST'){
        access(id,user,['owner']);const body=await readBody(req),email=String(body.email||'').trim().toLowerCase(),member=Object.values(database.users).find(value=>value.email===email);if(!member)throw fail(404,'Ask this person to create a local workspace account first.');
        if(body.role!=='remove'&&(!roles.has(body.role)||body.role==='owner'))throw fail(400,'Choose editor, commenter, viewer, or remove.');if(member.id===document.ownerId)throw fail(400,'The owner cannot remove their own access.');
        await fileTransaction(id,user,['owner'],draft=>{if(body.role==='remove')delete draft.files[id].members[member.id];else draft.files[id].members[member.id]=body.role;log(draft,user,'membership-'+body.role,id);});
        publish(id,{type:'permissions'});return sendJson(res,200,{ok:true});
      }
      if(suffix==='/comments'&&method==='GET')return sendJson(res,200,{threads:document.threads});
      if(suffix==='/comments'&&method==='POST'){
        access(id,user,['owner','editor','commenter']);const body=await readBody(req),text=String(body.text||'').trim();if(!text||text.length>10000)throw fail(400,'Enter a comment of up to 10,000 characters.');
        if(body.nodeId&&!document.graph.nodes[body.nodeId])throw fail(400,'The comment layer no longer exists.');
        const thread=await fileTransaction(id,user,['owner','editor','commenter'],draft=>{const value={id:crypto.randomUUID(),nodeId:body.nodeId||'',resolved:false,messages:[{id:crypto.randomUUID(),author:publicUser(user),text,createdAt:new Date().toISOString()}]};draft.files[id].threads.push(value);return value;});publish(id,{type:'comments'});return sendJson(res,201,thread);
      }
      const commentRoute=suffix.match(/^\/comments\/([a-f0-9-]+)$/);
      if(commentRoute&&method==='POST'){
        access(id,user,['owner','editor','commenter']);const body=await readBody(req);
        await fileTransaction(id,user,['owner','editor','commenter'],draft=>{const thread=draft.files[id].threads.find(item=>item.id===commentRoute[1]);if(!thread)throw fail(404,'Comment thread not found.');if(typeof body.resolved==='boolean')thread.resolved=body.resolved;else{const text=String(body.text||'').trim();if(!text||text.length>10000)throw fail(400,'Enter a reply of up to 10,000 characters.');thread.messages.push({id:crypto.randomUUID(),author:publicUser(user),text,createdAt:new Date().toISOString()});}});publish(id,{type:'comments'});return sendJson(res,200,{ok:true});
      }
      if(suffix==='/versions'&&method==='GET')return sendJson(res,200,{versions:document.versions.map(({graph,...version})=>version)});
      if(suffix==='/versions'&&method==='POST'){
        access(id,user,['owner','editor']);const body=await readBody(req),version=await fileTransaction(id,user,['owner','editor'],draft=>{const value={id:crypto.randomUUID(),name:String(body.name||'Version').slice(0,120),createdAt:new Date().toISOString(),actorId:user.id,revision:draft.files[id].revision,graph:clone(draft.files[id].graph)};draft.files[id].versions.unshift(value);log(draft,user,'version-created',id);return value;});publish(id,{type:'versions'});return sendJson(res,201,{id:version.id,name:version.name,createdAt:version.createdAt});
      }
      const versionRoute=suffix.match(/^\/versions\/([a-f0-9-]+)$/);
      if(versionRoute){const version=document.versions.find(item=>item.id===versionRoute[1]);if(!version)throw fail(404,'Version not found.');if(method==='GET')return sendJson(res,200,graphToProject(version.graph));if(method==='DELETE'){access(id,user,['owner','editor']);await fileTransaction(id,user,['owner','editor'],draft=>{draft.files[id].versions=draft.files[id].versions.filter(item=>item.id!==version.id);log(draft,user,'version-deleted',id);});return sendJson(res,200,{ok:true});}}
      if(suffix==='/library'&&method==='POST'){
        access(id,user,['owner']);const body=await readBody(req),library=await fileTransaction(id,user,['owner'],draft=>{const previous=Object.values(draft.libraries).find(item=>item.fileId===id),key=previous?.id||'library_'+crypto.randomUUID(),value={id:key,fileId:id,name:String(body.name||document.name).slice(0,120),version:(previous?.version||0)+1,components:clone(draft.files[id].graph.meta.forma.components||[]),variables:clone(draft.files[id].graph.meta.forma.variables||{}),updatedAt:new Date().toISOString()};draft.libraries[key]=value;log(draft,user,'library-published',id);return value;});publish(id,{type:'library'});return sendJson(res,201,library);
      }
      if(suffix==='/audit'&&method==='GET'){access(id,user,['owner']);return sendJson(res,200,{entries:database.audit.filter(item=>item.fileId===id)});}
      throw fail(404,'Workspace route not found.');
    }catch(error){if(!res.headersSent)return sendJson(res,error.status||500,{error:error.status?error.message:'Workspace storage is unavailable.',conflicts:error.conflicts,revision:error.revision});res.end();}
  }
  return {handle};
}
