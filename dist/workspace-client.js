import {apiFetch} from './api-client.js';
import {projectToGraph,graphToProject,diffGraphs,applyGraphChanges,pathsIntersect} from './collaboration-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone=value=>structuredClone(value);
const writeRoles=['owner','editor'];
export function installWorkspace(api){
  let user,active,source,timer,heartbeat,sending=false,applying=false,conflict,refreshRequested=false,people=[],lastPosition={x:0,y:0},dialogTab='files',threads=[],generation=0,retryDelay=750;
  const clientId=crypto.randomUUID(),localVersions=api.versions;
  const prefix='/api/workspace';
  const request=async(route,options={})=>{const response=await apiFetch(prefix+route,options);const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'Workspace unavailable.'),{status:response.status,conflicts:value.conflicts});return value;};
  const post=(route,body={})=>request(route,{method:'POST',body:JSON.stringify(body)});
  const fileRoute=suffix=>'/files/'+active.id+suffix;
  const canWrite=()=>!active||(writeRoles.includes(active.role)&&!active.mergedAt);
  const status=text=>{if(active)document.getElementById('save-status').textContent=text;};
  const recoveryKey=id=>'forma-shared-recovery:'+user?.id+':'+id;
  function captureRecovery(){if(!active||applying)return true;try{localStorage.setItem(recoveryKey(active.id),JSON.stringify({fileId:active.id,baseGraph:active.graph,revision:active.revision,pending:active.pending,localGraph:projectToGraph(api.serializeProject()),at:Date.now()}));return true;}catch{status('Offline recovery is full · download a backup');return false;}}
  function replace(graph,{reset=false}={}){applying=true;try{api.loadSharedProject(graphToProject(graph),{reset});}finally{applying=false;}permissions();}
  function rebaseHistory(changes){
    const current=api.serializeProject();api.history.rebase(snapshot=>{
      try{
        let graph=projectToGraph({...current,name:snapshot.data.name,editor:{grapesjs:snapshot.data.editor},forma:snapshot.data.forma,assets:snapshot.data.assets});
        for(const change of changes)try{graph=applyGraphChanges(graph,[change]);}catch{}
        const project=graphToProject(graph);return {...snapshot,data:{...snapshot.data,name:project.name,editor:project.editor.grapesjs,forma:project.forma,assets:project.assets}};
      }catch{return null;}
    });
  }
  async function flush(){
    clearTimeout(timer);if(!active||applying||!canWrite())return;if(conflict)throw Error('Resolve the concurrent edit before saving.');
    if(sending){refreshRequested=true;return sending;}
    const current=active,epoch=generation,captured=current.pending?.graph||projectToGraph(api.serializeProject()),changes=current.pending?.changes||diffGraphs(current.graph,captured);
    if(!changes.length){status('Shared · saved');return;}
    current.pending||={operationId:crypto.randomUUID(),baseRevision:current.revision,graph:captured,changes};captureRecovery();let finished;sending=new Promise(resolve=>{finished=resolve;});status('Sharing changes…');
    try{
      const result=await post('/files/'+current.id+'/ops',{baseRevision:current.pending.baseRevision,operationId:current.pending.operationId,changes});
      if(epoch!==generation)return;
      const now=projectToGraph(api.serializeProject()),pending=diffGraphs(captured,now),foreign=diffGraphs(captured,result.graph);
      rebaseHistory(foreign);active={...current,graph:result.graph,revision:result.revision,pending:null};retryDelay=750;
      if(foreign.length)replace(applyGraphChanges(result.graph,pending));
      captureRecovery();status('Shared · saved');
    }catch(error){
      if(epoch!==generation)return;
      if(error.status===409){const remote=await request('/files/'+current.id);conflict={remote,local:projectToGraph(api.serializeProject())};status('Concurrent edits need review');if(dialog.open)render();api.toast('Concurrent edits affect the same property. Open Share to review.');}
      else if(error.status===403||error.status===404){status('Shared access changed');await pull();}
      else{status('Offline · changes kept on this device');captureRecovery();retryDelay=Math.min(30000,retryDelay*2);}throw error;
    }finally{sending=false;finished();if(epoch===generation&&active&&!conflict&&(refreshRequested||diffGraphs(active.graph,projectToGraph(api.serializeProject())).length)){refreshRequested=false;timer=setTimeout(()=>flush().catch(()=>{}),retryDelay);}}
  }
  function schedule(){if(!active||applying)return;captureRecovery();if(!canWrite())return;clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),300);}
  async function pull(){
    if(!active)return;if(sending){refreshRequested=true;return;}
    const epoch=generation,current=active;
    try{
      const remote=await request('/files/'+current.id);if(epoch!==generation)return;
      active.role=remote.role;active.mergedAt=remote.mergedAt;permissions();
      if(remote.revision===current.revision)return;
      const local=projectToGraph(api.serializeProject()),pending=diffGraphs(current.graph,local),foreign=diffGraphs(current.graph,remote.graph);
      const collisions=pending.filter(change=>foreign.some(other=>!(change.kind==='sequence'&&other.kind==='sequence'&&JSON.stringify(change.path)===JSON.stringify(other.path))&&pathsIntersect(change.path,other.path)));
      if(collisions.length){conflict={remote,local};captureRecovery();status('Concurrent edits need review');if(dialog.open)render();return;}
      rebaseHistory(foreign);active={...current,graph:remote.graph,revision:remote.revision,role:remote.role};replace(applyGraphChanges(remote.graph,pending));captureRecovery();if(pending.length)schedule();else status('Shared · saved');
    }catch(error){status(error.status===404||error.status===401?'Shared access unavailable':'Offline · recovery available');if(error.status===404||error.status===401){active.role='viewer';permissions();source?.close();}}
  }
  async function leave(){
    if(!active)return;try{await flush();}catch{}if(!captureRecovery())throw Error('Download a backup before leaving this shared design.');
    generation++;source?.close();clearInterval(heartbeat);clearTimeout(timer);post(fileRoute('/presence'),{clientId,leave:true}).catch(()=>{});active=null;conflict=null;people=[];permissions();renderPresence();
  }
  async function presenceUpdate(){if(!active)return;const frame=api.editor.Pages.getSelected();await post(fileRoute('/presence'),{clientId,pageId:frame?.id,nodeId:api.selected?.get('formaNodeId'),...lastPosition}).catch(()=>{});}
  async function open(id){
    await leave();const remote=await request('/files/'+id);await api.prepareSharedProject();generation++;active={...remote};conflict=null;
    let local=remote.graph;try{const recovery=JSON.parse(localStorage.getItem(recoveryKey(id)));if(recovery&&writeRoles.includes(remote.role)){const pending=diffGraphs(recovery.baseGraph,recovery.localGraph),foreign=diffGraphs(recovery.baseGraph,remote.graph);if(recovery.pending){active={...active,graph:recovery.baseGraph,revision:recovery.revision,pending:recovery.pending};local=recovery.localGraph;}else if(pending.length){if(pending.some(change=>foreign.some(other=>pathsIntersect(change.path,other.path)&&!(change.kind==='sequence'&&other.kind==='sequence')))){conflict={remote,local:recovery.localGraph};local=recovery.localGraph;}else local=applyGraphChanges(remote.graph,pending);}}}catch{}
    replace(local,{reset:true});status(conflict?'Concurrent edits need review':'Shared · connected');
    if(active.pending)await flush().catch(()=>{});source=new EventSource(prefix+'/files/'+id+'/events');
    source.onmessage=event=>{if(!active||active.id!==id)return;const message=JSON.parse(event.data);if(message.type==='access-revoked'){active.role='viewer';permissions();status('Shared access revoked');source.close();return;}if(message.type==='presence'||message.type==='connected'){people=message.people||[];renderPresence();}if(['document','permissions'].includes(message.type))pull();if(message.type==='comments'){loadThreads().then(()=>{if(dialog.open&&dialogTab==='discussion')render();window.dispatchEvent(new CustomEvent('forma:shared-comments'));}).catch(()=>{});}if(message.type==='connected'&&message.revision!==active.revision)pull();};
    source.onerror=()=>status('Reconnecting · local recovery available');
    heartbeat=setInterval(()=>{presenceUpdate();if(!sending&&!conflict)schedule();},5000);presenceUpdate();if(canWrite())schedule();if(dialog.open)render();
  }
  function permissions(){
    const readonly=Boolean(active&&!canWrite());
    for(const selector of ['.tool-dock','.selection-heading']){const node=document.querySelector(selector);if(node)node.inert=readonly;}
    document.querySelectorAll('#design-panel .inspector-section').forEach(node=>{if(!node.classList.contains('export-section'))node.inert=readonly;});
    document.querySelectorAll('.selection-actions,#add-page,#reset-project,#file-name,#prototype-panel').forEach(node=>{node.inert=readonly;});
    const frame=api.editor.Canvas.getFrameEl();if(frame)frame.style.pointerEvents=readonly?'none':'';
    document.querySelectorAll('[data-wb-tab]').forEach(button=>{button.disabled=readonly&&!['comments','versions','dev','roadmap'].includes(button.dataset.wbTab);});
    document.querySelectorAll('#wb-version-create,[data-version-restore],[data-version-delete]').forEach(button=>{button.disabled=readonly;});
  }
  function renderPresence(){
    let overlay=document.getElementById('workspace-presence');if(!overlay){overlay=document.createElement('div');overlay.id='workspace-presence';overlay.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:8000;overflow:hidden';document.body.append(overlay);}overlay.replaceChildren();if(!active)return;
    const frame=api.editor.Canvas.getFrameEl()?.getBoundingClientRect(),zoom=api.editor.Canvas.getZoom()/100;if(!frame)return;
    for(const person of people.filter(item=>item.clientId!==clientId&&item.pageId===api.editor.Pages.getSelected()?.id)){
      const marker=document.createElement('div');marker.style.cssText=`position:absolute;left:${frame.left+person.x*zoom}px;top:${frame.top+person.y*zoom}px;color:${person.color};font:600 12px Inter,sans-serif;white-space:nowrap`;marker.textContent='➤ '+person.name;overlay.append(marker);
    }
  }
  api.editor.on('canvas:frame:load',({window})=>window.document.addEventListener('pointermove',event=>{lastPosition={x:event.clientX,y:event.clientY};}));api.editor.on('component:selected page:select',()=>{presenceUpdate();renderPresence();});
  new MutationObserver(permissions).observe(document.getElementById('workbench-dialog'),{childList:true,subtree:true});
  window.addEventListener('online',()=>{pull();schedule();});window.addEventListener('pagehide',captureRecovery);
  api.assetManager.localImportFile=api.assetManager.importFile;
  api.assetManager.importFile=async file=>{
    if(!active)return api.assetManager.localImportFile(file);if(!canWrite())throw Error('Your role cannot add images.');if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(file.type)||file.size>25*1024*1024)throw Error('Choose an image of 25 MB or smaller.');
    const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join(''),src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const asset={id:'asset_'+sha256.slice(0,20),name:file.name,mime:file.type,bytes:file.size,sha256,dataUrl:src};const assets=api.projectState.getAssets();if(!assets.some(item=>item.id===asset.id))api.projectState.setAssets([...assets,asset]);return {asset,src};
  };
  api.versions={listVersions:()=>active?request(fileRoute('/versions')).then(value=>value.versions):localVersions.listVersions(),createVersion:async name=>{if(!active)return localVersions.createVersion(name);await flush();return post(fileRoute('/versions'),{name});},getVersion:id=>active?request(fileRoute('/versions/'+id)):localVersions.getVersion(id),deleteVersion:id=>active?request(fileRoute('/versions/'+id),{method:'DELETE'}):localVersions.deleteVersion(id)};

  const button=document.createElement('button');button.className='secondary-btn';button.textContent='Share';button.id='workspace-button';document.querySelector('.header-actions').prepend(button);
  const dialog=document.createElement('dialog');dialog.className='workbench-dialog';dialog.style.cssText='width:min(800px,96vw);height:auto;max-height:90vh;overflow:auto';document.body.append(dialog);
  button.onclick=async()=>{try{user=(await request('/me')).user;render();dialog.showModal();}catch(error){api.toast(error.message);}};
  const invoke=work=>async()=>{try{await work();render();}catch(error){api.toast(error.message);const status=dialog.querySelector('[role="status"]');if(status)status.textContent=error.message;}};
  async function loadThreads(){if(!active)return;threads=(await request(fileRoute('/comments'))).threads;}
  function discussionMarkup(){return `<div class="wb-comment-compose"><textarea id="shared-comment" aria-label="New shared comment" placeholder="Comment on the selected layer"></textarea><button id="shared-comment-add" class="primary-btn">Add comment</button></div><div class="wb-list">${threads.map(thread=>`<article><div><b>${thread.resolved?'Resolved':'Open'} thread</b>${thread.messages.map(message=>`<p><strong>${esc(message.author.name)}</strong> ${esc(message.text)}</p>`).join('')}<input data-reply-input="${thread.id}" aria-label="Reply to thread ${thread.id}"><button data-reply="${thread.id}">Reply</button><button data-resolve="${thread.id}">${thread.resolved?'Reopen':'Resolve'}</button></div></article>`).join('')||'<p>No comments yet.</p>'}</div>`;}
  function bindDiscussion(root){
    const allowed=['owner','editor','commenter'].includes(active?.role);root.querySelectorAll('textarea,input,button').forEach(node=>{node.disabled=!allowed;});
    root.querySelector('#shared-comment-add').onclick=invoke(async()=>{await post(fileRoute('/comments'),{text:root.querySelector('#shared-comment').value,nodeId:api.selected?.get('formaNodeId')||''});await loadThreads();});
    root.querySelectorAll('[data-reply]').forEach(button=>button.onclick=invoke(async()=>{await post(fileRoute('/comments/'+button.dataset.reply),{text:root.querySelector(`[data-reply-input="${button.dataset.reply}"]`).value});await loadThreads();}));
    root.querySelectorAll('[data-resolve]').forEach(button=>button.onclick=invoke(async()=>{const thread=threads.find(item=>item.id===button.dataset.resolve);await post(fileRoute('/comments/'+thread.id),{resolved:!thread.resolved});await loadThreads();}));
  }
  async function renderDiscussion(content){content.innerHTML='<p>Loading shared comments…</p>';await loadThreads();content.innerHTML=discussionMarkup();bindDiscussion(content);}
  function render(){
    dialog.innerHTML=`<div class="wb-head"><div><span class="eyebrow">LOCAL WORKSPACE</span><h2>${user?'Share and collaborate':'Workspace account'}</h2></div><button id="workspace-close" class="icon-btn" aria-label="Close workspace">×</button></div><section class="wb-section"><p role="status"></p>${!user?`<div class="wb-form vertical"><label>Name<input id="workspace-name" autocomplete="name"></label><label>Email<input id="workspace-email" type="email" autocomplete="username"></label><label>Password<input id="workspace-password" type="password" minlength="12" autocomplete="current-password"></label></div><div class="wb-actions"><button id="workspace-login" class="primary-btn">Sign in</button><button id="workspace-register" class="secondary-btn">Create local account</button></div><p>Accounts and shared designs are stored on this computer. Hosting can be connected later.</p>`:`<p>Signed in as <strong>${esc(user.name)}</strong> (${esc(user.email)})</p><div class="wb-actions"><button id="workspace-files" class="secondary-btn">Shared files</button><button id="workspace-discussion" class="secondary-btn" ${active?'':'disabled'}>Discussion</button><button id="workspace-libraries" class="secondary-btn">Libraries</button><button id="workspace-signout" class="secondary-btn">Sign out</button></div>${active?`<p><strong>${esc(active.name)}</strong> · ${esc(active.role)} · revision ${active.revision}</p><button id="workspace-local-copy" class="secondary-btn">Make local copy</button>${canWrite()?'<button id="workspace-branch" class="secondary-btn">Create branch</button>':''}${active.branchOf&&canWrite()?'<button id="workspace-merge" class="primary-btn">Merge branch into main</button>':''}`:'<button id="workspace-publish" class="primary-btn">Share current design</button>'}${conflict?'<div class="wb-section"><h3>Concurrent edits need review</h3><p>Your changes are kept in local recovery. Choose which values to use for the conflicting properties.</p><button id="workspace-use-shared" class="secondary-btn">Use shared values</button><button id="workspace-keep-local" class="primary-btn">Keep my values</button></div>':''}<div id="workspace-content"></div>`}</section>`;
    dialog.querySelector('#workspace-close').onclick=()=>dialog.close();
    if(!user){for(const [id,route] of [['workspace-login','/auth/login'],['workspace-register','/auth/register']])dialog.querySelector('#'+id).onclick=invoke(async()=>{user=(await post(route,{name:dialog.querySelector('#workspace-name').value,email:dialog.querySelector('#workspace-email').value,password:dialog.querySelector('#workspace-password').value})).user;});return;}
    dialog.querySelector('#workspace-signout').onclick=invoke(async()=>{const wasActive=Boolean(active);await leave();await post('/auth/logout');user=null;if(wasActive)await api.newLocalProject();});
    dialog.querySelector('#workspace-publish')?.addEventListener('click',invoke(async()=>{const project=await api.portableProject(),result=await post('/files',{project});await open(result.id);}));
    dialog.querySelector('#workspace-local-copy')?.addEventListener('click',invoke(async()=>{const project=api.serializeProject();await leave();await api.importLocalProject(project);dialog.close();}));
    for(const tab of ['files','discussion','libraries'])dialog.querySelector('#workspace-'+tab).onclick=()=>{dialogTab=tab;render();};
    if(conflict){
      dialog.querySelector('#workspace-use-shared').onclick=invoke(async()=>{const remote=conflict.remote;captureRecovery();conflict=null;active={...active,graph:remote.graph,revision:remote.revision,role:remote.role,pending:null};replace(remote.graph,{reset:true});status('Shared · saved');});
      dialog.querySelector('#workspace-keep-local').onclick=invoke(async()=>{const {remote,local}=conflict;conflict=null;active={...active,graph:remote.graph,revision:remote.revision,role:remote.role,pending:null};replace(local,{reset:true});await flush();});
    }
    dialog.querySelector('#workspace-branch')?.addEventListener('click',invoke(async()=>{const name=await api.ask({title:'Create branch',value:'Design exploration'});if(!name)return;await flush();const branch=await post(fileRoute('/branches'),{name});await open(branch.id);}));
    dialog.querySelector('#workspace-merge')?.addEventListener('click',invoke(async()=>{await flush();const result=await post(fileRoute('/merge'),{operationId:crypto.randomUUID()});await open(result.fileId);}));
    const content=dialog.querySelector('#workspace-content');
    if(dialogTab==='discussion'&&active){loadThreads().then(()=>{if(!dialog.open||dialogTab!=='discussion')return;content.innerHTML=discussionMarkup();bindDiscussion(content);}).catch(error=>{content.textContent=error.message;});}
    else if(dialogTab==='libraries')renderLibraries(content);
    else renderFiles(content);
    permissions();
  }
  async function renderFiles(content){
    try{
      const {files}=await request('/files');if(!content.isConnected)return;
      content.innerHTML=`<div class="wb-list">${files.map(file=>`<article><div><b>${esc(file.name)}</b><small>${file.role} · revision ${file.revision}</small></div><button data-open-shared="${file.id}">Open</button></article>`).join('')||'<p>No shared designs yet.</p>'}</div>${active?.role==='owner'?'<h3>People with access</h3><div id="workspace-members"></div><div class="wb-form"><label>Account email<input id="workspace-invite-email" type="email"></label><label>Role<select id="workspace-invite-role"><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="remove">Remove access</option></select></label></div><button id="workspace-invite" class="primary-btn">Update access</button>':''}`;
      content.querySelectorAll('[data-open-shared]').forEach(button=>button.onclick=invoke(()=>open(button.dataset.openShared)));
      if(active?.role==='owner'){
        const {members}=await request(fileRoute('/members'));const target=content.querySelector('#workspace-members');if(target)target.textContent=members.map(member=>member.name+' ('+member.email+') — '+member.role).join(' · ');
        content.querySelector('#workspace-invite').onclick=invoke(()=>post(fileRoute('/members'),{email:content.querySelector('#workspace-invite-email').value,role:content.querySelector('#workspace-invite-role').value}));
      }
    }catch(error){content.textContent=error.message;}
  }
  async function renderLibraries(content){
    try{
      const {libraries}=await request('/libraries');if(!content.isConnected)return;
      content.innerHTML=`${active?.role==='owner'?'<button id="workspace-library-publish" class="primary-btn">Publish component library</button>':''}<div class="wb-list">${libraries.map(library=>`<article><div><b>${esc(library.name)}</b><small>Version ${library.version}</small></div><button data-library="${library.id}">${canWrite()?'Import / update':'View only'}</button></article>`).join('')||'<p>No accessible libraries yet.</p>'}</div>`;
      content.querySelector('#workspace-library-publish')?.addEventListener('click',invoke(async()=>{await flush();await post(fileRoute('/library'),{name:active.name});}));
      content.querySelectorAll('[data-library]').forEach(button=>{button.disabled=!canWrite();button.onclick=invoke(async()=>{
        const library=await request('/libraries/'+button.dataset.library),items=api.projectState.getComponents(),sourceId=library.id;
        const imported=library.components.map(item=>({...item,id:sourceId+'-'+item.id,mainNodeId:undefined,librarySource:{id:sourceId,componentId:item.id,version:library.version}}));
        api.projectState.setComponents([...items.filter(item=>item.librarySource?.id!==sourceId),...imported]);api.components.synchronize();schedule();api.toast('Library components updated. Instance overrides were preserved.');
      });});
    }catch(error){content.textContent=error.message;}
  }
  const service={isActive:()=>Boolean(active),get applying(){return applying;},canWrite,schedule,flush,leave,captureRecovery,renderDiscussion,user:()=>user,active:()=>active};api.workspace=service;
  return service;
}
