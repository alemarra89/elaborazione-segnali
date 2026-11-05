import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithCredential,signOut,connectAuthEmulator} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,writeBatch,doc,getDocsFromServer,connectFirestoreEmulator} from 'firebase/firestore';
import {changesForSync,migrationForSync,compactOperations,projectCloudRecords,stateChanged} from './sync-model.js';
import {createJournal} from './sync-journal.js';

export function createCloudSync({config,getState,onAccount,onRemote,onStatus,storage=localStorage,emulators=null}){
  const app=initializeApp(emulators?{...config.firebase,projectId:'demo-segnali',apiKey:'demo-key',authDomain:'localhost'}:config.firebase);
  const auth=getAuth(app);
  const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
  if(emulators){connectAuthEmulator(auth,`http://${emulators.host}:9099`,{disableWarnings:true});connectFirestoreEmulator(db,emulators.host,8085);}
  const journal=createJournal(storage);
  let user=null,unsubscribe=null,ready=false,snapshot=structuredClone(getState()),records=new Map(),writing=false,generation=0,stopped=false,retryTimer=null,lastError='';
  const status=(code,message='')=>onStatus({code,message,email:user?.email||null,uid:user?.uid||null,pending:user?journal.list(user.uid).length:0,lastSynced:code==='synced'?Date.now():null});
  function withPending(source){
    const projected=new Map(source);
    for(const operation of compactOperations(journal.list(user.uid).flatMap(entry=>entry.operations))){
      const old=projected.get(operation.id);
      if(old?.kind==='attempt'||old?.kind==='session'&&old.phase!=='active')continue;
      const target=operation.data.kind==='control'?projected.get(`session_${operation.data.activeSessionId}`):null;
      if(target&&target.phase!=='active')continue;
      projected.set(operation.id,{...old,...operation.data,...(old?.answers||operation.data.answers?{answers:{...old?.answers,...operation.data.answers}}:{})});
    }
    return projected;
  }
  const apply=()=>{
    const next=projectCloudRecords(getState(),withPending(records));snapshot=structuredClone(next);
    if(stateChanged(getState(),next))onRemote(next);
  };
  function queue(operations,options){
    if(!user||!operations.length)return;
    try{for(let i=0;i<operations.length;i+=200)journal.append(user.uid,operations.slice(i,i+200),options);status('pending');}
    catch{status('error','Non riesco a conservare le modifiche da sincronizzare. Mantieni aperta questa pagina.');return;}
    flush();
  }
  function message(error){
    if(error.code==='resource-exhausted')return 'Quota gratuita temporaneamente esaurita. Le risposte restano su questo dispositivo e verranno inviate quando il servizio torna disponibile.';
    if(error.code==='permission-denied')return 'Il server non ha accettato alcune modifiche. I progressi locali restano conservati: premi Riprova.';
    if(error.code==='unavailable'||!navigator.onLine)return 'Sei offline. Le modifiche restano sul dispositivo in attesa della connessione.';
    return 'Sincronizzazione non disponibile. I progressi restano sul dispositivo: puoi riprovare.';
  }
  async function reconcileClosedSessions(entries){
    const response=await getDocsFromServer(collection(db,'users',user.uid,'records'));
    const remote=new Map(response.docs.map(item=>[item.id,item.data()]));
    const closed=new Set([...remote].filter(([,record])=>record.kind==='session'&&record.phase!=='active').map(([id])=>id.slice(8)));
    let corrected=false;
    for(const entry of entries){
      const remaining=entry.operations.filter(operation=>{
        if(operation.id.startsWith('session_')&&closed.has(operation.id.slice(8))){corrected=true;return false;}
        if(operation.id.startsWith('attempt_')&&remote.has(operation.id)){corrected=true;return false;}
        if(operation.id==='control'&&(closed.has(operation.data.activeSessionId)
          ||operation.data.activeSessionId===null&&entry.operations.some(item=>item.id.startsWith('session_')&&closed.has(item.id.slice(8))))){corrected=true;return false;}
        return true;
      });
      if(remaining.length!==entry.operations.length){journal.append(user.uid,remaining);journal.remove([entry]);}
    }
    if(corrected){records=remote;apply();status('pending','Un quiz è stato già consegnato o chiuso da un altro dispositivo. Ho recuperato il risultato condiviso.');}
    return corrected;
  }
  async function flush(){
    if(!user||!ready||writing||stopped)return;
    let entries;
    try{entries=journal.list(user.uid);}catch{status('error','Non riesco a leggere le modifiche in attesa.');return;}
    if(!entries.length){if(!navigator.onLine)status('offline');else if(!lastError)status('synced');return;}
    if(!navigator.onLine){status('offline');return;}
    const uid=user.uid,turn=generation;
    // Keep one batch well below Firestore's 500-operation limit.
    entries=entries.slice(0,50);
    const operations=compactOperations(entries.flatMap(entry=>entry.operations));
    if(operations.length>400){entries=entries.slice(0,1);}
    writing=true;status('pending');let again=false;
    try{
      const batch=writeBatch(db);
      for(const operation of compactOperations(entries.flatMap(entry=>entry.operations)))batch.set(doc(db,'users',uid,'records',operation.id),operation.data,{merge:true});
      await batch.commit();
      journal.remove(entries);lastError='';again=true;
      if(turn===generation)status(journal.list(uid).length?'pending':'synced');
    }catch(error){
      lastError=error.code||'unknown';
      if(turn===generation){
        if(error.code==='permission-denied')try{again=await reconcileClosedSessions(entries);}catch{ /* Keep every unacknowledged local entry. */ }
        if(!again)status(error.code==='unavailable'||!navigator.onLine?'offline':'error',message(error));
      }
    }finally{
      writing=false;
      if(again&&turn===generation)queueMicrotask(flush);
    }
  }
  const stopAuth=onAuthStateChanged(auth,async nextUser=>{
    const turn=++generation;unsubscribe?.();unsubscribe=null;ready=false;records=new Map();lastError='';
    if(nextUser&&(!nextUser.emailVerified||nextUser.email?.toLowerCase()!==config.allowedEmail.toLowerCase())){
      await signOut(auth);status('error',`La sincronizzazione è riservata a ${config.allowedEmail}.`);return;
    }
    user=nextUser;
    onAccount(user?{uid:user.uid,email:user.email,displayName:user.displayName}:null);
    snapshot=structuredClone(getState());
    if(!user){status('signed-out');return;}
    status('connecting');
    unsubscribe=onSnapshot(collection(db,'users',user.uid,'records'),{includeMetadataChanges:true},cloudSnapshot=>{
      if(turn!==generation)return;
      const incoming=new Map(cloudSnapshot.docs.map(item=>[item.id,item.data()]));
      if(!ready){
        // An empty cache is not proof that the server has no prior progress.
        if(cloudSnapshot.metadata.fromCache){status(navigator.onLine?'connecting':'offline');return;}
        records=incoming;
        const migration=migrationForSync(getState(),records);
        try{for(let i=0;i<migration.length;i+=200)journal.append(user.uid,migration.slice(i,i+200),{first:true});}catch{status('error','Non riesco a preparare l’importazione dei progressi locali.');return;}
        ready=true;
        // Apply outstanding local changes before the first cloud projection.
        apply();flush();return;
      }
      records=incoming;apply();
      if(cloudSnapshot.metadata.hasPendingWrites||journal.list(user.uid).length)status('pending');
      else status(cloudSnapshot.metadata.fromCache?'offline':'synced');
    },error=>{lastError=error.code;status('error',message(error));});
  });
  const online=()=>{lastError='';flush();};
  const offline=()=>{if(user)status('offline');};
  const storageChanged=event=>{if(event.key?.startsWith('segnali.sync.outbox.v1.'))flush();};
  window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('storage',storageChanged);
  retryTimer=setInterval(()=>{if(user&&ready&&!lastError&&document.visibilityState==='visible')flush();},30000);
  return {
    async login(){
      if(!navigator.onLine)throw new Error('Per accedere serve una connessione.');
      if(emulators){
        // Test mode is selected only on loopback in app.js, always targets
        // demo-segnali, and never obtains or uses a real Google credential.
        const encode=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        const token=encode({alg:'none',typ:'JWT'})+'.'+encode({sub:'local-owner',email:config.allowedEmail,email_verified:true,name:'Utente di prova locale',iss:'https://accounts.google.com',aud:'demo-segnali'})+'.';
        await signInWithCredential(auth,GoogleAuthProvider.credential(token));return;
      }
      const provider=new GoogleAuthProvider();provider.setCustomParameters({login_hint:config.allowedEmail,prompt:'select_account'});
      try{await signInWithPopup(auth,provider);}catch(error){
        if(error.code==='auth/popup-closed-by-user'||error.code==='auth/cancelled-popup-request')return;
        if(error.code==='auth/popup-blocked')throw new Error('Il browser ha bloccato la finestra di accesso. Consenti il popup per questo sito e riprova.');
        if(error.code==='auth/unauthorized-domain')throw new Error('Questo indirizzo non è ancora autorizzato per l’accesso Google.');
        throw new Error('Accesso Google non riuscito. Puoi continuare a studiare e riprovare.');
      }
    },
    async logout(){if(user&&journal.list(user.uid).length)throw new Error('Ci sono modifiche da sincronizzare. Attendi la connessione o premi Riprova prima di uscire.');await signOut(auth);},
    publish(next){const operations=changesForSync(snapshot,next);snapshot=structuredClone(next);queue(operations);},
    rebase(next){snapshot=structuredClone(next);},
    async retry(){lastError='';if(ready)await flush();else if(user){const current=auth.currentUser;await current?.getIdToken(true);location.reload();}},
    pending(){return user?journal.list(user.uid).length:0;},
    dispose(){stopped=true;stopAuth();unsubscribe?.();clearInterval(retryTimer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('storage',storageChanged);}
  };
}
