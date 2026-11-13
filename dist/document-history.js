// One chronological history for the complete document, including CSS rules and
// Workbench metadata. Views and runtime prototype state are not document edits.
export function createDocumentHistory({read,write,onChange,delay=150,maxEntries=100,maxBytes=64*1024*1024}) {
  let entries=[],index=-1,timer,restoring=false,enabled=false;
  const snapshot=()=>{const value=read();return {value:structuredClone(value),key:JSON.stringify(value.data??value)};};
  const notify=()=>onChange?.();
  function flush(){
    clearTimeout(timer);if(!enabled||restoring)return false;
    const next=snapshot();if(entries[index]?.key===next.key)return false;
    entries=entries.slice(0,index+1);entries.push(next);index=entries.length-1;
    let bytes=entries.reduce((sum,entry)=>sum+entry.key.length*2,0);
    while(entries.length>2&&(entries.length>maxEntries||bytes>maxBytes)){bytes-=entries[0].key.length*2;entries.shift();index--;}
    notify();return true;
  }
  function schedule(){if(!enabled||restoring)return;clearTimeout(timer);timer=setTimeout(flush,delay);}
  function reset(){clearTimeout(timer);entries=[snapshot()];index=0;enabled=true;notify();}
  function pause(){clearTimeout(timer);enabled=false;}
  function restore(next){
    const previous=index;restoring=true;
    try{write(structuredClone(entries[next].value));index=next;entries[index]=snapshot();}
    catch(error){try{write(structuredClone(entries[previous].value));}catch{}throw error;}
    finally{restoring=false;notify();}
    return true;
  }
  function undo(){flush();return index>0?restore(index-1):false;}
  function redo(){flush();return index+1<entries.length?restore(index+1):false;}
  function rebase(transform){
    flush();const rebased=[];let nextIndex=-1;
    for(let i=0;i<entries.length;i++){const value=transform(structuredClone(entries[i].value));if(!value)continue;const entry={value,key:JSON.stringify(value.data??value)};if(rebased.at(-1)?.key!==entry.key)rebased.push(entry);if(i<=index)nextIndex=rebased.length-1;}
    entries=rebased;index=Math.max(0,nextIndex);if(!entries.length)reset();notify();
  }
  return {flush,schedule,reset,pause,rebase,resume:()=>{enabled=true;notify();},undo,redo,canUndo:()=>enabled&&index>0,canRedo:()=>enabled&&index+1<entries.length,get restoring(){return restoring;}};
}
