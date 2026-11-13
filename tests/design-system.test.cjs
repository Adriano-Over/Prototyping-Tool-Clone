const test=require('node:test'),assert=require('node:assert/strict');
function model(data={},parent){
  const state={type:'default',tagName:'div',attributes:{},style:{},classes:[],formaNodeId:'node_'+crypto.randomUUID(),...structuredClone(data)};delete state.components;let children=(data.components||[]).map(item=>model(item,null));
  const node={get:key=>state[key],set:(key,value)=>{if(typeof key==='object')Object.assign(state,key);else state[key]=value;},unset:key=>delete state[key],getName:()=>state.name||'Layer',getId:()=>state.attributes.id||state.formaNodeId,getAttributes:()=>({...state.attributes}),setAttributes:attrs=>state.attributes={...attrs},getStyle:()=>({...state.style}),setStyle:style=>state.style={...style},addStyle:style=>Object.assign(state.style,style),setClass:classes=>state.classes=classes,parent:()=>parent,
    components:items=>{if(items){children=items.map(item=>model(item,node));}return {models:children};},append:data=>{const child=model(data,node);children.push(child);return [child];},toJSON:()=>({...structuredClone(state),components:children.map(item=>item.toJSON())})};
  children=(data.components||[]).map(item=>model(item,node));return node;
}
function setup(){let definitions=[],variables={mode:'light',modes:{light:{brand:'#111111'},dark:{brand:'#eeeeee'}}},metadata={};const subscribers=[];
  const root=model({name:'Page',components:[{name:'Main',style:{width:'100px','background-color':'red'},classes:['shared-class'],components:[{type:'text',name:'Label',content:'Original'}]}]});
  const state={getComponents:()=>structuredClone(definitions),setComponents:value=>{definitions=structuredClone(value);subscribers.forEach(fn=>fn({section:'components'}));},getVariables:()=>structuredClone(variables),setVariables:value=>{variables=structuredClone(value);subscribers.forEach(fn=>fn({section:'variables'}));},subscribe:fn=>subscribers.push(fn),getLayoutMetadata:()=>structuredClone(metadata),setLayoutMetadata:value=>metadata=structuredClone(value)};
  let selection;const editor={Pages:{getAll:()=>[{getMainComponent:()=>root}]},getWrapper:()=>root,on:()=>{},select:node=>{selection=node;}};const api={editor,projectState:state,get selected(){return selection;},scheduleSave:()=>{},renderLayers:()=>{},history:{restoring:false}};return {api,root,main:root.components().models[0],state};
}
test('linked instances follow main edits, preserve overrides, swap variants, reset and detach',async()=>{
  const {createComponentService}=await import('../dist/component-service.js');const {api,main}=setup(),service=createComponentService(api),definition=service.create(main,'Button'),instance=service.insert(definition.id);
  assert.equal(instance.getStyle().width,'100px');assert.deepEqual(instance.toJSON().classes,['shared-class']);
  instance.addStyle({'background-color':'green'});main.addStyle({width:'240px','background-color':'blue'});service.synchronize();assert.equal(instance.getStyle().width,'240px');assert.equal(instance.getStyle()['background-color'],'green');
  main.addStyle({width:'400px'});service.saveVariant(definition.id,'Large',main);main.addStyle({width:'240px'});service.synchronize();service.updateInstance(instance,{variant:'Large'});assert.equal(instance.getStyle().width,'400px');assert.equal(instance.getStyle()['background-color'],'green');
  service.updateInstance(instance,{reset:true});assert.equal(instance.getStyle()['background-color'],'blue');service.detach(instance);main.addStyle({width:'500px'});service.synchronize();assert.equal(instance.getStyle().width,'400px');
});
test('exposed text properties remain local overrides after main changes',async()=>{
  const {createComponentService}=await import('../dist/component-service.js');const {api,main}=setup(),service=createComponentService(api),definition=service.create(main,'Button');service.expose(definition.id,main.components().models[0],'Label','text');const instance=service.insert(definition.id);service.setProperty(instance,'Label','Custom label');main.components().models[0].set('content','New default');service.synchronize();assert.equal(instance.components().models[0].get('content'),'Custom label');
});
test('aliases resolve across modes and collections; cycles and type mismatches fail',async()=>{
  const {resolveVariable,validateVariables,cssVariableName}=await import('../dist/variable-service.js');const state={mode:'light',modes:{light:{brand:'#fff'},dark:{brand:'#000'}},collections:{theme:{mode:'Day',modes:['Day','Night']}},definitions:{surface:{type:'COLOR',collectionId:'theme',values:{Day:{alias:'brand'},Night:'#112233'}},gap:{type:'NUMBER',collectionId:'theme',values:{Day:12,Night:24}}}};
  assert.equal(resolveVariable(state,'surface'),'#fff');assert.equal(resolveVariable(state,'surface',{theme:'Night'}),'#112233');assert.notEqual(cssVariableName('a.b'),cssVariableName('a-b'));
  state.definitions.surface.values.Day={alias:'gap'};assert.throws(()=>validateVariables(state),/different variable types/);state.definitions.surface.values.Day={alias:'surface'};assert.throws(()=>validateVariables(state),/cycle/);
});
test('arbitrary numeric bindings and inherited layer mode overrides apply without hard-coded token names',async()=>{
  const {createVariableService}=await import('../dist/variable-service.js');const {api,main}=setup(),service=createVariableService(api),collection=service.addCollection('Spacing',['Compact','Comfortable']);service.add('spacing.custom','NUMBER',collection,12);service.update('spacing.custom','Comfortable',30);service.bind(main,'padding','spacing.custom');assert.match(main.getStyle().padding,/calc\(var\(--forma-v-/);service.layerMode(main,collection,'Comfortable');assert.equal(api.projectState.getVariables().collections[collection].mode,'Compact');assert.ok(Object.values(main.getStyle()).includes('30'));assert.throws(()=>service.bind(main,'visible','spacing.custom'),/Boolean/);
});
test('deleting a variable clears generated and legacy CSS properties across page roots and layers',async()=>{
  const {createVariableService,cssVariableName}=await import('../dist/variable-service.js');const {api,root,main}=setup(),service=createVariableService(api),name='qa.verify_temp',legacy='--qa-verify_temp',generated=cssVariableName(name);
  service.add(name,'COLOR','legacy','#123456');assert.equal(root.getStyle()[generated],'#123456');assert.equal(root.getStyle()[legacy],'#123456');
  root.addStyle({[generated]:'#123456',[legacy]:'#123456'});main.addStyle({[generated]:'#123456',[legacy]:'#123456'});service.remove(name);
  for(const node of [root,main]){assert.equal(generated in node.getStyle(),false);assert.equal(legacy in node.getStyle(),false);}
  assert.equal(api.projectState.getVariables().modes.light[name],undefined);
});
