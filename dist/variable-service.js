const copy=value=>structuredClone(value);
export const cssVariableName=name=>'--forma-v-'+Array.from(name).map(char=>char.codePointAt(0).toString(16)).join('-');
const unitless=new Set(['opacity','z-index','font-weight','flex-grow','flex-shrink','order','line-height']);
export function variableNames(state){return [...new Set([...Object.keys(state.definitions||{}),...Object.values(state.modes||{}).flatMap(mode=>Object.keys(mode))])];}
export function resolveVariable(state,name,overrides={},seen=new Set()){
  if(seen.has(name))throw Error(`Variable alias cycle: ${[...seen,name].join(' → ')}`);seen=new Set([...seen,name]);
  const definition=state.definitions?.[name],collection=state.collections?.[definition?.collectionId];
  const mode=overrides[definition?.collectionId||'legacy']||collection?.mode||state.mode;
  let value=definition?(definition.values?.[mode]??definition.values?.[Object.keys(definition.values||{})[0]]):state.modes?.[mode]?.[name];
  if(value===undefined)throw Error(`Variable not found: ${name}`);
  const alias=typeof value==='object'&&value?.alias?value.alias:typeof value==='string'&&value.startsWith('@')?value.slice(1):null;
  if(alias){const targetType=state.definitions?.[alias]?.type;if(definition?.type&&targetType&&definition.type!==targetType)throw Error(`${name} and ${alias} have different variable types.`);value=resolveVariable(state,alias,overrides,seen);}
  if(definition?.type==='NUMBER'&&!Number.isFinite(Number(value)))throw Error(`${name} needs a number.`);
  if(definition?.type==='BOOLEAN'&&typeof value!=='boolean')throw Error(`${name} needs true or false.`);
  return value;
}
export function validateVariables(state){for(const name of variableNames(state)){
  const definition=state.definitions?.[name],collection=state.collections?.[definition?.collectionId];
  for(const mode of collection?.modes||(definition?Object.keys(definition.values||{}):Object.keys(state.modes||{})))resolveVariable(state,name,{[definition?.collectionId||'legacy']:mode});
}return state;}

