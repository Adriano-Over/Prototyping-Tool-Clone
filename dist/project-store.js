import { migrateProject } from './project-model.js';
import { apiFetch } from './api-client.js';
import { createBrowserRecovery } from './browser-recovery.js';
const ACTIVE_PROJECT_KEY='forma-active-project';
const cacheKey=id=>'forma-project-cache:'+(id||'draft');
const recoveryPrefix='forma-recovery:';
const projectContents=project=>JSON.stringify([project.name,project.editor,project.forma,project.assets]);
export function createProjectStore({getProject,getId,setId,setName,onStatus,onToast,storage=globalThis.localStorage,recovery=createBrowserRecovery(),request=apiFetch}) {
  let saveTimer,pendingSave,paused=true,conflict=false;
  const revisions=new Map(),privateCopies=new Map(),status=text=>onStatus?.(text);
  let lastWritten;
  async function putRecovery(key,value){
    if(recovery){
      try{await recovery.put(key,value);return true;}catch{}
    }
    try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
  }
  async function writeSnapshot(project=getProject?.(),{warn=true}={}) {
    if(!project?.editor?.grapesjs?.pages?.length)return false;
    const id=project.id||getId();
    if(await putRecovery(cacheKey(id),{...project,revision:revisions.get(id)??project.revision??0}))return true;
    if(warn){status('Recovery storage is full. Download a backup now.');onToast?.('Browser recovery could not be saved. Download a backup before closing.');}
    return false;
  }
  async function getRecovery(key){
    let large,legacy;
    try{large=await recovery?.get(key);}catch{}
    try{legacy=JSON.parse(storage.getItem(key));}catch{}
    if(!large||legacy?.updatedAt>large.updatedAt)return legacy||null;
    return large;
  }
  async function removeRecovery(key){
    try{await recovery?.remove(key);}catch{}
    try{storage.removeItem(key);}catch{}
  }
  async function readSnapshot(id=getId()) {
    try{const value=await getRecovery(cacheKey(id));return value?migrateProject(value,{id}):null;}catch{return null;}
  }
  async function retainRecovery(id,cached){
    const key=recoveryPrefix+id+':'+Date.now();
    if(await putRecovery(key,cached)){onToast?.('Opened the disk version. A separate browser recovery copy was kept.');return;}
    privateCopies.set(key,cached);
    onToast?.('Opened the disk version. Download the recovery copy from Projects before closing.');
  }
  async function json(url,options) {
    const response=await request(url,options),value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value.error||'Project service unavailable'),{status:response.status,code:value.code});
    return value;
  }
  async function fetchProject(id){return migrateProject(await json('/api/projects/'+encodeURIComponent(id),{cache:'no-store'}),{id});}
  async function recoverStartup(legacy) {
    paused=true;const id=getId(),cached=await readSnapshot(id)||(!id?legacy:null);
    if(id){
      try{
        const disk=await fetchProject(id);revisions.set(id,disk.revision);
        if(cached&&cached.revision===disk.revision&&cached.updatedAt>disk.updatedAt){status('Recovered unsaved browser changes');paused=false;return cached;}
        if(cached&&cached.revision!==disk.revision)await retainRecovery(id,cached);
        paused=false;return disk;
      }catch(error){
        if(cached){revisions.set(id,cached.revision);paused=false;status('Recovered in this browser. Folder save will retry.');return cached;}
        status('Saved project could not be opened. Autosave is paused.');
        throw new Error('Could not reopen the saved project. Retry opening it in Projects, or create a new project. The saved file has not been changed.');
      }
    }
    paused=false;return cached||null;
  }
  async function saveToFolder({notify=false,newCopy=false}={}) {
    if(paused)throw new Error('Autosave is paused until a project is safely opened.');
    if(conflict)throw new Error('This project changed on disk. Reopen it or download a recovery backup.');
    while(pendingSave)await pendingSave.catch(()=>{});
    if(conflict||paused)throw new Error('Saving is paused. Reopen the project or download a recovery backup.');
    const payload=newCopy?await portableProject():getProject?.();if(!payload?.editor?.grapesjs?.pages?.length)return;
    payload.id=newCopy?'':getId()||'';payload.baseRevision=revisions.get(payload.id)??0;
    const contents=projectContents(payload);
    if(!notify&&!newCopy&&lastWritten?.value.id===payload.id&&lastWritten.contents===contents){
      status('Saved in project folder');return lastWritten.value;
    }
    void writeSnapshot(payload,{warn:false});status('Saving to project folder…');
    const operation=(async()=>{
      try{
        const value=await json('/api/projects',{method:'POST',body:JSON.stringify(payload)});
        const previousId=payload.id;revisions.set(value.id,value.revision);setId(value.id);
        lastWritten={value,contents};
        try{storage.setItem(ACTIVE_PROJECT_KEY,value.id);}catch{}
        if(previousId!==value.id)await removeRecovery(cacheKey(previousId));
        const latest=getProject();
        const changed=!newCopy&&projectContents(latest)!==contents;
        void writeSnapshot({...latest,id:value.id,revision:value.revision,updatedAt:changed?latest.updatedAt:value.updatedAt},{warn:false});
        if(changed)scheduleSave();else status('Saved in project folder');
        if(notify)onToast?.(changed?'Saved; newer edits are being saved.':'Saved in project folder');return value;
      }catch(error){
        const safe=await writeSnapshot();
        if(error.status===409){conflict=true;status('Disk version changed. Browser recovery preserved.');onToast?.(error.message);}
        else{status(safe?'Saved in this browser · folder save failed':'Save failed · download a backup');if(notify)onToast?.(safe?'Folder save failed. Browser recovery is available; retry saving or download a backup.':'Save failed. Download a backup before closing.');}
        throw error;
      }
    })();pendingSave=operation;
    try{return await operation;}finally{if(pendingSave===operation)pendingSave=undefined;}
  }
  function scheduleSave(){
    if(paused)return;
    const project=getProject?.();
    clearTimeout(saveTimer);
    if(!pendingSave&&lastWritten?.value.id===getId()&&project&&lastWritten.contents===projectContents(project))return;
    void writeSnapshot(project,{warn:false});if(conflict)return;
    status('Saving…');saveTimer=setTimeout(()=>saveToFolder().catch(()=>{}),500);
  }
  async function flush(){clearTimeout(saveTimer);if(pendingSave)await pendingSave.catch(()=>{});return saveToFolder();}
  async function beforeSwitch(){clearTimeout(saveTimer);if(pendingSave)await pendingSave.catch(()=>{});const wasPaused=paused;paused=true;if(!wasPaused)await writeSnapshot(undefined,{warn:false});}
  function resume(){paused=false;conflict=false;}
  async function openProject(id){
    const [disk,cached]=await Promise.all([fetchProject(id),readSnapshot(id)]);
    let value=disk;
    if(cached&&cached.revision===disk.revision&&cached.updatedAt>disk.updatedAt)value=cached;
    else if(cached&&cached.revision!==disk.revision)await retainRecovery(id,cached);
    lastWritten=undefined;revisions.set(id,disk.revision);setId(id);setName(value.name);resume();
    try{storage.setItem(ACTIVE_PROJECT_KEY,id);}catch{}return value;
  }
  async function portableProject(project=getProject()){return json('/api/portable',{method:'POST',body:JSON.stringify(project)});}
  async function portableDocument(value){return json('/api/portable',{method:'POST',body:JSON.stringify({...value,id:getId()})});}
  async function duplicateProject(id){
    const source=await portableProject(await fetchProject(id));
    return json('/api/projects',{method:'POST',body:JSON.stringify({...source,id:'',name:source.name+' copy',createdAt:new Date().toISOString()})});
  }
  async function deleteProject(id){if(id===getId())await beforeSwitch();try{const value=await json('/api/projects/'+encodeURIComponent(id),{method:'DELETE'});await removeRecovery(cacheKey(id));return value;}catch(error){resume();throw error;}}
  async function listRecoveryCopies(){
    const keys=new Set(privateCopies.keys());
    try{for(const key of await recovery?.keys(recoveryPrefix)||[])keys.add(key);}catch{}
    try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(recoveryPrefix))keys.add(key);}}catch{}
    const result=await Promise.all([...keys].map(async key=>{
      try{const value=privateCopies.get(key)||await getRecovery(key);return value?{key,project:migrateProject(value)}:null;}catch{return null;}
    }));
    return result.filter(Boolean);
  }
  const versionsUrl=()=>'/api/projects/'+encodeURIComponent(getId())+'/versions';
  return {
    saveToFolder,scheduleSave,flush,beforeSwitch,resume,recoverStartup,writeSnapshot,readSnapshot,
    getProject:openProject,duplicateProject,deleteProject,portableProject,portableDocument,
    isPaused:()=>paused,
    listRecoveryCopies,
    importProject:async project=>json('/api/projects',{method:'POST',body:JSON.stringify({...await portableProject(project),id:'',createdAt:new Date().toISOString()})}),
    listProjects:()=>json('/api/projects',{cache:'no-store'}),
    listVersions:async()=>(await json(versionsUrl(),{cache:'no-store'})).versions||[],
    createVersion:async name=>{await flush();return json(versionsUrl(),{method:'POST',body:JSON.stringify({name,project:getProject()})});},
    getVersion:async id=>migrateProject(await json(versionsUrl()+'/'+encodeURIComponent(id),{cache:'no-store'}),{id:getId()}),
    deleteVersion:id=>json(versionsUrl()+'/'+encodeURIComponent(id),{method:'DELETE'}),
    cancelScheduledSave:()=>clearTimeout(saveTimer),
  };
}
