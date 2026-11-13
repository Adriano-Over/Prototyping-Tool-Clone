import { renderLayoutPanel } from './layout-panel.js';
import { installDesignExport } from './design-export.js';
import { installWorkspace } from './workspace-client.js';
import { createDesignSystemPanel } from './design-system-panel.js';
import { createTextStylePanel } from './text-style-panel.js';
import { setProjectSectionCommand } from './command-service.js';
import { autoLayoutCommand, gridMetadataCommand, removeAutoLayoutCommand } from './layout-service.js';
import { normalizeInteractions } from './prototype-model.js';

const waitForApi=()=>new Promise(resolve=>{
  if(window.formaApi?.editor)return resolve(window.formaApi);
  window.addEventListener('forma:ready',event=>resolve(event.detail),{once:true});
});

const api=await waitForApi();
const editor=api.editor;
const projectState=api.projectState;
const setSection=(section,value,id)=>api.commands.execute(setProjectSectionCommand(projectState,section,value,id));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="workbench.css">');
document.head.insertAdjacentHTML('beforeend','<style>@media(max-width:760px){#workbench-button{display:flex!important;width:34px;padding:0;justify-content:center;font-size:0}#workbench-button span{font-size:14px}}</style>');
const button=document.createElement('button');
button.id='workbench-button';button.className='secondary-btn';button.innerHTML='<span aria-hidden="true">◆</span> Workbench';
document.querySelector('.header-actions').prepend(button);
document.body.insertAdjacentHTML('beforeend',`
<dialog id="workbench-dialog" class="workbench-dialog">
  <div class="wb-head"><div><span class="eyebrow">FORMA DESKTOP</span><h2>Design workbench</h2><p>Advanced design, prototype and developer tools</p></div><button id="wb-close" class="icon-btn" aria-label="Close workbench">×</button></div>
  <div class="wb-layout">
    <nav class="wb-nav" aria-label="Workbench sections">
      <button class="active" data-wb-tab="create">Create</button><button data-wb-tab="layout">Layout</button><button data-wb-tab="components">Components</button><button data-wb-tab="text-styles">Text styles</button><button data-wb-tab="variables">Variables</button><button data-wb-tab="prototype">Prototype</button><button data-wb-tab="comments">Comments</button><button data-wb-tab="versions">Versions</button><button data-wb-tab="dev">Dev Mode</button><button data-wb-tab="roadmap">Coverage</button>
    </nav>
    <div id="wb-content" class="wb-content"></div>
  </div>
</dialog>`);
const dialog=document.getElementById('workbench-dialog');
const content=document.getElementById('wb-content');
const designSystem=createDesignSystemPanel({api,content,render,esc});
const textStylePanel=createTextStylePanel({api,content,render,esc});
installDesignExport(api);
installWorkspace(api);
let active='create';
button.onclick=()=>{render();dialog.showModal();};
document.getElementById('wb-close').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
dialog.querySelectorAll('[data-wb-tab]').forEach(tab=>tab.onclick=()=>{active=tab.dataset.wbTab;dialog.querySelectorAll('[data-wb-tab]').forEach(item=>item.classList.toggle('active',item===tab));render();});

