const clone=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function stableKey(value){let hash=2166136261;for(const char of JSON.stringify(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
export function projectToGraph(project){
  const data=clone(project.editor?.grapesjs||project),nodes={},pages={},rules={},pageOrder=[],ruleOrder=[];
  function nodeTree(input,path){
    if(Array.isArray(input))input={type:'wrapper',components:input};
    if(typeof input==='string')input={type:'textnode',content:input};
    const node=clone(input||{}),id=node.formaNodeId||'node_legacy_'+stableKey(path),children=node.components||[];delete node.components;node.formaNodeId=id;
    if(nodes[id])throw Error('Duplicate document node identity: '+id);
    nodes[id]={props:node,children:[]};nodes[id].children=(Array.isArray(children)?children:[children]).map((child,index)=>nodeTree(child,path+'/'+index));return id;
  }
  for(const [index,source] of (data.pages||[]).entries()){
    const page=clone(source),id=String(page.id||'page-'+index);page.id=id;
    if(page.frames)page.frames=page.frames.map((frame,i)=>{const copy=clone(frame);copy.rootId=nodeTree(copy.component,id+'/frame/'+i);delete copy.component;return copy;});
    else{page.rootId=nodeTree(page.component||page.components||{},id);delete page.component;delete page.components;}
    pages[id]=page;pageOrder.push(id);
  }
  if(Array.isArray(data.styles))for(const [index,rule] of data.styles.entries()){
    const identity={selectors:rule.selectors,mediaText:rule.mediaText,atRuleType:rule.atRuleType,state:rule.state};let key='rule_'+stableKey(identity);if(rules[key])key+='_'+index;rules[key]=rule;ruleOrder.push(key);
  }
  else if(data.styles)rules.legacy={raw:data.styles};
  delete data.pages;delete data.styles;
  const assets=Object.fromEntries((project.assets||[]).map(asset=>[asset.id,clone(asset)]));
  return {nodes,pages,pageOrder,rules,ruleOrder,editor:data,assets,assetOrder:Object.keys(assets),meta:{name:project.name||'Shared design',createdAt:project.createdAt||'',forma:clone(project.forma||{})}};
}
export function graphToProject(graph){
  const visited=new Set();
  function nodeTree(id,ancestors=new Set()){
    if(ancestors.has(id))throw Error('The document contains a parent cycle.');
    const node=graph.nodes[id];if(!node)throw Error('A document layer is missing: '+id);
    if(visited.has(id))throw Error('A layer cannot have multiple parents.');visited.add(id);
    return {...clone(node.props),components:(node.children||[]).map(child=>nodeTree(child,new Set([...ancestors,id])))};
  }
  const pages=graph.pageOrder.filter(id=>graph.pages[id]).map(id=>{
    const page=clone(graph.pages[id]);if(page.frames)page.frames=page.frames.map(frame=>{const copy={...frame,component:nodeTree(frame.rootId)};delete copy.rootId;return copy;});
    else{page.component=nodeTree(page.rootId);delete page.rootId;}return page;
  });
  if(!pages.length)throw Error('A shared design needs at least one page.');
  const styles=graph.rules.legacy?.raw||graph.ruleOrder.filter(key=>graph.rules[key]).map(key=>clone(graph.rules[key]));
  return {format:'forma-project',schemaVersion:3,id:'',name:graph.meta.name,createdAt:graph.meta.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),editor:{grapesjs:{...clone(graph.editor),pages,styles}},forma:clone(graph.meta.forma),assets:graph.assetOrder.filter(id=>graph.assets[id]).map(id=>clone(graph.assets[id]))};
}
const sequences=new Set(['children','pageOrder','ruleOrder','assetOrder']);
export function diffGraphs(before,after,path=[]){
  if(same(before,after))return [];
  if(Array.isArray(before)&&Array.isArray(after)&&sequences.has(path.at(-1)))return [{kind:'sequence',path,before:clone(before),value:clone(after)}];
  if(object(before)&&object(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>key in after?key in before?diffGraphs(before[key],after[key],[...path,key]):[{kind:'set',path:[...path,key],value:clone(after[key])}]:[{kind:'delete',path:[...path,key]}]);
  return [{kind:'set',path,value:clone(after)}];
}
export function pathsIntersect(a,b){return a.every((part,index)=>b[index]===part)||b.every((part,index)=>a[index]===part);}
export function mergeSequence(current,before,after){
  if(new Set(after).size!==after.length)throw Error('Duplicate sequence member.');
  const removed=new Set(before.filter(id=>!after.includes(id))),kept=current.filter(id=>!removed.has(id));
  // A longest increasing subsequence identifies unchanged anchors in linearithmic time.
  const positions=new Map(before.map((id,index)=>[id,index])),tails=[],tailIds=[],links=new Map();
  for(const id of after){if(!positions.has(id))continue;const position=positions.get(id);let low=0,high=tails.length;while(low<high){const mid=(low+high)>>1;if(tails[mid]<position)low=mid+1;else high=mid;}links.set(id,low?tailIds[low-1]:null);tails[low]=position;tailIds[low]=id;}
  const anchors=new Set();for(let id=tailIds.at(-1);id!=null;id=links.get(id))anchors.add(id);
  const moving=new Set(after.filter(id=>!anchors.has(id))),result=kept.filter(id=>!moving.has(id));
  for(let index=after.length-1;index>=0;index--){const id=after[index];if(!moving.has(id))continue;const next=after.slice(index+1).find(item=>result.includes(item));const at=next===undefined?result.length:result.indexOf(next);result.splice(at,0,id);}
  return result;
}
export function applyGraphChanges(source,changes){
  const result=clone(source);
  if(!Array.isArray(changes)||changes.length>50000)throw Error('Too many document changes.');
  for(const change of changes){
    if(!['set','delete','sequence'].includes(change.kind)||!Array.isArray(change.path)||!change.path.length||change.path.length>100||change.path.some(key=>typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)))throw Error('Invalid document operation.');
    let parent=result;for(const key of change.path.slice(0,-1)){if(!object(parent[key])&&!Array.isArray(parent[key]))throw Error('The operation target no longer exists.');parent=parent[key];}
    const key=change.path.at(-1);if(change.kind==='delete')delete parent[key];else if(change.kind==='sequence'){if(!Array.isArray(parent[key])||!Array.isArray(change.before)||!Array.isArray(change.value))throw Error('Invalid ordering operation.');parent[key]=mergeSequence(parent[key],change.before,change.value);}else parent[key]=clone(change.value);
  }return result;
}
export function conflictingChanges(changes,transactions,baseRevision){
  return changes.filter(change=>transactions.some(transaction=>transaction.revision>baseRevision&&transaction.changes.some(remote=>!(change.kind==='sequence'&&remote.kind==='sequence'&&same(change.path,remote.path))&&pathsIntersect(change.path,remote.path))));
}
