import { migrateProject } from './project-model.js';
import { apiFetch } from './api-client.js';
const ACTIVE_PROJECT_KEY='forma-active-project';
const cacheKey=id=>'forma-project-cache:'+(id||'draft');
export function createProjectStore({getProject,getId,setId,setName,onStatus,onToast,storage=globalThis.localStorage,request=apiFetch}) {
  let saveTimer,pendingSave,paused=true,conflict=false;
  const revisions=new Map(),status=text=>onStatus?.(text);
  function writeSnapshot(project=getProject?.()) {
    if(!project?.editor?.grapesjs?.pages?.length)return false;
    try{storage.setItem(cacheKey(project.id||getId()),JSON.stringify({...project,revision:revisions.get(project.id||getId())??project.revision??0}));return true;}
    catch{status('Recovery storage is full. Download a backup now.');onToast?.('Browser recovery could not be saved. Download a backup before closing.');return false;}
  }
  function readSnapshot(id=getId()) {
    try{const raw=storage.getItem(cacheKey(id));return raw?migrateProject(JSON.parse(raw),{id}):null;}catch{return null;}
  }
  async function json(url,options) {
    const response=await request(url,options),value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value.error||'Project service unavailable'),{status:response.status,code:value.code});
    return value;
  }
  async function fetchProject(id){return migrateProject(await json('/api/projects/'+encodeURIComponent(id),{cache:'no-store'}),{id});}
  async function recoverStartup(legacy) {
    paused=true;const id=getId(),cached=readSnapshot(id)||(!id?legacy:null);
    if(id){
      try{
        const disk=await fetchProject(id);revisions.set(id,disk.revision);
        if(cached&&cached.revision===disk.revision&&cached.updatedAt>disk.updatedAt){status('Recovered unsaved browser changes');paused=false;return cached;}
        if(cached&&cached.revision!==disk.revision){storage.setItem('forma-recovery:'+id+':'+Date.now(),JSON.stringify(cached));onToast?.('Opened the disk version. A separate browser recovery copy was kept.');}
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
    writeSnapshot(payload);status('Saving to project folder…');
    const operation=(async()=>{
      try{
        const value=await json('/api/projects',{method:'POST',body:JSON.stringify(payload)});
        const previousId=payload.id;revisions.set(value.id,value.revision);setId(value.id);
        try{storage.setItem(ACTIVE_PROJECT_KEY,value.id);if(previousId!==value.id)storage.removeItem(cacheKey(previousId));}catch{}
        const latest=getProject();
        const content=project=>JSON.stringify([project.name,project.editor,project.forma,project.assets]);
        const changed=!newCopy&&content(latest)!==content(payload);
        writeSnapshot({...latest,id:value.id,revision:value.revision,updatedAt:changed?latest.updatedAt:value.updatedAt});
        if(changed)scheduleSave();else status('Saved in project folder');
        if(notify)onToast?.(changed?'Saved; newer edits are being saved.':'Saved in project folder');return value;
      }catch(error){
        const safe=writeSnapshot();
        if(error.status===409){conflict=true;status('Disk version changed. Browser recovery preserved.');onToast?.(error.message);}
        else{status(safe?'Saved in this browser · folder save failed':'Save failed · download a backup');if(notify)onToast?.(safe?'Folder save failed. Browser recovery is available; retry saving or download a backup.':'Save failed. Download a backup before closing.');}
        throw error;
      }
    })();pendingSave=operation;
    try{return await operation;}finally{if(pendingSave===operation)pendingSave=undefined;}
  }
  function scheduleSave(){
    if(paused)return;
    writeSnapshot();clearTimeout(saveTimer);if(conflict)return;
    status('Saving…');saveTimer=setTimeout(()=>saveToFolder().catch(()=>{}),500);
  }
  async function flush(){clearTimeout(saveTimer);if(pendingSave)await pendingSave.catch(()=>{});return saveToFolder();}
  async function beforeSwitch(){clearTimeout(saveTimer);if(pendingSave)await pendingSave.catch(()=>{});if(!paused)writeSnapshot();paused=true;}
  function resume(){paused=false;conflict=false;}
  async function openProject(id){
    const disk=await fetchProject(id),cached=readSnapshot(id);
    let value=disk;
    if(cached&&cached.revision===disk.revision&&cached.updatedAt>disk.updatedAt)value=cached;
    else if(cached&&cached.revision!==disk.revision)storage.setItem('forma-recovery:'+id+':'+Date.now(),JSON.stringify(cached));
    revisions.set(id,disk.revision);setId(id);setName(value.name);resume();
    try{storage.setItem(ACTIVE_PROJECT_KEY,id);}catch{}return value;
  }
  async function portableProject(project=getProject()){return json('/api/portable',{method:'POST',body:JSON.stringify(project)});}
  async function portableDocument(value){return json('/api/portable',{method:'POST',body:JSON.stringify({...value,id:getId()})});}
  async function duplicateProject(id){
    const source=await portableProject(await fetchProject(id));
    return json('/api/projects',{method:'POST',body:JSON.stringify({...source,id:'',name:source.name+' copy',createdAt:new Date().toISOString()})});
  }
  async function deleteProject(id){if(id===getId())await beforeSwitch();try{const value=await json('/api/projects/'+encodeURIComponent(id),{method:'DELETE'});storage.removeItem(cacheKey(id));return value;}catch(error){resume();throw error;}}
  const versionsUrl=()=>'/api/projects/'+encodeURIComponent(getId())+'/versions';
  return {
    saveToFolder,scheduleSave,flush,beforeSwitch,resume,recoverStartup,writeSnapshot,readSnapshot,
    getProject:openProject,duplicateProject,deleteProject,portableProject,portableDocument,
    isPaused:()=>paused,
    listRecoveryCopies:()=>{const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith('forma-recovery:'))continue;try{result.push({key,project:migrateProject(JSON.parse(storage.getItem(key)))});}catch{}}return result;},
    importProject:async project=>json('/api/projects',{method:'POST',body:JSON.stringify({...await portableProject(project),id:'',createdAt:new Date().toISOString()})}),
    listProjects:()=>json('/api/projects',{cache:'no-store'}),
    listVersions:async()=>(await json(versionsUrl(),{cache:'no-store'})).versions||[],
    createVersion:async name=>{await flush();return json(versionsUrl(),{method:'POST',body:JSON.stringify({name,project:getProject()})});},
    getVersion:async id=>migrateProject(await json(versionsUrl()+'/'+encodeURIComponent(id),{cache:'no-store'}),{id:getId()}),
    deleteVersion:id=>json(versionsUrl()+'/'+encodeURIComponent(id),{method:'DELETE'}),
    cancelScheduledSave:()=>clearTimeout(saveTimer),
  };
}