export function createVariableService(api){
  const {editor,projectState}=api;let applying=false;
  const each=visit=>editor.Pages.getAll().forEach(page=>{const walk=node=>{visit(node);node.components().models.forEach(walk);};walk(page.getMainComponent());});
  const set=state=>{validateVariables(state);projectState.setVariables(state);apply();};
  const effectiveModes=node=>{const ancestors=[];for(let current=node;current;current=current.parent?.())ancestors.unshift(current);return Object.assign({},...ancestors.map(item=>item.get('formaVariableModes')||{}));};
  function apply(){
    if(applying)return;applying=true;
    try{
      const state=validateVariables(projectState.getVariables()),names=variableNames(state);
      editor.Pages.getAll().forEach(page=>{
        const values=Object.fromEntries(names.map(name=>[cssVariableName(name),String(resolveVariable(state,name))]));
        // Keep existing project CSS using the original six names compatible.
        for(const name of names)values['--'+name.replace(/[^a-z0-9_-]/gi,'-')]=String(resolveVariable(state,name));
        const root=page.getMainComponent(),style=root.getStyle();if(Object.entries(values).some(([key,value])=>style[key]!==value))root.addStyle(values);
      });
      each(node=>{
        const modes=effectiveModes(node),bindings=node.get('formaBindings')||{},previous=node.get('formaBindingValues')||{},last={};
        if(Object.keys(node.get('formaVariableModes')||{}).length){const local=Object.fromEntries(names.map(name=>[cssVariableName(name),String(resolveVariable(state,name,modes))]));const style=node.getStyle();if(Object.entries(local).some(([key,value])=>style[key]!==value))node.addStyle(local);}
        for(const [property,name] of Object.entries(bindings)){
          const value=resolveVariable(state,name,modes);last[property]=value;
          if(property==='text')node.set('content',String(value));
          else if(property==='visible'){const display=Boolean(value)?(node.get('formaVisibleDisplay')||'block'):'none';node.addStyle({display});}
          else{const suffix=typeof value==='number'&&!unitless.has(property)?'px':'';node.addStyle({[property]:`var(${cssVariableName(name)}${suffix?', '+value+suffix:''})`});
            // Numeric CSS variables carry a unit at the point of use.
            if(suffix)node.addStyle({[property]:`calc(var(${cssVariableName(name)}) * 1px)`});}
        }
        if(JSON.stringify(previous)!==JSON.stringify(last))node.set('formaBindingValues',last,{silent:true});
      });
    }finally{applying=false;}
  }
  function bind(node,property,name){if(!node)throw Error('Select a layer.');const value=resolveVariable(projectState.getVariables(),name,effectiveModes(node));if(property==='visible'&&typeof value!=='boolean')throw Error('Visibility requires a Boolean variable.');if(property!=='visible'&&property!=='text'&&typeof value==='boolean')throw Error('A Boolean variable cannot be bound to this property.');const bindings={...(node.get('formaBindings')||{}),[property]:name};if(property==='visible')node.set('formaVisibleDisplay',node.getStyle().display==='none'?'block':node.getStyle().display||'block');node.set('formaBindings',bindings);apply();api.scheduleSave();}
  function unbind(node,property){const bindings={...(node.get('formaBindings')||{})},name=bindings[property];if(!name)return;const value=resolveVariable(projectState.getVariables(),name,node.get('formaVariableModes')||{});delete bindings[property];node.set('formaBindings',bindings);if(!['text','visible'].includes(property))node.addStyle({[property]:String(value)+(typeof value==='number'&&!unitless.has(property)?'px':'')});api.scheduleSave();}
  function addCollection(name,modes=['Light','Dark']){const state=projectState.getVariables(),id='collection-'+crypto.randomUUID();state.collections||={};state.collections[id]={name,modes,mode:modes[0]};set(state);return id;}
  function add(name,type,collectionId,value){const state=projectState.getVariables();if(!name.trim()||variableNames(state).includes(name))throw Error('Use a new, non-empty variable name.');const collection=collectionId==='legacy'?{modes:Object.keys(state.modes)}:state.collections?.[collectionId];if(!collection)throw Error('Choose a collection.');state.definitions||={};state.definitions[name]={type,collectionId,values:Object.fromEntries(collection.modes.map(mode=>[mode,copy(value)]))};set(state);}
  function update(name,mode,value){const state=projectState.getVariables();if(state.definitions?.[name])state.definitions[name].values[mode]=value;else{state.modes[mode]||={};state.modes[mode][name]=value;}set(state);}
  function mode(collectionId,mode){const state=projectState.getVariables();if(collectionId==='legacy'){if(!state.modes[mode])throw Error('Mode not found.');state.mode=mode;}else{const collection=state.collections?.[collectionId];if(!collection?.modes.includes(mode))throw Error('Mode not found.');collection.mode=mode;}set(state);}
  function addMode(collectionId,name){const state=projectState.getVariables();if(collectionId==='legacy'){if(state.modes[name])throw Error('Mode already exists.');state.modes[name]=copy(state.modes[state.mode]||{});for(const definition of Object.values(state.definitions||{}))if(definition.collectionId==='legacy')definition.values[name]=copy(definition.values[state.mode]);}else{const collection=state.collections?.[collectionId];if(!collection||collection.modes.includes(name))throw Error('Use a new mode name.');collection.modes.push(name);for(const definition of Object.values(state.definitions||{}))if(definition.collectionId===collectionId)definition.values[name]=copy(definition.values[collection.mode]);}set(state);}
  function layerMode(node,collectionId,mode){if(!node)throw Error('Select a layer.');const modes={...(node.get('formaVariableModes')||{})};if(mode)modes[collectionId]=mode;else delete modes[collectionId];node.set('formaVariableModes',modes);if(!mode){const style=node.getStyle();for(const name of variableNames(projectState.getVariables()))delete style[cssVariableName(name)];node.setStyle(style);}apply();api.scheduleSave();}
  function remove(name){let bound=false;each(node=>{if(Object.values(node.get('formaBindings')||{}).includes(name))bound=true;});if(bound)throw Error('Unbind this variable from layers before deleting it.');const generated=cssVariableName(name),legacy='--'+name.replace(/[^a-z0-9_-]/gi,'-');each(node=>{const style=node.getStyle();if(!(generated in style)&&!(legacy in style))return;delete style[generated];delete style[legacy];node.setStyle(style);});const state=projectState.getVariables();delete state.definitions?.[name];for(const values of Object.values(state.modes||{}))delete values[name];set(state);}
  projectState.subscribe(({section})=>{if(section==='variables'||section==='project')apply();});
  return {apply,bind,unbind,addCollection,add,update,mode,addMode,layerMode,remove,set,resolved:()=>Object.fromEntries(variableNames(projectState.getVariables()).map(name=>[name,resolveVariable(projectState.getVariables(),name)]))};
}
