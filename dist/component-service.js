import { createFormaNodeId } from './stable-ids.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const children=node=>node.components?.().models||[];
const walk=(node,visit)=>{visit(node);children(node).forEach(child=>walk(child,visit));};
const placement=new Set(['position','left','top','right','bottom']);

export function snapshotComponent(node,path='root') {
  const attributes={...node.getAttributes()};delete attributes.id;delete attributes['data-component-id'];delete attributes['data-forma-node-id'];
  const key=node.get('formaPartKey')||path;
  return copy({type:node.get('type')||'default',tagName:node.get('tagName')||'div',name:node.get('name')||node.getName(),formaPartKey:key,
    attributes,classes:node.toJSON?.().classes||[],style:{...node.getStyle()},content:node.get('content')||'',formaBindings:copy(node.get('formaBindings')||{}),formaVariableModes:copy(node.get('formaVariableModes')||{}),
    components:children(node).map((child,index)=>snapshotComponent(child,`${key}/${index}`))});
}
function indexTree(root){const index=new Map();const visit=node=>{index.set(node.formaPartKey,node);(node.components||[]).forEach(visit);};visit(root);return index;}

export function collectOverrides(current,baseline) {
  if(!baseline)return {};
  const actual=indexTree(current),original=indexTree(baseline),result={};
  for(const [key,base] of original){
    const node=actual.get(key);if(!node){result[key]={deleted:true};continue;}
    const patch={};
    for(const section of ['style','attributes'])for(const name of new Set([...Object.keys(base[section]||{}),...Object.keys(node[section]||{})])){
      if(key===baseline.formaPartKey&&section==='style'&&placement.has(name))continue;
      if(!same(base[section]?.[name],node[section]?.[name])){patch[section]||={};patch[section][name]=node[section]?.[name]??null;}
    }
    for(const field of ['content','name','formaBindings','formaVariableModes'])if(!same(node[field],base[field]))patch[field]=node[field];
    if(Object.keys(patch).length)result[key]=patch;
  }
  // Preserve additions inside an instance as local structure overrides.
  for(const [key,node] of actual)if(!original.has(key)){
    const parent=[...actual.values()].find(item=>(item.components||[]).some(child=>child.formaPartKey===key));
    if(parent&&original.has(parent.formaPartKey)){result[parent.formaPartKey]||={};result[parent.formaPartKey].additions||=[];result[parent.formaPartKey].additions.push(copy(node));}
  }
  return result;
}
export function applyOverrides(data,overrides={}) {
  const visit=node=>{
    const patch=overrides[node.formaPartKey]||{};if(patch.deleted)return null;
    const result=copy(node);
    for(const section of ['style','attributes'])for(const [key,value] of Object.entries(patch[section]||{})){if(value===null)delete result[section][key];else result[section][key]=value;}
    for(const key of ['content','name','formaBindings','formaVariableModes'])if(key in patch)result[key]=patch[key];
    result.components=(result.components||[]).map(visit).filter(Boolean).concat(copy(patch.additions||[]));return result;
  };return visit(data);
}

