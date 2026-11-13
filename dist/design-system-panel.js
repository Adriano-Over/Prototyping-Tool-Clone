import { createComponentService } from './component-service.js';
import { createVariableService,variableNames,resolveVariable } from './variable-service.js';

export function createDesignSystemPanel({api,content,render,esc}){
  const components=createComponentService(api),variables=createVariableService(api);api.components=components;api.variables=variables;
  let collectionId='legacy';
  const selected=()=>api.selected;
  const run=work=>{try{work();api.renderLayers();api.scheduleSave();render();}catch(error){api.toast(error.message);}};
  const ask=async(title,value='')=>api.ask({title,value,confirmLabel:'Save'});
  const options=(entries,value)=>entries.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
  function componentsView(){
    const definitions=components.definitions(),node=selected(),relation=node?.get('formaInstance'),definition=definitions.find(item=>item.id===(relation?.definitionId||node?.get('formaComponentId')));
    let master=node;while(master&&master.get('formaComponentRole')!=='main')master=master.parent();
    content.innerHTML=`<section class="wb-section"><span class="eyebrow">COMPONENTS</span><h3>Linked components and variants</h3><p>Instances follow their main component while keeping local overrides.</p><button id="ds-create" class="primary-btn">Create component from selection</button>
    ${relation?`<div class="wb-form vertical"><label>Instance component<select id="ds-swap">${options(definitions.map(item=>[item.id,item.name]),relation.definitionId)}</select></label><label>Variant<select id="ds-variant">${options(Object.keys(definition?.variants||{Default:{}}).map(name=>[name,name]),relation.variant||'Default')}</select></label></div><div class="wb-actions"><button id="ds-reset" class="secondary-btn">Reset overrides</button><button id="ds-detach" class="secondary-btn">Detach instance</button></div>${Object.entries(definition?.properties||{}).map(([name,property])=>`<label class="wb-property">${esc(name)}<input data-instance-property="${esc(name)}" ${property.field==='visible'?'type="checkbox"':'type="text"'} aria-label="Component property ${esc(name)}"></label>`).join('')}`:''}
    ${node?.get('formaComponentRole')==='main'&&definition?`<label>Editing variant<select id="ds-edit-variant">${options(Object.keys(definition.variants||{Default:{}}).map(name=>[name,name]),node.get('formaComponentVariant')||'Default')}</select></label>`:''}
    ${definition?'<button id="ds-save-variant" class="secondary-btn">Save selection as variant</button>':''}
    ${master?'<div class="wb-form"><label>Exposed property name<input id="ds-property-name" placeholder="Label"></label><label>Property<select id="ds-property-field"><option value="text">Text</option><option value="visible">Visibility</option><option value="background-color">Fill</option><option value="color">Text color</option><option value="width">Width</option><option value="height">Height</option></select></label></div><button id="ds-expose" class="secondary-btn">Expose selected layer property</button>':''}
    <div class="wb-list">${definitions.map(item=>`<article><div><b>${esc(item.name)}</b><small>${Object.keys(item.variants||{Default:{}}).length} variant(s)</small></div><div><button data-component-insert="${esc(item.id)}">Insert instance</button><button data-component-delete="${esc(item.id)}" aria-label="Delete component ${esc(item.name)}">×</button></div></article>`).join('')||'<div class="wb-empty">No components yet.</div>'}</div></section>`;
    content.querySelector('#ds-create').onclick=async()=>{const current=selected();if(!current)return api.toast('Select a layer first.');const name=await ask('Create component',current.get('name')||'Component');if(name)run(()=>components.create(current,name));};
    content.querySelectorAll('[data-component-insert]').forEach(button=>button.onclick=()=>run(()=>components.insert(button.dataset.componentInsert)));
    content.querySelectorAll('[data-component-delete]').forEach(button=>button.onclick=()=>run(()=>components.remove(button.dataset.componentDelete)));
    if(relation){
      content.querySelector('#ds-swap').onchange=event=>run(()=>components.updateInstance(node,{definitionId:event.target.value}));
      content.querySelector('#ds-variant').onchange=event=>run(()=>components.updateInstance(node,{variant:event.target.value}));
      content.querySelector('#ds-reset').onclick=()=>run(()=>components.updateInstance(node,{reset:true}));content.querySelector('#ds-detach').onclick=()=>run(()=>components.detach(node));
      content.querySelectorAll('[data-instance-property]').forEach(input=>{
        const property=definition.properties[input.dataset.instanceProperty];let target;const walk=current=>{if(current.get('formaPartKey')===property.partKey)target=current;current.components().models.forEach(walk);};walk(node);
        if(input.type==='checkbox')input.checked=target?.getStyle().display!=='none';else input.value=property.field==='text'?target?.get('content')||'':target?.getStyle()[property.field]||'';
        input.onchange=()=>run(()=>components.setProperty(node,input.dataset.instanceProperty,input.type==='checkbox'?input.checked:input.value));
      });
    }
    content.querySelector('#ds-edit-variant')?.addEventListener('change',event=>run(()=>components.editVariant(node,event.target.value)));
    content.querySelector('#ds-save-variant')?.addEventListener('click',async()=>{const name=await ask('New variant name','Variant 2');if(name)run(()=>components.saveVariant(definition.id,name,node));});
    content.querySelector('#ds-expose')?.addEventListener('click',()=>{const name=content.querySelector('#ds-property-name').value.trim(),field=content.querySelector('#ds-property-field').value;if(!name)return api.toast('Enter a property name.');run(()=>components.expose(master.get('formaComponentId'),node,name,field));});
  }
  function parse(value,type){if(value.startsWith('@'))return {alias:value.slice(1)};if(type==='BOOLEAN'){if(!['true','false'].includes(value))throw Error('Enter true or false.');return value==='true';}if(type==='NUMBER'){if(!Number.isFinite(Number(value)))throw Error('Enter a number.');return Number(value);}return value;}
  const text=value=>typeof value==='object'&&value?.alias?'@'+value.alias:String(value??'');
  function variablesView(){
    const state=api.projectState.getVariables(),collections=[['legacy','Project tokens'],...Object.entries(state.collections||{}).map(([id,item])=>[id,item.name])];
    if(!collections.some(([id])=>id===collectionId))collectionId='legacy';
    const collection=collectionId==='legacy'?{modes:Object.keys(state.modes),mode:state.mode}:state.collections[collectionId],names=variableNames(state).filter(name=>(state.definitions?.[name]?.collectionId||'legacy')===collectionId),node=selected(),bindings=node?.get('formaBindings')||{};
    content.innerHTML=`<section class="wb-section"><span class="eyebrow">VARIABLES</span><h3>Collections, modes and bindings</h3><div class="wb-form"><label>Collection<select id="vs-collection">${options(collections,collectionId)}</select></label><label>Mode<select id="vs-mode">${options(collection.modes.map(mode=>[mode,mode]),collection.mode)}</select></label></div><div class="wb-actions"><button id="vs-add-collection" class="secondary-btn">New collection</button><button id="vs-add-mode" class="secondary-btn">New mode</button></div>
    <p>Use @variable.name to reference another variable.</p><div class="wb-token-list">${names.map(name=>{const definition=state.definitions?.[name],value=definition?definition.values[collection.mode]:state.modes[collection.mode]?.[name];return `<label><b>${esc(name)}</b><input data-variable-value="${esc(name)}" aria-label="Value of ${esc(name)}" value="${esc(text(value))}"><button data-variable-delete="${esc(name)}" aria-label="Delete variable ${esc(name)}">×</button></label>`;}).join('')}</div>
    <div class="wb-form"><label>Name<input id="vs-name" placeholder="color.brand"></label><label>Type<select id="vs-type"><option value="COLOR">Color</option><option value="NUMBER">Number</option><option value="STRING">String</option><option value="BOOLEAN">Boolean</option></select></label><label>Value<input id="vs-value" value="#188466"></label></div><button id="vs-add" class="primary-btn">Add variable</button></section>
    <section class="wb-section"><h3>Selected layer bindings</h3><div class="wb-form"><label>Property<select id="vs-property">${options([['background-color','Fill'],['color','Text color'],['width','Width'],['height','Height'],['padding','Padding'],['gap','Gap'],['border-radius','Corner radius'],['font-size','Font size'],['opacity','Opacity'],['text','Text content'],['visible','Visibility']],'background-color')}</select></label><label>Variable<select id="vs-binding">${options(variableNames(state).map(name=>[name,name]),'')}</select></label></div><button id="vs-bind" class="primary-btn">Bind variable</button><div class="wb-list">${Object.entries(bindings).map(([property,name])=>`<article><span>${esc(property)} → ${esc(name)}</span><button data-unbind="${esc(property)}">Unbind</button></article>`).join('')}</div><label>Layer mode override<select id="vs-layer-mode">${options([['','Inherit'],...collection.modes.map(mode=>[mode,mode])],node?.get('formaVariableModes')?.[collectionId]||'')}</select></label></section>`;
    content.querySelector('#vs-collection').onchange=event=>{collectionId=event.target.value;render();};content.querySelector('#vs-mode').onchange=event=>run(()=>variables.mode(collectionId,event.target.value));
    content.querySelector('#vs-add-collection').onclick=async()=>{const name=await ask('New variable collection','Collection');if(name)run(()=>{collectionId=variables.addCollection(name);});};
    content.querySelector('#vs-add-mode').onclick=async()=>{const name=await ask('New mode name','New mode');if(name)run(()=>variables.addMode(collectionId,name));};
    content.querySelector('#vs-add').onclick=()=>{const name=content.querySelector('#vs-name').value.trim(),type=content.querySelector('#vs-type').value,value=content.querySelector('#vs-value').value;run(()=>variables.add(name,type,collectionId,parse(value,type)));};
    content.querySelectorAll('[data-variable-value]').forEach(input=>input.onchange=()=>run(()=>variables.update(input.dataset.variableValue,collection.mode,parse(input.value,state.definitions?.[input.dataset.variableValue]?.type))));
    content.querySelectorAll('[data-variable-delete]').forEach(button=>button.onclick=()=>run(()=>variables.remove(button.dataset.variableDelete)));
    content.querySelector('#vs-bind').onclick=()=>{const property=content.querySelector('#vs-property').value,name=content.querySelector('#vs-binding').value;run(()=>variables.bind(node,property,name));};
    content.querySelectorAll('[data-unbind]').forEach(button=>button.onclick=()=>run(()=>variables.unbind(node,button.dataset.unbind)));
    content.querySelector('#vs-layer-mode').onchange=event=>run(()=>variables.layerMode(node,collectionId,event.target.value));
  }
  return {componentsView,variablesView};
}
