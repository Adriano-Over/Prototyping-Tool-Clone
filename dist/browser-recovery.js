export function createBrowserRecovery(database = globalThis.indexedDB) {
  if(!database)return null;
  const storeName='snapshots';
  let opening;
  function open(){
    if(!opening){
      opening=new Promise((resolve,reject)=>{
        const request=database.open('forma-recovery',1);
        request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
        request.onsuccess=()=>{
          request.result.onversionchange=()=>{request.result.close();opening=undefined;};
          resolve(request.result);
        };
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(Error('Recovery storage is blocked'));
      }).catch(error=>{opening=undefined;throw error;});
    }
    return opening;
  }
  async function transaction(mode,work){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,mode);
      const request=work(tx.objectStore(storeName));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error||request.error||Error('Recovery transaction was aborted'));
    });
  }
  return {
    put:(key,value)=>transaction('readwrite',store=>store.put(value,key)),
    get:key=>transaction('readonly',store=>store.get(key)),
    remove:key=>transaction('readwrite',store=>store.delete(key)),
    keys:prefix=>transaction('readonly',store=>store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'))),
  };
}