export function createComponentService(api) {
  const {editor,projectState}=api;let syncing=false,timer;
  const roots=()=>editor.Pages.getAll().map(page=>page.getMainComponent());
  const all=()=>{const result=[];roots().forEach(root=>walk(root,node=>result.push(node)));return result;};
  const definitions=()=>projectState.getComponents();
  const find=id=>definitions().find(item=>item.id===id);
  const assignKeys=node=>walk(node,item=>{if(!item.get('formaPartKey'))item.set('formaPartKey',createFormaNodeId(),{silent:true});});
  function definitionData(definition,variant){return definition.variants?.[variant]?.data||definition.data;}
  function create(node,name){
    if(!node||node===editor.getWrapper())throw Error('Select a component layer or frame.');
    assignKeys(node);const id='component-'+crypto.randomUUID();
    const data=snapshotComponent(node);const record={id,name,createdAt:new Date().toISOString(),mainNodeId:node.get('formaNodeId'),data,variants:{Default:{data:copy(data)}},defaultVariant:'Default'};
    syncing=true;try{node.set({formaComponentRole:'main',formaComponentId:id,formaComponentVariant:'Default'});projectState.setComponents([...definitions(),record]);}finally{syncing=false;}
    api.scheduleSave();return record;
  }
  function materialize(data,previous,rootPosition) {
    const old=new Map();if(previous)walk(previous,node=>old.set(node.get('formaPartKey'),node));
    const visit=(node,isRoot=false)=>{
      const result=copy(node),prior=old.get(node.formaPartKey);
      result.formaNodeId=prior?.get('formaNodeId')||createFormaNodeId();
      const id=prior?.getId?.()||'instance-'+crypto.randomUUID();result.attributes={...result.attributes,id};
      if(isRoot&&rootPosition)result.style={...result.style,...rootPosition};
      result.components=(node.components||[]).map(child=>visit(child));return result;
    };return visit(data,true);
  }
  function write(node,data){
    node.set({name:data.name,type:data.type,tagName:data.tagName,content:data.content,formaPartKey:data.formaPartKey,formaBindings:data.formaBindings||{},formaVariableModes:data.formaVariableModes||{}});node.setClass(data.classes||[]);node.setAttributes(data.attributes);node.setStyle(data.style);node.components(data.components||[]);
  }
  function insert(id,variant){
    const definition=find(id);if(!definition)throw Error('Component not found.');
    variant=variant||definition.defaultVariant||'Default';const source=definitionData(definition,variant);let target=api.selected;
    if(!target||target.get('formaComponentRole')==='main'||target.get('formaInstance')||!children(target).length)target=target?.parent()||editor.getWrapper();
    const containsSelf=node=>{for(let parent=node;parent;parent=parent.parent())if(parent.get('formaComponentId')===id||parent.get('formaInstance')?.definitionId===id)return true;return false;};
    while(target&&containsSelf(target))target=target.parent();target||=editor.getWrapper();
    const data=materialize(source,null,{position:'absolute',left:'48px',top:'48px'});
    syncing=true;let instance;try{instance=target.append(data)[0];instance.set('formaInstance',{definitionId:id,variant,baseline:snapshotComponent(instance),overrides:{}});}finally{syncing=false;}
    editor.select(instance);api.renderLayers();api.scheduleSave();return instance;
  }
  function refreshInstance(node,definition,{reset=false,variant}={}){
    const relation=node.get('formaInstance');if(!relation)return;
    let renderNode=node;
    if(relation.renderedPartKey){renderNode=null;walk(node,item=>{if(item.get('formaPartKey')===relation.renderedPartKey)renderNode=item;});if(!renderNode)throw Error('The linked component content could not be found in this instance.');}
    const before=snapshotComponent(renderNode);let overrides=reset?{}:collectOverrides(before,relation.baseline);
    variant=variant||relation.variant||definition.defaultVariant||'Default';
    const base=definitionData(definition,variant);if(!base)throw Error('Variant not found.');
    if(relation.definitionId!==definition.id){const old=indexTree(relation.baseline),next=indexTree(base),mapped={};for(const [key,patch] of Object.entries(overrides)){const name=old.get(key)?.name,target=[...next.values()].find(item=>item.name===name);if(target)mapped[target.formaPartKey]=patch;}overrides=mapped;}
    const position=Object.fromEntries(Object.entries(before.style).filter(([key])=>placement.has(key)));
    const baseline=materialize(base,renderNode,position),updated=materialize(applyOverrides(base,overrides),renderNode,position);
    const baselineSnapshot=copy(baseline);const strip=data=>{delete data.formaNodeId;delete data.attributes.id;data.components.forEach(strip);};strip(baselineSnapshot);
    const nextRelation={...relation,definitionId:definition.id,variant,baseline:baselineSnapshot,overrides,...(relation.renderedPartKey?{renderedPartKey:updated.formaPartKey}:{})};
    if(same(before,snapshotData(updated))&&same(relation,nextRelation))return;
    const selectedId=api.selected?.get('formaNodeId');write(renderNode,updated);node.set('formaInstance',nextRelation);
    if(selectedId){const target=all().find(item=>item.get('formaNodeId')===selectedId);if(target)editor.select(target);else editor.select(node);}
  }
  function snapshotData(data){const result=copy(data);const strip=node=>{delete node.formaNodeId;delete node.attributes.id;node.components.forEach(strip);};strip(result);return result;}
  function synchronize(){
    if(syncing||api.history?.restoring)return;
    syncing=true;
    try{
      const nodes=all();let items=definitions(),changed=false;
      for(const master of nodes.filter(node=>node.get('formaComponentRole')==='main')){
        const definition=items.find(item=>item.id===master.get('formaComponentId'));if(!definition)continue;
        assignKeys(master);const data=snapshotComponent(master),variant=master.get('formaComponentVariant')||definition.defaultVariant||'Default';
        if(!same(definitionData(definition,variant),data)){
          definition.variants||={Default:{data:copy(definition.data)}};definition.variants[variant]={data};if(variant===(definition.defaultVariant||'Default'))definition.data=data;definition.mainNodeId=master.get('formaNodeId');changed=true;
        }
      }
      if(changed)projectState.setComponents(items);
      for(const node of nodes){const relation=node.get('formaInstance');if(relation){const definition=items.find(item=>item.id===relation.definitionId);if(definition)refreshInstance(node,definition);}}
    }finally{syncing=false;}
  }
  function updateInstance(node,options={}){const relation=node?.get('formaInstance'),definition=relation&&find(options.definitionId||relation.definitionId);if(!definition)throw Error('Select a linked component instance.');if(options.definitionId&&options.definitionId!==relation.definitionId)options={...options,variant:definition.defaultVariant||'Default'};syncing=true;try{refreshInstance(node,definition,options);}finally{syncing=false;}api.scheduleSave();api.renderLayers();}
  function detach(node){if(!node?.get('formaInstance'))throw Error('Select a linked instance.');node.unset('formaInstance');walk(node,item=>item.unset('formaPartKey'));api.scheduleSave();}
  function saveVariant(id,name,node){const items=definitions(),definition=items.find(item=>item.id===id);if(!definition)throw Error('Component not found.');if(!name.trim())throw Error('Enter a variant name.');assignKeys(node);definition.variants||={Default:{data:copy(definition.data)}};definition.variants[name.trim()]={data:snapshotComponent(node)};projectState.setComponents(items);return name.trim();}
  function remove(id){if(all().some(node=>node.get('formaInstance')?.definitionId===id))throw Error('Detach or remove this component’s instances before deleting its definition.');for(const node of all())if(node.get('formaComponentId')===id){node.unset('formaComponentRole');node.unset('formaComponentId');}projectState.setComponents(definitions().filter(item=>item.id!==id));}
  function expose(id,node,name,field){const items=definitions(),definition=items.find(item=>item.id===id);if(!definition)throw Error('Choose a main component.');assignKeys(node);definition.properties||={};definition.properties[name]={partKey:node.get('formaPartKey'),field};projectState.setComponents(items);}
  function setProperty(instance,name,value){const definition=find(instance?.get('formaInstance')?.definitionId),property=definition?.properties?.[name];if(!property)throw Error('Component property not found.');let target;walk(instance,node=>{if(node.get('formaPartKey')===property.partKey)target=node;});if(!target)throw Error('This property is not available in the current variant.');if(property.field==='text')target.set('content',String(value));else if(property.field==='visible')target.addStyle({display:value?'block':'none'});else target.addStyle({[property.field]:String(value)});synchronize();api.scheduleSave();}
  function editVariant(master,variant){const definition=find(master?.get('formaComponentId'));if(!definition||!definition.variants?.[variant])throw Error('Variant not found.');synchronize();syncing=true;try{const data=materialize(definitionData(find(definition.id),variant),master);write(master,data);master.set('formaComponentVariant',variant);}finally{syncing=false;}api.renderLayers();api.scheduleSave();}
  const schedule=()=>{if(syncing)return;clearTimeout(timer);timer=setTimeout(synchronize,0);};
  editor.on('update component:styleUpdate',schedule);projectState.subscribe(({section})=>{if(section==='project'||section==='components')schedule();});
  return {create,insert,synchronize,updateInstance,detach,saveVariant,remove,definitions,expose,setProperty,editVariant};
}
