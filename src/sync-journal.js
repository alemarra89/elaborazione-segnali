// One localStorage key per change avoids read/modify/write races between tabs.
// Entries are removed only after the server acknowledges the Firestore batch.
export function createJournal(storage,prefix='segnali.sync.outbox.v1.'){
  return {
    list(uid){
      const records=[];
      for(let i=0;i<storage.length;i++){
        const key=storage.key(i);if(!key?.startsWith(prefix+uid+'.'))continue;
        const value=JSON.parse(storage.getItem(key));records.push({...value,key});
      }
      return records.sort((a,b)=>a.at-b.at||a.token.localeCompare(b.token));
    },
    append(uid,operations,{first=false}={}){
      if(!operations.length)return;
      const token=crypto.randomUUID(),key=prefix+uid+'.'+token;
      storage.setItem(key,JSON.stringify({token,at:first?0:Date.now(),operations}));return key;
    },
    remove(entries){for(const entry of entries)storage.removeItem(entry.key);}
  };
}