function uid(prefix='item'){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;}
function selection(){return api.selected;}
function requireSelection(){const selected=selection();if(!selected)api.toast('Select a layer first');return selected;}
function appendSvg(name,markup,width=160,height=160){
  const target=editor.getWrapper().components().models.find(c=>c.components().length>0)||editor.getWrapper();
  const component=target.append({type:'image',name,attributes:{src:`data:image/svg+xml,${encodeURIComponent(markup)}`},style:{position:'absolute',left:'48px',top:'48px',width:`${width}px`,height:`${height}px`},draggable:true,resizable:true})[0];
  editor.select(component);api.renderLayers();api.toast(`${name} added`);
}
const svg=(body,w=160,h=160)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
function createView(){
  content.innerHTML=`<section class="wb-section"><span class="eyebrow">VECTOR & SHAPE TOOLS</span><h3>Create editable canvas objects</h3><p>Insert SVG-backed vector shapes or standard GrapesJS objects.</p><div class="wb-card-grid">
  <button data-create="polygon"><b>⬡</b><span>Polygon</span></button><button data-create="star"><b>★</b><span>Star</span></button><button data-create="arrow"><b>→</b><span>Arrow</span></button><button data-create="pencil"><b>〰</b><span>Pencil stroke</span></button><button data-create="image"><b>▧</b><span>Image</span></button><button data-create="section"><b>⌗</b><span>Section</span></button></div></section>`;
  content.querySelectorAll('[data-create]').forEach(item=>item.onclick=()=>{
    const kind=item.dataset.create;
    if(kind==='polygon')appendSvg('Polygon',svg('<polygon points="80,7 151,49 151,111 80,153 9,111 9,49" fill="#b9d9c3" stroke="#188466" stroke-width="3"/>'));
    if(kind==='star')appendSvg('Star',svg('<path d="M80 8l21 43 48 7-35 34 8 48-42-23-42 23 8-48-35-34 48-7z" fill="#edc471" stroke="#8d7130" stroke-width="3"/>'));
    if(kind==='arrow')appendSvg('Arrow',svg('<defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L0 6L9 3z" fill="#188466"/></marker></defs><path d="M12 80C55 22 105 138 148 60" fill="none" stroke="#188466" stroke-width="6" stroke-linecap="round" marker-end="url(#a)"/>'));
    if(kind==='pencil')appendSvg('Pencil stroke',svg('<path d="M8 105C28 22 58 144 80 72S127 39 152 91" fill="none" stroke="#9470ef" stroke-width="9" stroke-linecap="round"/>'));
    if(kind==='section'){api.addElement('frame');selection()?.set('name','Section');api.style({'background-color':'#f4f1ff','border':'1px dashed #9470ef'});}
    if(kind==='image')pickImage();
  });
}
function pickImage(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const {asset,src}=await api.assetManager.importFile(file);const target=editor.getWrapper().components().models.find(c=>c.components().length>0)||editor.getWrapper();const component=target.append({type:'image',name:file.name,assetId:asset.id,attributes:{src,alt:file.name,'data-forma-asset-id':asset.id},style:{position:'absolute',left:'48px',top:'48px',width:'320px',height:'220px','object-fit':'cover'},draggable:true,resizable:true})[0];editor.select(component);api.renderLayers();api.toast('Image saved to project assets');}catch(error){api.toast(error.message||'Image import failed');}};input.click();
}
function layoutView(){return renderLayoutPanel({api,content,esc});}
function componentsView(){return designSystem.componentsView();}
function variablesView(){return designSystem.variablesView();}
function prototypeView(){
  const item=selection();const nodeId=item?.get('formaNodeId');const prototype=projectState.getPrototype()||{};let interactions=normalizeInteractions(nodeId?prototype[nodeId]:[]);let selectedIndex=0;
  const renderEditor=()=>{const current=interactions[selectedIndex];const actionOptions=[['open-url','Open link'],['navigate-page','Navigate page'],['back','Back'],['overlay','Open overlay'],['close-overlay','Close overlay'],['toggle','Toggle target visibility'],['message','Show message'],['scroll','Scroll to target'],['set-variable','Set variable'],['submit-email','Validate email demo']];content.innerHTML=`<section class="wb-section"><span class="eyebrow">INTERACTIVE PROTOTYPE</span><h3>Interactions for selected layer</h3><p>One layer can respond to several triggers. Actions run in order.</p>${!item?'<div class="wb-empty">Select a layer first.</div>':`<div class="wb-actions"><select id="wb-interaction-select" aria-label="Select interaction">${interactions.map((entry,index)=>`<option value="${index}" ${index===selectedIndex?'selected':''}>${index+1}. ${esc(entry.trigger)}</option>`).join('')}</select><button id="wb-interaction-up" aria-label="Move interaction up" ${selectedIndex>0?'':'disabled'}>↑</button><button id="wb-interaction-down" aria-label="Move interaction down" ${selectedIndex<interactions.length-1?'':'disabled'}>↓</button><button id="wb-interaction-add">Add interaction</button><button id="wb-interaction-remove" ${current?'':'disabled'}>Remove</button></div>${current?`<div class="wb-form vertical"><label>Trigger<select id="wb-trigger">${[['click','On click'],['mouseenter','Mouse enter'],['mouseleave','Mouse leave'],['dblclick','Double click'],['mousedown','Mouse down'],['mouseup','Mouse up'],['keydown','Key press'],['dragstart','Drag start'],['drop','Drop on layer']].map(([value,label])=>`<option value="${value}" ${current.trigger===value?'selected':''}>${label}</option>`).join('')}</select></label>${current.trigger==='keydown'?`<label>Key<input data-key value="${esc(current.key||'Enter')}" placeholder="Enter"></label>`:''}<h4>Ordered actions</h4>${current.actions.map((action,index)=>`<div class="wb-form vertical" data-action-index="${index}"><label>Action ${index+1}<select data-action="${index}">${actionOptions.map(([value,label])=>`<option value="${value}" ${action.action===value?'selected':''}>${label}</option>`).join('')}</select></label>${action.action==='set-variable'?`<label>Variable name<input data-variable="${index}" value="${esc(action.variable||'')}" placeholder="variable_name"></label><label>Value<input data-value="${index}" value="${esc(action.value??'')}" placeholder="Value or toggle"></label>`:action.action!=='back'&&action.action!=='close-overlay'?`<label>Target / value<input data-target="${index}" value="${esc(action.target||'')}" placeholder="URL, page, layer ID or message"></label>`:''}<label>Run only when<input data-condition="${index}" value="${esc(action.condition||'')}" placeholder="Optional: isOpen == true"></label><div class="wb-form">${action.action==='navigate-page'||action.action==='overlay'?`<label>Transition<select data-transition="${index}">${[['none','Instant'],['dissolve','Dissolve'],['move-in','Move in'],['push','Push']].map(([v,t])=>`<option value="${v}" ${v===(action.transition||'dissolve')?'selected':''}>${t}</option>`).join('')}</select></label><label>Duration (ms)<input type="number" min="0" max="3000" data-duration="${index}" value="${esc(action.duration??300)}"></label>`:''}<label>Wait (ms)<input type="number" min="0" max="10000" data-delay="${index}" value="${esc(action.delay??0)}"></label></div><span class="wb-actions"><button data-action-up="${index}" ${index>0?'':'disabled'} aria-label="Move action up">↑</button><button data-action-down="${index}" ${index<current.actions.length-1?'':'disabled'} aria-label="Move action down">↓</button><button data-remove-action="${index}">Remove action</button></span></div>`).join('')}<button id="wb-action-add">Add action</button></div><div class="wb-actions"><button id="wb-prototype-save" class="primary-btn">Save changes</button><button id="wb-prototype-clear" class="secondary-btn">Clear all</button></div>`:'<div class="wb-empty">No interactions saved yet.</div>'}`}</section>`;
    const save=()=>{if(!item)return;const trigger=document.getElementById('wb-trigger')?.value;if(current){current.trigger=trigger;if(trigger==='keydown')current.key=content.querySelector('[data-key]')?.value||'Enter';}current?.actions.forEach((action,index)=>{action.action=content.querySelector(`[data-action="${index}"]`)?.value||action.action;const read=key=>content.querySelector(`[data-${key}="${index}"]`);action.condition=read('condition')?.value||'';action.delay=Math.max(0,Math.min(10000,Number(read('delay')?.value)||0));if(read('transition'))action.transition=read('transition').value;if(read('duration'))action.duration=Math.max(0,Math.min(3000,Number(read('duration').value)||0));if(action.action==='set-variable'){action.variable=read('variable')?.value||'';action.value=read('value')?.value||'';}else if(action.action!=='back'&&action.action!=='close-overlay')action.target=read('target')?.value||'';});const next=projectState.getPrototype()||{};if(interactions.length)next[nodeId]=interactions;else delete next[nodeId];item.addAttributes({'data-forma-prototype':JSON.stringify(interactions)});setSection('prototype',next,'set-prototype-interactions');};
    const select=document.getElementById('wb-interaction-select');if(select)select.onchange=()=>{selectedIndex=Number(select.value);renderEditor();};
    document.getElementById('wb-interaction-add')?.addEventListener('click',()=>{interactions.push({id:uid('interaction'),trigger:'click',actions:[{action:'message',target:'Interaction'}]});selectedIndex=interactions.length-1;renderEditor();});
    document.getElementById('wb-interaction-up')?.addEventListener('click',()=>{[interactions[selectedIndex-1],interactions[selectedIndex]]=[interactions[selectedIndex],interactions[selectedIndex-1]];selectedIndex--;renderEditor();});document.getElementById('wb-interaction-down')?.addEventListener('click',()=>{[interactions[selectedIndex+1],interactions[selectedIndex]]=[interactions[selectedIndex],interactions[selectedIndex+1]];selectedIndex++;renderEditor();});
    document.getElementById('wb-interaction-remove')?.addEventListener('click',()=>{interactions.splice(selectedIndex,1);selectedIndex=Math.max(0,selectedIndex-1);renderEditor();});
    document.getElementById('wb-action-add')?.addEventListener('click',()=>{save();current.actions.push({action:'message',target:'Interaction'});renderEditor();});
    content.querySelectorAll('[data-remove-action]').forEach(button=>button.onclick=()=>{save();current.actions.splice(Number(button.dataset.removeAction),1);renderEditor();});
    content.querySelectorAll('[data-action-up]').forEach(button=>button.onclick=()=>{save();const index=Number(button.dataset.actionUp);[current.actions[index-1],current.actions[index]]=[current.actions[index],current.actions[index-1]];renderEditor();});content.querySelectorAll('[data-action-down]').forEach(button=>button.onclick=()=>{save();const index=Number(button.dataset.actionDown);[current.actions[index+1],current.actions[index]]=[current.actions[index],current.actions[index+1]];renderEditor();});
    document.getElementById('wb-prototype-save')?.addEventListener('click',()=>{save();api.toast('Prototype interactions saved');renderEditor();});
    document.getElementById('wb-prototype-clear')?.addEventListener('click',()=>{interactions=[];item.removeAttributes('data-forma-prototype');const next=projectState.getPrototype()||{};delete next[nodeId];setSection('prototype',next,'clear-prototype-interactions');renderEditor();});
    document.getElementById('wb-trigger')?.addEventListener('change',()=>{save();renderEditor();});content.querySelector('[data-key]')?.addEventListener('change',save);content.querySelectorAll('[data-action]').forEach(input=>input.addEventListener('change',()=>{save();renderEditor();}));content.querySelectorAll('[data-target],[data-variable],[data-value],[data-condition],[data-delay],[data-transition],[data-duration]').forEach(input=>input.addEventListener('change',save));
  };renderEditor();
}
function commentsView(){
  if(api.workspace?.isActive())return api.workspace.renderDiscussion(content);
  const selected=selection();const key=selected?.get?.('formaNodeId')||'';const all=projectState.getComments();const items=all[key]||[];
  content.innerHTML=`<section class="wb-section"><span class="eyebrow">COMMENTS & ANNOTATIONS</span><h3>${selected?esc(selected.get('name')||'Selected layer'):'Select a layer'}</h3><div class="wb-comment-compose"><textarea id="wb-comment" placeholder="Add feedback, implementation notes, or accessibility requirements"></textarea><button id="wb-comment-add" class="primary-btn">Add comment</button></div><div class="wb-list">${items.length?items.map(item=>`<article><div><b>${esc(item.author)}</b><p>${esc(item.text)}</p><small>${new Date(item.createdAt).toLocaleString()}</small></div><button data-resolve="${item.id}">${item.resolved?'Reopen':'Resolve'}</button></article>`).join(''):'<div class="wb-empty">No comments on this layer.</div>'}</div></section>`;
  document.getElementById('wb-comment-add').onclick=()=>{if(!selected||!key)return api.toast('Select a saved layer first');const text=document.getElementById('wb-comment').value.trim();if(!text)return;items.push({id:uid('comment'),nodeId:key,author:'Adriano',text,createdAt:new Date().toISOString(),resolved:false});all[key]=items;setSection('comments',all,'add-comment');render();};
  content.querySelectorAll('[data-resolve]').forEach(item=>item.onclick=()=>{const comment=items.find(value=>value.id===item.dataset.resolve);comment.resolved=!comment.resolved;setSection('comments',all,'resolve-comment');render();});
}
async function versionsView(){
  content.innerHTML='<section class="wb-section"><div class="wb-empty">Loading versions…</div></section>';
  let versions=[];try{versions=await api.versions.listVersions();}catch(error){content.innerHTML=`<section class="wb-section"><div class="wb-empty">${esc(error.message)}</div></section>`;return;}
  content.innerHTML=`<section class="wb-section"><span class="eyebrow">VERSION HISTORY</span><h3>Named snapshots</h3><p>Capture the complete GrapesJS project and restore it later.</p><div class="wb-actions"><button id="wb-version-create" class="primary-btn">Create snapshot</button></div><div class="wb-list">${versions.length?versions.map(item=>`<article><div><b>${esc(item.name)}</b><small>${new Date(item.createdAt).toLocaleString()}</small></div><span><button data-version-restore="${item.id}">Restore</button><button data-version-delete="${item.id}">×</button></span></article>`).join(''):'<div class="wb-empty">No snapshots yet.</div>'}</div></section>`;
  document.getElementById('wb-version-create').onclick=async()=>{const name=await api.ask({title:'Create version',message:'Name this snapshot so you can find it later.',value:`Version ${versions.length+1}`,confirmLabel:'Create'});if(!name)return;try{await api.versions.createVersion(name);api.toast('Snapshot created');render();}catch(error){api.toast(error.message);}};
  content.querySelectorAll('[data-version-restore]').forEach(item=>item.onclick=async()=>{try{await api.versions.createVersion('Automatic recovery before restore');const version=await api.versions.getVersion(item.dataset.versionRestore);api.restoreVersion(version);api.scheduleSave();dialog.close();api.toast('Snapshot restored · recovery version created');}catch(error){api.toast(error.message);}});
  content.querySelectorAll('[data-version-delete]').forEach(item=>item.onclick=async()=>{try{await api.versions.deleteVersion(item.dataset.versionDelete);render();}catch(error){api.toast(error.message);}});
}
function devView(){
  const selected=selection();const style=selected?.getStyle()||{};const attrs=selected?.getAttributes()||{};const name=selected?.get('name')||'No selection';const id=selected?.getId?.()||'';
  const css=Object.entries(style).map(([key,value])=>`  ${key}: ${value};`).join('\n');
  const html=selected?`<div class="${id||'layer'}">${selected.get('type')==='text'?selected.get('content'):'…'}</div>`:'Select a layer to inspect it.';
  content.innerHTML=`<section class="wb-section"><span class="eyebrow">DEV MODE</span><h3>${esc(name)}</h3><div class="wb-metrics"><span><b>${parseFloat(style.width)||0}</b> width</span><span><b>${parseFloat(style.height)||0}</b> height</span><span><b>${parseFloat(style.left)||0}</b> x</span><span><b>${parseFloat(style.top)||0}</b> y</span></div><h4>HTML</h4><pre>${esc(html)}</pre><h4>CSS</h4><pre>${esc(`.${id||'layer'} {\n${css}\n}`)}</pre><h4>Attributes</h4><pre>${esc(JSON.stringify(attrs,null,2))}</pre><div class="wb-actions"><button id="wb-copy-code" class="secondary-btn">Copy code</button></div></section>`;
  document.getElementById('wb-copy-code').onclick=async()=>{await navigator.clipboard.writeText(`${html}\n\n.${id||'layer'} {\n${css}\n}`);api.toast('Code copied');};
}
function roadmapView(){
  const groups=[['Available in Forma',['Canvas, multiple pages, frames, sections, slices, layers, shapes, text, Pen/Pencil and editable vector anchors','Selection, pan, continuous zoom, alignment, duplicate, rename, lock, hide, undo and redo','Position, size, rotation, opacity, fills, typography, stroke width, shadows, blur and clipping/masks','Flex auto layout with wrapping, independent row/column gaps, padding, sizing modes and child constraints','Linked local components, variants, exposed properties, variable collections/modes/bindings','Preview with page links, variables, conditions, multiple triggers, overlay/back, transitions and ordered actions','Local comments, version snapshots, developer inspection, PNG/SVG/PDF export and portable HTML/AI bundles','Local projects and the native Windows host']],['Partial compared with Figma',['Fills: gradient stops/direction and image fit/crop position are editable; on-canvas gradient handles, full fill stacks, and native image replacement/crop remain incomplete','Strokes and effects: basic color/width and CSS effects; per-side borders, advanced cap/join/dash behavior, and full effect stacks remain incomplete','Vectors: editable paths and Bézier anchors; Boolean operations, vector-network editing, and Pencil pressure remain incomplete','Transforms: single-layer scale; complete multi-selection scaling and Figma transform semantics remain incomplete','Layout: basic responsive constraints and flex sizing; full breakpoint-aware sizing and nested resize rules remain incomplete','Prototype: keyboard/drag triggers, overlays, back, delays, conditions, and basic transitions; Smart Animate and complete interaction semantics remain incomplete','Frames and slices: core regions and selected-slice export; full region metadata and batch export options remain incomplete','Comments, snapshots, workspaces, and collaboration are local/simplified; the service is not cloud-hosted']],['Unavailable platform features',['Cloud collaboration across machines, SSO and organization administration','Community marketplace, plugin/widget sandbox and external integrations','Dedicated FigJam, Slides, Sites, Make and Buzz products','Hosted generative AI/image services and cloud publishing']]];
  content.innerHTML=`<section class="wb-section"><span class="eyebrow">GUIDE COVERAGE</span><h3>Product capability map</h3><p>Forma is a local design editor with a native Windows host. This guide comparison marks basic versions separately from full Figma functionality and cloud services.</p>${groups.map(([title,items],index)=>`<div class="wb-roadmap ${index===0?'done':''}"><h4>${esc(title)}</h4>${items.map(item=>`<span>${index===0?'✓':index===1?'~':'○'} ${esc(item)}</span>`).join('')}</div>`).join('')}</section>`;
}
function render(){({create:createView,layout:layoutView,components:componentsView,'text-styles':textStylePanel.render,variables:variablesView,prototype:prototypeView,comments:commentsView,versions:versionsView,dev:devView,roadmap:roadmapView}[active]||createView)();}

editor.on('component:selected',()=>{if(dialog.open&&['prototype','comments','dev','layout','components','variables'].includes(active))render();});
projectState.subscribe(()=>{if(dialog.open)render();});
window.formaWorkbench={open:(section)=>{if(section&&['create','layout','components','variables','prototype','comments','versions','dev','roadmap'].includes(section)){active=section;dialog.querySelectorAll('[data-wb-tab]').forEach(item=>item.classList.toggle('active',item.dataset.wbTab===section));}render();dialog.showModal();},render,exportData:()=>({format:'forma-workbench-data',version:2,...projectState.exportData(),versions:[]})};
window.addEventListener('forma:shared-comments',()=>{if(dialog.open&&active==='comments')render();});
